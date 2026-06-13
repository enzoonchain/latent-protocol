"""Payout management endpoints."""

from fastapi import APIRouter, HTTPException
from server.models import PayoutRequest, PayoutResponse

router = APIRouter()


@router.post("/request", response_model=PayoutResponse)
async def request_payout(req: PayoutRequest):
    """Request payout of accumulated earnings."""
    # TODO: check balance >= threshold
    # TODO: execute USDC transfer on Base
    # TODO: update payout status in Postgres
    return PayoutResponse(
        payout_id="placeholder",
        amount=0.0,
        tx_hash="pending",
        status="not_implemented",
    )


@router.get("/{wallet_address}")
async def get_payout_history(wallet_address: str):
    """Get payout history for a user."""
    # TODO: query Postgres payouts table
    return {"payouts": [], "wallet": wallet_address}
