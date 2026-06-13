"""Fetch ads from the Agent Kickbacks marketplace."""

import httpx


class AdClient:
    def __init__(self, server_url: str):
        self.server = server_url

    def get_ad(
        self,
        wallet: str,
        context: str,
        agent: str,
        surface: str = "any",
    ) -> dict | None:
        """Request best matching ad from marketplace.

        Returns ad dict or None if no ad available.
        Timeout: 2s max — never slow down the agent.
        """
        try:
            resp = httpx.post(
                f"{self.server}/ad/request",
                json={
                    "user_wallet": wallet,
                    "agent": agent,
                    "context": context,
                    "surface": surface,
                },
                timeout=2.0,
            )
            if resp.status_code == 200:
                return resp.json()
        except (httpx.TimeoutException, httpx.ConnectError):
            pass  # fail open — agent works without ads
        return None
