"""Campaign management endpoints."""

from fastapi import APIRouter, HTTPException
from server.models import CampaignCreate, AdCreate

router = APIRouter()


@router.post("/create")
async def create_campaign(req: CampaignCreate):
    """Create a new ad campaign."""
    # TODO: insert into Postgres campaigns table
    # TODO: x402 payment for campaign funding
    return {
        "campaign_id": "placeholder",
        "status": "created",
        "message": "Campaign creation not yet implemented",
    }


@router.post("/{campaign_id}/ad")
async def add_ad_to_campaign(campaign_id: str, req: AdCreate):
    """Add an ad creative to a campaign."""
    # TODO: insert into Postgres ads table
    return {
        "ad_id": "placeholder",
        "status": "created",
        "message": "Ad creation not yet implemented",
    }


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str):
    """Get campaign details."""
    # TODO: fetch from Postgres
    return {"campaign_id": campaign_id, "status": "not_implemented"}


@router.get("/")
async def list_campaigns(wallet: str = ""):
    """List campaigns for an advertiser wallet."""
    # TODO: fetch from Postgres
    return {"campaigns": [], "wallet": wallet}
