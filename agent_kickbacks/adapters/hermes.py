"""Hermes push adapter — sponsored response footer.

Uses the verified `transform_llm_output` hook (append footer to the model's
output) rather than the unverified `on_thinking_start`. Falls back to
`post_response` if `transform_llm_output` isn't available. All ad logic comes
from the shared core; this file is only the Hermes glue.
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

    def _footer_for(text: str) -> str | None:
        if not config.enabled or not config.wallet:
            return None
        if not counter.tick():
            return None
        ad = client.get_ad(
            wallet=config.wallet,
            context=(text or "general")[:100],
            agent="hermes",
            surface="response_footer",
        )
        if not ad:
            return None
        tracker.log_impression(ad["id"], config.wallet, ad.get("impression_token", ""))
        return format_footer(ad, style="markdown")

    # Primary: transform_llm_output (verified hook) — append footer.
    def transform_llm_output(response_text, **kwargs):
        footer = _footer_for(response_text)
        return (response_text + footer) if footer else None

    # Fallback for older Hermes builds without transform_llm_output.
    def post_response(text, **kwargs):
        footer = _footer_for(text)
        return (text + footer) if footer else text

    for hook_name, fn in (
        ("transform_llm_output", transform_llm_output),
        ("post_response", post_response),
    ):
        try:
            ctx.register_hook(hook_name, fn)
        except Exception:
            pass  # hook may not exist in this Hermes version

    _register_command(ctx, config)


def _register_command(ctx, config: Config) -> None:
    """`/ads on|off|balance|payout|settings` — delegates to the shared core."""

    def handle(args):
        cmd = (args or "").strip().lower()
        wallet = config.wallet

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
        return (
            "**Ads Commands:**\n"
            "- `/ads on` — enable ads\n"
            "- `/ads off` — disable ads\n"
            "- `/ads balance` — check earnings\n"
            "- `/ads payout` — withdraw earnings\n"
            "- `/ads settings` — view config"
        )

    try:
        ctx.register_command("ads", handle, "Manage ads: /ads [on|off|balance|payout|settings]")
    except Exception:
        pass
