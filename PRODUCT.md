# Agent Kickbacks — Product Implementation Doc

> Crypto-native ad marketplace for AI agents. x402 micropayments on Base. Open source.

---

## 1. Vision

Kickbacks.ai turns AI agent wait states into ad inventory — users earn money while their agent thinks. We rebuild this concept for the crypto-native agent ecosystem:

- **No Google auth** → wallet signature
- **No Stripe/fiat** → x402 + USDC on Base
- **No VS Code extension** → Hermes plugin + WebUI integration
- **No closed backend** → open source, self-hostable
- **No single surface** → WebUI, Telegram, CLI, Discord

**Tagline:** *"Get paid to wait. The most-watched line in crypto agents now has a market."*

---

## 2. Original Kickbacks.ai — Analysis

### What It Does
A VS Code extension that replaces AI coding tool spinners (Claude Code, Codex) with sponsored ads. Developers see ads while waiting for AI responses and earn 50% of ad revenue.

### Architecture (from source analysis)

| Component | Purpose |
|-----------|---------|
| `extension.ts` | Entry point, lifecycle, kill-switch |
| `activation/webviewInjection.ts` | Core ad injection into VS Code webviews (~20KB) |
| `loopback.ts` | Local HTTP bridge (webview ↔ extension) |
| `activation/adRotation.ts` | Ad queue rotation + timer |
| `activation/statusBarAd.ts` | VS Code status bar ad display |
| `adapters/claude-code/` | Claude Code spinner patching |
| `adapters/codex/` | Codex thinking-shimmer patching |
| `adapters/claude-cli/` | Claude Code CLI statusline |
| `auth/client.ts` | Google OAuth flow |
| `auth/vault.ts` | Encrypted credential storage |
| `metrics/client.ts` | Impression/view/click telemetry |
| `portfolio/client.ts` | Ad inventory fetching |
| `killswitch/client.ts` | Server-controlled off-switch |
| `update/client.ts` | Self-update with Ed25519 verification |
| `viewTracking/viewSession.ts` | Viewability measurement |

### Ad Surfaces (4 injection points)

| Surface | Target | Method |
|---------|--------|--------|
| Spinner overlay | Claude Code VS Code panel | Patches `webview/index.js` verb array |
| Thinking-shimmer | Codex VS Code panel | Patches `thinking-shimmer-*.js` via export hook |
| Status bar line | Claude Code terminal CLI | Patches `~/.claude/settings.json` statusLine |
| Spinner verb | Claude Code terminal CLI ≥2.1.143 | Patches `~/.claude/settings.json` spinnerVerbs |

### Revenue Model

- **Auction:** English-ascending, advertisers buy blocks of 1,000 × 5-second impressions
- **Impression billing:** 3-tier system: `impression_rendered` → `view_tick` (5s heartbeat) → `view_threshold_met` (15s cumulative)
- **Click billing:** 50× impression value, anti-misclick gate (15s threshold)
- **Split:** 50% developer / 50% platform
- **Earning caps:** Hourly + daily, tiered by account verification

### Key Patterns We Borrow

1. **Ad rotation with TTL** — ads expire, force refresh every N seconds
2. **View tracking** — `IntersectionObserver` for web, time-based for CLI
3. **Kill switch** — server can disable serving instantly
4. **Self-healing** — re-apply patches if overwritten
5. **Boot canary** — crash detection prevents infinite loops
6. **Demo mode** — signed-out users see ads but don't earn (advertiser still pays)

---

## 3. What We Build — Crypto-Native Version

### Core Differences from Kickbacks

| Kickbacks | Agent Kickbacks |
|-----------|----------------|
| Google OAuth | Wallet signature (EIP-712) |
| Stripe/fiat | x402 + USDC on Base |
| VS Code extension | Hermes plugin |
| Private backend | Open source, self-hostable |
| 1 surface (VS Code) | 4+ surfaces (WebUI, Telegram, CLI, Discord) |
| Centralized ad server | Distributed marketplace |
| 50/50 split | 50% user / 30% operator / 20% protocol |
| Server-authoritative earnings | On-chain + off-chain hybrid |

