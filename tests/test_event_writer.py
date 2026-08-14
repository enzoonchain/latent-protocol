"""Tests for the batched async ad_events writer."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

from server import tracker
from server.tracker import log_ad_event, start_event_writer, stop_event_writer


def _reset_writer():
    tracker._event_queue = None
    tracker._event_writer_task = None


def test_log_ad_event_sync_path_uses_db():
    """Without a running writer, events are inserted synchronously."""
    _reset_writer()
    db = MagicMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()

    async def _run():
        await log_ad_event(
            db, event_type="request_no_fill", user_wallet="0xabc", reason="test"
        )

    asyncio.run(_run())
    db.execute.assert_awaited()
    db.commit.assert_awaited()


def test_log_ad_event_enqueues_when_writer_running():
    """With the writer running, events are queued, not written synchronously."""
    _reset_writer()
    start_event_writer()
    try:
        db = MagicMock()
        db.execute = AsyncMock()
        db.commit = AsyncMock()

        async def _run():
            await log_ad_event(
                db, event_type="request_filled", user_wallet="0xabc", ad_id="ad-1"
            )

        asyncio.run(_run())
        # Enqueued → the caller's session is untouched (async path).
        db.execute.assert_not_awaited()
        db.commit.assert_not_awaited()
        assert tracker._event_queue is not None
    finally:
        asyncio.run(stop_event_writer())


def test_writer_flushes_enqueued_events():
    """stop_event_writer flushes remaining events and stops the task."""
    _reset_writer()
    start_event_writer()
    flushed = []

    async def fake_flush(batch):
        flushed.extend(batch)

    original = tracker._flush_events
    tracker._flush_events = fake_flush
    try:
        db = MagicMock()

        async def _run():
            await log_ad_event(db, event_type="click_credited", user_wallet="0xabc")

        asyncio.run(_run())
        asyncio.run(stop_event_writer())
        assert tracker._event_queue is None
        assert len(flushed) >= 1
        assert flushed[0]["event_type"] == "click_credited"
    finally:
        tracker._flush_events = original
        _reset_writer()
