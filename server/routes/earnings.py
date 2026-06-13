"""User earnings endpoints."""

from fastapi import APIRouter
from server.models import EarningsResponse

router = APIRouter()


@router.get("/{wallet_address}", response_model=EarningsResponse)
async def get_earnings(wallet_address: str):
    """Get earnings for a user wallet."""
    # TODO: query Postgres earnings table
    return EarningsResponse(
        wallet_address=wallet_address,
        balance=0.0,
        total_earned=0.0,
        total_impressions=0,
        total_clicks=0,
    )


@router.get("/{wallet_address}/history")
async def get_earnings_history(wallet_address: str, limit: int = 50):
    """Get earnings history for a user."""
    # TODO: query Postgres impressions + earnings
    return {"history": [], "wallet": wallet_address}
