"""Ad serving endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from server.admin_auth import require_admin
from server.config import USER_SHARE
from server.database import get_db
from server.models import AdRequest, AdResponse, ImpressionRequest, ClickRequest
from server.matcher import select_best_ad
from server.security import make_impression_token, verify_impression_token
from server.tracker import log_impression, log_click, log_ad_event, user_earning_for_impression
from server.safety import (
    is_kill_switch_active,
    check_rate_limit,
    is_content_allowed,
)

router = APIRouter()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post(
    "/request",
    response_model=AdResponse,
    responses={204: {"description": "No ads available"}},
)
async def request_ad(
    req: AdRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    """Reserve best matching ad + impression_token (not billable).

    Billing happens only on POST /ad/impression after the client confirms
    display. Every outcome is written to ad_events for admin debugging.
    """
    ip = _client_ip(request)
    base_meta = {
        "tags": list(req.tags or []),
        "path": str(request.url.path),
    }

    async def _evt(event_type: str, reason: str = "", ad_id: str | None = None, earned: float = 0.0, **extra):
        await log_ad_event(
            db,
            event_type=event_type,
            user_wallet=req.user_wallet,
            reason=reason,
            ad_id=ad_id,
            agent=req.agent,
            surface=req.surface,
            context=req.context,
            tags=list(req.tags or []),
            ip=ip,
            earned=earned,
            meta={**base_meta, **extra},
        )

    # 1. Kill switch
    if is_kill_switch_active():
        await _evt("request_kill_switch", "kill_switch_active")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # 2. Rate limiting
    if not check_rate_limit(req.user_wallet, ip):
        await _evt("request_rate_limited", "rate_limit")
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
        await _evt("request_no_fill", "no_matching_ad")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # 4. Content moderation
    if not is_content_allowed(ad["title"], ad["body"]):
        await _evt(
            "request_blocked",
            "content_blocked",
            ad_id=str(ad["id"]),
            title=ad.get("title"),
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    earn_amount = round(float(ad["bid_per_impression"]) * USER_SHARE, 6)
    await _evt(
        "request_filled",
        "matched",
        ad_id=str(ad["id"]),
        earned=earn_amount,
        title=ad.get("title"),
        bid=float(ad["bid_per_impression"]),
    )

    return AdResponse(
        ad_id=ad["id"],
        title=ad["title"],
        body=ad["body"],
        cta_text=ad["cta_text"],
        cta_url=f"{ad['cta_url']}?ref=latent-protocol&ad={ad['id']}",
        earn_amount=earn_amount,
        image_url=ad.get("image_url"),
        impression_token=make_impression_token(ad["id"], req.user_wallet),
    )


@router.post("/impression")
async def track_impression(
    req: ImpressionRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    """Confirm a viewable impression (the only billable event)."""
    ip = _client_ip(request)

    if not verify_impression_token(req.token, req.ad_id, req.user_wallet):
        await log_ad_event(
            db,
            event_type="impression_invalid_token",
            user_wallet=req.user_wallet,
            reason="invalid_impression_token",
            ad_id=req.ad_id,
            agent=req.agent,
            surface=req.surface,
            context=req.context,
            ip=ip,
        )
        raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid impression token")

    logged = await log_impression(
        db,
        ad_id=req.ad_id,
        user_wallet=req.user_wallet,
        agent=req.agent or "plugin",
        surface=req.surface or "direct",
        context=req.context or "",
    )

    # Re-read bid for audit earned amount when billed
    earned = 0.0
    if logged:
        from sqlalchemy import text

        row = (
            await db.execute(
                text(
                    "SELECT bid_per_impression FROM ads WHERE id = CAST(:id AS uuid)"
                ),
                {"id": req.ad_id},
            )
        ).first()
        if row:
            earned = user_earning_for_impression(float(row[0]))

    await log_ad_event(
        db,
        event_type="impression_billed" if logged else "impression_skipped",
        user_wallet=req.user_wallet,
        reason="billed" if logged else "duplicate_or_unknown",
        ad_id=req.ad_id,
        agent=req.agent,
        surface=req.surface,
        context=req.context,
        ip=ip,
        earned=earned,
    )
    return {"status": "tracked" if logged else "skipped"}


@router.post("/click")
async def track_click(
    req: ClickRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    """Track an ad click."""
    ip = _client_ip(request)
    credited = await log_click(db, ad_id=req.ad_id, user_wallet=req.user_wallet)
    await log_ad_event(
        db,
        event_type="click_credited" if credited else "click_skipped",
        user_wallet=req.user_wallet,
        reason="credited" if credited else "ineligible_or_duplicate",
        ad_id=req.ad_id,
        agent=req.agent,
        surface=req.surface,
        context=req.context,
        ip=ip,
    )
    return {"status": "tracked" if credited else "skipped"}


@router.get("/click")
async def click_redirect(
    request: Request,
    ad: str,
    w: str = "",
    db: AsyncSession = Depends(get_db),
):
    """Track a click and 302-redirect to the advertiser's URL."""
    from sqlalchemy import text

    row = (
        await db.execute(
            text("SELECT cta_url FROM ads WHERE id = CAST(:id AS uuid)"), {"id": ad}
        )
    ).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown ad")

    credited = await log_click(db, ad_id=ad, user_wallet=w)
    await log_ad_event(
        db,
        event_type="click_redirect",
        user_wallet=w,
        reason="credited" if credited else "ineligible_or_duplicate",
        ad_id=ad,
        ip=_client_ip(request),
        meta={"credited": credited},
    )
    return RedirectResponse(
        f"{row[0]}?ref=latent-protocol&ad={ad}", status_code=status.HTTP_302_FOUND
    )


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
        "default_frequency": 1,
    }


