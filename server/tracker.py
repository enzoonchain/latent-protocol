"""Impression and click tracking against Postgres.

Earnings are server-authoritative: the client may only *report* events, the
server decides what is billable and how much the user earns.

`log_ad_event` is a non-billable audit trail for admin debugging (every
request / fill / no-fill / bill / click outcome). It is written in batches
by a background writer when the event queue is running (see `start_event_writer`
/ `stop_event_writer`, wired in server.main lifespan) so per-request commits
don't slow down ad serving. Falls back to synchronous inserts when the queue
is not running (e.g. tests).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import (
    AD_EVENTS_BATCH_SIZE,
    AD_EVENTS_FLUSH_SECONDS,
    CLICK_MIN_VIEW_SECONDS,
    CLICK_MULTIPLIER,
    IMPRESSION_REPLAY_WINDOW_SECONDS,
    USER_SHARE,
)

# ── Async ad_events writer ────────────────────────────────────────────────

_AD_EVENT_INSERT = text(
    """
    INSERT INTO ad_events
        (user_wallet, event_type, reason, ad_id, agent, surface,
         context, tags, ip, earned, meta)
    VALUES
        (:wallet, :event_type, :reason,
         CAST(:ad_id AS uuid), :agent, :surface, :context,
         CAST(:tags AS text[]), :ip, :earned,
         CAST(:meta AS jsonb))
    """
)

_event_queue: asyncio.Queue | None = None
_event_writer_task: asyncio.Task | None = None
_STOP = object()


def _build_event_payload(
    *,
    event_type: str,
    user_wallet: str = "",
    reason: str = "",
    ad_id: Optional[str] = None,
    agent: str = "",
    surface: str = "",
    context: str = "",
    tags: Optional[list[str]] = None,
    ip: str = "",
    earned: float = 0.0,
    meta: Optional[dict[str, Any]] = None,
) -> dict:
    return {
        "wallet": user_wallet or "",
        "event_type": event_type,
        "reason": reason or "",
        "ad_id": ad_id,
        "agent": agent or "",
        "surface": surface or "",
        "context": (context or "")[:500],
        "tags": tags or [],
        "ip": ip or "",
        "earned": float(earned or 0),
        "meta": json.dumps(meta or {}),
    }


async def _flush_events(batch: list[dict]) -> None:
    """Insert a batch of ad_events with one executemany + commit.

    Best-effort: audit logging must never break ad serving, so any failure is
    logged and the batch is dropped.
    """
    if not batch:
        return
    from server.database import session_factory

    try:
        factory = session_factory()
        async with factory() as session:
            await session.execute(_AD_EVENT_INSERT, batch)
            await session.commit()
    except Exception as exc:  # noqa: BLE001 — audit must never break serving
        print(f"[latent-protocol] ad_event batch flush failed ({len(batch)} events): {exc}")


async def _event_writer() -> None:
    """Drain the queue into batches, flush each batch, stop on _STOP sentinel."""
    assert _event_queue is not None
    while True:
        batch: list[dict] = []
        try:
            item = await asyncio.wait_for(_event_queue.get(), timeout=AD_EVENTS_FLUSH_SECONDS)
        except asyncio.TimeoutError:
            item = None
        if item is _STOP:
            break
        if item is not None:
            batch.append(item)
        while len(batch) < AD_EVENTS_BATCH_SIZE and not _event_queue.empty():
            try:
                nxt = _event_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            if nxt is _STOP:
                # Sentinel seen while draining: flush what we have, then stop.
                await _flush_events(batch)
                return
            batch.append(nxt)
        await _flush_events(batch)


def _ensure_writer_task() -> None:
    """Create the writer task once a running event loop exists (lazy)."""
    global _event_writer_task
    if _event_queue is not None and _event_writer_task is None:
        _event_writer_task = asyncio.create_task(_event_writer())


def start_event_writer() -> None:
    """Start the background ad_events writer (idempotent).

    Only initializes the queue; the writer task is created lazily on the first
    enqueue (or via `_ensure_writer_task`) so it always runs on the right loop.
    """
    global _event_queue
    if _event_queue is not None:
        return
    _event_queue = asyncio.Queue()


async def stop_event_writer() -> None:
    """Flush remaining events and stop the writer (call on shutdown)."""
    global _event_queue, _event_writer_task
    if _event_queue is None:
        return
    _ensure_writer_task()
    await _event_queue.put(_STOP)
    if _event_writer_task is not None:
        try:
            await asyncio.wait_for(_event_writer_task, timeout=5)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            _event_writer_task.cancel()
    # Anything enqueued after the sentinel (tiny race at shutdown) — flush it.
    leftover: list[dict] = []
    while not _event_queue.empty():
        try:
            nxt = _event_queue.get_nowait()
        except asyncio.QueueEmpty:
            break
        if nxt is not _STOP:
            leftover.append(nxt)
    if leftover:
        await _flush_events(leftover)
    _event_queue = None
    _event_writer_task = None


# ── Audit log ──────────────────────────────────────────────────────────────

async def log_ad_event(
    db: AsyncSession,
    *,
    event_type: str,
    user_wallet: str = "",
    reason: str = "",
    ad_id: Optional[str] = None,
    agent: str = "",
    surface: str = "",
    context: str = "",
    tags: Optional[list[str]] = None,
    ip: str = "",
    earned: float = 0.0,
    meta: Optional[dict[str, Any]] = None,
) -> None:
    """Best-effort audit log. Never raises — must not break ad serving.

    When the async writer is running, the event is queued and the request
    returns immediately. Otherwise (tests, AD_EVENTS_ASYNC=false) it is
    inserted synchronously on the caller's session.
    """
    payload = _build_event_payload(
        event_type=event_type,
        user_wallet=user_wallet,
        reason=reason,
        ad_id=ad_id,
        agent=agent,
        surface=surface,
        context=context,
        tags=tags,
        ip=ip,
        earned=earned,
        meta=meta,
    )
    q = _event_queue
    if q is not None:
        q.put_nowait(payload)
        _ensure_writer_task()
        return
    try:
        await db.execute(_AD_EVENT_INSERT, payload)
        await db.commit()
    except Exception as exc:  # noqa: BLE001 — audit must never break serving
        try:
            await db.rollback()
        except Exception:
            pass
        print(f"[latent-protocol] ad_event log failed ({event_type}): {exc}")


# ── Earnings math ──────────────────────────────────────────────────────────

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
) -> bool:
    """Record a (confirmed-display) impression and credit the user.

    Revenue split: user 50% / operator 30% / protocol 20% of the bid. We store
    the user's share in `earnings` and debit the campaign budget by the full
    bid in one atomic step. Returns True if logged, False if skipped (unknown
    ad or replay within the dedup window).
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
        return False  # unknown ad — nothing billable

    # Anti-replay: ignore a duplicate impression for this ad+user logged within
    # the dedup window (a valid token can otherwise be replayed during its TTL).
    dup = (
        await db.execute(
            text(
                "SELECT 1 FROM impressions "
                "WHERE ad_id = CAST(:ad_id AS uuid) AND user_wallet = :wallet "
                "AND created_at > now() - make_interval(secs => :win) LIMIT 1"
            ),
            {"ad_id": ad_id, "wallet": user_wallet, "win": IMPRESSION_REPLAY_WINDOW_SECONDS},
        )
    ).first()
    if dup:
        return False

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
    return True


async def log_click(db: AsyncSession, ad_id: str, user_wallet: str) -> bool:
    """Record a click. Idempotent: only the first click on a given impression
    is credited (anti double-counting / click fraud), and only once the
    impression is at least CLICK_MIN_VIEW_SECONDS old (anti-misclick gate).

    Clicks are worth CLICK_MULTIPLIER × an impression. Returns True if credited.
    """
    # Mark the most recent un-clicked, sufficiently-viewed impression as clicked.
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
                      AND created_at <= now() - make_interval(secs => :min_view)
                    ORDER BY created_at DESC
                    LIMIT 1
                )
                RETURNING id
                """
            ),
            {"ad_id": ad_id, "wallet": user_wallet, "min_view": CLICK_MIN_VIEW_SECONDS},
        )
    ).mappings().first()
    if not clicked:
        return False  # no eligible impression, too fresh, or already credited

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
        return False
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
    return True
