# Latent Protocol — Advertiser Guide

Reach users of AI agents with contextual, non-intrusive sponsored recommendations. Pay per impression or click in USDC on Base.

---

## How it works

1. You create a **campaign** and add **ad creatives** (title, body, CTA)
2. You buy **impression blocks** (1 block = 1,000 impressions) in USDC
3. The marketplace matches your ads to relevant agent conversations
4. You pay only for confirmed impressions and clicks
5. Budget is debited atomically — no overspend, no surprise bills

---

## Pricing

| Surface | CPM (per 1,000 impressions) |
|---------|----------------------------|
| Response footer (all platforms) | $5 |
| Thinking state — OpenClaw (coming soon) | $10 |

Minimum campaign budget: **$10**  
Minimum bid per impression: **$0.001**  
1 block = 1,000 impressions = bid × 1,000

---

## Quick start via API

### 1. Create a campaign

```bash
curl -X POST https://agent-kickbacks-production.up.railway.app/campaign/create \
  -H "Content-Type: application/json" \
  -d '{
    "advertiser_wallet": "0xYOUR_WALLET",
    "name": "My DeFi Campaign",
    "total_budget": 50.0,
    "daily_cap": 10.0
  }'
```

Response:
```json
{ "campaign_id": "uuid-here" }
```

### 2. Add an ad creative

```bash
curl -X POST https://agent-kickbacks-production.up.railway.app/campaign/{campaign_id}/ad \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Earn 12% APY",
    "body": "Stake ETH and earn real yield. No lockups.",
    "cta_text": "Learn more",
    "cta_url": "https://yourprotocol.io",
    "category": "defi",
    "tags": ["ethereum", "yield", "staking"],
    "bid_per_impression": 0.005
  }'
```

**Supported categories:** `defi`, `nft`, `dao`, `gaming`, `developer`, `ai`, `general`

Tags are matched against user conversation context for relevance scoring.

### 3. Fund your campaign (buy blocks)

```bash
curl -X POST https://agent-kickbacks-production.up.railway.app/campaign/{campaign_id}/buy \
  -H "Content-Type: application/json" \
  -d '{ "blocks": 10 }'
```

Response:
```json
{
  "cost_usdc": 50.0,
  "impressions_added": 10000,
  "blocks_remaining": 10
}
```

### 4. Monitor performance

```bash
curl https://agent-kickbacks-production.up.railway.app/campaign/{campaign_id}
```

Response includes:
```json
{
  "id": "...",
  "name": "My DeFi Campaign",
  "status": "active",
  "budget_remaining": 40.0,
  "blocks_remaining": 8,
  "impressions": 2000,
  "clicks": 56,
  "ctr": 2.8
}
```

### 5. List your campaigns

```bash
curl "https://agent-kickbacks-production.up.railway.app/campaign/?wallet=0xYOUR_WALLET"
```

---

## Ad creative guidelines

| Field | Max length | Notes |
|-------|-----------|-------|
| `title` | 60 chars | Shown in bold |
| `body` | 120 chars | The main message |
| `cta_text` | 30 chars | Button label (e.g. "Learn more", "Try it free") |
| `cta_url` | — | Must be HTTPS |
| `image_url` | — | Optional, HTTPS |

**Content policy:**
- ✅ DeFi protocols, NFT projects, DAOs, developer tools, AI products
- ✅ Crypto-native content
- ❌ Scams, phishing, malware, pump-and-dump schemes
- ❌ Explicit content
- ❌ Misleading claims

Ads are filtered by the server-side content moderation layer before serving.

---

## Bid strategy

Higher `bid_per_impression` = more impressions won in the auction.

Ads compete in a **bid-weighted auction**: probability of winning an impression slot is proportional to `bid × relevance_score`. Relevance is calculated from tag overlap with the user's conversation context.

**Recommended starting bids:**

| Category | Suggested bid |
|----------|--------------|
| General | $0.003 |
| DeFi / NFT | $0.005 |
| Developer tools | $0.004 |
| Premium (high CTR expected) | $0.008–$0.01 |

---

## Campaign lifecycle

```
created → active (has budget + blocks) → exhausted (budget = 0)
                ↑                               ↓
           fund again ←─────────────────────────┘
```

- `active`: serving impressions
- `paused`: manually paused (endpoint coming)
- `exhausted`: budget depleted — top up with `POST /campaign/{id}/fund`

---

## API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/campaign/create` | Create new campaign |
| `POST` | `/campaign/{id}/ad` | Add ad creative |
| `POST` | `/campaign/{id}/fund` | Add budget |
| `POST` | `/campaign/{id}/buy` | Buy impression blocks |
| `GET` | `/campaign/{id}` | Campaign stats |
| `GET` | `/campaign/?wallet=0x...` | List your campaigns |
