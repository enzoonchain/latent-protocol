"""Ad serving endpoints."""

from fastapi import APIRouter, Response, status
from server.config import USER_SHARE
from server.models import AdRequest, AdResponse, ImpressionRequest, ClickRequest
from server.matcher import select_best_ad
from server.tracker import log_impression, log_click

router = APIRouter()


@router.post(
    "/request",
    response_model=AdResponse,
    responses={204: {"description": "No ads available"}},
)
async def request_ad(req: AdRequest):
    """Serve best matching ad to agent.

    Note: serving an ad does NOT log an impression. The impression is logged
    separately via POST /ad/impression once the client confirms the ad was
    actually displayed. This keeps "fetched" and "displayed" distinct and
    avoids double-counting (plugin calls both endpoints).
    """
    ad = await select_best_ad(
        context=req.context,
        tags=req.tags,
        agent=req.agent,
        surface=req.surface,
        user_wallet=req.user_wallet,
    )

    if not ad:
        # 204 No Content — no body, client treats this as "no ad available".
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # Estimated user earnings for this impression (user's share of the bid).
    earn_amount = ad["bid_per_impression"] * USER_SHARE

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
