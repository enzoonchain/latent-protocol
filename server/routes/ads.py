"""Ad serving endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import USER_SHARE
from server.database import get_db
from server.models import AdRequest, AdResponse, ImpressionRequest, ClickRequest
from server.matcher import select_best_ad
from server.security import make_impression_token, verify_impression_token
from server.tracker import log_impression, log_click

router = APIRouter()


@router.post(
    "/request",
    response_model=AdResponse,
    responses={204: {"description": "No ads available"}},
)
async def request_ad(req: AdRequest, db: AsyncSession = Depends(get_db)):
    """Serve best matching ad to agent.

    Note: serving an ad does NOT log an impression. The impression is logged
    separately via POST /ad/impression once the client confirms the ad was
    actually displayed. This keeps "fetched" and "displayed" distinct and
    avoids double-counting (plugin calls both endpoints).
    """
    ad = await select_best_ad(
        db,
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
        # Bind this impression to the served ad+wallet so it can't be forged.
        impression_token=make_impression_token(ad["id"], req.user_wallet),
    )


@router.post("/impression")
async def track_impression(
    req: ImpressionRequest, db: AsyncSession = Depends(get_db)
):
    """Track an ad impression (called by the client).

    Requires a valid signed token from the /ad/request response — the server
    is the authority on what is billable, so forged/replayed impressions are
    rejected.
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
