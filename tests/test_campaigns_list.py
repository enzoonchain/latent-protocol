"""Tests for the N+1-free list_campaigns ads payload parsing."""

import json

from server.routes.campaigns import _parse_ads, router


def test_list_campaigns_route_registered():
    paths = {getattr(r, "path", None) for r in router.routes}
    assert "/" in paths


def test_parse_ads_from_json_string():
    raw = json.dumps(
        [
            {"id": "ad-1", "title": "One", "body": "B1", "bid": 0.005},
            {"id": "ad-2", "title": "Two", "body": "B2", "bid": 0.01},
        ]
    )
    ads = _parse_ads(raw)
    assert len(ads) == 2
    assert ads[0] == {"id": "ad-1", "title": "One", "body": "B1", "bid": 0.005}
    assert ads[1]["bid"] == 0.01


def test_parse_ads_from_list():
    ads = _parse_ads([{"id": "ad-1", "title": "One", "body": "B1", "bid": 0.005}])
    assert len(ads) == 1
    assert ads[0]["id"] == "ad-1"


def test_parse_ads_empty():
    assert _parse_ads(None) == []
    assert _parse_ads("[]") == []
    assert _parse_ads("not json") == []
