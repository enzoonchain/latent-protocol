"""x402 payments — Base, exact-EVM scheme (x402 >= 2.13).

Env-gated and lazily imported: the server runs fine with x402 disabled, and
`x402` (the `x402[evm,httpx]` extra) is only imported when actually enabled.

Two payment surfaces:
  * ``install_payment_middleware`` — ASGI middleware gating the static route
    ``POST /ad/request`` (agent pays to be served an ad).
  * ``settle_payment_or_402`` — explicit, handler-level verify+settle for the
    advertiser money routes (``/campaign/{id}/buy`` and ``/fund``). The ASGI
    middleware only matches *static* route keys, so templated money routes are
    gated here instead. Budget is credited ONLY after the facilitator settles
    the payment on-chain — never on a mere proof header being present.

The same flow runs on testnet (Base Sepolia) and mainnet; only the env
(``EVM_NETWORK``/``USDC_ADDRESS``/``FACILITATOR_URL``/``USDC_EIP712_*``) changes.
"""

from __future__ import annotations

import base64
import json
import os
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import FastAPI, Request


def is_enabled() -> bool:
    return os.getenv("X402_ENABLED", "false").lower() == "true"


def _network() -> str:
    return os.getenv("EVM_NETWORK", "eip155:84532")


def _pay_to() -> str:
    return os.getenv("EVM_ADDRESS", "")


def _asset() -> str:
    return os.getenv("USDC_ADDRESS", "0x036CbD53842c5426634e7929541eC2318f3dCF7e")


def _eip712() -> dict[str, str]:
    # USDC EIP-712 domain — name/version vary per token contract, so they are
    # env-configurable. Base Sepolia test USDC: name "USDC"; Base mainnet USDC:
    # name "USD Coin". Both version "2".
    return {
        "name": os.getenv("USDC_EIP712_NAME", "USDC"),
        "version": os.getenv("USDC_EIP712_VERSION", "2"),
    }


def _base_units(amount_usdc: float) -> str:
    """USDC has 6 decimals."""
    return str(int(round(amount_usdc * 1_000_000)))


# ── Lazy, shared resource server (one per process) ──
_RESOURCE_SERVER: Any = None


def _get_resource_server() -> Any:
    """Build + initialize the x402 resource server once and cache it.

    ``initialize()`` contacts the facilitator (``get_supported``), so this
    requires network egress to ``FACILITATOR_URL`` — it runs on the deployed
    host, not in sandboxes that block egress.
    """
    global _RESOURCE_SERVER
    if _RESOURCE_SERVER is not None:
        return _RESOURCE_SERVER

    facilitator_url = os.getenv("FACILITATOR_URL", "")
    if not _pay_to() or not facilitator_url:
        raise RuntimeError(
            "X402_ENABLED=true but EVM_ADDRESS / FACILITATOR_URL are not set"
        )

    from x402.http import FacilitatorConfig, HTTPFacilitatorClient
    from x402.mechanisms.evm.exact.register import register_exact_evm_server
    from x402.server import x402ResourceServer

    facilitator = HTTPFacilitatorClient(FacilitatorConfig(url=facilitator_url))
    server = x402ResourceServer(facilitator_clients=facilitator)
    register_exact_evm_server(server, networks=_network())
    server.initialize()
    _RESOURCE_SERVER = server
    return server


def _build_requirements(amount_usdc: float) -> Any:
    """The canonical PaymentRequirements for an amount — the single source of
    truth shared by the 402 challenge and the verify/settle call."""
    from x402.server import PaymentRequirements

    return PaymentRequirements(
        scheme="exact",
        network=_network(),
        asset=_asset(),
        amount=_base_units(amount_usdc),
        payTo=_pay_to(),
        maxTimeoutSeconds=int(os.getenv("X402_MAX_TIMEOUT_SECONDS", "3600")),
        extra=_eip712(),
    )