### The 4 Surfaces (Our Version)

| Surface | Injection Point | Method |
|---------|----------------|--------|
| **WebUI thinking state** | While agent is "thinking" | Modify `ui.js` — inject ad banner into `thinkingRow` element |
| **WebUI response footer** | After agent response | Hermes plugin `post_response` hook |
| **Telegram response footer** | After agent message | Plugin appends sponsored message |
| **CLI response footer** | After terminal output | Plugin appends ANSI colored banner |

### What the Plugin Handles

```
┌─────────────────────────────────────────────────────┐
│  PLUGIN: agent-ads (Hermes plugin)                  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  INPUT:                                              │
│  ├── on_thinking_start hook → fetch ad               │
│  ├── post_tool_call hook → fetch ad                  │
│  ├── post_response hook → append footer ad           │
│  └── /ads slash command → user control               │
│                                                      │
│  OUTPUT:                                             │
│  ├── WebUI: ad banner in thinking state              │
│  ├── WebUI: ad card in response footer               │
│  ├── Telegram: sponsored message after response      │
│  ├── CLI: ANSI banner after response                 │
│  └── earnings balance display                        │
│                                                      │
│  TRACKING:                                           │
│  ├── impression log → ad server API                  │
│  ├── click tracking → redirect URLs                  │
│  ├── view time → IntersectionObserver (WebUI)        │
│  └── frequency cap → per-session counter             │
│                                                      │
│  WALLET:                                             │
│  ├── config: ads.wallet (Base address)               │
│  ├── earnings accumulation (off-chain ledger)        │
│  ├── balance display (WebUI sidebar)                 │
│  └── payout trigger: $5+ USDC on Base               │
│                                                      │
│  NOT in plugin:                                      │
│  ├── Ad server hosting → separate service            │
│  ├── Advertiser portal → separate web app            │
│  ├── USDC smart contract → on-chain settlement       │
│  └── Ad targeting algorithm → server-side            │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 4. Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  Advertiser   │    │  User/Agent  │    │  Operator     │       │
│  │  (Protocol)   │    │  (Hermes)    │    │  (You)        │       │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘       │
│         │                    │                    │               │
│         ▼                    ▼                    ▼               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  Advertiser   │    │  Hermes      │    │  Admin        │       │
│  │  Portal       │    │  Plugin      │    │  Dashboard    │       │
│  │  (Next.js)    │    │  (Python)    │    │  (Next.js)    │       │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘       │
│         │                    │                    │               │
│         ▼                    ▼                    ▼               │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                AD MARKETPLACE SERVER                   │       │
│  │                (FastAPI + x402)                        │       │
│  │                                                        │       │
│  │  ├── /ad/request     — serve ad to agent               │       │
│  │  ├── /ad/click       — track clicks                    │       │
│  │  ├── /ad/impression  — track impressions               │       │
│  │  ├── /campaign/*     — CRUD campaigns                  │       │
│  │  ├── /earnings/*     — user earnings                   │       │
│  │  ├── /payout/*       — payout management               │       │
│  │  └── /health         — status                          │       │
│  │                                                        │       │
│  └──────────┬─────────────────────┬──────────────────────┘       │
│             │                     │                               │
│             ▼                     ▼                               │
│  ┌──────────────┐    ┌──────────────────────┐                   │
│  │ Railway PG    │    │  x402 Facilitator    │                   │
│  │ (Postgres)    │    │  (Coinbase CDP)      │                   │
│  │               │    │                       │                   │
│  │  ads          │    │  verify + settle      │                   │
│  │  campaigns    │    │  USDC on Base         │                   │
│  │  impressions  │    │                       │                   │
│  │  clicks       │    └──────────┬────────────┘                   │
│  │  earnings     │               │                                │
│  │  payouts      │               ▼                                │
│  └──────────────┘    ┌──────────────────────┐                   │
│                      │  Base L2              │                   │
│                      │  USDC transfers       │                   │
│                      │  ~$0.0001 gas         │                   │
│                      │  ~2s finality         │                   │
│                      └──────────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Ad Server (FastAPI + x402)

```python
# server/main.py

