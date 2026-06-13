"""Ad targeting and selection engine.

Selects the best ad based on context, tags, and bid amount, against the
Postgres inventory. Pure scoring/selection helpers are kept separate so they
can be unit-tested without a database.
"""

import random
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import AD_FREQUENCY_WINDOW_MINUTES, MAX_IMPRESSIONS_PER_USER_PER_DAY


def tag_match_score(
    ad_category: str,
    ad_tags: list[str],
    context: str,
    req_tags: list[str],
) -> int:
    """Relevance score for an ad given the request context/tags.

    Pure function — higher is more relevant. Used to bias selection toward
    contextually relevant ads before applying the bid-weighted lottery.
    """
    score = 0
    ctx = (context or "").lower()
    req = {t.lower() for t in req_tags}
    cat = (ad_category or "").lower()
    tags = {t.lower() for t in ad_tags}

    # Category appears in the request context text.
    if cat and cat != "general" and cat in ctx:
        score += 2
    # Category explicitly requested.
    if cat in req:
        score += 2
    # Tag overlap with requested tags.
    score += 2 * len(tags & req)
    # Any ad tag mentioned in the context text.
    score += sum(1 for t in tags if t and t in ctx)
    return score


def weighted_choice(
    candidates: list[dict],
    rng: random.Random | None = None,
) -> Optional[dict]:
    """Pick one candidate, weighted by ``_weight`` (bid × relevance).

    Pure function (inject ``rng`` for deterministic tests). Returns None for an
    empty list. Non-positive weights fall back to a uniform pick.
    """
    if not candidates:
        return None
    r = rng or random
    weights = [max(c.get("_weight", 0.0), 0.0) for c in candidates]
    total = sum(weights)
    if total <= 0:
        return r.choice(candidates)
    return r.choices(candidates, weights=weights, k=1)[0]


async def select_best_ad(
    db: AsyncSession,
    context: str,
    tags: list[str],
    agent: str,
    surface: str,
    user_wallet: str,
) -> Optional[dict]:
    """Select the best matching ad from available inventory.

    1. Daily cap: bail if the user already hit their per-day impression cap.
    2. Candidates: active ads on active campaigns with budget for the bid,
       not expired, and not shown to this user within the frequency window.
    3. Rank: weight = bid × (1 + relevance), then bid-weighted random pick.
    """
    # 1. Per-user daily cap (server-authoritative — never trust the client).
    cap_row = (
        await db.execute(
            text(
                "SELECT count(*) AS n FROM impressions "
                "WHERE user_wallet = :wallet "
                "AND created_at > now() - interval '1 day'"
            ),
            {"wallet": user_wallet},
        )
    ).mappings().first()
    if cap_row and cap_row["n"] >= MAX_IMPRESSIONS_PER_USER_PER_DAY:
        return None

    # 2. Servable candidates.
    rows = (
        await db.execute(
            text(
                """
                SELECT a.id, a.title, a.body, a.cta_text, a.cta_url,
                       a.image_url, a.category, a.tags, a.bid_per_impression
                FROM ads a
                JOIN campaigns c ON c.id = a.campaign_id
                WHERE a.status = 'active'
                  AND c.status = 'active'
                  AND c.budget_remaining >= a.bid_per_impression
                  AND (a.expires_at IS NULL OR a.expires_at > now())
                  AND NOT EXISTS (
                        SELECT 1 FROM impressions i
                        WHERE i.ad_id = a.id
                          AND i.user_wallet = :wallet
                          AND i.created_at > now()
                              - make_interval(mins => :window)
                  )
                """
            ),
            {"wallet": user_wallet, "window": AD_FREQUENCY_WINDOW_MINUTES},
        )
    ).mappings().all()

    if not rows:
        return None

    # 3. Score + bid-weighted selection.
    candidates: list[dict] = []
    for row in rows:
        ad = dict(row)
        bid = float(ad["bid_per_impression"])
        relevance = tag_match_score(
            ad["category"], list(ad["tags"] or []), context, tags
        )
        ad["_weight"] = bid * (1 + relevance)
        candidates.append(ad)

    chosen = weighted_choice(candidates)
    if chosen is None:
        return None

    # Normalize for the response layer.
    chosen["id"] = str(chosen["id"])
    chosen["bid_per_impression"] = float(chosen["bid_per_impression"])
    chosen.pop("_weight", None)
    return chosen
