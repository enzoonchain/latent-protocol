"""Ad serving endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import USER_SHARE
from server.database import get_db
from server.models import AdRequest, AdResponse, ImpressionRequest, ClickRequest
from server.matcher import select_best_ad
from server.security import make_impression_token, verify_impression_token
from server.tracker import log_impression, log_click
from server.safety import (
    is_kill_switch_active,
    check_rate_limit,
    is_content_allowed,
    should_show_ad,
)

router = APIRouter()


@router.post(
    "/request",
    response_model=AdResponse,
    responses={204: {"description": "No ads available"}},
)
async def request_ad(
    req: AdRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    """Serve best matching ad to agent.

    Safety checks (all fail open):
    1. Kill switch
    2. Rate limiting (per-user, per-IP)
    3. Content moderation
    4. Frequency caps
    """
    # 1. Kill switch — immediate return
    if is_kill_switch_active():
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # 2. Rate limiting
    ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(req.user_wallet, ip):
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # 3. Select best ad
    ad = await select_best_ad(
        db,
        context=req.context,
        tags=req.tags,
        agent=req.agent,
        surface=req.surface,
        user_wallet=req.user_wallet,
    )

    if not ad:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # 4. Content moderation
    if not is_content_allowed(ad["title"], ad["body"]):
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # 5. Frequency check (simplified — in production, track impressions from DB)
    # For now, rely on the matcher's frequency window check
    # The client-side FrequencyCounter handles display frequency

    # Estimated user earnings for this impression
    earn_amount = ad["bid_per_impression"] * USER_SHARE

    return AdResponse(
        ad_id=ad["id"],
        title=ad["title"],
        body=ad["body"],
        cta_text=ad["cta_text"],
        cta_url=f"{ad['cta_url']}?ref=agent-kickbacks&ad={ad['id']}",
        earn_amount=round(earn_amount, 6),
        image_url=ad.get("image_url"),
        impression_token=make_impression_token(ad["id"], req.user_wallet),
    )


@router.post("/impression")
async def track_impression(
    req: ImpressionRequest, db: AsyncSession = Depends(get_db)
):
    """Track an ad impression (called by the client).

    Requires a valid signed token from the /ad/request response.
    """
    if not verify_impression_token(req.token, req.ad_id, req.user_wallet):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid impression token")

    logged = await log_impression(
        db,
        ad_id=req.ad_id,
        user_wallet=req.user_wallet,
        agent="plugin",
        surface="direct",
        context="",
    )
    return {"status": "tracked" if logged else "skipped"}


@router.post("/click")
async def track_click(req: ClickRequest, db: AsyncSession = Depends(get_db)):
    """Track an ad click."""
    await log_click(db, ad_id=req.ad_id, user_wallet=req.user_wallet)
    return {"status": "tracked"}


@router.get("/health")
async def ad_health():
    return {"status": "ok"}


@router.get("/safety")
async def safety_status():
    """Public safety status (for monitoring)."""
    return {
        "kill_switch": is_kill_switch_active(),
        "rate_limit_user_per_min": 10,
        "rate_limit_ip_per_min": 30,
        "max_impressions_per_day": 100,
        "max_impressions_per_session": 20,
        "default_frequency": 5,
    }
