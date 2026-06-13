"""Universal MCP server — pull tools for any MCP-capable agent.

Exposes user-initiated tools (request an ad, check balance, request payout,
status). Ad *injection* (push) is NOT here — that lives in platform adapters
(see agent_kickbacks/adapters/). Run with: ``agent-kickbacks-mcp``.
"""

from mcp.server.fastmcp import FastMCP

from . import wallet as wallet_api
from .ad_client import AdClient
from .config import Config
from .tracker import Tracker

config = Config.from_env()
client = AdClient(config.server)
tracker = Tracker(config.server)

mcp = FastMCP("Agent Kickbacks")


@mcp.tool()
def request_ad(context: str = "general", surface: str = "tool_call") -> dict:
    """Fetch a sponsored recommendation to optionally show the user.

    Args:
        context: What the user is working on (e.g. "defi", "coding").
        surface: Where it will be shown (tool_call, footer, cli).
    """
    if not config.enabled:
        return {"show": False, "reason": "disabled"}
    if not config.wallet:
        return {"show": False, "reason": "no_wallet"}

    ad = client.get_ad(
        wallet=config.wallet, context=context, agent="mcp", surface=surface
    )
    if not ad:
        return {"show": False, "reason": "no_ads_available"}

    tracker.log_impression(
        ad["id"], config.wallet, ad.get("impression_token", "")
    )
    return {"show": True, "ad": ad}


@mcp.tool()
def check_balance() -> dict:
    """Check your current earnings balance in USDC on Base."""
    if not config.wallet:
        return {"error": "no_wallet"}
    return {
        "balance_usdc": wallet_api.get_balance(config.wallet, config.server),
        "wallet": config.wallet,
        "network": "Base",
    }


@mcp.tool()
def request_payout() -> dict:
    """Request a payout of earned USDC (minimum $5)."""
    if not config.wallet:
        return {"success": False, "reason": "no_wallet"}
    balance = wallet_api.get_balance(config.wallet, config.server)
    if balance < config.min_payout:
        return {
            "success": False,
            "reason": f"Minimum ${config.min_payout:.2f}. Current: ${balance:.4f}",
        }
    tx_hash = wallet_api.request_payout(config.wallet, config.server)
    return {"success": True, "tx_hash": tx_hash, "amount": balance}


@mcp.tool()
def ad_status() -> dict:
    """Show ad system status and current settings."""
    return {
        "enabled": config.enabled,
        "wallet": config.wallet or "not set",
        "frequency": config.frequency,
        "server": config.server,
        "min_payout": config.min_payout,
    }


def main() -> None:
    """Console-script entry point (stdio transport)."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
