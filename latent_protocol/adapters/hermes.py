"""Hermes push adapter — sponsored thinking-state + response footer.

Two ad surfaces, in priority order:

1. ``pre_llm_call`` — *thinking-state* injection. Fires once per turn before
   the tool-calling loop; Hermes appends the returned ``context`` to the user
   message, so the sponsor line is in front of the user while the agent thinks.
   ⚠️ Hermes issue #2817: ``pre_llm_call`` is *documented but not yet wired*
   (closed "not planned"). We register it forward-compatibly — it is a no-op on
   current builds and starts paying out automatically once Hermes invokes it.

2. ``transform_llm_output`` — *response footer*. The only hook that actually
   fires today, so it is the live revenue surface. Falls back to
   ``post_response`` on older builds.

Per-turn coordination keeps the two from double-serving: whenever the
thinking-state hook runs (shows an ad *or* decides to skip on the frequency
counter) it owns that turn, and the footer becomes a pure fallback for turns
where ``pre_llm_call`` never fired. All ad logic comes from the shared core;
this file is only the Hermes glue.
"""

from ..ad_client import AdClient
from ..config import Config
from ..footer import FrequencyCounter, format_footer
from ..tracker import Tracker
from .. import wallet as wallet_api


def register(ctx) -> None:
    """Entry point called by the Hermes plugin system."""
    config = Config.from_env()
    client = AdClient(config.server)
    tracker = Tracker(config.server)
    counter = FrequencyCounter(config.frequency)

    # Per-session record of which turns pre_llm_call already owns, so the
    # footer hook never serves a second ad in the same turn. Values:
    #   "shown" → thinking-state ad served; footer must skip.
    #   "skip"  → frequency counter said "not this turn"; footer must skip too
    #             (the turn is already counted; don't tick twice).
    # A missing key means pre_llm_call never fired (today's reality on builds
    # affected by Hermes #2817) → footer falls back to its own decision.
    turn_state: dict[str, str] = {}

    # Last ad served this process, so `/ads click` can attribute a click in
    # surfaces where the CTA isn't directly clickable (plain Hermes has no OSC 8
    # hyperlinks; only `hermes --tui` does). Clicks are worth 50x impressions.
    last_ad: dict[str, str | None] = {"id": None}

    def _fetch(text: str, surface: str) -> dict | None:
        ad = client.get_ad(
            wallet=config.wallet,
            context=(text or "general")[:100],
            agent="hermes",
            surface=surface,
        )
        if not ad:
            return None
        ad_id = ad.get("ad_id", ad.get("id", ""))
        tracker.log_impression(ad_id, config.wallet, ad.get("impression_token", ""))
        last_ad["id"] = ad_id or None
        return ad

    # Primary surface: thinking-state injection. Hermes appends the returned
    # `context` to the user message before the tool loop runs.
    def pre_llm_call(session_id=None, user_message="", **kwargs):
        if not config.enabled or not config.wallet:
            return None
        if not counter.tick():
            turn_state[session_id] = "skip"  # turn counted; suppress footer
            return None
        ad = _fetch(user_message, surface="thinking_state")
        if not ad:
            turn_state[session_id] = "skip"
            return None
        turn_state[session_id] = "shown"
        body = ad.get("body", "")
        cta_text = ad.get("cta_text", "Learn more")
        cta_url = ad.get("cta_url", "")
        return {"context": f"💡 Sponsored while you wait: {body} — {cta_text}: {cta_url}"}

    # Fallback surface: response footer. Owns the turn only when pre_llm_call
    # did not run for this session (e.g. Hermes builds without #2817 fixed).
    def _footer_for(text: str, session_id=None) -> str | None:
        if not config.enabled or not config.wallet:
            return None
        if session_id in turn_state:
            turn_state.pop(session_id, None)  # turn already owned by thinking hook
            return None
        if not counter.tick():
            return None
        ad = _fetch(text, surface="response_footer")
        return format_footer(ad, style="markdown") if ad else None

    def transform_llm_output(response_text, session_id=None, **kwargs):
        footer = _footer_for(response_text, session_id)
        return (response_text + footer) if footer else None

    # Fallback for older Hermes builds without transform_llm_output.
    def post_response(text, session_id=None, **kwargs):
        footer = _footer_for(text, session_id)
        return (text + footer) if footer else text

    for hook_name, fn in (
        ("pre_llm_call", pre_llm_call),
        ("transform_llm_output", transform_llm_output),
        ("post_response", post_response),
    ):
        try:
            ctx.register_hook(hook_name, fn)
        except Exception:
            pass  # hook may not exist in this Hermes version

    _register_command(ctx, config, tracker, last_ad)


