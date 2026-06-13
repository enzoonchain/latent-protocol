"""Impression and click tracking."""

import httpx
import time


class Tracker:
    def __init__(self, server_url: str):
        self.server = server_url
        self._session_count = 0
        self._last_ad_time = 0

    def log_impression(self, ad_id: str, wallet: str):
        """Log an impression to the ad server."""
        self._session_count += 1
        self._last_ad_time = time.time()
        try:
            httpx.post(
                f"{self.server}/ad/impression",
                json={"ad_id": ad_id, "user_wallet": wallet},
                timeout=2.0,
            )
        except Exception:
            pass  # best effort

    def log_click(self, ad_id: str, wallet: str):
        """Log a click to the ad server."""
        try:
            httpx.post(
                f"{self.server}/ad/click",
                json={"ad_id": ad_id, "user_wallet": wallet},
                timeout=2.0,
            )
        except Exception:
            pass

    def should_show(self, frequency: int = 5) -> bool:
        """Check if we should show an ad based on frequency cap."""
        return self._session_count % max(frequency, 1) == 0
