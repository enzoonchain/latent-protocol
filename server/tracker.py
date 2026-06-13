"""Impression and click tracking against Postgres.

Earnings are server-authoritative: the client may only *report* events, the
server decides what is billable and how much the user earns.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import CLICK_MULTIPLIER, USER_SHARE


def user_earning_for_impression(bid: float) -> float:
    """User's share of a single impression's bid."""
    return round(bid * USER_SHARE, 6)


def user_earning_for_click(bid: float) -> float:
    """User's bonus for a click (worth CLICK_MULTIPLIER impressions)."""
    return round(bid * USER_SHARE * CLICK_MULTIPLIER, 6)


async def log_impression(
    db: AsyncSession,
    ad_id: str,
    user_wallet: str,
    agent: str,
    surface: str,
    context: str,
) -> None:
    """Record a (confirmed-display) impression and credit the user.

    Revenue split: user 50% / operator 30% / protocol 20% of the bid. We store
    the user's share in `earnings` and debit the campaign budget by the full
    bid in one atomic step.
    """
    ad = (
        await db.execute(
            text(
                "SELECT bid_per_impression, campaign_id FROM ads "
                "WHERE id = CAST(:ad_id AS uuid)"
            ),
            {"ad_id": ad_id},
        )
    ).mappings().first()
    if not ad:
        return  # unknown ad — nothing billable

    bid = float(ad["bid_per_impression"])

    imp = (
        await db.execute(
            text(
                """
                INSERT INTO impressions
                    (ad_id, user_wallet, agent, surface, context)
                VALUES
                    (CAST(:ad_id AS uuid), :wallet, :agent, :surface, :context)
                RETURNING id
                """
            ),
            {
                "ad_id": ad_id,
                "wallet": user_wallet,
                "agent": agent,
                "surface": surface,
                "context": context,
            },
        )
    ).mappings().first()

    await db.execute(
        text(
            """
            INSERT INTO earnings (wallet_address, impression_id, amount, kind)
            VALUES (:wallet, :imp_id, :amount, 'impression')
            """
        ),
        {
            "wallet": user_wallet,
            "imp_id": imp["id"],
            "amount": user_earning_for_impression(bid),
        },
    )

    # Debit the campaign budget by the full bid; exhaust it if it hits zero.
    await db.execute(
        text(
            """
            UPDATE campaigns
            SET budget_remaining = GREATEST(budget_remaining - :bid, 0),
                status = CASE WHEN budget_remaining - :bid <= 0
                              THEN 'exhausted' ELSE status END
            WHERE id = :campaign_id
            """
        ),
        {"bid": bid, "campaign_id": ad["campaign_id"]},
    )
    await db.commit()


async def log_click(db: AsyncSession, ad_id: str, user_wallet: str) -> None:
    """Record a click. Idempotent: only the first click on a given impression
    is credited (anti double-counting / click fraud).

    Clicks are worth CLICK_MULTIPLIER × an impression.
    """
    # Mark the most recent un-clicked impression for this ad+user as clicked.
    clicked = (
        await db.execute(
            text(
                """
                UPDATE impressions SET clicked = TRUE
                WHERE id = (
                    SELECT id FROM impressions
                    WHERE ad_id = CAST(:ad_id AS uuid)
                      AND user_wallet = :wallet
                      AND clicked = FALSE
                    ORDER BY created_at DESC
                    LIMIT 1
                )
                RETURNING id
                """
            ),
            {"ad_id": ad_id, "wallet": user_wallet},
        )
    ).mappings().first()
    if not clicked:
        return  # no matching impression, or already credited

    ad = (
        await db.execute(
            text(
                "SELECT bid_per_impression, campaign_id FROM ads "
                "WHERE id = CAST(:ad_id AS uuid)"
            ),
            {"ad_id": ad_id},
        )
    ).mappings().first()
    if not ad:
        return
    bid = float(ad["bid_per_impression"])

    await db.execute(
        text(
            """
            INSERT INTO earnings (wallet_address, impression_id, amount, kind)
            VALUES (:wallet, :imp_id, :amount, 'click')
            """
        ),
        {
            "wallet": user_wallet,
            "imp_id": clicked["id"],
            "amount": user_earning_for_click(bid),
        },
    )

    await db.execute(
        text(
            """
            UPDATE campaigns
            SET budget_remaining = GREATEST(budget_remaining - :cost, 0),
                status = CASE WHEN budget_remaining - :cost <= 0
                              THEN 'exhausted' ELSE status END
            WHERE id = :campaign_id
            """
        ),
        {"cost": bid * CLICK_MULTIPLIER, "campaign_id": ad["campaign_id"]},
    )
    await db.commit()