import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# x402 imports
from x402.http import FacilitatorConfig, HTTPFacilitatorClient, PaymentOption
from x402.http.middleware.fastapi import PaymentMiddlewareASGI
from x402.http.types import RouteConfig
from x402.mechanisms.evm.exact import ExactEvmServerScheme
from x402.server import x402ResourceServer
from x402.schemas import Network

# Config
EVM_ADDRESS = os.getenv("EVM_ADDRESS")  # Marketplace treasury wallet
EVM_NETWORK: Network = "eip155:8453"     # Base Mainnet
FACILITATOR_URL = os.getenv("FACILITATOR_URL", "https://x402.org/facilitator")

app = FastAPI(title="Agent Kickbacks")

# x402 setup
facilitator = HTTPFacilitatorClient(FacilitatorConfig(url=FACILITATOR_URL))
server = x402ResourceServer(facilitator)
server.register(EVM_NETWORK, ExactEvmServerScheme())

# Paid routes
routes = {
    "POST /ad/request": RouteConfig(
        accepts=[PaymentOption(
            scheme="exact",
            pay_to=EVM_ADDRESS,
            price="$0.001",        # $0.001 per impression
            network=EVM_NETWORK,
        )],
        mime_type="application/json",
        description="Request an ad impression",
    ),
    "POST /ad/click": RouteConfig(
        accepts=[PaymentOption(
            scheme="exact",
            pay_to=EVM_ADDRESS,
            price="$0.01",         # $0.01 per click (10× impression)
            network=EVM_NETWORK,
        )],
        mime_type="application/json",
        description="Track an ad click",
    ),
}

app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)
```

### Ad Serving Endpoint

```python
# server/routes/ads.py

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from .matcher import select_best_ad
from .tracker import log_impression

router = APIRouter()

class AdRequest(BaseModel):
    user_wallet: str
    agent: str          # "hermes", "bankrbot", etc.
    context: str        # what user is working on
    surface: str        # "webui_thinking", "webui_footer", "telegram", "cli"
    tags: list[str] = []

class AdResponse(BaseModel):
    ad_id: str
    title: str
    body: str
    cta_text: str
    cta_url: str
    earn_amount: float  # USDC amount user earns
    image_url: str | None = None

@router.post("/ad/request")
async def request_ad(req: AdRequest):
    """Serve best matching ad to agent."""
    ad = await select_best_ad(
        context=req.context,
        tags=req.tags,
        agent=req.agent,
        surface=req.surface
    )
    
    if not ad:
        raise HTTPException(204, "No ads available")
    
    # Log impression
    await log_impression(
        ad_id=ad["id"],
        user_wallet=req.user_wallet,
        agent=req.agent,
        surface=req.surface,
        context=req.context
    )
    
    return AdResponse(
        ad_id=ad["id"],
        title=ad["title"],
        body=ad["body"],
        cta_text=ad["cta_text"],
        cta_url=f"{ad['cta_url']}?ref=agent-kickbacks&ad={ad['id']}",
        earn_amount=ad["bid_per_impression"] * 0.5,  # 50% to user
        image_url=ad.get("image_url")
    )
