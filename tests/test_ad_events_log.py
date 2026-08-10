"""Unit tests for non-billable ad_event audit helper."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

from server.tracker import log_ad_event


def test_log_ad_event_swallows_db_errors():
    db = MagicMock()
    db.execute = AsyncMock(side_effect=RuntimeError("db down"))
    db.rollback = AsyncMock()
    db.commit = AsyncMock()

    async def _run():
        await log_ad_event(
            db,
            event_type="request_no_fill",
            user_wallet="0xabc",
            reason="no_matching_ad",
            agent="hermes",
            surface="webui_footer",
        )

    asyncio.run(_run())
    db.rollback.assert_awaited()


def test_ads_events_admin_route_registered():
    from server.routes.ads import router

    paths = {getattr(r, "path", None) for r in router.routes}
    assert "/events" in paths
