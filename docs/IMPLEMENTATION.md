# Implementation Plan — Agent Kickbacks

> Build roadmap, task breakdown, questions, dependencies, and execution order.

---

## Status

| Phase | Status | Target |
|-------|--------|--------|
| Phase 1: Foundation | 🟡 In progress (scaffold done, logic + DB pending) | Week 1-2 |
| Phase 2: Display | 🔴 Not started | Week 2-3 |
| Phase 3: Payments | 🔴 Not started | Week 3-4 |
| Phase 4: Launch | 🔴 Not started | Week 4-5 |

**Legend:** 🔴 Not started · 🟡 In progress / scaffolded · 🟢 Done

### What's already in the repo (scaffold)

- FastAPI app + routers (`/ad`, `/campaign`, `/earnings`, `/payout`), CORS, health check, lifespan.
- x402 middleware wired but **commented out** until a facilitator + wallet are configured.
- Pydantic models, async Postgres (SQLAlchemy + asyncpg) client, `scripts/schema.sql`, `pyproject.toml` with deps, `.env.example`, Dockerfile + compose (server + Postgres).
- Hermes plugin scaffold: `plugin.yaml`, `register()`, `agent_ads` tool, `on_thinking_start` / `post_response` hooks, `/ads` command, ad client + tracker + wallet helpers.
- **Still stubbed (return `None`/`pass`/placeholder):** `matcher.select_best_ad`, `tracker.log_impression/click`, all DB writes, campaign/earnings/payout business logic. These are the real Phase 1 work.

---

## Phase 1: Foundation (Week 1-2)

### 1.1 Ad Server Setup

**Goal:** Working FastAPI server with x402 payment middleware on Base.

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 1.1.1 | Initialize Python project (pyproject.toml, venv) | — | — | 🟢 |
| 1.1.2 | Install dependencies: fastapi, uvicorn, x402[httpx], sqlalchemy, asyncpg | 1.1.1 | — | 🟢 (declared in pyproject) |
| 1.1.3 | Create FastAPI app + wire x402 middleware (currently commented out) | 1.1.2 | — | 🟡 |
| 1.1.4 | Set up Coinbase CDP facilitator on Base | — | ethskills | 🔴 |
| 1.1.5 | Create .env.example with all required vars | 1.1.3 | — | 🟢 |
| 1.1.6 | Test x402 payment flow (Base Sepolia first) | 1.1.3, 1.1.4 | — | 🔴 |

**Key files:**
- `server/main.py` — FastAPI app + x402 middleware
- `server/config.py` — environment variables
- `server/routes/ads.py` — ad serving endpoints
- `server/x402_payments.py` — x402 integration helpers
- `.env.example` — template

