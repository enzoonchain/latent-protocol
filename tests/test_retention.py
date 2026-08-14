"""Tests for the ad_events retention sweep."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from server import retention
from server.retention import _sweep_events_once, retention_loop, run_retention_sweep


def test_sweep_deletes_expired_batch():
    factory = MagicMock()
    db = MagicMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.execute.return_value.rowcount = 10_000
    factory.return_value.__aenter__ = AsyncMock(return_value=db)
    factory.return_value.__aexit__ = AsyncMock(return_value=False)

    async def _run():
        return await _sweep_events_once(factory)

    deleted = asyncio.run(_run())
    assert deleted == 10_000
    db.commit.assert_awaited()


def test_sweep_disabled_when_retention_zero():
    factory = MagicMock()
    with patch.object(retention, "AD_EVENTS_RETENTION_DAYS", 0):
        async def _run():
            return await _sweep_events_once(factory)

        assert asyncio.run(_run()) == 0
    factory.assert_not_called()


def test_run_retention_sweep_stops_when_batch_partial():
    calls = {"n": 0}

    async def fake_once(factory):
        calls["n"] += 1
        return 10_000 if calls["n"] == 1 else 5_000

    with patch.object(retention, "_sweep_events_once", fake_once):
        total = asyncio.run(run_retention_sweep())
    assert total == 15_000
    assert calls["n"] == 2  # one full batch, then partial → stop


def test_retention_loop_gated_by_interval():
    with patch.object(retention, "AD_EVENTS_RETENTION_INTERVAL_HOURS", 0), patch.object(
        retention, "AD_EVENTS_RETENTION_DAYS", 90
    ):
        assert asyncio.run(retention_loop()) is None


def test_retention_loop_gated_by_days():
    with patch.object(retention, "AD_EVENTS_RETENTION_INTERVAL_HOURS", 24), patch.object(
        retention, "AD_EVENTS_RETENTION_DAYS", 0
    ):
        assert asyncio.run(retention_loop()) is None
