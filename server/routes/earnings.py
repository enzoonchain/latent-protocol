"""User earnings endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from server.database import get_db
from server.models import EarningsResponse

router = APIRouter()


@router.get("/{wallet_address}", response_model=EarningsResponse)
async def get_earnings(wallet_address: str, db: AsyncSession = Depends(get_db)):
    """Get earnings summary for a user wallet."""
    earn = (
        await db.execute(
            text(
                """
                SELECT
                    COALESCE(SUM(amount) FILTER (WHERE NOT paid_out), 0) AS balance,
                    COALESCE(SUM(amount), 0) AS total_earned
                FROM earnings
                WHERE wallet_address = :wallet
                """
            ),
            {"wallet": wallet_address},
        )
    ).mappings().first()

    imp = (
        await db.execute(
            text(
                """
                SELECT
                    count(*) AS total_impressions,
                    count(*) FILTER (WHERE clicked) AS total_clicks
                FROM impressions
                WHERE user_wallet = :wallet
                """
            ),
            {"wallet": wallet_address},
        )
    ).mappings().first()

    return EarningsResponse(
        wallet_address=wallet_address,
        balance=float(earn["balance"]),
        total_earned=float(earn["total_earned"]),
        total_impressions=int(imp["total_impressions"]),
        total_clicks=int(imp["total_clicks"]),
    )


@router.get("/{wallet_address}/history")
async def get_earnings_history(
    wallet_address: str, limit: int = 50, db: AsyncSession = Depends(get_db)
):
    """Get recent earnings events for a user."""
    rows = (
        await db.execute(
            text(
                """
                SELECT id, amount, kind, paid_out, created_at
                FROM earnings
                WHERE wallet_address = :wallet
                ORDER BY created_at DESC
                LIMIT :limit
                """
            ),
            {"wallet": wallet_address, "limit": min(max(limit, 1), 500)},
        )
    ).mappings().all()

    history = [
        {
            "id": str(r["id"]),
            "amount": float(r["amount"]),
            "kind": r["kind"],
            "paid_out": r["paid_out"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]
    return {"history": history, "wallet": wallet_address}
