# Agent Kickbacks

> Crypto-native ad marketplace for AI agents. x402 micropayments on Base. Open source.

**Get paid to wait.** While your agent thinks, you earn USDC.

## What Is This?

Agent Kickbacks is an open-source ad marketplace that monetizes AI agent idle time. When your agent is processing, thinking, or waiting — sponsored recommendations are shown, and you earn 50% of ad revenue in USDC on Base.

Built on [x402](https://x402.org) — the internet's native payment protocol by Coinbase.

## Quick Start

### Install Plugin (Hermes Users)

```bash
cd ~/.hermes/plugins/
git clone https://github.com/enzoonchain/agent-kickbacks.git agent-ads
hermes config set plugins.enabled '[agent-ads]'
hermes config set ads.wallet 0xYOUR_BASE_WALLET
hermes gateway restart
```

### Self-Host Ad Server

```bash
git clone https://github.com/enzoonchain/agent-kickbacks.git
cd agent-kickbacks
cp .env.example .env  # edit with your values
docker compose up -d
```

## Architecture

```
Advertiser (Protocol/Token)     User/Agent (Hermes)
        │                              │
        │  x402 payment                │  plugin fetches ad
        ▼                              ▼
┌──────────────────────────────────────────────┐
│           AD MARKETPLACE SERVER               │
│           (FastAPI + x402)                    │
│                                               │
│  /ad/request  /ad/click  /campaign/*          │
│  /earnings/*  /payout/*  /health              │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
          ┌─────────────────┐
          │  x402 Facilitator │
          │  (Coinbase CDP)   │
          │  USDC on Base     │
          └─────────────────┘
```

## Features

- **Hermes Plugin** — drop-in plugin for any Hermes instance
- **x402 Payments** — instant USDC micropayments on Base (~$0.0001 gas)
- **Multi-surface** — WebUI thinking state, response footer, Telegram, CLI
- **Block Bidding** — advertisers buy blocks of 1,000 impressions
- **User Dashboard** — earnings, stats, payout management
- **Open Source** — Apache-2.0, self-hostable

## Revenue Split

| Recipient | Share |
|-----------|-------|
| User (viewer) | 50% |
| Operator (host) | 30% |
| Protocol treasury | 20% |

## Project Structure

```
agent-kickbacks/
├── server/          # FastAPI ad server + x402
├── plugin/          # Hermes plugin
├── webui/           # WebUI patches (thinking state, footer)
├── portal/          # Advertiser portal (Next.js)
├── contracts/       # Smart contracts (optional)
├── docs/            # Documentation
└── scripts/         # Setup + deployment scripts
```

## Tech Stack

| Component | Tech |
|-----------|------|
| Ad Server | FastAPI + x402 Python SDK |
| Database | Supabase (Postgres) |
| Payments | x402 protocol, USDC on Base |
| Facilitator | Coinbase CDP (1K free tx/mo) |
| Plugin | Hermes plugin system |
| Portal | Next.js + Wagmi + RainbowKit |
| Chain | Base L2 (eip155:8453) |

## Docs

- [Product Implementation](PRODUCT.md) — full product spec
- [Implementation Plan](docs/IMPLEMENTATION.md) — build roadmap + tasks
- [Plugin Guide](docs/PLUGIN.md) — plugin installation + configuration
- [Advertiser Guide](docs/ADVERTISER.md) — how to create campaigns

## License

Apache-2.0
