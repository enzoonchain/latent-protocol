# Latent Protocol — Project Status

> Auto-updated: 2026-06-13

---

## Quick Summary

| Category | Status |
|----------|--------|
| **Backend (FastAPI)** | ✅ Complete |
| **Client Library (MCP)** | ✅ Complete |
| **Landing Page (Next.js)** | ✅ Complete |
| **Wallet Connect** | ✅ Complete |
| **Safety Mechanisms** | ✅ Complete |
| **Infrastructure** | 🟡 Railway ready, deploy in progress |
| **x402 Payments** | 🔴 Needs live test |
| **Documentation** | 🔴 Not started |

---

## Phase Completion

### Phase 1: Foundation ✅

| Task | Issue | Status |
|------|-------|--------|
| FastAPI server + x402 middleware | #1 | ✅ |
| Railway Postgres schema | #2 | ✅ (kód kész, nincs élő DB) |
| Ad matcher + tracker | #3 | ✅ |
| MCP server + Hermes adapter | #4 | ✅ |

### Phase 2: Display ✅

| Task | Issue | Status |
|------|-------|--------|
| Response footer adapter | #6 | ✅ |
| User controls (/ads command) | #11 | ✅ |
| Thinking hook (OpenClaw) | #10 | ⏳ Deferred |
| WebUI thinking-state | #5 | ⏳ Deferred |

### Phase 3: Payments ✅

| Task | Issue | Status |
|------|-------|--------|
| Advertiser portal (Next.js) | #7 | ✅ |
| Block bidding | #12 | ✅ |
| User earnings + payout | #8 | ✅ |

### Phase 4: Launch

| Task | Issue | Status |
|------|-------|--------|
| Safety mechanisms | #13 | ✅ |
| Docker + self-hosting | #14 | ✅ |
| Documentation | #15 | 🔴 Not started |
| Launch (deploy) | #16 | 🟡 In progress |

---

## What's Built

### Backend (server/)
```
server/
├── main.py              # FastAPI app, CORS, health, route registration
├── config.py            # All env vars + constants
├── database.py          # SQLAlchemy async engine + session
├── models.py            # Pydantic request/response models
├── matcher.py           # Ad targeting + selection engine
├── tracker.py           # Impression + click tracking
├── auction.py           # Block bidding helpers
├── security.py          # HMAC-signed impression tokens
├── safety.py            # Kill switch, rate limiting, content moderation
├── payout_engine.py     # USDC transfer on Base
├── x402_payments.py     # x402 middleware wiring
└── routes/
    ├── ads.py           # POST /ad/request, /ad/impression, /ad/click
    ├── campaigns.py     # CRUD + buy blocks
    ├── earnings.py      # GET /earnings/{wallet}
    └── payouts.py       # POST /payout/request, GET /payout/{wallet}
```

### Client Library (latent_protocol/)
```
latent_protocol/
├── __init__.py          # v0.1.0
├── config.py            # Env-based Config dataclass
├── ad_client.py         # HTTP client for /ad/request
├── tracker.py           # Client-side impression/click reporting
├── wallet.py            # Balance check + payout request
├── footer.py            # Ad rendering (markdown/telegram/CLI)
├── mcp_server.py        # Universal MCP server (4 tools)
└── adapters/
    └── hermes.py        # Hermes push adapter
```

### Landing Page (landing/)
```
landing/
├── app/
│   ├── layout.tsx       # Root layout with providers
│   ├── page.tsx         # Main page (all sections)
│   └── globals.css      # Design system + curtain animation
├── components/
│   ├── Nav.tsx          # Fixed nav + wallet connect
│   ├── Hero.tsx         # Curtain reveal animation
│   ├── Ticker.tsx       # Scrolling marquee
│   ├── HowItWorks.tsx   # 4-step mechanism
│   ├── AdSurfaces.tsx   # Interactive mock
│   ├── Economics.tsx    # Revenue split + rates
│   ├── AdBlocks.tsx     # Live marketplace view
│   ├── Protocol.tsx     # Tech flow
│   ├── AdvertiserPortal.tsx  # Campaign CRUD + analytics
│   ├── UserPortal.tsx   # Earnings + payout tracking
│   ├── Plate.tsx        # Decorative advertiser CTA
│   ├── OpenSource.tsx   # GitHub CTA
│   ├── Install.tsx      # Final CTA
│   ├── Footer.tsx       # 4-column links
│   └── Providers.tsx    # Wagmi + RainbowKit + QueryClient
├── lib/
│   ├── wagmi.ts         # Base chain config
│   └── api.ts           # API client with mock fallback
└── public/
    ├── curtain-left.png
    ├── curtain-right.png
    └── plate.png
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | — | Server health check |
| GET | `/safety` | — | Safety status |
| POST | `/ad/request` | x402 (optional) | Serve best matching ad |
| POST | `/ad/impression` | HMAC token | Log confirmed impression |
| POST | `/ad/click` | — | Log ad click |
| POST | `/campaign/create` | — | Create campaign |
| POST | `/{id}/ad` | — | Add ad creative |
| POST | `/{id}/fund` | — | Top up campaign budget |
| POST | `/{id}/buy` | x402 (optional) | Buy impression blocks |
| GET | `/{id}` | — | Campaign details + stats |
| GET | `/` | — | List campaigns by wallet |
| GET | `/earnings/{wallet}` | — | Earnings summary |
| GET | `/earnings/{wallet}/history` | — | Earning events |
| POST | `/payout/request` | — | Request USDC payout |
| GET | `/payout/{wallet}` | — | Payout history |

---

## Environment Variables

See `.env.example` for full list. Key variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | Postgres connection string |
| `IMPRESSION_SIGNING_SECRET` | Prod | `dev-insecure-secret` | HMAC secret for tokens |
| `EVM_PRIVATE_KEY` | For payouts | — | USDC transfer signing key |
| `AD_KILL_SWITCH` | No | `false` | Disable all ad serving |
| `ADS_FREQUENCY` | No | `5` | Show ad every N messages |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins |

---

## Tests

**50 unit tests passing:**

| File | Tests | Coverage |
|------|-------|----------|
| test_auction.py | 4 | Block math |
| test_block_bidding.py | 6 | Block purchase |
| test_earnings_calc.py | 3 | Earnings math |
| test_footer.py | 6 | Rendering |
| test_matcher.py | 5 | Tag scoring |
| test_payout_engine.py | 4 | USDC transfer |
| test_safety.py | 15 | Safety mechanisms |
| test_security.py | 5 | HMAC tokens |

---

## What's Left

### Before Launch (Priority Order)

1. **Railway Postgres provisioning** — Apply schema.sql to live DB
2. **Coinbase CDP facilitator** — Set up for x402 payments
3. **x402 live test** — Base Sepolia first
4. **Seed data** — Sample ads for testing
5. **Documentation** — PLUGIN.md, ADVERTISER.md, ARCHITECTURE.md
6. **Deploy ad server** — Railway
7. **Deploy landing page** — Vercel

### Deferred (Post-Launch)

- WebUI thinking-state injection (OpenClaw-only)
- Thinking hook adapter (OpenClaw)
- Advertiser portal: add ad creative form
- Integration tests (DB-backed)
- Alembic migrations

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.12, FastAPI, SQLAlchemy, asyncpg |
| Database | PostgreSQL 16 (Railway) |
| Payments | x402, USDC on Base, Coinbase CDP |
| Client | Python, httpx, MCP SDK |
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Wallet | Wagmi, viem, RainbowKit |
| Deploy | Docker, Railway, Vercel |