```

### Database Schema (Railway Postgres)

> Canonical DDL lives in [`scripts/schema.sql`](scripts/schema.sql). The block below is illustrative.

```sql
-- Ads table
CREATE TABLE ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_id UUID NOT NULL REFERENCES advertisers(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    cta_text TEXT NOT NULL DEFAULT 'Learn more',
    cta_url TEXT NOT NULL,
    image_url TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    tags JSONB DEFAULT '[]',
    bid_per_impression NUMERIC(10,6) NOT NULL,
    daily_budget NUMERIC(10,2) NOT NULL,
    budget_remaining NUMERIC(10,2) NOT NULL,
    impressions_today INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- Campaigns (advertiser-created)
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_id UUID NOT NULL REFERENCES advertisers(id),
    name TEXT NOT NULL,
    total_budget NUMERIC(10,2) NOT NULL,
    budget_spent NUMERIC(10,2) DEFAULT 0,
    daily_cap NUMERIC(10,2),
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Advertisers
CREATE TABLE advertisers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL UNIQUE,
    name TEXT,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Impressions
CREATE TABLE impressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id UUID NOT NULL REFERENCES ads(id),
    user_wallet TEXT NOT NULL,
    agent TEXT NOT NULL,
    surface TEXT NOT NULL,
    context TEXT,
    clicked BOOLEAN DEFAULT FALSE,
    view_time_ms INTEGER DEFAULT 0,
    earned_amount NUMERIC(10,6) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User earnings (off-chain ledger)
CREATE TABLE earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    impression_id UUID REFERENCES impressions(id),
    amount NUMERIC(10,6) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payout_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payouts
CREATE TABLE payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    amount NUMERIC(10,6) NOT NULL,
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
```

### Hermes Plugin Structure

```
~/.hermes/plugins/agent-ads/
├── plugin.yaml                 # manifest
├── __init__.py                 # register() — hooks + tools
├── ad_client.py                # ad server API client
├── tracker.py                  # impression + click tracking
├── wallet.py                   # earnings + payout
├── config.py                   # ads.wallet, ads.frequency, etc.
├── hooks/
│   ├── on_thinking.py          # thinking state injection
│   ├── post_tool_call.py       # tool call post-hook
│   └── post_response.py        # response footer
├── commands/
│   └── ads.py                  # /ads slash command
└── static/
    └── ad_card.js              # WebUI banner component
```

### Plugin Code

```python
# ~/.hermes/plugins/agent-ads/__init__.py

import json
from .ad_client import AdClient
from .tracker import Tracker
from .wallet import Wallet
from .config import get_config

def register(ctx):
    config = get_config()
    client = AdClient(config.server)
    tracker = Tracker(config.server)
    wallet = Wallet(config.wallet)

    # ─── TOOL: fetch ad ───
    schema = {
        "name": "agent_ads",
        "description": "Fetch a sponsored recommendation to display.",
        "parameters": {
            "type": "object",
            "properties": {
                "context": {"type": "string", "description": "User context"}
            }
        }
    }

    def handle_ads(params, **kwargs):
        ad = client.get_ad(
            wallet=config.wallet,
            context=params.get("context", "general"),
            agent="hermes"
        )
        if ad:
            tracker.log_impression(ad["id"], config.wallet)
            return json.dumps({"show": True, "ad": ad})
        return json.dumps({"show": False})

    ctx.register_tool(
        name="agent_ads",
        toolset="agent_ads",
        schema=schema,
        handler=handle_ads,
        description="Fetch sponsored recommendation"
    )

    # ─── HOOK: thinking start ───
    def on_thinking_start(context=None):
        if not config.enabled:
            return
        ad = client.get_ad(
            wallet=config.wallet,
            context=context or "general",
            agent="hermes",
            surface="webui_thinking"
        )
        if ad:
            tracker.log_impression(ad["id"], config.wallet)
            ctx.inject_message(
                f"💰 Sponsored: {ad['body']} → {ad['cta_url']}",
                role="system"
            )

    ctx.register_hook("on_thinking_start", on_thinking_start)

    # ─── HOOK: post response footer ───
    def post_response(text, **kwargs):
        if not config.enabled:
            return text
        if not tracker.should_show(config.frequency):
            return text
        ad = client.get_ad(
            wallet=config.wallet,
            context=text[:100],
            agent="hermes",
            surface="response_footer"
        )
        if ad:
            tracker.log_impression(ad["id"], config.wallet)
            footer = (
                f"\n\n---\n"
                f"💰 **Sponsored:** {ad['body']}  \n"
                f"[{ad['cta_text']} →]({ad['cta_url']})  \n"
                f"_+${ad['earn_amount']} USDC earned_"
            )
            return text + footer
        return text

    ctx.register_hook("post_response", post_response)

    # ─── SLASH: /ads ───
    def handle_ads_command(args):
        cmd = args.strip().lower()
        if cmd == "off":
            config.enabled = False
            return "❌ Ads disabled. /ads on to re-enable."
        elif cmd == "on":
            config.enabled = True
            return "✅ Ads enabled."
        elif cmd == "balance":
            bal = wallet.get_balance()
            return f"💰 Balance: ${bal:.4f} USDC"
        elif cmd == "payout":
            amount = wallet.get_balance()
            if amount >= 5.0:
                tx = wallet.payout()
                return f"💸 Payout sent! ${amount:.4f} USDC\nTx: {tx}"
            return f"❌ Minimum payout $5.00. Current: ${amount:.4f}"
        else:
            return "Usage: /ads [on|off|balance|payout]"

    ctx.register_command("ads", handle_ads_command, "Manage ads: /ads [on|off|balance|payout]")
```

### WebUI Integration (thinking state)

```javascript
// hermes-webui/static/ui.js modification
// Inject ad banner into thinkingRow while agent is processing

const _origThinkingTick = window._thinkingTick;  // save original
window._thinkingTick = function() {
    _origThinkingTick.apply(this, arguments);
    
    const row = document.getElementById('thinkingRow');
    if (!row || row.dataset.thinkingActive !== '1') return;
    
    // Inject ad banner if not already present
    if (!row.querySelector('.agent-ad-banner')) {
        fetch('/api/agent-ads/request', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                context: 'thinking',
                surface: 'webui_thinking',
                agent: 'hermes'
            })
        })
        .then(r => r.json())
        .then(ad => {
            if (!ad.show) return;
            const banner = document.createElement('div');
            banner.className = 'agent-ad-banner';
            banner.innerHTML = `
                <div style="border:1px solid #fbbf2433; background:#fbbf2408; 
                            border-radius:8px; padding:8px 12px; margin:4px 0; 
                            font-size:12px; opacity:0.8; display:flex; 
                            justify-content:space-between; align-items:center;">
                    <span>💰 <b>${ad.ad.title}</b> — ${ad.ad.body}</span>
                    <a href="${ad.ad.cta_url}" target="_blank" 
                       style="color:#60a5fa; font-size:11px;">
                       ${ad.ad.cta_text} →
                    </a>
                    <span style="color:#34d399; font-size:11px;">
                        +$${ad.ad.earn_amount}
                    </span>
                </div>`;
            row.appendChild(banner);
        })
        .catch(() => {});  // fail silently
    }
};
```

---

## 5. Advertiser Portal

### Features

| Feature | Description |
|---------|-------------|
| **Connect wallet** | Wagmi + RainbowKit on Base |
| **Create ad** | Title (30 chars), body (140 chars), CTA text, CTA URL, image, category, tags |
| **Set budget** | Total budget + daily cap in USDC |
| **Fund campaign** | x402 payment or direct USDC transfer |
| **Block bidding** | Buy blocks of 1,000 impressions at set price |
| **Analytics** | Impressions, clicks, CTR, spend, remaining budget |
| **Pause/resume** | Real-time campaign control |

### Block Bidding System

```
┌─────────────────────────────────────────────────┐
│  BLOCK BIDDING (Kickbacks-style)                │
├─────────────────────────────────────────────────┤
│                                                  │
│  Advertiser buys a "block":                      │
│  ├── 1,000 impressions                           │
│  ├── at $X per impression (bid)                  │
│  ├── total cost: $X × 1,000                      │
│  └── block expires in 7 days                     │
│                                                  │
│  Auction: English-ascending                       │
│  ├── Higher bid = more impressions served        │
│  ├── Same bid = rotated equally                  │
│  └── Budget exhausted = ads stop                  │
│                                                  │
│  Pricing tiers:                                  │
│  ├── $0.001/impression (minimum)                 │
│  ├── $0.005/impression (recommended)             │
│  ├── $0.01/impression (premium placement)        │
│  └── $0.05/impression (thinking state — premium) │
│                                                  │
└─────────────────────────────────────────────────┘
```

### User Profile Dashboard

```
┌─────────────────────────────────────────────────┐
│  USER PROFILE                                    │
├─────────────────────────────────────────────────┤
│                                                  │
│  Wallet: 0x1234...5678                           │
│  Connected: Base                                 │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  EARNINGS                                  │  │
│  │                                            │  │
│  │  Today:        $0.47                       │  │
│  │  This Week:    $3.22                       │  │
│  │  This Month:   $12.85                      │  │
│  │  All Time:     $47.23                      │  │
│  │                                            │  │
│  │  Available:     $5.23  [Payout →]          │  │
│  │  Pending:       $0.47                      │  │
│  │  Paid Out:      $41.53                     │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  AD ACTIVITY                               │  │
│  │                                            │  │
│  │  Impressions today:   47                   │  │
│  │  Clicks today:        3                    │  │
│  │  CTR:                 6.4%                 │  │
│  │  Avg view time:       8.2s                 │  │
│  │                                            │  │
│  │  Top categories:                           │  │
│  │  ├── DeFi (23 impressions)                 │  │
│  │  ├── Tokens (15 impressions)               │  │
│  │  └── Infra (9 impressions)                 │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  SETTINGS                                  │  │
│  │                                            │  │
│  │  Ads enabled:    ✅ On                     │  │
│  │  Frequency:      Every 5 messages          │  │
│  │  Categories:     All                       │  │
│  │  Min payout:     $5.00 USDC               │  │
│  │  Auto-payout:    ❌ Off                    │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## 6. Revenue Model

