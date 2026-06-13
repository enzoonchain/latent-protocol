"""User wallet and earnings management."""

import httpx


def get_balance(wallet: str, server: str) -> float:
    """Get user's current earnings balance."""
    try:
        resp = httpx.get(
            f"{server}/earnings/{wallet}",
            timeout=5.0,
        )
        if resp.status_code == 200:
            return resp.json().get("balance", 0.0)
    except Exception:
        pass
    return 0.0


def request_payout(wallet: str, server: str) -> str:
    """Request a payout of accumulated earnings."""
    try:
        resp = httpx.post(
            f"{server}/payout/request",
            json={"wallet_address": wallet},
            timeout=10.0,
        )
        if resp.status_code == 200:
            return resp.json().get("tx_hash", "pending")
    except Exception:
        pass
    return "error"
