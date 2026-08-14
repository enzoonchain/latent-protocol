"""Tests for the in-process matcher caches (inventory, daily caps, frequency)."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

from server import matcher
from server.matcher import (
    _daily_cap_for,
    _inventory,
    _record_shown,
    _seen_recently,
    select_best_ad,
)
from server.config import AD_FREQUENCY_WINDOW_MINUTES


def _reset_caches():
    matcher._inventory_cache = {"ts": 0.0, "rows": None}
    matcher._daily_caps.clear()
    matcher._last_shown.clear()


def test_daily_cap_cached_per_day():
    _reset_caches()
    calls = {"n": 0}

    class _Result:
        def mappings(self):
            return self

        def first(self):
            calls["n"] += 1
            return {"n": 3}

    db = MagicMock()

    async def execute(*_a, **_k):
        return _Result()

    db.execute = execute

    async def _run():
        first = await _daily_cap_for(db, "0xwallet")
        second = await _daily_cap_for(db, "0xwallet")
        return first, second

    first, second = asyncio.run(_run())
    assert first == 3
    assert second == 3
    # Second call is served from cache (DB hit once).
    assert calls["n"] == 1


def test_inventory_cached_with_ttl():
    _reset_caches()
    calls = {"n": 0}
    rows = [{"id": "ad-1", "title": "Test", "bid_per_impression": 0.005}]

    class _Result:
        def mappings(self):
            return self

        def all(self):
            calls["n"] += 1
            return rows

    db = MagicMock()

    async def execute(*_a, **_k):
        return _Result()

    db.execute = execute

    async def _run():
        a = await _inventory(db)
        b = await _inventory(db)
        return a, b

    a, b = asyncio.run(_run())
    assert a == b == rows
    assert calls["n"] == 1  # second call served from cache


def test_seen_recently_respects_window():
    _reset_caches()
    now = 1_000_000.0
    _record_shown("0xwallet", "ad-1", now)
    # Freshly shown → seen recently.
    assert _seen_recently("0xwallet", "ad-1", now + 1)
    # Outside the window → no longer recent.
    outside = AD_FREQUENCY_WINDOW_MINUTES * 60 + 1
    assert not _seen_recently("0xwallet", "ad-1", now + outside)
    # Different wallet / ad not affected.
    assert not _seen_recently("0xother", "ad-1", now + 1)
    assert not _seen_recently("0xwallet", "ad-2", now + 1)


def test_record_shown_increments_daily_cap():
    _reset_caches()
    _record_shown("0xwallet", "ad-1", 1_000_000.0)
    _record_shown("0xwallet", "ad-2", 1_000_001.0)
    today = matcher._today_key()
    assert matcher._daily_caps["0xwallet"] == (today, 2)


def test_select_best_ad_cache_path_uses_cached_inventory():
    _reset_caches()
    rows = [{"id": "ad-1", "title": "T", "body": "B", "cta_text": "Go",
             "cta_url": "https://x", "image_url": None, "category": "general",
             "tags": [], "bid_per_impression": 0.005}]

    class _Result:
        def mappings(self):
            return self

        def first(self):
            return {"n": 0}

        def all(self):
            return rows

    db = MagicMock()

    async def execute(*_a, **_k):
        return _Result()

    db.execute = execute
    db.commit = AsyncMock()

    async def _run():
        return await select_best_ad(
            db, context="hello", tags=[], agent="hermes", surface="footer",
            user_wallet="0xwallet",
        )

    chosen = asyncio.run(_run())
    assert chosen is not None
    assert chosen["id"] == "ad-1"
    # Served → recorded in last_shown + daily cap.
    assert matcher._last_shown["0xwallet"]["ad-1"] > 0
    assert matcher._daily_caps["0xwallet"][1] == 1
