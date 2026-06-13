"""Impression integrity — short-lived signed tokens (anti-forgery / anti-replay).

`/ad/request` issues an HMAC-signed token that binds (ad_id, user_wallet) with
an expiry. `/ad/impression` must echo a valid, unexpired token, so a client can
only log an impression for an ad the server actually served to *that* wallet.

Stateless (no DB) → survives restarts and scales horizontally. Single-use /
replay protection within the TTL is handled by the dedup guard in
`tracker.log_impression`.
"""

import base64
import hashlib
import hmac
import os
import time

_DEFAULT_TTL = int(os.getenv("IMPRESSION_TOKEN_TTL_SECONDS", "300"))


def _secret() -> bytes:
    """Read signing secret from env. Falls back to a dev-only default.

    In production, IMPRESSION_SIGNING_SECRET MUST be set — otherwise anyone
    can forge impression tokens and claim fake earnings.
    """
    secret = os.getenv("IMPRESSION_SIGNING_SECRET", "")
    if not secret:
        import warnings
        warnings.warn(
            "IMPRESSION_SIGNING_SECRET not set — using insecure dev default. "
            "Set this in production!",
            stacklevel=2,
        )
        secret = "dev-insecure-secret"
    return secret.encode()


def _sign(msg: str) -> str:
    sig = hmac.new(_secret(), msg.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(sig).decode().rstrip("=")


def make_impression_token(
    ad_id: str, user_wallet: str, ttl: int | None = None
) -> str:
    """Issue a signed token for (ad_id, user_wallet) valid for ``ttl`` seconds."""
    exp = int(time.time()) + (ttl if ttl is not None else _DEFAULT_TTL)
    return f"{exp}.{_sign(f'{ad_id}|{user_wallet}|{exp}')}"


def verify_impression_token(token: str, ad_id: str, user_wallet: str) -> bool:
    """True iff ``token`` is a valid, unexpired signature for (ad_id, wallet)."""
    try:
        exp_str, sig = token.split(".", 1)
        exp = int(exp_str)
    except (ValueError, AttributeError):
        return False
    if exp < int(time.time()):
        return False
    expected = _sign(f"{ad_id}|{user_wallet}|{exp}")
    return hmac.compare_digest(sig, expected)
