"""Shared client configuration (env-based)."""

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
        return cls(
            enabled=os.getenv("ADS_ENABLED", "true").lower() == "true",
            wallet=os.getenv("ADS_WALLET", ""),
            server=os.getenv("ADS_SERVER", "https://ads.agentkickbacks.io"),
            frequency=int(os.getenv("ADS_FREQUENCY", "5")),
            min_payout=float(os.getenv("ADS_MIN_PAYOUT", "5.0")),
            categories=os.getenv("ADS_CATEGORIES", "all").split(","),
        )
