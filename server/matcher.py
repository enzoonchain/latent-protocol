"""Ad targeting and selection engine.

Selects the best ad based on context, tags, and bid amount, against the
Postgres inventory. Pure scoring/selection helpers are kept separate so they
can be unit-tested without a database.

Performance: with `AD_MEMORY_CACHE` enabled (default), the servable inventory
and per-user daily caps / frequency windows are cached in-process so the hot
path (`/ad/request`) does not hit Postgres on every request. These caches are
single-instance only — for multi-instance deploys set `AD_MEMORY_CACHE=false`
(or replace the in-memory stores with Redis).
"""

import random
import time
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import (
    AD_FREQUENCY_WINDOW_MINUTES,
    AD_INVENTORY_TTL_SECONDS,
    AD_MEMORY_CACHE_ENABLED,
    MAX_IMPRESSIONS_PER_USER_PER_DAY,
)

# ── In-process caches (single instance) ───────────────────────────────────

_inventory_cache: dict = {"ts": 0.0, "rows": None}
# wallet -> (yyyymmdd, count)
_daily_caps: dict[str, tuple[str, int]] = {}
# wallet -> {ad_id: last_shown_epoch}
_last_shown: dict[str, dict[str, float]] = {}

# Bound memory growth of the per-user maps.
_MAX_CACHED_USERS = 20_000


def _today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def _now() -> float:
    return time.time()


def _prune_last_shown(now: float) -> None:
    """Drop stale per-user ad timestamps and evict idle users."""
    window = AD_FREQUENCY_WINDOW_MINUTES * 60
    if len(_last_shown) <= _MAX_CACHED_USERS:
        return
    for wallet in list(_last_shown.keys()):
        entries = _last_shown[wallet]
        for ad_id in list(entries.keys()):
            if now - entries[ad_id] > window:
                del entries[ad_id]
        if not entries:
            del _last_shown[wallet]


# ── Pure scoring/selection helpers ────────────────────────────────────────


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


# ── Inventory loading (cached) ────────────────────────────────────────────


async def _load_inventory(db: AsyncSession) -> list[dict]:
    """Servable ads: active ad on an active campaign with budget, not expired.

    Per-user filters (daily cap, frequency window) are applied separately so
    this result can be cached across users.
    """
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
                  AND c.budget_remaining > 0
                  AND c.budget_remaining >= a.bid_per_impression
                  AND (a.expires_at IS NULL OR a.expires_at > now())
                """
            )
        )
    ).mappings().all()
    return [dict(r) for r in rows]


async def _inventory(db: AsyncSession) -> list[dict]:
    """Cached servable inventory (TTL = AD_INVENTORY_TTL_SECONDS)."""
    global _inventory_cache
    now = _now()
    if now - _inventory_cache["ts"] < AD_INVENTORY_TTL_SECONDS:
        return list(_inventory_cache["rows"] or [])
    rows = await _load_inventory(db)
    _inventory_cache = {"ts": now, "rows": rows}
    return list(rows)


async def _daily_cap_for(db: AsyncSession, wallet: str) -> int:
    """Daily impression count for a user, cached per UTC day."""
    today = _today_key()
    entry = _daily_caps.get(wallet)
    if entry and entry[0] == today:
        return entry[1]
    row = (
        await db.execute(
            text(
                "SELECT count(*) AS n FROM impressions "
                "WHERE user_wallet = :wallet "
                "AND created_at > now() - interval '1 day'"
            ),
            {"wallet": wallet},
        )
    ).mappings().first()
    n = int(row["n"]) if row else 0
    _daily_caps[wallet] = (today, n)
    return n


def _seen_recently(wallet: str, ad_id: str, now: float) -> bool:
    """True if this user was shown this ad within the frequency window."""
    entries = _last_shown.get(wallet)
    if not entries:
        return False
    last = entries.get(str(ad_id))
    return last is not None and (now - last) < AD_FREQUENCY_WINDOW_MINUTES * 60


def _record_shown(wallet: str, ad_id: str, now: float) -> None:
    _last_shown.setdefault(wallet, {})[str(ad_id)] = now
    today = _today_key()
    entry = _daily_caps.get(wallet)
    _daily_caps[wallet] = (today, (entry[1] + 1) if entry and entry[0] == today else 1)


# ── Selection ─────────────────────────────────────────────────────────────


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
    if not AD_MEMORY_CACHE_ENABLED:
        return await _select_best_ad_db(
            db, context, tags, agent, surface, user_wallet
        )
    return await _select_best_ad_cached(
        db, context, tags, agent, surface, user_wallet
    )


async def _select_best_ad_cached(
    db: AsyncSession,
    context: str,
    tags: list[str],
    agent: str,
    surface: str,
    user_wallet: str,
) -> Optional[dict]:
    """Selection with in-process caches (daily cap, inventory, frequency)."""
    now = _now()

    # 1. Per-user daily cap (server-authoritative, cached per UTC day).
    if await _daily_cap_for(db, user_wallet) >= MAX_IMPRESSIONS_PER_USER_PER_DAY:
        return None

    # 2. Servable candidates (cached inventory, minus recently-shown ads).
    rows = [
        ad
        for ad in await _inventory(db)
        if not _seen_recently(user_wallet, ad["id"], now)
    ]
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

    _record_shown(user_wallet, chosen["id"], now)
    _prune_last_shown(now)

    # Normalize for the response layer.
    chosen["id"] = str(chosen["id"])
    chosen["bid_per_impression"] = float(chosen["bid_per_impression"])
    chosen.pop("_weight", None)
    return chosen


async def _select_best_ad_db(
    db: AsyncSession,
    context: str,
    tags: list[str],
    agent: str,
    surface: str,
    user_wallet: str,
) -> Optional[dict]:
    """DB-authoritative selection (no in-memory caching)."""
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
                  AND c.budget_remaining > 0
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