def _register_command(ctx, config: Config, tracker: Tracker, last_ad: dict) -> None:
    """`/ads on|off|click|balance|payout|settings` — delegates to the shared core."""

    def handle(args):
        cmd = (args or "").strip().lower()
        wallet = config.wallet

        if cmd == "click":
            ad_id = last_ad.get("id")
            if not ad_id:
                return "ℹ️ No recent sponsored ad to click."
            if not wallet:
                return "❌ No wallet configured."
            tracker.log_click(ad_id, wallet)
            return "✅ Thanks! Click registered — you earn more for clicks."
        if cmd == "off":
            config.enabled = False
            return "❌ Ads disabled. Use `/ads on` to re-enable."
        if cmd == "on":
            config.enabled = True
            return "✅ Ads enabled."
        if cmd == "balance":
            if not wallet:
                return "❌ No wallet configured. Set `ADS_WALLET`."
            bal = wallet_api.get_balance(wallet, config.server)
            return f"💰 Balance: ${bal:.4f} USDC"
        if cmd == "payout":
            if not wallet:
                return "❌ No wallet configured."
            bal = wallet_api.get_balance(wallet, config.server)
            if bal >= config.min_payout:
                tx = wallet_api.request_payout(wallet, config.server)
                return f"💸 Payout sent! ${bal:.4f} USDC → {wallet}\nTx: {tx}"
            return f"❌ Minimum ${config.min_payout:.2f}. Current: ${bal:.4f}"
        if cmd == "settings":
            return (
                "⚙️ **Ad Settings**\n"
                f"- Wallet: `{wallet or 'not set'}`\n"
                f"- Enabled: {'✅' if config.enabled else '❌'}\n"
                f"- Frequency: every {config.frequency} messages\n"
                f"- Server: {config.server}"
            )
        if cmd == "setup generate":
            from .. import setup as setup_mod
            addr, private_key = setup_mod.generate_wallet()
            setup_mod.save_config_file({"wallet": addr})
            config.wallet = addr
            return (
                "✅ **New wallet generated!**\n\n"
                f"- **Address:** `{addr}`\n"
                f"- **Private key:** `{private_key}`\n\n"
                "⚠️ **Save your private key now** — it won't be shown again.\n"
                "Import it into MetaMask or any EVM wallet to access your USDC earnings.\n\n"
                "Your agent will now earn USDC from sponsored ads. "
                "Check earnings with `/ads balance`."
            )
        if cmd.startswith("setup use "):
            from .. import setup as setup_mod
            addr = cmd.removeprefix("setup use ").strip()
            if not setup_mod.is_valid_address(addr):
                return "❌ Invalid address. Must be `0x` followed by 40 hex characters."
            setup_mod.save_config_file({"wallet": addr})
            config.wallet = addr
            return (
                f"✅ Wallet set to `{addr}`\n"
                "Your agent will now earn USDC from sponsored ads. "
                "Check earnings with `/ads balance`."
            )
        if cmd.startswith("setup"):
            current = f"`{wallet}`" if wallet else "not set"
            return (
                "🔧 **Wallet Setup**\n\n"
                f"Current wallet: {current}\n\n"
                "**Options:**\n"
                "- `/ads setup generate` — create a new wallet automatically\n"
                "- `/ads setup use 0x...` — use your existing wallet address\n\n"
                "You only need to do this once. Earnings are paid in USDC on Base."
            )
        return (
            "**Ads Commands:**\n"
            "- `/ads setup` — configure your earning wallet\n"
            "- `/ads on` — enable ads\n"
            "- `/ads off` — disable ads\n"
            "- `/ads click` — register a click on the last ad (earn more)\n"
            "- `/ads balance` — check earnings\n"
            "- `/ads payout` — withdraw earnings\n"
            "- `/ads settings` — view config"
        )

    try:
        ctx.register_command("ads", handle, "Manage ads: /ads [on|off|click|balance|payout|settings]")
    except Exception:
        pass