### Payment Flow (x402)

```
1. Advertiser funds campaign ($50 USDC via x402)
   → Facilitator settles on Base
   → $50 USDC → marketplace treasury wallet

2. User's agent requests ad
   → Server selects best ad
   → Ad served + impression logged
   → $0.005 deducted from advertiser balance

3. Revenue split (off-chain ledger):
   ├── 50% → user balance ($0.0025)
   ├── 30% → operator balance ($0.0015)
   └── 20% → protocol treasury ($0.0010)

4. User hits $5 threshold
   → Triggers batch payout via Base
   → $5 USDC transferred to user wallet
   → ~$0.0001 gas on Base
```

### Pricing

| Action | Price | User Earns | Operator Gets | Protocol Gets |
|--------|-------|------------|---------------|---------------|
| Impression | $0.005 | $0.0025 | $0.0015 | $0.0010 |
| Click | $0.15 | $0.075 | $0.045 | $0.030 |
| Premium impression (thinking state) | $0.01 | $0.005 | $0.003 | $0.002 |

### Unit Economics

| Metric | Conservative | Optimistic |
|--------|-------------|------------|
| Daily active users | 100 | 1,000 |
| Ads per user per day | 5 | 10 |
| Avg CPM (cost per 1000 impressions) | $5 | $10 |
| **Daily platform revenue** | **$2.50** | **$100** |
| **Monthly platform revenue** | **$75** | **$3,000** |
| Operator share (30%) | $22.50/mo | $900/mo |

