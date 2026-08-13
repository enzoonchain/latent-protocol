"""Pre-launch signup — wallet + scan metrics before ads go live."""

import json
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from server.admin_auth import require_admin
from server.database import get_db
from server.models import PrelaunchRegisterRequest, PrelaunchRegisterResponse

router = APIRouter()

EVM_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")


@router.post("/register", response_model=PrelaunchRegisterResponse)
async def register_prelaunch(
    req: PrelaunchRegisterRequest, db: AsyncSession = Depends(get_db)
):
    """Public: save or update a pre-launch wallet + aggregated scan metrics."""
    wallet = req.wallet.strip()
    if not EVM_RE.match(wallet):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid wallet address",
        )

    agents = [a.strip().lower() for a in req.agents if a.strip()]
    metrics = req.metrics.model_dump()

    existing = await db.execute(
        text("SELECT wallet_address FROM prelaunch_signups WHERE lower(wallet_address) = lower(:w)"),
        {"w": wallet},
    )
    row = existing.fetchone()
    updated = row is not None

    await db.execute(
        text(
            """
            INSERT INTO prelaunch_signups (wallet_address, agents, metrics)
            VALUES (:wallet, :agents, CAST(:metrics AS jsonb))
            ON CONFLICT (wallet_address) DO UPDATE SET
                agents = EXCLUDED.agents,
                metrics = EXCLUDED.metrics,
                updated_at = now()
            """
        ),
        {
            "wallet": wallet,
            "agents": agents,
            "metrics": json.dumps(metrics),
        },
    )
    await db.commit()

    return PrelaunchRegisterResponse(wallet=wallet, registered=True, updated=updated)


@router.get("/count")
async def prelaunch_count(db: AsyncSession = Depends(get_db)):
    """Public: signup count for landing page."""
    result = await db.execute(text("SELECT COUNT(*) FROM prelaunch_signups"))
    count = int(result.scalar() or 0)
    return {"count": count}


@router.get("/signups")
async def list_prelaunch_signups(
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_admin),
):
    """Admin only: list pre-launch signups with metrics."""
    lim = min(max(limit, 1), 500)
    off = max(offset, 0)

    total = int((await db.execute(text("SELECT COUNT(*) FROM prelaunch_signups"))).scalar() or 0)

    rows = (
        await db.execute(
            text(
                """
                SELECT wallet_address, agents, metrics, created_at, updated_at
                FROM prelaunch_signups
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
                """
            ),
            {"limit": lim, "offset": off},
        )
    ).mappings().all()

    return {
        "total": total,
        "limit": lim,
        "offset": off,
        "signups": [
            {
                "wallet": r["wallet_address"],
                "agents": list(r["agents"] or []),
                "metrics": r["metrics"] or {},
                "created_at": r["created_at"].isoformat(),
                "updated_at": r["updated_at"].isoformat(),
            }
            for r in rows
        ],
    }


@router.delete("/signups/{wallet_address}")
async def delete_prelaunch_signup(
    wallet_address: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_admin),
):
    """Admin only: remove a pre-launch signup."""
    if not EVM_RE.match(wallet_address.strip()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid wallet")

    result = await db.execute(
        text("DELETE FROM prelaunch_signups WHERE lower(wallet_address) = lower(:w) RETURNING wallet_address"),
        {"w": wallet_address.strip()},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signup not found")
    await db.commit()
    return {"deleted": True, "wallet": row[0]}
