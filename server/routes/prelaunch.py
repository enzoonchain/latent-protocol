"""Pre-launch signup — wallet + scan metrics before ads go live."""

import json
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from server.database import get_db
from server.models import PrelaunchRegisterRequest, PrelaunchRegisterResponse

router = APIRouter()

EVM_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")


@router.post("/register", response_model=PrelaunchRegisterResponse)
async def register_prelaunch(
    req: PrelaunchRegisterRequest, db: AsyncSession = Depends(get_db)
):
    """Save or update a pre-launch wallet + aggregated scan metrics (no prompts)."""
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
    """Public count of pre-launch signups (for landing page)."""
    result = await db.execute(text("SELECT COUNT(*) FROM prelaunch_signups"))
    count = int(result.scalar() or 0)
    return {"count": count}
