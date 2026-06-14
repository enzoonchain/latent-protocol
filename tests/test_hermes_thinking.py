"""Tests for the Hermes thinking-state (pre_llm_call) + footer coordination."""

from unittest.mock import MagicMock, patch

from latent_protocol.adapters import hermes
from latent_protocol.config import Config


FAKE_AD = {
    "ad_id": "ad-1",
    "body": "Try Acme!",
    "cta_text": "Learn more",
    "cta_url": "https://acme.io",
    "earn_amount": 0.0025,
    "impression_token": "tok-abc",
}


class FakeCtx:
    """Captures hooks/commands registered by hermes.register()."""

    def __init__(self):
        self.hooks = {}
        self.commands = {}

    def register_hook(self, name, fn):
        self.hooks[name] = fn

    def register_command(self, name, fn, desc=""):
        self.commands[name] = fn


def _register(frequency=1, ad=FAKE_AD):
    cfg = Config(
        enabled=True,
        wallet="0xDEADBEEF",
        server="http://localhost:8000",
        frequency=frequency,
        min_payout=5.0,
        categories=["all"],
    )
    client = MagicMock()
    client.get_ad.return_value = ad
    tracker = MagicMock()
    ctx = FakeCtx()
    with patch.object(hermes.Config, "from_env", return_value=cfg), \
         patch.object(hermes, "AdClient", return_value=client), \
         patch.object(hermes, "Tracker", return_value=tracker):
        hermes.register(ctx)
    return ctx, client, tracker


def test_all_hooks_registered():
    ctx, _, _ = _register()
    assert "pre_llm_call" in ctx.hooks
    assert "transform_llm_output" in ctx.hooks
    assert "post_response" in ctx.hooks
    assert "ads" in ctx.commands


def test_thinking_state_injects_context():
    ctx, client, tracker = _register(frequency=1)
    out = ctx.hooks["pre_llm_call"](session_id="s1", user_message="defi help")
    assert out is not None
    assert "Sponsored while you wait" in out["context"]
    assert "Acme" in out["context"]
    client.get_ad.assert_called_once()
    assert client.get_ad.call_args.kwargs["surface"] == "thinking_state"
    tracker.log_impression.assert_called_once_with("ad-1", "0xDEADBEEF", "tok-abc")


def test_footer_skipped_after_thinking_shown():
    ctx, client, tracker = _register(frequency=1)
    ctx.hooks["pre_llm_call"](session_id="s1", user_message="hi")
    # Same turn → footer must not serve a second ad.
    result = ctx.hooks["transform_llm_output"]("response", session_id="s1")
    assert result is None
    # Only the thinking-state ad was fetched, not a second footer ad.
    assert client.get_ad.call_count == 1


def test_footer_skipped_when_thinking_throttled():
    # frequency=2 → first tick returns False (skip), turn is still "owned".
    ctx, client, tracker = _register(frequency=2)
    out = ctx.hooks["pre_llm_call"](session_id="s1", user_message="hi")
    assert out is None  # throttled
    result = ctx.hooks["transform_llm_output"]("response", session_id="s1")
    assert result is None  # footer must not double-count this turn
    client.get_ad.assert_not_called()


def test_footer_fallback_when_pre_llm_never_fires():
    # Simulate Hermes #2817: pre_llm_call is never invoked.
    ctx, client, tracker = _register(frequency=1)
    result = ctx.hooks["transform_llm_output"]("response", session_id="s1")
    assert result is not None
    assert "Acme" in result
    assert client.get_ad.call_args.kwargs["surface"] == "response_footer"
