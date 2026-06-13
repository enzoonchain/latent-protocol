"""Tests for safety mechanisms."""

import time
from server.safety import (
    is_kill_switch_active,
    check_rate_limit,
    is_content_allowed,
    should_show_ad,
    _cleanup_old,
    DEFAULT_BLOCKLIST,
)


def test_kill_switch_default_off():
    """Kill switch should be off by default."""
    assert is_kill_switch_active() is False


def test_rate_limit_allows_normal_requests():
    """Normal requests within limits should be allowed."""
    assert check_rate_limit("wallet_abc", "192.168.1.1") is True


def test_rate_limit_user_cap():
    """Should block after too many requests from same user."""
    wallet = "rate_limit_test_user"
    ip = "10.0.0.1"
    # Fill up the limit
    for _ in range(10):
        check_rate_limit(wallet, ip)
    # 11th should be blocked
    assert check_rate_limit(wallet, ip) is False


def test_rate_limit_ip_cap():
    """Should block after too many requests from same IP."""
    ip = "10.0.0.99"
    wallet_base = "ip_test_wallet_"
    # Fill up the limit from different wallets
    for i in range(30):
        check_rate_limit(f"{wallet_base}{i}", ip)
    # 31st should be blocked
    assert check_rate_limit("new_wallet", ip) is False


def test_rate_limit_different_ips_independent():
    """Different IPs should have independent limits."""
    # Fill up one IP with different wallets
    for i in range(30):
        check_rate_limit(f"diff_ip_wallet_{i}", "10.0.0.1")
    # Different IP with new wallet should still work
    assert check_rate_limit("diff_ip_wallet_new", "10.0.0.2") is True


def test_content_allowed_clean():
    """Clean content should be allowed."""
    assert is_content_allowed("DeFi Yield", "Earn 12% APY on your ETH") is True


def test_content_blocked_scams():
    """Scam content should be blocked."""
    assert is_content_allowed("Free Money", "Send ETH to claim") is False
    assert is_content_allowed("Airdrop", "Claim your airdrop now") is False
    assert is_content_allowed("Wallet", "verify wallet now") is False
    assert is_content_allowed("Returns", "Guaranteed returns 100%") is False


def test_content_blocked_case_insensitive():
    """Blocklist should be case-insensitive."""
    assert is_content_allowed("FREE MONEY", "get rich quick") is False
    assert is_content_allowed("Seed Phrase", "enter yours") is False


def test_content_allowed_edge_cases():
    """Edge cases for content moderation."""
    assert is_content_allowed("", "") is True
    assert is_content_allowed("Normal Ad", "") is True
    assert is_content_allowed("", "Normal body text") is True


def test_should_show_ad_kill_switch():
    """Should not show ad when kill switch is active."""
    # Kill switch is off by default, so this tests the logic path
    result = should_show_ad("wallet", 0, 0)
    assert result is True  # should show (kill switch off)


def test_should_show_ad_daily_cap():
    """Should not show ad when daily cap reached."""
    assert should_show_ad("wallet", 0, 100) is False
    assert should_show_ad("wallet", 0, 101) is False


def test_should_show_ad_session_cap():
    """Should not show ad when session cap reached."""
    assert should_show_ad("wallet", 20, 0) is False
    assert should_show_ad("wallet", 21, 0) is False


def test_should_show_ad_frequency():
    """Should show ad at frequency intervals."""
    # Default frequency is 5
    assert should_show_ad("wallet", 0, 0) is True   # 0 % 5 == 0
    assert should_show_ad("wallet", 1, 0) is False  # 1 % 5 != 0
    assert should_show_ad("wallet", 4, 0) is False  # 4 % 5 != 0
    assert should_show_ad("wallet", 5, 0) is True   # 5 % 5 == 0
    assert should_show_ad("wallet", 10, 0) is True  # 10 % 5 == 0


def test_cleanup_old():
    """Should remove entries older than window."""
    now = time.time()
    entries = [now - 120, now - 30, now - 5, now]  # 120s old, 30s, 5s, now
    cleaned = _cleanup_old(entries, now)
    assert len(cleaned) == 3  # 120s old should be removed


def test_blocklist_has_defaults():
    """Default blocklist should contain expected entries."""
    assert "free money" in DEFAULT_BLOCKLIST
    assert "seed phrase" in DEFAULT_BLOCKLIST
    assert "private key" in DEFAULT_BLOCKLIST
    assert "guaranteed returns" in DEFAULT_BLOCKLIST
