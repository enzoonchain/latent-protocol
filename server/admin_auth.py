"""Admin authentication for operator-only routes.

Set ADMIN_API_KEY in the server environment to a long random secret.
Clients send it as:
  - Header: X-Admin-Key: <secret>
  - or:     Authorization: Bearer <secret>
"""

import hmac
import os

from fastapi import Header, HTTPException, status


def admin_api_key() -> str:
    return os.getenv("ADMIN_API_KEY", "").strip()


def admin_configured() -> bool:
    return bool(admin_api_key())


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def verify_admin_key(provided: str | None) -> bool:
    expected = admin_api_key()
    if not expected or not provided:
        return False
    return hmac.compare_digest(provided, expected)


async def require_admin(
    x_admin_key: str | None = Header(None, alias="X-Admin-Key"),
    authorization: str | None = Header(None),
) -> None:
    """FastAPI dependency — raises 401/503 when admin key is missing or wrong."""
    if not admin_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API not configured (set ADMIN_API_KEY on the server)",
        )
    token = x_admin_key or _extract_bearer(authorization)
    if not verify_admin_key(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin credentials",
        )