@router.get("/events")
async def list_ad_events(
    wallet: str = "",
    event_type: str = "",
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_admin),
):
    """Admin only: recent ad_events (optionally filter by wallet / type)."""
    from sqlalchemy import text

    lim = min(max(limit, 1), 500)
    clauses = ["TRUE"]
    params: dict = {"limit": lim}
    if wallet:
        clauses.append("lower(e.user_wallet) = lower(:wallet)")
        params["wallet"] = wallet
    if event_type:
        clauses.append("e.event_type = :event_type")
        params["event_type"] = event_type

    rows = (
        await db.execute(
            text(
                f"""
                SELECT
                    e.id, e.user_wallet, e.event_type, e.reason, e.ad_id,
                    e.agent, e.surface, e.context, e.tags, e.ip, e.earned,
                    e.meta, e.created_at,
                    a.title, a.body, a.cta_text, a.cta_url, a.image_url
                FROM ad_events e
                LEFT JOIN ads a ON a.id = e.ad_id
                WHERE {' AND '.join(clauses)}
                ORDER BY e.created_at DESC
                LIMIT :limit
                """
            ),
            params,
        )
    ).mappings().all()

    return {
        "events": [
            {
                "id": str(r["id"]),
                "user_wallet": r["user_wallet"],
                "event_type": r["event_type"],
                "reason": r["reason"],
                "ad_id": str(r["ad_id"]) if r["ad_id"] else None,
                "title": r["title"],
                "body": r["body"],
                "cta_text": r["cta_text"],
                "cta_url": r["cta_url"],
                "image_url": r["image_url"],
                "agent": r["agent"],
                "surface": r["surface"],
                "context": r["context"] or "",
                "tags": list(r["tags"] or []),
                "ip": r["ip"],
                "earned": float(r["earned"] or 0),
                "meta": r["meta"] or {},
                "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ],
        "count": len(rows),
    }


@router.get("/leaderboard")
async def get_leaderboard(limit: int = 20, db: AsyncSession = Depends(get_db)):
    """Return active ads ranked by bid_per_impression with impression counts."""
    from sqlalchemy import text

    sql = text(
        """
        SELECT
            a.id,
            a.title,
            a.image_url,
            a.bid_per_impression,
            c.name AS campaign_name,
            c.advertiser_wallet,
            COUNT(i.id) AS impressions,
            COUNT(i.id) FILTER (WHERE i.clicked) AS clicks,
            RANK() OVER (ORDER BY a.bid_per_impression DESC) AS rank
        FROM ads a
        JOIN campaigns c ON c.id = a.campaign_id
        LEFT JOIN impressions i ON i.ad_id = a.id
        WHERE a.status = 'active' AND c.status = 'active'
        GROUP BY a.id, a.title, a.image_url, a.bid_per_impression, c.name, c.advertiser_wallet
        ORDER BY a.bid_per_impression DESC
        LIMIT :limit
        """
    )
    result = await db.execute(sql, {"limit": limit})
    rows = result.mappings().all()
    return {
        "leaderboard": [
            {
                "id": str(r["id"]),
                "title": r["title"],
                "image_url": r["image_url"],
                "bid_per_impression": float(r["bid_per_impression"]),
                "campaign_name": r["campaign_name"],
                "advertiser_wallet": r["advertiser_wallet"],
                "impressions": int(r["impressions"]),
                "clicks": int(r["clicks"]),
                "rank": int(r["rank"]),
            }
            for r in rows
        ]
    }


@router.get("/top-bid")
async def get_top_bid(db: AsyncSession = Depends(get_db)):
    """Return the current highest bid per impression across active ads."""
    from sqlalchemy import text

    sql = text(
        """
        SELECT MAX(a.bid_per_impression) AS top_bid
        FROM ads a
        JOIN campaigns c ON c.id = a.campaign_id
        WHERE a.status = 'active' AND c.status = 'active'
        """
    )
    result = await db.execute(sql)
    row = result.fetchone()
    top_bid = float(row[0]) if row and row[0] is not None else 0.005
    return {"top_bid": top_bid}
