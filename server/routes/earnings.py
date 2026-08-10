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


@router.get("/{wallet_address}/ads")
async def get_ads_history(
    wallet_address: str, limit: int = 100, db: AsyncSession = Depends(get_db)
):
    """Full ad event history for a user (requests, fills, bills, clicks).

    Reads `ad_events` (debug audit log). Falls back to billed impressions
    if the ad_events table is empty/missing for older deploys mid-migration.
    """
    lim = min(max(limit, 1), 500)
    try:
        rows = (
            await db.execute(
                text(
                    """
                    SELECT
                        e.id,
                        e.ad_id,
                        e.event_type,
                        e.reason,
                        e.agent,
                        e.surface,
                        e.context,
                        e.earned,
                        e.ip,
                        e.meta,
                        e.created_at,
                        a.title,
                        a.body,
                        a.cta_text,
                        a.cta_url,
                        a.image_url
                    FROM ad_events e
                    LEFT JOIN ads a ON a.id = e.ad_id
                    WHERE lower(e.user_wallet) = lower(:wallet)
                    ORDER BY e.created_at DESC
                    LIMIT :limit
                    """
                ),
                {"wallet": wallet_address, "limit": lim},
            )
        ).mappings().all()
        ads = [
            {
                "id": str(r["id"]),
                "ad_id": str(r["ad_id"]) if r["ad_id"] else None,
                "event_type": r["event_type"],
                "reason": r["reason"] or "",
                "title": r["title"] or "",
                "body": r["body"] or "",
                "cta_text": r["cta_text"] or "",
                "cta_url": r["cta_url"] or "",
                "image_url": r["image_url"],
                "agent": r["agent"] or "",
                "surface": r["surface"] or "",
                "context": r["context"] or "",
                "clicked": r["event_type"] in ("click_credited", "click_redirect"),
                "earned": float(r["earned"] or 0),
                "ip": r["ip"] or "",
                "meta": r["meta"] or {},
                "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ]
        return {"ads": ads, "wallet": wallet_address, "count": len(ads), "source": "ad_events"}
    except Exception:
        # Table may not exist yet on a rolling deploy — fall back to impressions.
        await db.rollback()

    rows = (
        await db.execute(
            text(
                """
                SELECT
                    i.id,
                    i.ad_id,
                    a.title,
                    a.body,
                    a.cta_text,
                    a.cta_url,
                    a.image_url,
                    i.agent,
                    i.surface,
                    i.context,
                    i.clicked,
                    i.created_at,
                    COALESCE((
                        SELECT SUM(e.amount)
                        FROM earnings e
                        WHERE e.impression_id = i.id
                    ), 0) AS earned
                FROM impressions i
                JOIN ads a ON a.id = i.ad_id
                WHERE lower(i.user_wallet) = lower(:wallet)
                ORDER BY i.created_at DESC
                LIMIT :limit
                """
            ),
            {"wallet": wallet_address, "limit": lim},
        )
    ).mappings().all()

    ads = [
        {
            "id": str(r["id"]),
            "ad_id": str(r["ad_id"]),
            "event_type": "impression_billed",
            "reason": "legacy_impressions",
            "title": r["title"],
            "body": r["body"],
            "cta_text": r["cta_text"],
            "cta_url": r["cta_url"],
            "image_url": r["image_url"],
            "agent": r["agent"],
            "surface": r["surface"],
            "context": r["context"] or "",
            "clicked": bool(r["clicked"]),
            "earned": float(r["earned"]),
            "ip": "",
            "meta": {},
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]
    return {"ads": ads, "wallet": wallet_address, "count": len(ads), "source": "impressions"}
