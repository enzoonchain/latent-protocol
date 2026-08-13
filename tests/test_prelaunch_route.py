"""Pre-launch route registration."""

from server.routes.prelaunch import router as prelaunch_router


def test_prelaunch_register_route_registered():
    paths = {getattr(r, "path", None) for r in prelaunch_router.routes}
    assert "/register" in paths


def test_prelaunch_count_route_registered():
    paths = {getattr(r, "path", None) for r in prelaunch_router.routes}
    assert "/count" in paths


def test_prelaunch_feed_route_registered():
    paths = {getattr(r, "path", None) for r in prelaunch_router.routes}
    assert "/feed" in paths


def test_prelaunch_signups_admin_route_registered():
    paths = {getattr(r, "path", None) for r in prelaunch_router.routes}
    assert "/signups" in paths
    assert "/signups/{wallet_address}" in paths
