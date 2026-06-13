"""Safety mechanisms — kill switch, rate limiting, content moderation.

All checks fail open: if something goes wrong, the agent keeps working.
Ads are a nice-to-have, never a blocker.
"""

import os
import time
from collections import defaultdict

# ── Kill Switch ──

KILL_SWITCH = os.getenv("AD_KILL_SWITCH", "false").lower() == "true"


def is_kill_switch_active() -> bool:
    """Server-controlled off-switch. When True, no ads are served."""
    return KILL_SWITCH


# ── Rate Limiting ──

RATE_LIMIT_PER_USER_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_USER_PER_MINUTE", "10"))
RATE_LIMIT_PER_IP_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_IP_PER_MINUTE", "30"))

# In-memory rate limiter (resets on restart — fine for single-server; use Redis for distributed)
_user_requests: dict[str, list[float]] = defaultdict(list)
_ip_requests: dict[str, list[float]] = defaultdict(list)

RATE_WINDOW_SECONDS = 60


def _cleanup_old(entries: list[float], now: float) -> list[float]:
    """Remove entries older than the rate window."""
    cutoff = now - RATE_WINDOW_SECONDS
    return [t for t in entries if t > cutoff]


def check_rate_limit(user_wallet: str, ip_address: str) -> bool:
    """Check if request is within rate limits. Returns True if allowed."""
    now = time.time()

    # Per-user limit
    _user_requests[user_wallet] = _cleanup_old(_user_requests[user_wallet], now)
    if len(_user_requests[user_wallet]) >= RATE_LIMIT_PER_USER_PER_MINUTE:
        return False
    _user_requests[user_wallet].append(now)

    # Per-IP limit
    _ip_requests[ip_address] = _cleanup_old(_ip_requests[ip_address], now)
    if len(_ip_requests[ip_address]) >= RATE_LIMIT_PER_IP_PER_MINUTE:
        return False
    _ip_requests[ip_address].append(now)

    return True


# ── Content Moderation ──

BLOCKLIST_FILE = os.getenv("AD_BLOCKLIST_FILE", "")
_blocklist: set[str] = set()

# Default blocklist — scam/phishing keywords
DEFAULT_BLOCKLIST = {
    "free money",
    "send eth",
    "send usdc",
    "seed phrase",
    "private key",
    "connect wallet and sign",
    "airdrop claim",
    "verify wallet",
    "urgent action required",
    "limited time offer",
    "guaranteed returns",
    "risk free",
    "double your",
    "100% profit",
}


def _load_blocklist() -> set[str]:
    """Load blocklist from file + defaults."""
    words = set(DEFAULT_BLOCKLIST)
    if BLOCKLIST_FILE and os.path.exists(BLOCKLIST_FILE):
        with open(BLOCKLIST_FILE) as f:
            for line in f:
                line = line.strip().lower()
                if line and not line.startswith("#"):
                    words.add(line)
    return words


def is_content_allowed(title: str, body: str) -> bool:
    """Check if ad content passes moderation. Returns True if allowed."""
    global _blocklist
    if not _blocklist:
        _blocklist = _load_blocklist()

    text = f"{title} {body}".lower()
    return not any(bad in text for bad in _blocklist)


# ── Ad Frequency (per-user configurable) ──

# Default frequency: show ad every N messages
DEFAULT_AD_FREQUENCY = int(os.getenv("ADS_FREQUENCY", "5"))
MIN_AD_FREQUENCY = 1
MAX_AD_FREQUENCY = 100

# Session and daily caps (server-authoritative)
MAX_IMPRESSIONS_PER_SESSION = int(os.getenv("MAX_IMPRESSIONS_PER_SESSION", "20"))
MAX_IMPRESSIONS_PER_DAY = int(os.getenv("MAX_IMPRESSIONS_PER_USER_PER_DAY", "100"))

# Don't show the same ad to the same user again within this window
AD_FREQUENCY_WINDOW_MINUTES = int(os.getenv("AD_FREQUENCY_WINDOW_MINUTES", "30"))


def get_user_frequency(user_wallet: str) -> int:
    """Get the ad frequency for a user. Defaults to server config.

    In the future, this could read from a user preferences table.
    For now, returns the server default.
    """
    # TODO: read from user_preferences table if exists
    return DEFAULT_AD_FREQUENCY


def should_show_ad(user_wallet: str, impressions_this_session: int, impressions_today: int) -> bool:
    """Determine if we should show an ad to this user right now.

    Checks:
    1. Kill switch
    2. Daily cap
    3. Session cap
    4. Frequency (every N messages)
    """
    if is_kill_switch_active():
        return False

    if impressions_today >= MAX_IMPRESSIONS_PER_DAY:
        return False

    if impressions_this_session >= MAX_IMPRESSIONS_PER_SESSION:
        return False

    freq = get_user_frequency(user_wallet)
    return impressions_this_session % freq == 0
