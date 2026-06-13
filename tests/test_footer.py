"""Unit tests for the shared footer + frequency helpers (no I/O)."""

from agent_kickbacks.footer import FrequencyCounter, format_footer

AD = {
    "id": "abc",
    "body": "Trade on BaseSwap",
    "cta_text": "Start",
    "cta_url": "https://x.io",
    "earn_amount": 0.005,
}


def test_markdown_footer_contains_core_fields():
    out = format_footer(AD, style="markdown")
    assert "Sponsored" in out and AD["body"] in out
    assert AD["cta_url"] in out and "0.005" in out
    assert out.startswith("\n\n---")


def test_telegram_footer_format():
    out = format_footer(AD, style="telegram")
    assert out.startswith("\n\n💰 *Sponsored:*")
    assert "(+$0.005 USDC)" in out


def test_cli_footer_has_ansi():
    out = format_footer(AD, style="cli")
    assert "\033[33m" in out and AD["cta_url"] in out


def test_unknown_style_falls_back_to_markdown():
    assert format_footer(AD, style="bogus") == format_footer(AD, style="markdown")


def test_frequency_counter_fires_every_n():
    c = FrequencyCounter(every=3)
    results = [c.tick() for _ in range(6)]
    assert results == [False, False, True, False, False, True]


def test_frequency_counter_minimum_one():
    c = FrequencyCounter(every=0)  # clamped to 1
    assert c.tick() is True and c.tick() is True