---

## 7. Implementation Timeline

### Phase 1: Foundation (Week 1-2)

| Task | Deliverable | Owner |
|------|-------------|-------|
| Ad server API (FastAPI) | `/ad/request`, `/ad/click` endpoints | Backend |
| x402 integration | Payment middleware on ad routes | Backend |
| Postgres schema | All tables created (`scripts/schema.sql`) | Backend |
| Hermes plugin scaffold | `~/.hermes/plugins/agent-ads/` | Plugin |
| Plugin: ad_client.py | Ad server communication | Plugin |
| Plugin: tracker.py | Impression + click tracking | Plugin |

### Phase 2: Display (Week 2-3)

| Task | Deliverable | Owner |
|------|-------------|-------|
| Plugin: thinking hook | Ad in thinking state | Plugin |
| Plugin: response hook | Ad in response footer | Plugin |
| WebUI: thinking banner | `ui.js` modification | Frontend |
| WebUI: response card | Ad card component | Frontend |
| Telegram: footer injection | Sponsored message append | Plugin |
| CLI: ANSI banner | Colored ad output | Plugin |

### Phase 3: Payments (Week 3-4)

| Task | Deliverable | Owner |
|------|-------------|-------|
| Advertiser portal | Next.js app with Wagmi | Frontend |
| Campaign creation | Form + USDC funding | Frontend + Backend |
| Block bidding | Auction system | Backend |
| User earnings dashboard | Profile + stats | Frontend |
| USDC payout engine | Batch transfer on Base | Backend |

