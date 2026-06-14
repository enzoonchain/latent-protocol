"""Unified adapter — one entry point for every platform.

Auto-detects the current environment and delegates to the right push adapter.
This is the recommended integration point; use a specific adapter only when
you need platform-specific features.

Platform detection order
------------------------
1. ``AGENT_KICKBACKS_PLATFORM`` env var — explicit override.
2. ``HERMES_PLUGIN`` / ``HERMES_CTX`` env var present → hermes.
3. ``TELEGRAM_BOT_TOKEN`` env var present → telegram.
4. ``CLAUDE_CODE`` / ``MCP_SERVER`` env var present → mcp.
5. ``sys.stdout.isatty()`` → cli.
6. Fallback → mcp (use pull tools instead of push injection).

Quick start
-----------
    from latent_protocol.adapters.unified import UnifiedAdapter

    adapter = UnifiedAdapter()
    print(adapter.platform)          # "hermes" | "telegram" | "cli" | "mcp"

    # Wrap any response — format adapts to the detected platform
    output = adapter.wrap(llm_response, context="defi")

    # Hermes: register hooks on the plugin context
    adapter.register(hermes_ctx)

    # Telegram: per-user frequency tracking
    adapter.wrap_response(text, context=user_msg, user_id=str(uid))

    # CLI: function decorator
    @adapter.inject
    def ask(prompt: str) -> str:
        return call_llm(prompt)
"""

from __future__ import annotations

import os
import sys
from typing import Literal

from ..ad_client import AdClient
from ..config import Config
from ..footer import FrequencyCounter, format_footer
from ..tracker import Tracker

Platform = Literal["hermes", "telegram", "cli", "mcp"]

STYLE_MAP: dict[str, str] = {
    "hermes": "markdown",
    "telegram": "telegram",
    "cli": "cli",
    "mcp": "markdown",
}


def detect_platform() -> Platform:
    """Infer the current agent platform from the environment."""
    explicit = os.getenv("AGENT_KICKBACKS_PLATFORM", "").lower()
    if explicit in ("hermes", "telegram", "cli", "mcp"):
        return explicit  # type: ignore[return-value]

    if os.getenv("HERMES_PLUGIN") or os.getenv("HERMES_CTX"):
        return "hermes"
    if os.getenv("TELEGRAM_BOT_TOKEN"):
        return "telegram"
    if os.getenv("CLAUDE_CODE") or os.getenv("MCP_SERVER"):
        return "mcp"
    if sys.stdout.isatty():
        return "cli"
    return "mcp"