def build_payment_required_header(amount_usdc: float) -> str:
    """Base64 `payment-required` challenge the web client signs.

    Canonical x402 v2 shape: ``{ x402Version: 2, accepts: [ <PaymentRequirements> ] }``.
    When x402 is enabled we serialize a real PaymentRequirements; otherwise
    (no x402 extra installed) we emit an equivalent literal so the client can
    still render the challenge in dev.
    """
    if is_enabled():
        req = _build_requirements(amount_usdc).model_dump(by_alias=True, mode="json")
    else:
        req = {
            "scheme": "exact",
            "network": _network(),
            "asset": _asset(),
            "amount": _base_units(amount_usdc),
            "payTo": _pay_to(),
            "maxTimeoutSeconds": int(os.getenv("X402_MAX_TIMEOUT_SECONDS", "3600")),
            "extra": _eip712(),
        }
    payload = {"x402Version": 2, "accepts": [req]}
    return base64.b64encode(json.dumps(payload).encode()).decode()


def _payment_header(request: "Request") -> str | None:
    return request.headers.get("x-payment") or request.headers.get("payment")


def _raise_402(amount_usdc: float, detail: str) -> None:
    from fastapi import HTTPException, status

    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail=detail,
        headers={"payment-required": build_payment_required_header(amount_usdc)},
    )


async def settle_payment_or_402(
    request: "Request", amount_usdc: float, resource: str
) -> dict[str, Any]:
    """Verify AND settle an x402 payment on-chain, or raise.

    Fail closed: returns only after the facilitator confirms settlement.
      * x402 disabled            → no-op (returns {} so callers stay uniform).
      * no proof header          → 402 with a signable challenge.
      * proof invalid            → 402 (nothing credited).
      * settlement fails on-chain → 502 (nothing credited).

    On success returns ``{settled, tx_hash, payer, network, amount}``.
    """
    if not is_enabled():
        return {"settled": False}

    header = _payment_header(request)
    if not header:
        _raise_402(amount_usdc, "Payment required — sign the x402 payment to continue.")

    from fastapi import HTTPException, status
    from x402.http import decode_payment_signature_header

    try:
        payload = decode_payment_signature_header(header)  # type: ignore[arg-type]
    except Exception as exc:  # malformed proof
        _raise_402(amount_usdc, f"Malformed x402 payment proof: {exc}")

    requirements = _build_requirements(amount_usdc)
    server = _get_resource_server()

    verify = await server.verify_payment(payload, requirements)
    if not verify.is_valid:
        _raise_402(
            amount_usdc,
            f"Payment verification failed: {verify.invalid_message or verify.invalid_reason}",
        )

    settle = await server.settle_payment(payload, requirements)
    if not settle.success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Payment settlement failed: {settle.error_message or settle.error_reason}",
        )

    return {
        "settled": True,
        "tx_hash": settle.transaction,
        "payer": settle.payer or verify.payer,
        "network": settle.network or _network(),
        "amount": amount_usdc,
    }


def install_payment_middleware(app: "FastAPI") -> bool:
    """Attach the x402 ASGI middleware to the static paid route(s).

    Only advertiser funding routes are gated — the ad request endpoint is
    FREE for users (advertisers pay via campaign funding).
    
    Returns True if installed, False if disabled.
    """
    if not is_enabled():
        return False

    pay_to = _pay_to()
    facilitator_url = os.getenv("FACILITATOR_URL", "")
    if not pay_to or not facilitator_url:
        raise RuntimeError(
            "X402_ENABLED=true but EVM_ADDRESS / FACILITATOR_URL are not set"
        )

    from x402.http import PaymentOption, RouteConfig
    from x402.http.middleware.fastapi import PaymentMiddlewareASGI
    from x402.schemas import Network

    server = _get_resource_server()

    try:
        net: object = Network(_network())
    except Exception:
        net = _network()

    # NO routes gated here — ad request is free for users
    # Campaign funding is gated via settle_payment_or_402() in the route handlers
    routes = {}

    app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)
    return True