### Phase 4: Polish + Launch (Week 4-5)

| Task | Deliverable | Owner |
|------|-------------|-------|
| Kill switch | Server-controlled off-switch | Backend |
| Frequency cap | Per-user rate limiting | Backend |
| Analytics dashboard | Impression/click/click-through | Frontend |
| README + docs | Open source documentation | Docs |
| X launch post | Product announcement | Marketing |

---

## 8. File Structure

```
agent-kickbacks/
├── README.md
├── LICENSE                          # Apache-2.0
├── docker-compose.yml               # self-hostable
├── .env.example                     # environment template
│
├── server/                          # FastAPI ad server
│   ├── main.py                      # app + x402 middleware
│   ├── config.py                    # env vars + settings
│   ├── routes/
│   │   ├── ads.py                   # /ad/request, /ad/click
│   │   ├── campaigns.py             # CRUD campaigns
│   │   ├── earnings.py              # user earnings
│   │   └── payouts.py               # payout management
│   ├── models.py                    # Pydantic models
│   ├── matcher.py                   # ad targeting engine
│   ├── tracker.py                   # impression/click tracking
│   ├── x402_payments.py             # x402 integration
│   └── database.py                  # async SQLAlchemy engine (asyncpg)
│
├── plugin/                          # Hermes plugin
│   ├── plugin.yaml                  # manifest
│   ├── __init__.py                  # register() — hooks + tools
│   ├── ad_client.py                 # ad server API client
│   ├── tracker.py                   # impression + click tracking
│   ├── wallet.py                    # earnings + payout
│   ├── config.py                    # ads.wallet, ads.frequency
│   ├── hooks/
│   │   ├── on_thinking.py           # thinking state injection
│   │   ├── post_tool_call.py        # tool call post-hook
│   │   └── post_response.py         # response footer
│   ├── commands/
│   │   └── ads.py                   # /ads slash command
│   └── static/
│       └── ad_card.js               # WebUI banner component
│
├── webui/                           # WebUI modifications
│   ├── patches/
│   │   ├── thinking-banner.patch    # thinking state ad injection
│   │   └── response-footer.patch    # response footer ad card
│   └── static/
│       └── agent-ads.js             # ad rendering + tracking
│
├── portal/                          # Advertiser portal (Next.js)
│   ├── pages/
│   │   ├── index.tsx                # landing
│   │   ├── create.tsx               # create ad
│   │   ├── campaigns.tsx            # manage campaigns
│   │   └── analytics.tsx            # ad performance
│   ├── components/
│   │   ├── AdForm.tsx               # ad creation form
│   │   ├── CampaignCard.tsx         # campaign display
│   │   └── AnalyticsChart.tsx       # performance charts
│   └── lib/
│       ├── wagmi.ts                 # wallet connection
│       └── api.ts                   # ad server client
│
├── contracts/                       # On-chain (optional)
│   ├── Treasury.sol                 # USDC treasury + distribution
│   └── README.md                    # deployment guide
│
└── docs/
    ├── PRODUCT.md                   # this document
    ├── ARCHITECTURE.md              # technical architecture
    ├── PLUGIN.md                    # plugin installation guide
    └── ADVERTISER.md                # advertiser onboarding
```

---

## 9. Open Source Strategy

### Distribution

| Channel | Method |
|---------|--------|
| **GitHub** | Main repo, Apache-2.0 |
| **Hermes plugins** | `hermes plugins install agent-ads` |
| **PyPI** | `pip install agent-kickbacks` |
| **Docker** | `docker compose up` for self-hosted |

### Self-Hosting

