"""CLI adapter — sponsored ANSI banner for terminal-based AI agents.

Works with any tool that prints text to a terminal: Click CLIs, Rich consoles,
plain print() wrappers, Typer apps, etc.

Quick start
-----------
    from latent_protocol.adapters.cli import CliAdAdapter

    adapter = CliAdAdapter()               # reads ADS_WALLET / config file

    # Option 1: print the response + ad in one call
    adapter.print_response(llm_output, context=user_prompt)

    # Option 2: get the combined string (e.g. you control the print)
    output = adapter.wrap_response(llm_output, context=user_prompt)
    print(output)

Decorator usage
---------------
    @adapter.inject
    def ask(prompt: str) -> str:
        return my_llm(prompt)

    # calling ask("hello") automatically appends the ad banner
"""

import sys

from ..ad_client import AdClient
from ..config import Config
from ..footer import FrequencyCounter, format_footer
from ..tracker import Tracker


class CliAdAdapter:
    """Append an ANSI-colored sponsored banner to CLI agent output.

    Respects the ADS_ENABLED / ADS_FREQUENCY config and the per-process
    FrequencyCounter so ads appear at most once every N responses.
    """

    def __init__(self, config: Config | None = None):
        self._cfg = config or Config.from_env()
        self._client = AdClient(self._cfg.server)
        self._tracker = Tracker(self._cfg.server)
        self._counter = FrequencyCounter(self._cfg.frequency)

    def wrap_response(self, text: str, context: str = "general") -> str:
        """Return *text* with an ANSI ad banner appended, or *text* unchanged."""
        if not self._cfg.enabled or not self._cfg.wallet:
            return text
        if not self._counter.tick():
            return text

        ad = self._client.get_ad(
            wallet=self._cfg.wallet,
            context=(context or "general")[:100],
            agent="cli",
            surface="response_footer",
        )
        if not ad:
            return text

        self._tracker.log_impression(
            ad["id"], self._cfg.wallet, ad.get("impression_token", "")
        )
        return text + format_footer(ad, style="cli")

    def print_response(
        self, text: str, context: str = "general", file=None
    ) -> None:
        """Print *text* (with ad banner if due) to *file* (default stdout)."""
        print(self.wrap_response(text, context=context), file=file or sys.stdout)

    def inject(self, fn):
        """Decorator: automatically appends the ad banner to a function's str return value.

        Usage::

            @adapter.inject
            def ask(prompt: str) -> str:
                return call_llm(prompt)
        """
        import functools

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            result = fn(*args, **kwargs)
            if isinstance(result, str):
                # Use the first positional arg as context hint if available
                ctx = args[0] if args and isinstance(args[0], str) else "general"
                return self.wrap_response(result, context=ctx)
            return result

        return wrapper
