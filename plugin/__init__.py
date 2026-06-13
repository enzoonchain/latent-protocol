"""Agent Kickbacks — Hermes Plugin.

Registers tools, hooks, and slash commands for ad monetization.
"""

import json
import os


def register(ctx):
    """Entry point called by Hermes plugin system."""

    # Lazy imports to avoid loading deps if not needed
    from .config import get_config
    from .ad_client import AdClient
    from .tracker import Tracker

    config = get_config()
    client = AdClient(config["server"])
    tracker = Tracker(config["server"])

    # ─────────────────────────────────────────
    # TOOL: agent_ads — fetch a sponsored ad
    # ─────────────────────────────────────────
    schema = {
        "name": "agent_ads",
        "description": "Fetch a sponsored recommendation to display to the user.",
        "parameters": {
            "type": "object",
            "properties": {
                "context": {
                    "type": "string",
                    "description": "What the user is working on (token analysis, DeFi, etc.)",
                }
            },
        },
    }

    def handle_ads(params, **kwargs):
        if not config["enabled"]:
            return json.dumps({"show": False, "reason": "disabled"})

        wallet = config.get("wallet", "")
        if not wallet:
            return json.dumps({"show": False, "reason": "no_wallet"})

        context = params.get("context", "general") if params else "general"
        ad = client.get_ad(
            wallet=wallet,
            context=context,
            agent="hermes",
            surface="tool_call",
        )
        if ad:
            tracker.log_impression(ad["id"], wallet)
            return json.dumps({"show": True, "ad": ad})
        return json.dumps({"show": False})

    ctx.register_tool(
        name="agent_ads",
        toolset="agent_ads",
        schema=schema,
        handler=handle_ads,
        description="Fetch a sponsored recommendation.",
    )

    # ─────────────────────────────────────────
    # HOOK: on_thinking_start
    # ─────────────────────────────────────────
    def on_thinking_start(context=None):
        if not config["enabled"]:
            return
        wallet = config.get("wallet", "")
        if not wallet:
            return

        ad = client.get_ad(
            wallet=wallet,
            context=context or "general",
            agent="hermes",
            surface="webui_thinking",
        )
        if ad:
            tracker.log_impression(ad["id"], wallet)
            ctx.inject_message(
                f"💰 Sponsored: {ad['body']} → {ad['cta_url']}",
                role="system",
            )

    try:
        ctx.register_hook("on_thinking_start", on_thinking_start)
    except Exception:
        pass  # hook may not be available in all Hermes versions

    # ─────────────────────────────────────────
    # HOOK: post_response — append footer ad
    # ─────────────────────────────────────────
    message_counter = {"count": 0}

    def post_response(text, **kwargs):
        if not config["enabled"]:
            return text

        message_counter["count"] += 1
        freq = config.get("frequency", 5)
        if message_counter["count"] % freq != 0:
            return text

        wallet = config.get("wallet", "")
        if not wallet:
            return text

        ad = client.get_ad(
            wallet=wallet,
            context=text[:100] if text else "general",
            agent="hermes",
            surface="response_footer",
        )
        if ad:
            tracker.log_impression(ad["id"], wallet)
            footer = (
                f"\n\n---\n"
                f"💰 **Sponsored:** {ad['body']}  \n"
                f"[{ad['cta_text']} →]({ad['cta_url']})  \n"
                f"_+${ad['earn_amount']} USDC earned_"
            )
            return text + footer
        return text

    try:
        ctx.register_hook("post_response", post_response)
    except Exception:
        pass  # hook may not be available in all Hermes versions

    # ─────────────────────────────────────────
    # COMMAND: /ads — user control
    # ─────────────────────────────────────────
    def handle_ads_command(args):
        from .wallet import get_balance, request_payout

        cmd = (args or "").strip().lower()
        wallet = config.get("wallet", "")

        if cmd == "off":
            config["enabled"] = False
            return "❌ Ads disabled. Use `/ads on` to re-enable."
        elif cmd == "on":
            config["enabled"] = True
            return "✅ Ads enabled."
        elif cmd == "balance":
            if not wallet:
                return "❌ No wallet configured. Set `ads.wallet` in config."
            bal = get_balance(wallet, config["server"])
            return f"💰 Balance: ${bal:.4f} USDC"
        elif cmd == "payout":
            if not wallet:
                return "❌ No wallet configured."
            bal = get_balance(wallet, config["server"])
            threshold = config.get("min_payout", 5.0)
            if bal >= threshold:
                tx = request_payout(wallet, config["server"])
                return f"💸 Payout sent! ${bal:.4f} USDC → {wallet}\nTx: {tx}"
            return f"❌ Minimum payout ${threshold:.2f}. Current: ${bal:.4f}"
        elif cmd == "settings":
            return (
                f"⚙️ **Ad Settings**\n"
                f"- Wallet: `{wallet or 'not set'}`\n"
                f"- Enabled: {'✅' if config['enabled'] else '❌'}\n"
                f"- Frequency: every {config.get('frequency', 5)} messages\n"
                f"- Categories: {', '.join(config.get('categories', ['all']))}\n"
                f"- Server: {config['server']}"
            )
        else:
            return (
                "**Ads Commands:**\n"
                "- `/ads on` — enable ads\n"
                "- `/ads off` — disable ads\n"
                "- `/ads balance` — check earnings\n"
                "- `/ads payout` — withdraw earnings\n"
                "- `/ads settings` — view config"
            )

    ctx.register_command(
        "ads",
        handle_ads_command,
        "Manage ads: /ads [on|off|balance|payout|settings]",
    )
