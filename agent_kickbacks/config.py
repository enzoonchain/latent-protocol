"""Shared client configuration.

Priority: config file (~/.agent-kickbacks/config.json) > env vars > defaults.
This means users who ran `agent-kickbacks setup` never need to touch env vars.
"""

import os
from dataclasses import dataclass


@dataclass
class Config:
    enabled: bool
    wallet: str
    server: str
    frequency: int
    min_payout: float
    categories: list[str]

    @classmethod
    def from_env(cls) -> "Config":
        from .setup import load_config_file
        saved = load_config_file()

        def _get(key: str, env_key: str, default: str) -> str:
            return str(saved[key]) if key in saved else os.getenv(env_key, default)

        enabled_raw = _get("enabled", "ADS_ENABLED", "true")
        enabled = str(enabled_raw).lower() not in ("false", "0", "no")

        cats_raw = _get("categories", "ADS_CATEGORIES", "all")
        categories = [c.strip() for c in str(cats_raw).split(",") if c.strip()]

        return cls(
            enabled=enabled,
            wallet=_get("wallet", "ADS_WALLET", ""),
            server=_get("server", "ADS_SERVER", "https://ads.agentkickbacks.io"),
            frequency=int(_get("frequency", "ADS_FREQUENCY", "5")),
            min_payout=float(_get("min_payout", "ADS_MIN_PAYOUT", "5.0")),
            categories=categories,
        )