**Questions to resolve:**
- [x] Facilitator → Coinbase CDP (Q1)
- [x] Test on Base Sepolia first, then mainnet (Q2)
- [x] USDC Base Mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` · Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (current `config.py` default)

---

### 1.2 Database Schema

**Goal:** Railway Postgres with all tables and indexes (no RLS — the FastAPI server is the only writer and enforces access control; see Q3).

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 1.2.1 | Provision Railway Postgres (attach plugin → `DATABASE_URL`) | — | — | 🔴 |
| 1.2.2 | Create tables: ads, campaigns, advertisers, impressions, earnings, payouts | 1.2.1 | — | 🟡 (`scripts/schema.sql` written; apply to DB) |
| 1.2.3 | Wire async engine/session + apply schema on deploy | 1.2.2 | — | 🟡 (`server/database.py` done) |
| 1.2.4 | Create indexes (wallet_address, ad_id, created_at) | 1.2.2 | — | 🟢 (in `schema.sql`) |
| 1.2.5 | Seed test data (sample ads, test advertiser) | 1.2.2 | — | 🔴 |

**Key files:**
- `server/database.py` — async SQLAlchemy engine + session (asyncpg)
- `scripts/schema.sql` — table + index DDL
- `server/models.py` — Pydantic models matching DB schema
- `scripts/seed.sql` — test data

**Questions to resolve:**
- [x] DB hosting → **Railway Postgres** (same platform as the ad server; direct asyncpg, no REST hop)
- [x] Auth model → **wallet-based** (EIP-712 signature); access control enforced in the FastAPI layer, not DB-level RLS.

---

### 1.3 Ad Serving Logic

**Goal:** Server can select and serve contextual ads.

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 1.3.1 | Build ad matcher (context → tags → category matching) | 1.2.2 | — | 🔴 |
| 1.3.2 | Build frequency cap (max N ads per user per session) | 1.2.2 | — | 🔴 |
| 1.3.3 | Build impression logger | 1.2.2 | — | 🔴 |
| 1.3.4 | Build click tracker (redirect URLs) | 1.2.2 | — | 🔴 |
| 1.3.5 | Build earnings calculator (50/30/20 split) | 1.3.3 | — | 🔴 |
| 1.3.6 | Write tests for matcher + tracker | 1.3.1-1.3.5 | — | 🔴 |

**Key files:**
- `server/matcher.py` — ad selection algorithm
- `server/tracker.py` — impression/click tracking
- `server/routes/ads.py` — endpoints
- `server/routes/earnings.py` — earnings endpoints

---

### 1.4 Hermes Plugin Scaffold

**Goal:** Working plugin that loads in Hermes and can fetch ads.

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 1.4.1 | Create plugin.yaml manifest | — | hermes-agent | 🟢 |
| 1.4.2 | Create __init__.py with register() | — | hermes-agent | 🟢 |
| 1.4.3 | Build ad_client.py (API communication, 2s timeout, fail-open) | 1.1.3 | — | 🟢 |
| 1.4.4 | Build config.py (ads.wallet, ads.frequency, etc.) | — | — | 🟢 |
| 1.4.5 | Build tracker.py (impression + click logging) | 1.3.3 | — | 🟢 |
| 1.4.6 | Register tool: agent_ads | 1.4.2 | hermes-agent | 🟢 |
| 1.4.7 | Test plugin loads in Hermes (blocked on hook availability — see Q5) | 1.4.1-1.4.6 | hermes-agent | 🔴 |

**Key files:**
- `plugin/plugin.yaml` — manifest
- `plugin/__init__.py` — registration
- `plugin/ad_client.py` — API client
- `plugin/config.py` — configuration
- `plugin/tracker.py` — tracking

---

## Phase 2: Display (Week 2-3)

### 2.1 Thinking State Injection (WebUI)

**Goal:** Ad banner appears in WebUI while agent is thinking.

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 2.1.1 | Study WebUI thinkingRow DOM structure | — | — | 🔴 |
| 2.1.2 | Create ad banner JS component | 1.1.3 | — | 🔴 |
| 2.1.3 | Patch ui.js to inject banner during thinking state | 2.1.1, 2.1.2 | — | 🔴 |
| 2.1.4 | Add IntersectionObserver for view time tracking | 2.1.3 | — | 🔴 |
| 2.1.5 | Test: banner appears while agent thinks | 2.1.3 | — | 🔴 |

**Key files:**
- `webui/static/agent-ads.js` — ad rendering component
- `webui/patches/thinking-banner.patch` — ui.js patch

**Questions to resolve:**
- [x] Separate JS file loaded alongside ui.js (no direct patch) — self-healing (Q4)
- [ ] Confirm WebUI static-file serving path / how to register our own asset (verify in 2.1.1)

---

### 2.2 Response Footer Injection

**Goal:** Sponsored message appears after every N agent responses.

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 2.2.1 | Implement post_response hook in plugin | 1.4.2 | hermes-agent | 🔴 |
| 2.2.2 | Format: markdown footer for WebUI | 2.2.1 | — | 🔴 |
| 2.2.3 | Format: Telegram message (bold + link) | 2.2.1 | — | 🔴 |
| 2.2.4 | Format: ANSI colored banner for CLI | 2.2.1 | — | 🔴 |
| 2.2.5 | Frequency cap: show every N messages | 2.2.1 | — | 🔴 |
| 2.2.6 | Test on all 3 surfaces | 2.2.2-2.2.4 | — | 🔴 |

**Key files:**
- `plugin/hooks/post_response.py` — response hook
- `plugin/templates/telegram_ad.md` — Telegram format
- `plugin/templates/cli_ad.py` — CLI format

---

### 2.3 Thinking Hook

**Goal:** Plugin hooks into agent thinking state.

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 2.3.1 | Research available Hermes plugin hooks (on_thinking, post_tool_call) | — | hermes-agent | 🔴 |
| 2.3.2 | Implement on_thinking_start hook | 2.3.1 | hermes-agent | 🔴 |
| 2.3.3 | Implement post_tool_call hook | 2.3.1 | hermes-agent | 🔴 |
| 2.3.4 | Test: ad appears during agent tool calls | 2.3.2, 2.3.3 | — | 🔴 |

**Key files:**
- `plugin/hooks/on_thinking.py` — thinking hook
- `plugin/hooks/post_tool_call.py` — tool call hook

---

### 2.4 Slash Commands

**Goal:** Users control ads via /ads command.

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 2.4.1 | Register /ads slash command | 1.4.2 | hermes-agent | 🔴 |
| 2.4.2 | Implement /ads on|off | 2.4.1 | — | 🔴 |
| 2.4.3 | Implement /ads balance | 2.4.1 | — | 🔴 |
| 2.4.4 | Implement /ads payout | 2.4.1 | — | 🔴 |
| 2.4.5 | Implement /ads settings | 2.4.1 | — | 🔴 |

**Key files:**
- `plugin/commands/ads.py` — slash command handler

---

## Phase 3: Payments (Week 3-4)

### 3.1 Advertiser Portal

**Goal:** Web app where advertisers create and manage campaigns.

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 3.1.1 | Initialize Next.js project with Tailwind | — | — | 🔴 |
| 3.1.2 | Set up Wagmi + RainbowKit (wallet connect on Base) | 3.1.1 | — | 🔴 |
| 3.1.3 | Build campaign creation form | 3.1.2 | — | 🔴 |
| 3.1.4 | Build ad creative form (title, body, CTA, URL, image) | 3.1.2 | — | 🔴 |
| 3.1.5 | Build campaign list + management | 3.1.3 | — | 🔴 |
| 3.1.6 | Build analytics dashboard (impressions, clicks, CTR) | 3.1.5 | — | 🔴 |
| 3.1.7 | Connect to ad server API | 3.1.3, 1.1.3 | — | 🔴 |

**Key files:**
- `portal/pages/index.tsx` — landing
- `portal/pages/create.tsx` — campaign creation
- `portal/pages/campaigns.tsx` — campaign management
- `portal/pages/analytics.tsx` — performance dashboard
- `portal/lib/wagmi.ts` — wallet config
- `portal/lib/api.ts` — API client

---

### 3.2 Block Bidding System

**Goal:** Advertisers buy impression blocks via English-ascending auction.

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 3.2.1 | Design auction algorithm | — | — | 🔴 |
| 3.2.2 | Implement block purchase (1,000 impressions per block) | 3.2.1, 1.2.2 | — | 🔴 |
| 3.2.3 | Implement bid ranking (higher bid = more impressions) | 3.2.2 | — | 🔴 |
| 3.2.4 | Implement budget tracking + exhaustion | 3.2.2 | — | 🔴 |
| 3.2.5 | x402 payment for campaign funding | 3.2.2, 1.1.3 | — | 🔴 |

**Key files:**
- `server/routes/campaigns.py` — campaign CRUD
- `server/auction.py` — auction logic

---

### 3.3 User Earnings + Payout

**Goal:** Users see earnings and can withdraw USDC on Base.

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 3.3.1 | Build earnings API (per-user totals, history) | 1.3.5 | — | 🔴 |
| 3.3.2 | Build payout API (threshold check, batch transfer) | 3.3.1 | — | 🔴 |
| 3.3.3 | Implement USDC transfer on Base (ethers.js or web3.py) | 3.3.2 | ethskills | 🔴 |
| 3.3.4 | Build user profile page in portal | 3.3.1 | — | 🔴 |
| 3.3.5 | WebUI sidebar widget (earnings display) | 3.3.1 | — | 🔴 |

**Key files:**
- `server/routes/payouts.py` — payout management
- `server/payout_engine.py` — USDC transfer logic
- `portal/pages/profile.tsx` — user dashboard

**Questions to resolve:**
- [x] Payout threshold → $5 USDC (Q8)
- [x] On-demand (`/ads payout`) above threshold; weekly batch sweep as fallback. Payout engine must be idempotent.
- [x] Operator pays gas (~$0.0001 on Base) — negligible, absorbed into the 30% operator share.

---

## Phase 4: Polish + Launch (Week 4-5)

### 4.1 Safety Mechanisms

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 4.1.1 | Implement kill switch (server-controlled off-switch) | 1.1.3 | — | 🔴 |
| 4.1.2 | Implement rate limiting (per-user, per-IP) | 1.1.3 | — | 🔴 |
| 4.1.3 | Implement ad content moderation (blocklist) | 1.3.1 | — | 🔴 |
| 4.1.4 | Error handling: fail-open (no ad = agent still works) | 1.4.3 | — | 🔴 |

---

### 4.2 Docker + Self-Hosting

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 4.2.1 | Create Dockerfile for ad server | 1.1.3 | — | 🔴 |
| 4.2.2 | Create docker-compose.yml (server + Postgres) | 4.2.1 | — | 🟢 (server + Postgres + schema init) |
| 4.2.3 | Create setup script (scripts/setup.sh) | 4.2.2 | — | 🔴 |
| 4.2.4 | Test self-hosting from scratch | 4.2.3 | — | 🔴 |

---

### 4.3 Documentation

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 4.3.1 | Write plugin installation guide (docs/PLUGIN.md) | Phase 1-2 | — | 🔴 |
| 4.3.2 | Write advertiser onboarding guide (docs/ADVERTISER.md) | Phase 3 | — | 🔴 |
| 4.3.3 | Write architecture doc (docs/ARCHITECTURE.md) | Phase 1-3 | — | 🔴 |
| 4.3.4 | Write contributing guide (CONTRIBUTING.md) | — | — | 🔴 |

---

### 4.4 Launch

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 4.4.1 | Write X announcement thread | Phase 1-3 | — | 🔴 |
| 4.4.2 | Deploy ad server (Railway or VPS) | 4.2.1 | web-deploy | 🔴 |
| 4.4.3 | Deploy advertiser portal (Vercel) | 3.1.7 | web-deploy | 🔴 |
| 4.4.4 | Publish plugin to Hermes skills hub | Phase 1-2 | — | 🔴 |
| 4.4.5 | First advertiser onboarding | 3.1.7 | — | 🔴 |

---

## Open Questions

### Technical

| # | Question | Status | Decision |
|---|----------|--------|----------|
| Q1 | Which x402 facilitator to use? | 🟢 | **Coinbase CDP** (1K free tx/mo). `FACILITATOR_URL` overridable for self-host. |
| Q2 | Base Sepolia for testing first? | 🟢 | **Yes** — Sepolia (`eip155:84532`) is the default; flip to mainnet (`eip155:8453`) only after 1.1.6 passes. |
| Q3 | Supabase vs raw Postgres? | 🟢 | **Railway Postgres** + SQLAlchemy async/asyncpg. One platform with the ad server, direct connection (no PostgREST latency on the 2s-budget ad path), no vendor lock-in. Revisit Supabase only if realtime dashboards are needed. |
| Q4 | WebUI static file serving — can we add custom JS? | 🟡 | **Separate JS file loaded alongside ui.js, no direct patch** (self-healing, survives WebUI updates). Confirm serving path in 2.1.1. |
| Q5 | Hermes plugin hook names — what's available? | 🟡 | `post_response` confirmed. `on_thinking_start` / `post_tool_call` **unverified** → plugin already wraps `register_hook` in try/except (fail-open). **Blocker for 1.4.7** — verify before Phase 2.3. |
| Q6 | How to handle x402 on advertiser portal? | 🟢 | **Wagmi + x402 client-side**; campaign funding pays the server's `EVM_ADDRESS`. |

### Business

| # | Question | Status | Decision |
|---|----------|--------|----------|
| Q7 | Minimum advertiser budget? | 🟢 | **$10 USDC** minimum campaign budget. |
| Q8 | Payout threshold? | 🟢 | **$5 USDC** (`PAYOUT_THRESHOLD_USDC`). |
| Q9 | Frequency cap default? | 🟢 | **Every 5 messages** + max 20/session + 100/day (server-enforced, see Q11). |
| Q10 | Ad content policy? | 🟢 | No scams, no phishing; crypto-native OK. Blocklist enforced in 4.1.3. |
| Q11 | Where is the frequency cap authoritative? | 🟢 | **Server-side** (`MAX_IMPRESSIONS_PER_*`). The plugin's in-memory counter is a UX hint only — never trust the client for billing. |
| Q12 | When is an impression billable? | 🟢 | On **confirmed display** via `POST /ad/impression`, *not* on `POST /ad/request` (fetch). Prevents double-counting. |

---

## Integrity & Anti-Fraud (cross-cutting — design now, harden in 4.1)

The whole model depends on advertisers trusting that impressions/clicks are real. The client self-reports, so the server must treat all client input as untrusted:

| Risk | Mitigation | Phase |
|------|-----------|-------|
| Fake impressions inflate user earnings / drain advertiser budget | Server-side frequency + rate caps (per user, per session, per day, per IP); ad must have been served via `/ad/request` before its `/ad/impression` is accepted | 1.3.2, 4.1.2 |
| Click fraud (50× impression value) | Anti-misclick gate (click only billable after a min view threshold); 1 click per impression id | 1.3.4, 4.1.x |
| Replay / forged impressions | Server issues a short-lived signed `impression_token` in the `/ad/request` response; `/ad/impression` must echo it | 1.3.3 (add to schema) |
| Sybil wallets farming earnings | Earning caps tiered by verification; payout threshold; monitoring | 3.3, 4.1 |

> **Decision:** impressions and earnings are **server-authoritative**. The plugin/WebUI can only *report* events; the server decides what is billable.

## Custody & Payout Model (de-risk early)

- Advertiser funds a campaign → USDC paid (via x402) to the operator-controlled `EVM_ADDRESS`.
- User earnings accrue **off-chain** (Postgres `earnings` table), paid out on-chain in batches once ≥ `$5`.
- This is a **custodial** design: the operator holds funds and signs payouts with `EVM_PRIVATE_KEY`.
  - **Action items:** key stored only in env/secret manager (never in DB or repo); payout engine idempotent (no double-pay on retry); reconcile `sum(earnings) + operator + protocol == sum(campaign spend)` as an invariant test; document the trust assumption clearly for self-hosters.

---

## Dependencies

```
Phase 1 (Foundation)
├── 1.1 Ad Server ─────────────────┐
├── 1.2 Database ──────────────────┤
├── 1.3 Ad Logic ──────────────────┼── Phase 2 (Display)
└── 1.4 Plugin Scaffold ───────────┘   ├── 2.1 Thinking State
                                        ├── 2.2 Response Footer
                                        ├── 2.3 Thinking Hook
                                        └── 2.4 Slash Commands
                                                │
