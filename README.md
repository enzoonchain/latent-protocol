# Latent Protocol

> Crypto-native ad marketplace for AI agents. x402 micropayments on Base. Open source.

**Get paid to wait.** While your agent thinks, you earn USDC.

## What Is This?

Latent Protocol is an open-source ad marketplace that monetizes AI agent idle time. When your agent is processing, thinking, or waiting — sponsored recommendations are shown, and you earn 50% of ad revenue in USDC on Base.

Built on [x402](https://x402.org) — the internet's native payment protocol by Coinbase.

## Quick Start

### One-line install (Claude Code + Hermes)

Prerequisite: [Hermes](https://hermes-agent.nousresearch.com/docs/getting-started/quickstart) or Claude Code already installed.

```bash
# after npm publish:
npx latent-protocol init

# until publish lands (from this repo / GitHub):
npx --yes github:enzoonchain/latent-protocol init --yes --generate
```

This detects installed agents, sets up a Base wallet, and patches every surface it finds:

- **Claude Code** — Node status line (no Python required)
- **Hermes** — pip package + `agent-ads` plugin enable (Python 3.10+)
- **OpenClaw** — thinking-state + footer plugin (WA/TG/Slack/…)
- **Cursor · Codex · MiMo · Gemini CLI** — registers the `latent-protocol`
  MCP server in the agent's own config and drops a session-start ad
  instruction (`AGENTS.md` / `GEMINI.md` / a Cursor rule)

```bash
npx latent-protocol status      # wallet, balance, patched surfaces
npx latent-protocol uninstall   # revert patches
```

Point at a custom ad server (e.g. staging):

```bash
npx latent-protocol init --yes --generate \
  --server https://ad-server-production-bffc.up.railway.app
```

### Self-Host Ad Server

```bash
git clone https://github.com/enzoonchain/latent-protocol.git
cd latent-protocol
cp .env.example .env  # edit with your values
docker compose up -d
```

## Architecture

```
Advertiser (Protocol/Token)     User/Agent (Hermes / Claude Code)
        │                              │
        │  x402 payment                │  plugin / statusline fetches ad
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

- **One-line `npx latent init`** — Claude Code + Hermes onboarding
- **Hermes Plugin** — `pre_llm_call` thinking-state + response footer
- **Claude Code status line** — sponsored chrome while the agent thinks
- **x402 Payments** — instant USDC micropayments on Base (~$0.0001 gas)
- **Multi-surface** — WebUI thinking state, Telegram, CLI, MCP
- **Block Bidding** — advertisers buy blocks of 1,000 impressions
- **Open Source** — Apache-2.0, self-hostable

## Revenue Split

| Recipient | Share |
|-----------|-------|
| User (viewer) | 50% |
| Operator (host) | 30% |
| Protocol treasury | 20% |

## Project Structure

```
latent-protocol/
├── cli/             # npm `latent` — npx installer + Node statusline
├── server/          # FastAPI ad server + x402
├── plugin/          # Hermes plugin (flat dir template)
├── openclaw-plugin/ # OpenClaw TypeScript plugin
├── landing/         # Advertiser portal (Next.js)
├── docs/            # Documentation
└── scripts/         # Setup + deployment scripts
```

## Tech Stack

| Component | Tech |
|-----------|------|
| Ad Server | FastAPI + x402 Python SDK |
| Database | Railway Postgres (SQLAlchemy async + asyncpg) |
| Payments | x402 protocol, USDC on Base |
| Facilitator | Coinbase CDP (1K free tx/mo) |
| Installer | Node CLI (`npx latent`) |
| Plugin | Hermes plugin system + Claude Code statusLine |
| Portal | Next.js + Wagmi + RainbowKit |
| Chain | Base L2 (eip155:8453) |

## Docs

- [Product](PRODUCT.md) — product spec and architecture
- [Plugin Guide](docs/PLUGIN.md) — plugin installation + configuration
- [Dev Plan](docs/DEV_PLAN_NPX_HERMES.md) — `npx` installer + Hermes recon
- [OpenClaw Plugin](docs/OPENCLAW_PLUGIN.md) — OpenClaw-specific setup
- [Advertiser Guide](docs/ADVERTISER.md) — how to create campaigns

## License

Apache-2.0
