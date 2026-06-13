"""Agent Ads plugin configuration."""

import os


def get_config() -> dict:
    """Load config from environment and Hermes config."""
    return {
        "enabled": os.getenv("ADS_ENABLED", "true").lower() == "true",
        "wallet": os.getenv("ADS_WALLET", ""),
        "server": os.getenv("ADS_SERVER", "https://ads.agentkickbacks.io"),
        "frequency": int(os.getenv("ADS_FREQUENCY", "5")),
        "categories": os.getenv("ADS_CATEGORIES", "all").split(","),
        "min_payout": float(os.getenv("ADS_MIN_PAYOUT", "5.0")),
    }
