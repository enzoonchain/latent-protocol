"""Telegram adapter — sponsored footer for standalone Telegram bots.

Works with any Telegram bot framework (python-telegram-bot, aiogram, telebot,
raw Bot API). The adapter is framework-agnostic: call ``wrap_response()`` on
the text you're about to send, and it returns the text with a sponsored footer
appended (or the original text unchanged if no ad is available).

Quick start (python-telegram-bot example)
-----------------------------------------
    from latent_protocol.adapters.telegram import TelegramAdAdapter

    adapter = TelegramAdAdapter()          # reads ADS_WALLET / config file

    async def reply(update, context):
        text = await my_llm(update.message.text)
        await update.message.reply_text(
            adapter.wrap_response(text, context=update.message.text),
            parse_mode="Markdown",
        )

aiogram middleware example
--------------------------
    from aiogram import BaseMiddleware
    from latent_protocol.adapters.telegram import TelegramAdAdapter

    class AgentKickbacksMiddleware(BaseMiddleware):
        def __init__(self):
            self.adapter = TelegramAdAdapter()

        async def __call__(self, handler, event, data):
            data["ad_adapter"] = self.adapter
            return await handler(event, data)

    # In your handler:
    async def handle(message: Message, ad_adapter: TelegramAdAdapter):
        response = await generate(message.text)
        await message.answer(
            ad_adapter.wrap_response(response, context=message.text),
            parse_mode="Markdown",
        )
"""

from ..ad_client import AdClient
from ..config import Config
from ..footer import FrequencyCounter, format_footer
from ..tracker import Tracker


class TelegramAdAdapter:
    """Append a Telegram-formatted sponsored footer to bot responses.

    One instance per bot process; the FrequencyCounter is per-instance so it
    tracks message cadence globally (not per-user). For per-user frequency
    tracking, pass ``per_user=True`` and supply a ``user_id`` to wrap_response.
    """

    def __init__(self, config: Config | None = None, per_user: bool = False):
        self._cfg = config or Config.from_env()
        self._client = AdClient(self._cfg.server)
        self._tracker = Tracker(self._cfg.server)
        self._per_user = per_user
        # Global counter (used when per_user=False)
        self._counter = FrequencyCounter(self._cfg.frequency)
        # Per-user counters keyed by user_id
        self._user_counters: dict[str, FrequencyCounter] = {}

    def _counter_for(self, user_id: str | None) -> FrequencyCounter:
        if not self._per_user or user_id is None:
            return self._counter
        if user_id not in self._user_counters:
            self._user_counters[user_id] = FrequencyCounter(self._cfg.frequency)
        return self._user_counters[user_id]

    def wrap_response(
        self,
        text: str,
        context: str = "general",
        user_id: str | None = None,
    ) -> str:
        """Return *text* with a sponsored footer appended, or *text* unchanged.

        Args:
            text:     The bot response to be sent.
            context:  What the conversation is about (used for ad targeting).
            user_id:  Telegram user ID string — used for per-user frequency
                      tracking when ``per_user=True`` was set on the adapter.
        """
        if not self._cfg.enabled or not self._cfg.wallet:
            return text
        if not self._counter_for(user_id).tick():
            return text

        ad = self._client.get_ad(
            wallet=self._cfg.wallet,
            context=(context or "general")[:100],
            agent="telegram",
            surface="response_footer",
        )
        if not ad:
            return text

        self._tracker.log_impression(
            ad.get("ad_id", ad.get("id", "")), self._cfg.wallet, ad.get("impression_token", "")
        )
        return text + format_footer(ad, style="telegram")

    def track_click(self, ad_id: str) -> None:
        """Call this when the user taps the CTA button (if you track inline buttons)."""
        self._tracker.log_click(ad_id, self._cfg.wallet)
