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
DATABASE_URL = os.getenv("DATABASE_URL")


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


# ── x402 Payment Middleware (env-gated; see server/x402_payments.py) ──
from server.x402_payments import install_payment_middleware

try:
    if install_payment_middleware(app):
        print(f"[agent-kickbacks] x402 payment ENABLED on POST /ad/request ({EVM_NETWORK})")
    else:
        print("[agent-kickbacks] x402 payment disabled (set X402_ENABLED=true to enable)")
except Exception as exc:  # misconfigured or x402 extra missing — fail loud, run unpaid
    print(f"[agent-kickbacks] ⚠️  x402 NOT installed — serving unpaid: {exc}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server.main:app",
        host=os.getenv("SERVER_HOST", "0.0.0.0"),
        port=int(os.getenv("SERVER_PORT", "8000")),
        reload=True,
    )
