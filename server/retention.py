"""Periodic retention sweep for fast-growing tables.

ad_events grows ~2-3 rows per ad request and is only used for debugging /
admin history. Without retention it grows unbounded. This module deletes
rows older than `AD_EVENTS_RETENTION_DAYS` (default 90) on a schedule
(`AD_EVENTS_RETENTION_INTERVAL_HOURS`, default 24h), in small batches so a
single DELETE never locks the table for long.

Best-effort: a failed sweep is logged and retried next interval — it must
never crash the server.
"""

import asyncio
import logging

from sqlalchemy import text

from server.config import (
    AD_EVENTS_RETENTION_DAYS,
    AD_EVENTS_RETENTION_INTERVAL_HOURS,
)

logger = logging.getLogger("latent-protocol.retention")

_BATCH = 10_000


async def _sweep_events_once(factory) -> int:
    """Delete one batch of expired ad_events. Returns rows deleted."""
    cutoff_days = AD_EVENTS_RETENTION_DAYS
    if cutoff_days <= 0:
        return 0
    async with factory() as db:
        result = await db.execute(
            text(
                """
                DELETE FROM ad_events
                WHERE id IN (
                    SELECT id FROM ad_events
                    WHERE created_at < now() - make_interval(days => :days)
                    LIMIT :batch
                )
                """
            ),
            {"days": cutoff_days, "batch": _BATCH},
        )
        await db.commit()
        return result.rowcount or 0


async def run_retention_sweep() -> int:
    """Run one full retention sweep (batched). Returns total rows deleted."""
    from server.database import session_factory

    total = 0
    while True:
        deleted = await _sweep_events_once(session_factory())
        total += deleted
        if deleted < _BATCH:
            break
        # Small pause between batches so we never starve the connection pool.
        await asyncio.sleep(0.1)
    if total:
        logger.info("retention sweep: deleted %d ad_events rows", total)
    return total


async def retention_loop() -> None:
    """Periodic sweep task (AD_EVENTS_RETENTION_INTERVAL_HOURS)."""
    interval_hours = AD_EVENTS_RETENTION_INTERVAL_HOURS
    if interval_hours <= 0 or AD_EVENTS_RETENTION_DAYS <= 0:
        return
    while True:
        await asyncio.sleep(interval_hours * 3600)
        try:
            await run_retention_sweep()
        except Exception as exc:  # noqa: BLE001 — never kill the server
            logger.error("retention sweep failed: %s", exc)