```bash
# Clone and run
git clone https://github.com/agent-kickbacks/agent-kickbacks.git
cd agent-kickbacks
cp .env.example .env  # edit with your values
docker compose up -d

# Or install plugin only
cd plugin/
pip install -e .
hermes plugins install agent-ads
hermes config set ads.wallet 0xYOUR_WALLET
```

### Why Open Source Wins

1. **Trust** — users see exactly what runs on their machine
2. **Composability** — other agent frameworks can integrate
3. **Community** — contributions expand surfaces + features
4. **No vendor lock-in** — self-host if you want
5. **Adoption** — free distribution via GitHub + PyPI

---

## 10. x402 Integration Details

### Why x402

| Traditional Payment | x402 on Base |
|---------------------|--------------|
| $0.30 + 2.9% per tx | ~$0.0001 gas |
| Days to settle | ~2 seconds |
| Chargebacks possible | On-chain finality |
| KYC required | Wallet signature only |
| $1 minimum practical | $0.001 practical |

### Facilitator Choice

| Facilitator | Free Tier | After | Chains |
|-------------|-----------|-------|--------|
| **Coinbase CDP** | 1,000 tx/mo | $0.001/tx | Base, Polygon, Arbitrum, Solana |
| PayAI | — | — | Base, Solana |
| Sperax | — | — | Base, Arbitrum, Ethereum |

**Recommendation:** Start with Coinbase CDP (1,000 free transactions/month is enough for MVP).

### Payment Flow

```
Advertiser                Marketplace              Facilitator              Base
    │                          │                        │                     │
    │  POST /campaign/create   │                        │                     │
    │  + x402 payment          │                        │                     │
    │─────────────────────────▶│                        │                     │
    │                          │  POST /verify          │                     │
    │                          │───────────────────────▶│                     │
    │                          │◀───────────────────────│                     │
    │                          │  POST /settle          │                     │
    │                          │───────────────────────▶│                     │
    │                          │                        │  transferWithAuth   │
    │                          │                        │────────────────────▶│
    │                          │                        │◀────────────────────│
    │                          │◀───────────────────────│                     │
    │  200 OK + tx_hash        │                        │                     │
    │◀─────────────────────────│                        │                     │
```

### USDC on Base

| Network | Chain ID | USDC Address |
|---------|----------|-------------|
| Base Mainnet | `eip155:8453` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia | `eip155:84532` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

### EIP-3009 (Gasless for Users)

x402 uses `transferWithAuthorization` — users sign off-chain, facilitator submits on-chain. **Users never pay gas.** Critical for micropayments.

---

## 11. Competitive Landscape

| Project | What | Our Advantage |
|---------|------|---------------|
| Kickbacks.ai | VS Code extension, fiat, closed | Open source, crypto-native, multi-surface |
| AdPrompt.ai | Marketing APIs on x402 | We do impressions, not APIs |
| Teneo Protocol | Agent data marketplace | We do ads, not data |
| Browserbase | Browser automation on x402 | Different vertical |

**Our moat:** First open-source agent ad marketplace with x402 micropayments on Base. No competitor exists in this exact space.

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Low advertiser demand | Start with crypto projects (natural fit), offer free tier |
| Low user adoption | Open source + Hermes integration = easy onboarding |
| Ad blockers | Plugin-level, not browser-level — harder to block |
| Spam perception | Frequency cap + context-aware targeting + dismiss option |
| x402 downtime | Fail-open (no ad shown, agent still works) |
| Payout delays | Off-chain ledger, batch payouts weekly |

---

## 13. Success Metrics

| Metric | Week 1 | Month 1 | Month 6 |
|--------|--------|---------|---------|
| Plugin installs | 10 | 100 | 1,000 |
| Daily active users | 5 | 50 | 500 |
| Daily impressions | 50 | 500 | 5,000 |
| Advertisers | 1 | 5 | 20 |
| Daily revenue | $0.10 | $2.50 | $50 |
| Monthly revenue | $3 | $75 | $1,500 |

---

*Last updated: 2026-06-12*
*Status: Planning — ready to build*
