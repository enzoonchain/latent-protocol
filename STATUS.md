# Latent Protocol — Project Status

> Auto-updated: 2026-06-14

---

## Quick Summary

| Category | Status |
|----------|--------|
| **Backend (FastAPI)** | ✅ Complete + Deployed |
| **Database (Railway Postgres)** | ✅ Deployed + Schema Applied |
| **Client Library (MCP)** | ✅ Complete |
| **Landing Page (Next.js)** | ✅ Complete |
| **Wallet Connect** | ✅ Complete |
| **Safety Mechanisms** | ✅ Complete |
| **API Endpoints** | ✅ All Tested |
| **MCP Server** | ⚠️ Test only (request_ad, inject_footer) |
| **MCP Management** | ✅ Production (check_balance, payout, status, setup) |
| **x402 Payments** | 🔴 Needs live test |
| **Documentation** | 🔴 Not started |

---

## Live Deployment

| Service | URL | Status |
|---------|-----|--------|
| **Ad Server** | https://api.latentprotocol.xyz | ✅ Running |
| **Postgres** | Internal Railway | ✅ Running |

---

## API Endpoints — Tested ✅

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/health` | ✅ Tested | Returns OK |
| GET | `/ad/safety` | ✅ Tested | Kill switch, rate limits |
| POST | `/ad/request` | ✅ Tested | Returns ad + impression token |
| POST | `/ad/impression` | ✅ Tested | Tracks impression, credits earnings |
| POST | `/ad/click` | ✅ Tested | Tracks click, 50x multiplier |
| POST | `/campaign/create` | ✅ Tested | Creates campaign |
| POST | `/{id}/ad` | ✅ Tested | Adds ad creative |
| POST | `/{id}/buy` | ✅ Tested | Buy blocks (x402 gated) |
| GET | `/{id}` | ✅ Tested | Campaign stats |
| GET | `/` | ✅ Tested | List campaigns |
| GET | `/earnings/{wallet}` | ✅ Tested | Balance + stats |
| GET | `/earnings/{wallet}/history` | ✅ Tested | Earning events |
| POST | `/payout/request` | ⚠️ Stub | Needs USDC transfer |
| GET | `/payout/{wallet}` | ⚠️ Stub | Returns empty |

---

## Tested Flow (End-to-End)

```
1. POST /campaign/create → Campaign created ($10 budget)
2. POST /campaign/{id}/ad → Ad added (DeFi, $0.005/impression)
3. POST /ad/request → Ad returned + impression token
4. POST /ad/impression → Impression tracked, user earns $0.0025
5. POST /ad/click → Click tracked, user earns $0.125
6. GET /earnings/{wallet} → Balance: $0.1275
7. GET /campaign/{id} → Stats: 1 impression, 1 click, 100% CTR
```

---

## What's NOT Tested

| Item | Why |
|------|-----|
| x402 live payment | Needs Coinbase CDP facilitator |
| Payout (USDC transfer) | Needs EVM_PRIVATE_KEY + live Base |
| Landing page → API connection | Needs NEXT_PUBLIC_API_URL set |
| Multiple users/advertisers | Manual testing needed |
| Rate limiting under load | Needs load testing |
| Content moderation | Blocklist needs real ads |

---

## Phase Completion

### Phase 1: Foundation ✅

| Task | Issue | Status |
|------|-------|--------|
| FastAPI server + x402 middleware | #1 | ✅ |
| Railway Postgres schema | #2 | ✅ Deployed |
| Ad matcher + tracker | #3 | ✅ Tested |
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
| User earnings + payout | #8 | ✅ (payout stub) |

### Phase 4: Launch

| Task | Issue | Status |
|------|-------|--------|
| Safety mechanisms | #13 | ✅ |
| Docker + self-hosting | #14 | ✅ |
| Documentation | #15 | 🔴 Not started |
| Launch (deploy) | #16 | ✅ Deployed |

---

## Next Steps (Priority Order)

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

## Platform Integration Strategy

### Core Principle: WE Control Ad Delivery

| Tool Type | Who Controls Timing? | Production Ready? |
|-----------|---------------------|-------------------|
| **Platform adapters** (Hermes, Telegram, CLI) | ✅ Us (frequency counter) | ✅ Yes |
| **Platform hooks** (Claude Code, Codex) | ✅ Us (hook config) | ✅ Yes |
| **MCP tools** (request_ad, inject_footer) | ❌ User/agent | ⚠️ Test only |
| **MCP management** (balance, payout, status) | ✅ Us | ✅ Yes |

### Why MCP Ad Delivery is Test Only

MCP tools are **user-initiated** — the user/agent decides when to call them.
This means:
- User can spam `inject_footer` to farm impressions
- User controls ad timing, not us
- We lose control over frequency, targeting, and caps

**Production ad delivery MUST use platform-specific adapters** where we control
the frequency counter, session caps, and daily limits.

### Claude Code via `statusLine`

The Claude Code `statusLine` setting runs a command on each refresh; stdout is the displayed text. We implement this via the `latent-statusline` console script (`latent_protocol/adapters/claude_code.py`):

- `latent-statusline --install` → writes the `statusLine` block into `~/.claude/settings.json`
- Per-refresh new process → **disk cache rotation** (`ADS_STATUSLINE_ROTATE`, default 30s), so 1 impression / rotation, not every refresh (anti-spam)
- ANSI color + OSC 8 clickable CTA link
- Fail-open: ad-server error → empty status line, agent unaffected

### Platform Support Matrix

| Platform | Integration | Ad Delivery | Thinking State | Status |
|----------|------------|-------------|----------------|--------|
| **OpenClaw** | Plugin (`api.on(...)`) | ✅ `before_prompt_build` | ✅ **Best (live!)** | ✅ Live (`openclaw-plugin/`) |
| **Hermes** | Plugin | ✅ Automatic (footer) | ⚠️ `pre_llm_call` no-op (#2817) | ✅ Ready (thinking forward-compat) |
| **Claude Code** | `statusLine` + Hook | ✅ `statusLine` (live, dynamic) | ✅ statusLine = thinking-adjacent | ✅ Live (`latent-statusline`) |
| **Codex / MiMo** | Skill + Hook | ✅ Session start | ❌ No | ✅ Ready |
| **Telegram** | Adapter | ✅ `wrap_response` | N/A | ✅ Ready |
| **CLI** | Decorator | ✅ `@inject` | N/A | ✅ Ready |
| **MCP (any)** | Tool server | ⚠️ Test only | ❌ No | Test phase |

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
| Deploy | Docker, Railway |

---

## Environment Variables

See `.env.example` for full list.

**Production (Railway):**
- `DATABASE_URL` = Railway internal Postgres
- `IMPRESSION_SIGNING_SECRET` = Set
- `CORS_ORIGINS` = `*`
- `AD_KILL_SWITCH` = `false`
- `ADS_FREQUENCY` = `5`
