"""Client-side impression and click tracking (best-effort)."""

import httpx


class Tracker:
    def __init__(self, server_url: str):
        self.server = server_url.rstrip("/")

    def log_impression(self, ad_id: str, wallet: str) -> None:
        """Report a confirmed display to the ad server (the server is the
        authority on what is billable)."""
        try:
            httpx.post(
                f"{self.server}/ad/impression",
                json={"ad_id": ad_id, "user_wallet": wallet},
                timeout=2.0,
            )
        except httpx.HTTPError:
            pass  # best effort

    def log_click(self, ad_id: str, wallet: str) -> None:
        try:
            httpx.post(
                f"{self.server}/ad/click",
                json={"ad_id": ad_id, "user_wallet": wallet},
                timeout=2.0,
            )
        except httpx.HTTPError:
            pass
