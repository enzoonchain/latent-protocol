"""Ad serving endpoints."""

from fastapi import APIRouter, HTTPException
from server.models import AdRequest, AdResponse, ImpressionRequest, ClickRequest
from server.matcher import select_best_ad
from server.tracker import log_impression, log_click

router = APIRouter()


@router.post("/request", response_model=AdResponse)
async def request_ad(req: AdRequest):
    """Serve best matching ad to agent."""
    ad = await select_best_ad(
        context=req.context,
        tags=req.tags,
        agent=req.agent,
        surface=req.surface,
        user_wallet=req.user_wallet,
    )

    if not ad:
        raise HTTPException(204, detail="No ads available")

    # Calculate user earnings (50% of bid)
    earn_amount = ad["bid_per_impression"] * 0.5

    # Log impression
    await log_impression(
        ad_id=ad["id"],
        user_wallet=req.user_wallet,
        agent=req.agent,
        surface=req.surface,
        context=req.context,
    )

    return AdResponse(
        ad_id=ad["id"],
        title=ad["title"],
        body=ad["body"],
        cta_text=ad["cta_text"],
        cta_url=f"{ad['cta_url']}?ref=agent-kickbacks&ad={ad['id']}",
        earn_amount=round(earn_amount, 6),
        image_url=ad.get("image_url"),
    )


@router.post("/impression")
async def track_impression(req: ImpressionRequest):
    """Track an ad impression (called by plugin)."""
    await log_impression(
        ad_id=req.ad_id,
        user_wallet=req.user_wallet,
        agent="plugin",
        surface="direct",
        context="",
    )
    return {"status": "tracked"}


@router.post("/click")
async def track_click(req: ClickRequest):
    """Track an ad click."""
    await log_click(ad_id=req.ad_id, user_wallet=req.user_wallet)
    return {"status": "tracked"}


@router.get("/health")
async def ad_health():
    return {"status": "ok"}
