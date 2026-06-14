"""Latent Protocol — FastAPI Ad Server.

Crypto-native ad marketplace for AI agents.
x402 micropayments on Base.
"""

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.config import EVM_ADDRESS, EVM_NETWORK, FACILITATOR_URL

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    print("[latent-protocol] Starting ad server")
    print(f"  Network: {EVM_NETWORK}")
    print(f"  Treasury: {EVM_ADDRESS}")
    print(f"  Facilitator: {FACILITATOR_URL}")

    # Auto-apply schema if DATABASE_URL is set
    from server.config import DATABASE_URL
    if DATABASE_URL:
        try:
            from pathlib import Path
            from server.database import get_engine
            schema_path = Path(__file__).parent.parent / "scripts" / "schema.sql"
            if schema_path.exists():
                engine = get_engine()
                async with engine.begin() as conn:
                    sql = schema_path.read_text()
                    # asyncpg rejects multi-statement prepared statements;
                    # use the raw driver connection which accepts raw SQL scripts.
                    raw = await conn.get_raw_connection()
                    await raw.driver_connection.execute(sql)
                print("[latent-protocol] Schema applied successfully")
            else:
                print(f"[latent-protocol] Schema file not found at {schema_path}")
        except Exception as exc:
            print(f"[latent-protocol] Schema apply failed (non-fatal): {exc}")

    yield
    print("[latent-protocol] Shutting down")


app = FastAPI(
    title="Latent Protocol",
    description="Crypto-native ad marketplace for AI agents. x402 on Base.",
    version="0.1.0",
    lifespan=lifespan,
)

import os


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
# NOTE: install the payment middleware BEFORE CORS. Starlette runs the
# last-added middleware first (outermost), so CORS must be added last to
# wrap the 402 responses and answer OPTIONS preflights — otherwise the
# payment middleware intercepts the preflight without CORS headers and the
# browser reports "Failed to fetch" on gated routes (e.g. /campaign/*/buy).
from server.x402_payments import install_payment_middleware

try:
    if install_payment_middleware(app):
        print(f"[latent-protocol] x402 payment ENABLED on POST /ad/request ({EVM_NETWORK})")
    else:
        print("[latent-protocol] x402 payment disabled (set X402_ENABLED=true to enable)")
except Exception as exc:
    print(f"[latent-protocol] ⚠️  x402 NOT installed — serving unpaid: {exc}")


# ── CORS — added LAST so it is the outermost middleware ──
_raw_origins = os.getenv("CORS_ORIGINS", "*")
allow_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Explicit so the browser can read the 402 payment challenge headers.
    expose_headers=["payment-required", "x-payment-required", "x-payment-response"],
)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server.main:app",
        host=os.getenv("SERVER_HOST", "0.0.0.0"),
        port=int(os.getenv("SERVER_PORT", "8000")),
    )