Phase 3 (Payments) ◄────────────────────────────┘
├── 3.1 Advertiser Portal
├── 3.2 Block Bidding
└── 3.3 User Earnings + Payout
        │
Phase 4 (Launch) ◄──────────────────────────────┘
├── 4.1 Safety
├── 4.2 Docker
├── 4.3 Docs
└── 4.4 Launch
```

---

## Skills to Load

| Skill | When | Why |
|-------|------|-----|
| `hermes-agent` | Phase 1.4, 2.x | Plugin system, hooks, slash commands |
| `ethskills` | Phase 3.3 | USDC transfers, Base chain interaction |
| `python-fastapi-service` | Phase 1.1-1.2 | FastAPI + SQLAlchemy async (DB is plain Railway Postgres) |
| `web-deploy` | Phase 4.4 | Deploy server + portal |
| `github-workflow` | All | Repo management, PRs |
| `nextjs-best-practices` | Phase 3.1 | Advertiser portal |
| `frontend-ui-dark-ts` | Phase 3.1 | UI components |

---

## First Sprint (This Week)

### Goal: Working ad server + plugin skeleton

**Day 1-2:**
- [x] Create GitHub repo (now private)
- [x] Create project structure
- [x] Write PRODUCT.md
- [x] Write IMPLEMENTATION.md
- [x] Set up Python project (pyproject.toml)
- [x] Create FastAPI app + plugin scaffold (x402 middleware wired but disabled until configured)
- [ ] Provision Railway Postgres + apply `scripts/schema.sql` (1.2)

**Day 3-4:**
- [ ] Implement ad matcher + tracker against Postgres (replace stubs in 1.3)
- [x] Build plugin scaffold (plugin.yaml, __init__.py)
- [x] Build ad_client.py (API communication)
- [ ] Verify available Hermes hooks, then test plugin loads (Q5 / 1.4.7)

**Day 5:**
- [ ] Integration test: ad server → plugin → ad display
- [ ] Fix issues
- [ ] Push progress

---

## Changelog

- **2026-06-13** — **Switched persistence from Supabase to Railway Postgres** (Q3 revised). Rationale: one platform with the ad server, direct asyncpg connection (no PostgREST hop on the 2s ad path), no vendor lock-in. `server/database.py` rewritten to SQLAlchemy async + asyncpg; added `scripts/schema.sql` (tables + indexes); `pyproject.toml` now depends on `sqlalchemy[asyncio]` + `asyncpg` (dropped `supabase`); `.env.example` uses `DATABASE_URL`; `docker-compose.yml` now runs Postgres + server with schema auto-init. Access control moves to the app layer (no RLS).
- **2026-06-13** — Finalized plan: resolved Q1–Q10, added Q11/Q12, added Integrity & Anti-Fraud and Custody & Payout sections, marked scaffold tasks 🟢. Bug fixes landed in `server/routes/ads.py`:
  - Removed duplicate impression logging — `/ad/request` no longer logs an impression (the plugin also reported it via `/ad/impression`, double-counting every served ad). Impression is now billable only on confirmed display (Q12).
  - Fixed invalid `HTTPException(204, detail=…)` — a 204 must carry no body; now returns a bodiless `204 No Content` that the client already interprets as "no ad".
  - Replaced hardcoded `* 0.5` earnings with the `USER_SHARE` constant from `config.py` (single source of truth for the 50/30/20 split).
- **2026-06-12** — Initial repo, structure, PRODUCT.md, IMPLEMENTATION.md.

*Last updated: 2026-06-13*
