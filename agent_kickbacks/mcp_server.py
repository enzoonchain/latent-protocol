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


@mcp.tool()
def setup_wallet(mode: str = "generate", address: str = "") -> dict:
    """Set up your earning wallet. Call this once to start earning USDC.

    Args:
        mode: "generate" to create a new wallet, "import" to use an existing address.
        address: Your existing EVM address (only needed when mode="import").

    Returns when mode="generate":
        address, private_key (save this!), and a reminder to import into MetaMask.
    Returns when mode="import":
        Confirmation that the address was saved.
    """
    from .setup import generate_wallet, is_valid_address, save_config_file

    if mode == "generate":
        addr, private_key = generate_wallet()
        save_config_file({"wallet": addr})
        # Reload so subsequent tool calls in this session use the new wallet
        config.wallet = addr
        return {
            "success": True,
            "address": addr,
            "private_key": private_key,
            "warning": (
                "Save your private key now — it will NOT be shown again. "
                "Import it into MetaMask or any EVM wallet to access your USDC earnings. "
                "Agent Kickbacks only stores your address."
            ),
            "next": "Your wallet is active. Ads will now earn you USDC automatically.",
        }

    if mode == "import":
        if not address:
            return {"success": False, "error": "Provide your wallet address in the 'address' field."}
        if not is_valid_address(address):
            return {"success": False, "error": "Invalid EVM address. Must be 0x + 40 hex chars."}
        save_config_file({"wallet": address})
        config.wallet = address
        return {
            "success": True,
            "address": address,
            "next": "Wallet saved. Ads will now earn USDC to this address.",
        }

    return {"success": False, "error": "mode must be 'generate' or 'import'"}


@mcp.tool()
def inject_footer(text: str, style: str = "markdown", context: str = "general") -> dict:
    """Append a sponsored footer to *text* and return the result.

    Use this when you generate a response yourself and want to append an ad
    without a push adapter.  Pairs with ``request_ad`` — call ``request_ad``
    to decide whether to show, then ``inject_footer`` to render + track.

    Args:
        text:    The LLM response you're about to display.
        style:   Footer format — "markdown" (default), "cli", or "telegram".
        context: Topic hint for ad targeting (e.g. "defi", "coding").

    Returns:
        {text: str, injected: bool}
    """
    if not config.enabled or not config.wallet:
        return {"text": text, "injected": False}

    from .footer import FrequencyCounter, format_footer

    # Per-tool frequency counter (persists across calls in this process)
    if not hasattr(inject_footer, "_counter"):
        inject_footer._counter = FrequencyCounter(config.frequency)  # type: ignore[attr-defined]
    if not inject_footer._counter.tick():  # type: ignore[attr-defined]
        return {"text": text, "injected": False}

    ad = client.get_ad(
        wallet=config.wallet,
        context=(context or "general")[:100],
        agent="mcp",
        surface="response_footer",
    )
    if not ad:
        return {"text": text, "injected": False}

    tracker.log_impression(ad["id"], config.wallet, ad.get("impression_token", ""))
    allowed = {"markdown", "cli", "telegram"}
    footer = format_footer(ad, style=style if style in allowed else "markdown")
    return {"text": text + footer, "injected": True}


@mcp.tool()
def platform_info() -> dict:
    """Detect the current agent platform and return integration instructions.

    Returns:
        {platform, style, instructions, example_code}
    """
    from .adapters.unified import STYLE_MAP, detect_platform

    platform = detect_platform()
    instructions = {
        "hermes": (
            "Call UnifiedAdapter().register(ctx) inside your Hermes plugin "
            "register() function."
        ),
        "telegram": (
            "Call adapter.wrap_response(text, context=msg.text, user_id=str(uid)) "
            "before sending each bot reply."
        ),
        "cli": (
            "Decorate your response function with @adapter.inject, or call "
            "adapter.wrap(text) directly."
        ),
        "mcp": (
            "You're already in MCP mode. Use request_ad + inject_footer tools, "
            "or add this server to your MCP client config."
        ),
    }
    examples = {
        "hermes": (
            "from agent_kickbacks.adapters.unified import UnifiedAdapter\n"
            "def register(ctx):\n"
            "    UnifiedAdapter().register(ctx)"
        ),
        "telegram": (
            "from agent_kickbacks.adapters.unified import UnifiedAdapter\n"
            "adapter = UnifiedAdapter()\n"
            "async def reply(update, ctx):\n"
            "    text = await llm(update.message.text)\n"
            "    await update.message.reply_text(\n"
            "        adapter.wrap_response(text,\n"
            "            context=update.message.text,\n"
            "            user_id=str(update.effective_user.id)),\n"
            "        parse_mode='Markdown')"
        ),
        "cli": (
            "from agent_kickbacks.adapters.unified import UnifiedAdapter\n"
            "adapter = UnifiedAdapter()\n\n"
            "@adapter.inject\n"
            "def ask(prompt: str) -> str:\n"
            "    return call_llm(prompt)"
        ),
        "mcp": (
            '# Add to claude_desktop_config.json / mcp.json:\n'
            '{\n'
            '  "mcpServers": {\n'
            '    "agent-kickbacks": {\n'
            '      "command": "agent-kickbacks-mcp"\n'
            '    }\n'
            '  }\n'
            '}'
        ),
    }
    return {
        "platform": platform,
        "style": STYLE_MAP.get(platform, "markdown"),
        "instructions": instructions.get(platform, ""),
        "example_code": examples.get(platform, ""),
    }


def main() -> None:
    """Console-script entry point (stdio transport)."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
