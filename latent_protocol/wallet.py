"""User wallet / earnings helpers (talk to the ad server API)."""

import httpx


def get_balance(wallet: str, server: str) -> float:
    """Current claimable earnings balance for a wallet."""
    try:
        resp = httpx.get(f"{server.rstrip('/')}/earnings/{wallet}", timeout=5.0)
        if resp.status_code == 200:
            return float(resp.json().get("balance", 0.0))
    except httpx.HTTPError:
        pass
    return 0.0


def request_payout(wallet: str, server: str) -> str:
    """Request a payout of accumulated earnings; returns a tx hash or status."""
    try:
        resp = httpx.post(
            f"{server.rstrip('/')}/payout/request",
            json={"wallet_address": wallet},
            timeout=10.0,
        )
        if resp.status_code == 200:
            return resp.json().get("tx_hash", "pending")
    except httpx.HTTPError:
        pass
    return "error"
