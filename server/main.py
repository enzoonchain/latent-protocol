"""Agent Kickbacks — FastAPI Ad Server.

Crypto-native ad marketplace for AI agents.
x402 micropayments on Base.
"""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# ── Config ──
EVM_ADDRESS = os.getenv("EVM_ADDRESS")
EVM_NETWORK = os.getenv("EVM_NETWORK", "eip155:84532")  # Base Sepolia default
FACILITATOR_URL = os.getenv("FACILITATOR_URL", "https://x402.org/facilitator")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    # Startup: verify x402 facilitator connection
    print(f"[agent-kickbacks] Starting ad server")
    print(f"  Network: {EVM_NETWORK}")
    print(f"  Treasury: {EVM_ADDRESS}")
    print(f"  Facilitator: {FACILITATOR_URL}")
    yield
    # Shutdown
    print("[agent-kickbacks] Shutting down")


app = FastAPI(
    title="Agent Kickbacks",
    description="Crypto-native ad marketplace for AI agents. x402 on Base.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow all origins for plugin access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ──
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "network": EVM_NETWORK,
        "facilitator": FACILITATOR_URL,
    }


# ── Import and register routes ──
from server.routes.ads import router as ads_router
from server.routes.campaigns import router as campaigns_router
from server.routes.earnings import router as earnings_router
from server.routes.payouts import router as payouts_router

app.include_router(ads_router, prefix="/ad", tags=["ads"])
app.include_router(campaigns_router, prefix="/campaign", tags=["campaigns"])
app.include_router(earnings_router, prefix="/earnings", tags=["earnings"])
app.include_router(payouts_router, prefix="/payout", tags=["payouts"])


# ── x402 Payment Middleware (optional — enable when ready) ──
# Uncomment when x402 is configured:
#
# from x402.http import FacilitatorConfig, HTTPFacilitatorClient, PaymentOption
# from x402.http.middleware.fastapi import PaymentMiddlewareASGI
# from x402.http.types import RouteConfig
# from x402.mechanisms.evm.exact import ExactEvmServerScheme
# from x402.server import x402ResourceServer
# from x402.schemas import Network
#
# facilitator = HTTPFacilitatorClient(FacilitatorConfig(url=FACILITATOR_URL))
# x402_server = x402ResourceServer(facilitator)
# x402_server.register(EVM_NETWORK, ExactEvmServerScheme())
#
# routes = {
#     "POST /ad/request": RouteConfig(
#         accepts=[PaymentOption(
#             scheme="exact",
#             pay_to=EVM_ADDRESS,
#             price="$0.001",
#             network=EVM_NETWORK,
#         )],
#         mime_type="application/json",
#         description="Request an ad impression",
#     ),
# }
#
# app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=x402_server)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server.main:app",
        host=os.getenv("SERVER_HOST", "0.0.0.0"),
        port=int(os.getenv("SERVER_PORT", "8000")),
        reload=True,
    )
