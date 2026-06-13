# Agent Kickbacks — Project Status

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
| **x402 Payments** | 🔴 Needs live test |
| **Documentation** | 🔴 Not started |

---

## Live Deployment

| Service | URL | Status |
|---------|-----|--------|
| **Ad Server** | https://agent-kickbacks-production.up.railway.app | ✅ Running |
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

1. **Set NEXT_PUBLIC_API_URL** on Vercel → connect landing page to live API
2. **Coinbase CDP facilitator** → enable x402 payments
3. **EVM_PRIVATE_KEY** → enable USDC payouts
4. **Documentation** → PLUGIN.md, ADVERTISER.md
5. **Load testing** → rate limits, performance

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
