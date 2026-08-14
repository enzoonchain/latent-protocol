"""Tests for the bulk payout sweep endpoint and background loop."""

from unittest.mock import MagicMock, patch

from server.routes import payouts as payouts_mod
from server.routes.payouts import router


def test_sweep_route_registered():
    paths = {getattr(r, "path", None) for r in router.routes}
    assert "/sweep" in paths


def test_sweep_route_requires_admin():
    route = next(r for r in router.routes if getattr(r, "path", None) == "/sweep")
    assert "POST" in getattr(route, "methods", set())
    # Admin dependency is wired via require_admin.
    assert route.dependant.dependencies
    assert any(
        dep.call is not None
        and getattr(dep.call, "__name__", "") == "require_admin"
        for dep in route.dependant.dependencies
    )


def test_sweep_all_isolates_per_wallet_errors():
    db = MagicMock()

    async def fake_eligible(_db, _min):
        return ["0xwallet-a", "0xwallet-b", "0xwallet-c"]

    async def fake_process(_db, wallet):
        if wallet == "0xwallet-b":
            raise RuntimeError("rpc down")
        return {
            "wallet": wallet,
            "payout_id": f"p-{wallet}",
            "amount": 6.0,
            "tx_hash": "0xtx",
            "status": "sent",
        }

    with patch.object(payouts_mod, "_eligible_wallets", fake_eligible), patch.object(
        payouts_mod, "_process_payout", fake_process
    ):
        result = __import__("asyncio").run(payouts_mod._sweep_all(db))

    assert result["eligible"] == 3
    assert result["paid"] == 2
    assert result["total_sent_usdc"] == 12.0
    statuses = {r["wallet"]: r["status"] for r in result["results"]}
    assert statuses["0xwallet-b"].startswith("error:")


def test_run_payout_sweep_skips_without_private_key():
    with patch.object(payouts_mod, "EVM_PRIVATE_KEY", ""):
        result = __import__("asyncio").run(payouts_mod.run_payout_sweep())
    assert result["skipped"] == "no_private_key"


def test_sweep_loop_is_gated_by_interval():
    # interval <= 0 → loop returns immediately (no scheduling).
    loop = payouts_mod.payout_sweep_loop
    with patch.object(payouts_mod, "PAYOUT_SWEEP_INTERVAL_MINUTES", 0):
        assert __import__("asyncio").run(loop()) is None
