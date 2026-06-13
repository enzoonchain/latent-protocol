"""x402 payment middleware wiring — Base, exact-EVM scheme (x402 >= 2.13).

Env-gated and lazily imported: the server runs fine with x402 disabled, and
`x402` (the `x402[evm,httpx]` extra) is only imported when actually enabled.

Enable with `X402_ENABLED=true` plus `EVM_ADDRESS` + `FACILITATOR_URL`
(and a funded wallet). End-to-end validation against a live facilitator is
task 1.1.6 (Base Sepolia first) — the construction here is API-correct for
x402 2.13 but has not been exercised against a real facilitator yet.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI


def is_enabled() -> bool:
    return os.getenv("X402_ENABLED", "false").lower() == "true"


def install_payment_middleware(app: "FastAPI") -> bool:
    """Attach x402 payment to paid routes.

    Returns True if installed, False if disabled. Raises if enabled but
    misconfigured so the caller can decide how loud to be (we never want to
    silently serve a paid route for free).
    """
    if not is_enabled():
        return False

    pay_to = os.getenv("EVM_ADDRESS", "")
    network = os.getenv("EVM_NETWORK", "eip155:84532")
    facilitator_url = os.getenv("FACILITATOR_URL", "")
    price = os.getenv("X402_AD_PRICE", "$0.001")
    if not pay_to or not facilitator_url:
        raise RuntimeError(
            "X402_ENABLED=true but EVM_ADDRESS / FACILITATOR_URL are not set"
        )

    # Lazy imports — only when enabled (needs the x402[evm,httpx] extra).
    from x402.http import (
        FacilitatorConfig,
        HTTPFacilitatorClient,
        PaymentOption,
        RouteConfig,
    )
    from x402.http.middleware.fastapi import PaymentMiddlewareASGI
    from x402.mechanisms.evm.exact.register import register_exact_evm_server
    from x402.schemas import Network
    from x402.server import x402ResourceServer

    facilitator = HTTPFacilitatorClient(FacilitatorConfig(url=facilitator_url))
    server = x402ResourceServer(facilitator_clients=facilitator)
    register_exact_evm_server(server, networks=network)

    try:
        net: object = Network(network)  # coerce CAIP-2 to the Network type
    except Exception:
        net = network  # fall back to the raw CAIP-2 string

    routes = {
        "POST /ad/request": RouteConfig(
            accepts=PaymentOption(
                scheme="exact",
                pay_to=pay_to,
                price=price,
                network=net,  # type: ignore[arg-type]
            ),
            description="Request an ad impression",
            mime_type="application/json",
        ),
    }

    app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)
    return True
