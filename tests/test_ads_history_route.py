"""Ads history route is registered on the earnings router."""

from server.routes.earnings import router as earnings_router


def test_ads_history_route_registered():
    paths = {getattr(r, "path", None) for r in earnings_router.routes}
    assert "/{wallet_address}/ads" in paths


def test_ads_history_handler_exists():
    route = next(
        r
        for r in earnings_router.routes
        if getattr(r, "path", None) == "/{wallet_address}/ads"
    )
    assert "GET" in getattr(route, "methods", set())
    assert route.endpoint.__name__ == "get_ads_history"
