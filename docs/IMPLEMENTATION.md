# Implementation Plan — Agent Kickbacks

> Build roadmap, task breakdown, questions, dependencies, and execution order.

---

## Status

| Phase | Status | Target |
|-------|--------|--------|
| Phase 1: Foundation | 🔴 Not started | Week 1-2 |
| Phase 2: Display | 🔴 Not started | Week 2-3 |
| Phase 3: Payments | 🔴 Not started | Week 3-4 |
| Phase 4: Launch | 🔴 Not started | Week 4-5 |

---

## Phase 1: Foundation (Week 1-2)

### 1.1 Ad Server Setup

**Goal:** Working FastAPI server with x402 payment middleware on Base.

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 1.1.1 | Initialize Python project (pyproject.toml, venv) | — | — | 🔴 |
| 1.1.2 | Install dependencies: fastapi, uvicorn, x402[httpx], supabase | 1.1.1 | — | 🔴 |
| 1.1.3 | Create FastAPI app with x402 middleware | 1.1.2 | — | 🔴 |
| 1.1.4 | Set up Coinbase CDP facilitator on Base | — | ethskills | 🔴 |
| 1.1.5 | Create .env.example with all required vars | 1.1.3 | — | 🔴 |
| 1.1.6 | Test x402 payment flow (Base Sepolia first) | 1.1.3, 1.1.4 | — | 🔴 |

**Key files:**
- `server/main.py` — FastAPI app + x402 middleware
- `server/config.py` — environment variables
- `server/routes/ads.py` — ad serving endpoints
- `server/x402_payments.py` — x402 integration helpers
- `.env.example` — template

**Questions to resolve:**
- [ ] Which facilitator? Coinbase CDP (recommended) vs PayAI vs self-hosted
- [ ] Test on Base Sepolia first or go straight to mainnet?
- [ ] USDC contract address for Base Mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

---

### 1.2 Database Schema

**Goal:** Supabase project with all tables, RLS policies, and indexes.

| # | Task | Depends On | Skill | Status |
|---|------|-----------|-------|--------|
| 1.2.1 | Create Supabase project | — | supabase | 🔴 |
| 1.2.2 | Create tables: ads, campaigns, advertisers, impressions, earnings, payouts | 1.2.1 | supabase | 🔴 |
| 1.2.3 | Set up RLS policies (advertisers own data, users see own earnings) | 1.2.2 | supabase | 🔴 |
| 1.2.4 | Create indexes (wallet_address, ad_id, created_at) | 1.2.2 | supabase | 🔴 |
| 1.2.5 | Seed test data (sample ads, test advertiser) | 1.2.2 | — | 🔴 |

**Key files:**
- `server/database.py` — Supabase client setup
- `server/models.py` — Pydantic models matching DB schema
- `scripts/seed.sql` — test data

**Questions to resolve:**
- [ ] Supabase project name? `agent-kickbacks`?
- [ ] Do we need Supabase Auth or just wallet-based auth?

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
| 1.4.1 | Create plugin.yaml manifest | — | hermes-agent | 🔴 |
| 1.4.2 | Create __init__.py with register() | — | hermes-agent | 🔴 |
| 1.4.3 | Build ad_client.py (API communication) | 1.1.3 | — | 🔴 |
| 1.4.4 | Build config.py (ads.wallet, ads.frequency, etc.) | — | — | 🔴 |
| 1.4.5 | Build tracker.py (impression + click logging) | 1.3.3 | — | 🔴 |
| 1.4.6 | Register tool: agent_ads | 1.4.2 | hermes-agent | 🔴 |
| 1.4.7 | Test plugin loads in Hermes | 1.4.1-1.4.6 | hermes-agent | 🔴 |

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
- [ ] Do we patch ui.js directly or create a separate JS file that loads alongside?
- [ ] How does the WebUI serve static files? Can we add our own?

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
- [ ] Payout threshold: $5 USDC?
- [ ] Batch payouts (weekly) or on-demand?
- [ ] Who pays gas for user payouts? (operator absorbs ~$0.0001)

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
| 4.2.2 | Create docker-compose.yml (server + Supabase) | 4.2.1 | — | 🔴 |
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

| # | Question | Status | Answer |
|---|----------|--------|--------|
| Q1 | Which x402 facilitator to use? | 🔴 | Coinbase CDP recommended (1K free tx/mo) |
| Q2 | Base Sepolia for testing first? | 🔴 | Yes — test on Sepolia, then mainnet |
| Q3 | Supabase vs raw Postgres? | 🔴 | Supabase (managed, RLS, realtime) |
| Q4 | WebUI static file serving — can we add custom JS? | 🔴 | Need to check WebUI architecture |
| Q5 | Hermes plugin hook names — what's available? | 🔴 | post_response confirmed, others TBD |
| Q6 | How to handle x402 on advertiser portal? | 🔴 | Wagmi + x402 client-side |

### Business

| # | Question | Status | Answer |
|---|----------|--------|--------|
| Q7 | Minimum advertiser budget? | 🔴 | Suggest $10 USDC |
| Q8 | Payout threshold? | 🔴 | Suggest $5 USDC |
| Q9 | Frequency cap default? | 🔴 | Every 5 messages |
| Q10 | Ad content policy? | 🔴 | No scams, no phishing, crypto-native OK |

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
| `supabase` | Phase 1.2 | Database setup, RLS, realtime |
| `python-fastapi-service` | Phase 1.1 | FastAPI best practices |
| `web-deploy` | Phase 4.4 | Deploy server + portal |
| `github-workflow` | All | Repo management, PRs |
| `nextjs-best-practices` | Phase 3.1 | Advertiser portal |
| `frontend-ui-dark-ts` | Phase 3.1 | UI components |

---

## First Sprint (This Week)

### Goal: Working ad server + plugin skeleton

**Day 1-2:**
- [x] Create GitHub repo
- [x] Create project structure
- [x] Write PRODUCT.md
- [x] Write IMPLEMENTATION.md
- [ ] Set up Python project (pyproject.toml, venv)
- [ ] Create FastAPI app with x402 middleware
- [ ] Set up Supabase project + schema

**Day 3-4:**
- [ ] Build ad matcher + tracker
- [ ] Build plugin scaffold (plugin.yaml, __init__.py)
- [ ] Build ad_client.py (API communication)
- [ ] Test: plugin loads in Hermes

**Day 5:**
- [ ] Integration test: ad server → plugin → ad display
- [ ] Fix issues
- [ ] Push progress

---

*Last updated: 2026-06-12*