class UnifiedAdapter:
    """Single adapter class that works across Hermes, Telegram, CLI, and MCP.

    Instantiate once; call ``wrap()`` (or the platform-specific helpers) on
    every LLM response.  The adapter auto-detects the platform, picks the
    right footer style, and handles frequency throttling.

    Parameters
    ----------
    config:
        Optional ``Config`` override.  Defaults to ``Config.from_env()``.
    platform:
        Explicit platform override.  Defaults to ``detect_platform()``.
    """

    def __init__(
        self,
        config: Config | None = None,
        platform: Platform | None = None,
    ) -> None:
        self._cfg = config or Config.from_env()
        self.platform: Platform = platform or detect_platform()
        self._client = AdClient(self._cfg.server)
        self._tracker = Tracker(self._cfg.server)
        self._counter = FrequencyCounter(self._cfg.frequency)

    @property
    def style(self) -> str:
        """Footer render style for the detected platform."""
        return STYLE_MAP.get(self.platform, "markdown")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _fetch_ad(self, context: str = "general") -> dict | None:
        if not self._cfg.enabled or not self._cfg.wallet:
            return None
        if not self._counter.tick():
            return None
        ad = self._client.get_ad(
            wallet=self._cfg.wallet,
            context=(context or "general")[:100],
            agent=self.platform,
            surface="response_footer",
        )
        if not ad:
            return None
        self._tracker.log_impression(
            ad.get("ad_id", ad.get("id", "")), self._cfg.wallet, ad.get("impression_token", "")
        )
        return ad

    # ------------------------------------------------------------------
    # Universal interface
    # ------------------------------------------------------------------

    def get_footer(self, context: str = "general") -> str | None:
        """Fetch an ad and return a rendered footer string, or ``None``."""
        ad = self._fetch_ad(context)
        return format_footer(ad, style=self.style) if ad else None

    def wrap(self, text: str, context: str = "general") -> str:
        """Return *text* with a sponsored footer appended, or *text* unchanged.

        This is the main method — works identically on all platforms.
        """
        footer = self.get_footer(context)
        return (text + footer) if footer else text

    # ------------------------------------------------------------------
    # Hermes
    # ------------------------------------------------------------------

    def register(self, ctx) -> None:
        """Register transform_llm_output and /ads command on a Hermes context.

        Raises ``RuntimeError`` if the detected platform is not ``"hermes"``.
        """
        if self.platform != "hermes":
            raise RuntimeError(
                f"register() requires platform='hermes', got '{self.platform}'. "
                "Set AGENT_KICKBACKS_PLATFORM=hermes or pass platform='hermes'."
            )
        from .hermes import register as _hermes_register
        _hermes_register(ctx)

    # ------------------------------------------------------------------
    # Telegram
    # ------------------------------------------------------------------

    def wrap_response(
        self,
        text: str,
        context: str = "general",
        user_id: str | None = None,
    ) -> str:
        """Telegram-style wrap with optional per-user frequency tracking.

        Falls back to ``wrap()`` on non-Telegram platforms so callers don't
        need to branch on platform.
        """
        if self.platform == "telegram":
            if not hasattr(self, "_tg_adapter"):
                from .telegram import TelegramAdAdapter
                self._tg_adapter = TelegramAdAdapter(config=self._cfg)
            return self._tg_adapter.wrap_response(text, context=context, user_id=user_id)
        return self.wrap(text, context=context)

    def track_click(self, ad_id: str) -> None:
        """Report a CTA click (Telegram inline-button tap, etc.)."""
        self._tracker.log_click(ad_id, self._cfg.wallet)

    # ------------------------------------------------------------------
    # CLI
    # ------------------------------------------------------------------

    def inject(self, fn):
        """Decorator: append an ANSI ad banner to a function's str return value.

        On non-CLI platforms the function is returned unchanged so the
        decorator can be used unconditionally.
        """
        if self.platform == "cli":
            if not hasattr(self, "_cli_adapter"):
                from .cli import CliAdAdapter
                self._cli_adapter = CliAdAdapter(config=self._cfg)
            return self._cli_adapter.inject(fn)
        return fn

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def status(self) -> dict:
        """Return a summary of the adapter's current configuration."""
        return {
            "platform": self.platform,
            "style": self.style,
            "enabled": self._cfg.enabled,
            "wallet": self._cfg.wallet or "not set",
            "frequency": self._cfg.frequency,
            "server": self._cfg.server,
            "min_payout": self._cfg.min_payout,
        }


# ---------------------------------------------------------------------------
# Console-script entry point
# ---------------------------------------------------------------------------

def adapter_main() -> None:
    """``latent-adapter`` — detect platform and print setup status."""
    import json

    adapter = UnifiedAdapter()
    info = adapter.status()
    info["detection_method"] = (
        "env:AGENT_KICKBACKS_PLATFORM"
        if os.getenv("AGENT_KICKBACKS_PLATFORM")
        else "auto"
    )
    setup_hints = {
        "hermes": "from latent_protocol.adapters.unified import UnifiedAdapter\nadapter = UnifiedAdapter()\nadapter.register(ctx)  # in your plugin register() function",
        "telegram": "from latent_protocol.adapters.unified import UnifiedAdapter\nadapter = UnifiedAdapter()\ntext = adapter.wrap_response(text, context=msg.text, user_id=str(uid))",
        "cli": "from latent_protocol.adapters.unified import UnifiedAdapter\nadapter = UnifiedAdapter()\n@adapter.inject\ndef ask(prompt): ...",
        "mcp": "Add to claude_desktop_config.json / mcp.json:\n{\"mcpServers\":{\"latent-protocol\":{\"command\":\"latent-mcp\"}}}",
    }
    info["setup"] = setup_hints.get(info["platform"], "")
    print(json.dumps(info, indent=2))
