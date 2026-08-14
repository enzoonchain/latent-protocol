"""Payout management endpoints.

Earnings are claimed atomically (`UPDATE ... WHERE NOT paid_out RETURNING`),
which prevents double-pay even across concurrent requests. A payout row is
created in `processing` state first so every attempt is traceable; if the
on-chain transfer fails (or no key is configured), the claimed earnings are
**reverted to unpaid** so the user never loses their balance to a failed tx.
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from server.admin_auth import require_admin
from server.config import (
    EVM_NETWORK,
    EVM_PRIVATE_KEY,
    PAYOUT_SWEEP_INTERVAL_MINUTES,
    PAYOUT_THRESHOLD_USDC,
    USDC_ADDRESS,
)
from server.database import get_db, session_factory
from server.models import PayoutRequest, PayoutResponse
from server.payout_engine import send_usdc

logger = logging.getLogger("latent-protocol.payouts")

router = APIRouter()

# Map chain ID string to int for the payout engine
_CHAIN_IDS = {
    "eip155:8453": 8453,     # Base mainnet
    "eip155:84532": 84532,   # Base Sepolia
}


def _rpc_url(chain_id: int) -> str:
    """Public RPC endpoints (no API key needed for now)."""
    if chain_id == 8453:
        return "https://mainnet.base.org"
    return "https://sepolia.base.org"


async def _claim_earnings(
    db: AsyncSession, wallet: str
) -> list[dict]:
    """Atomically claim this wallet's unpaid earnings (anti double-pay).

    Returns the claimed rows (id + amount). A concurrent payout for the same
    wallet gets zero rows and is rejected. The caller must revert these rows
    (paid_out = FALSE) if the on-chain transfer fails.
    """
    rows = (
        await db.execute(
            text(
                "UPDATE earnings SET paid_out = TRUE "
                "WHERE wallet_address = :w AND NOT paid_out "
                "RETURNING id, amount"
            ),
            {"w": wallet},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


async def _revert_claimed(db: AsyncSession, earning_ids: list[str]) -> None:
    """Un-claim earnings after a failed transfer so the user keeps their balance."""
    if not earning_ids:
        return
    await db.execute(
        text(
            "UPDATE earnings SET paid_out = FALSE "
            "WHERE id::text = ANY(:ids)"
        ),
        {"ids": earning_ids},
    )
    await db.commit()


async def _process_payout(
    db: AsyncSession, wallet: str
) -> dict:
    """Claim, record, and (if configured) send one wallet's payout.

    Returns a result dict. Never raises for per-wallet failures — the sweep
    and the endpoint both surface per-wallet status instead.
    """
    # 1. Traceable payout row first (processing = claimed/in-flight).
    payout_row = (
        await db.execute(
            text(
                "INSERT INTO payouts (wallet_address, amount, status) "
                "VALUES (:w, :amt, 'processing') RETURNING id"
            ),
            {"w": wallet, "amt": 0.0},
        )
    ).mappings().first()
    payout_id = str(payout_row["id"])

    # 2. Atomically claim unpaid earnings (anti double-pay).
    earn_rows = await _claim_earnings(db, wallet)
    if not earn_rows:
        await db.execute(
            text("UPDATE payouts SET status = 'failed' WHERE id = :pid"),
            {"pid": payout_id},
        )
        await db.commit()
        return {
            "wallet": wallet,
            "payout_id": payout_id,
            "amount": 0.0,
            "tx_hash": "",
            "status": "no_unpaid_earnings",
        }

    earning_ids = [str(r["id"]) for r in earn_rows]
    payout_amount = sum(float(r["amount"]) for r in earn_rows)

    await db.execute(
        text("UPDATE payouts SET amount = :amt WHERE id = :pid"),
        {"amt": payout_amount, "pid": payout_id},
    )
    await db.commit()

    # 3. Execute USDC transfer (if configured).
    if not EVM_PRIVATE_KEY:
        # No private key — revert the claim so the user keeps the balance.
        await _revert_claimed(db, earning_ids)
        await db.execute(
            text("UPDATE payouts SET status = 'failed' WHERE id = :pid"),
            {"pid": payout_id},
        )
        await db.commit()
        return {
            "wallet": wallet,
            "payout_id": payout_id,
            "amount": payout_amount,
            "tx_hash": "",
            "status": "failed_no_key",
        }

    chain_id = _CHAIN_IDS.get(EVM_NETWORK, 84532)
    rpc = _rpc_url(chain_id)

    try:
        tx_hash = await send_usdc(
            to_address=wallet,
            amount_usdc=payout_amount,
            private_key=EVM_PRIVATE_KEY,
            rpc_url=rpc,
            usdc_address=USDC_ADDRESS,
            chain_id=chain_id,
        )
        await db.execute(
            text(
                "UPDATE payouts SET status = 'sent', tx_hash = :tx WHERE id = :pid"
            ),
            {"tx": tx_hash, "pid": payout_id},
        )
        await db.commit()
        return {
            "wallet": wallet,
            "payout_id": payout_id,
            "amount": payout_amount,
            "tx_hash": tx_hash,
            "status": "sent",
        }
    except Exception as exc:
        # Transfer failed — revert the earnings claim, mark payout failed.
        await _revert_claimed(db, earning_ids)
        await db.execute(
            text("UPDATE payouts SET status = 'failed' WHERE id = :pid"),
            {"pid": payout_id},
        )
        await db.commit()
        return {
            "wallet": wallet,
            "payout_id": payout_id,
            "amount": payout_amount,
            "tx_hash": "",
            "status": f"failed: {exc}",
        }


@router.post("/request", response_model=PayoutResponse)
async def request_payout(req: PayoutRequest, db: AsyncSession = Depends(get_db)):
    """Request payout of accumulated earnings.

    Flow:
    1. Check balance >= threshold
    2. Claim unpaid earnings atomically (anti double-pay)
    3. Execute USDC transfer on Base
    4. On failure, revert the claim so the user keeps their balance
    """
    wallet = req.wallet_address

    # 1. Check balance
    bal = (
        await db.execute(
            text(
                "SELECT COALESCE(SUM(amount) FILTER (WHERE NOT paid_out), 0) AS balance "
                "FROM earnings WHERE wallet_address = :w"
            ),
            {"w": wallet},
        )
    ).mappings().first()
    balance = float(bal["balance"])

    if balance < PAYOUT_THRESHOLD_USDC:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Minimum payout is ${PAYOUT_THRESHOLD_USDC:.2f}. Current: ${balance:.4f}",
        )

    result = await _process_payout(db, wallet)
    if result["status"] == "no_unpaid_earnings":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No unpaid earnings found (concurrent payout?)",
        )

    return PayoutResponse(
        payout_id=result["payout_id"],
        amount=result["amount"],
        tx_hash=result["tx_hash"],
        status=result["status"],
    )


async def _eligible_wallets(db: AsyncSession, min_amount: float) -> list[str]:
    """Wallets whose unpaid earnings have crossed the payout threshold."""
    rows = (
        await db.execute(
            text(
                """
                SELECT wallet_address
                FROM earnings
                WHERE NOT paid_out
                GROUP BY wallet_address
                HAVING SUM(amount) FILTER (WHERE NOT paid_out) >= :min
                """
            ),
            {"min": min_amount},
        )
    ).mappings().all()
    return [str(r["wallet_address"]) for r in rows]


async def _sweep_all(db: AsyncSession) -> dict:
    """Core sweep logic: pay out every wallet that crossed the threshold.

    Processes wallets sequentially (each is a separate USDC tx on Base).
    Per-wallet failures are reported, never fatal.
    """
    wallets = await _eligible_wallets(db, PAYOUT_THRESHOLD_USDC)
    results = []
    for wallet in wallets:
        try:
            results.append(await _process_payout(db, wallet))
        except Exception as exc:  # noqa: BLE001 — per-wallet isolation
            results.append(
                {
                    "wallet": wallet,
                    "payout_id": "",
                    "amount": 0.0,
                    "tx_hash": "",
                    "status": f"error: {exc}",
                }
            )
    sent = [r for r in results if r["status"] == "sent"]
    return {
        "eligible": len(wallets),
        "paid": len(sent),
        "total_sent_usdc": round(sum(r["amount"] for r in sent), 6),
        "results": results,
    }


@router.post("/sweep")
async def sweep_payouts(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_admin),
):
    """Admin only: bulk-pay out every wallet that crossed the threshold."""
    return await _sweep_all(db)


async def run_payout_sweep() -> dict:
    """Background sweep: pay out all eligible wallets on its own session."""
    if not EVM_PRIVATE_KEY:
        logger.info("payout sweep skipped — EVM_PRIVATE_KEY not configured")
        return {"eligible": 0, "paid": 0, "skipped": "no_private_key"}
    factory = session_factory()
    async with factory() as db:
        return await _sweep_all(db)


async def payout_sweep_loop() -> None:
    """Periodic sweep task (PAYOUT_SWEEP_INTERVAL_MINUTES)."""
    interval = PAYOUT_SWEEP_INTERVAL_MINUTES
    if interval <= 0:
        return
    while True:
        await asyncio.sleep(interval * 60)
        try:
            result = await run_payout_sweep()
            logger.info("payout sweep: %s", result)
        except Exception as exc:  # noqa: BLE001 — never kill the server
            logger.error("payout sweep failed: %s", exc)


@router.get("/{wallet_address}")
async def get_payout_history(
    wallet_address: str, db: AsyncSession = Depends(get_db)
):
    """Get payout history for a user."""
    rows = (
        await db.execute(
            text(
                "SELECT id, amount, tx_hash, status, created_at "
                "FROM payouts WHERE wallet_address = :w "
                "ORDER BY created_at DESC LIMIT 50"
            ),
            {"w": wallet_address},
        )
    ).mappings().all()
    return {
        "wallet": wallet_address,
        "payouts": [
            {
                "payout_id": str(r["id"]),
                "amount": float(r["amount"]),
                "tx_hash": r["tx_hash"],
                "status": r["status"],
                "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ],
    }
