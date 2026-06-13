"""Payout management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import (
    EVM_NETWORK,
    EVM_PRIVATE_KEY,
    PAYOUT_THRESHOLD_USDC,
    USDC_ADDRESS,
)
from server.database import get_db
from server.models import PayoutRequest, PayoutResponse
from server.payout_engine import send_usdc

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


@router.post("/request", response_model=PayoutResponse)
async def request_payout(req: PayoutRequest, db: AsyncSession = Depends(get_db)):
    """Request payout of accumulated earnings.

    Flow:
    1. Check balance >= threshold
    2. Mark unpaid earnings as paid_out (atomic, idempotent)
    3. Execute USDC transfer on Base
    4. Record payout in payouts table
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

    # 2. Lock unpaid earnings and mark as paid_out (returns IDs for the payout record)
    earn_rows = (
        await db.execute(
            text(
                "UPDATE earnings SET paid_out = TRUE "
                "WHERE wallet_address = :w AND NOT paid_out "
                "RETURNING id, amount"
            ),
            {"w": wallet},
        )
    ).mappings().all()

    if not earn_rows:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No unpaid earnings found (concurrent payout?)",
        )

    payout_amount = sum(float(r["amount"]) for r in earn_rows)

    # 3. Record payout as pending
    payout_row = (
        await db.execute(
            text(
                "INSERT INTO payouts (wallet_address, amount, status) "
                "VALUES (:w, :amt, 'pending') RETURNING id"
            ),
            {"w": wallet, "amt": payout_amount},
        )
    ).mappings().first()
    payout_id = str(payout_row["id"])
    await db.commit()

    # 4. Execute USDC transfer (if configured)
    if not EVM_PRIVATE_KEY:
        # No private key — mark as failed (test/dev mode)
        await db.execute(
            text("UPDATE payouts SET status = 'failed' WHERE id = :pid"),
            {"pid": payout_id},
        )
        await db.commit()
        return PayoutResponse(
            payout_id=payout_id,
            amount=payout_amount,
            tx_hash="",
            status="failed_no_key",
        )

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
        return PayoutResponse(
            payout_id=payout_id,
            amount=payout_amount,
            tx_hash=tx_hash,
            status="sent",
        )
    except Exception as exc:
        await db.execute(
            text(
                "UPDATE payouts SET status = 'failed' WHERE id = :pid"
            ),
            {"pid": payout_id},
        )
        await db.commit()
        return PayoutResponse(
            payout_id=payout_id,
            amount=payout_amount,
            tx_hash="",
            status=f"failed: {exc}",
        )


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
