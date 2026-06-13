# Latent — Project Context

> For AI agents: read this to understand what Latent is, how it works, and why it exists.

---

## What Is Latent?

Latent is an **open-source ad marketplace for AI agents**. It monetizes the idle time of AI agents — the moments when an agent is thinking, processing, or waiting for API responses. During these "latent" periods, sponsored recommendations are shown to users, and they earn USDC on Base.

**One-liner:** Get paid to wait. Your agent's idle time is now worth something.

---

## The Problem

AI agents (Hermes, BankrBot, Aeon, Claude Code, Codex) have significant idle time:
- Waiting for LLM responses (3-10 seconds per turn)
- Processing tool calls (web search, terminal, file operations)
- Between conversation turns

This idle time is currently **wasted attention** — the user stares at a loading spinner or blank screen. Nobody profits. It's dead time.

---

## The Solution

Latent turns agent idle time into ad inventory:

1. **Agent is processing** → Latent plugin fetches a contextual ad from the marketplace
2. **Ad is displayed** → In the thinking state (WebUI), response footer (all surfaces), or CLI banner
3. **User earns** → 50% of ad revenue goes to the user in USDC on Base
4. **Advertiser pays** → Via x402 micropayments (~$0.001 per impression)

---

## How It Works (Technical)

### Architecture

```
User → Agent (Hermes) → Plugin → Ad Server → Ad returned → Displayed to user
                                    ↓
                              x402 payment (USDC on Base)
                                    ↓
                              User earns 50%
```

### Components

| Component | What | Tech |
|-----------|------|------|
| **Ad Server** | Serves ads, tracks impressions/clicks, manages campaigns | FastAPI + x402 + Supabase |
| **Hermes Plugin** | Injects ads into agent output, tracks user earnings | Python plugin system |
| **WebUI Patch** | Shows ads during agent thinking state | JavaScript injection |
| **Advertiser Portal** | Campaign creation, analytics, wallet funding | Next.js + Wagmi |
| **x402 Payments** | Instant USDC micropayments on Base | Coinbase CDP facilitator |

### Payment Flow (x402)

```
1. Advertiser deposits $50 USDC → Treasury (via x402)
2. User's agent requests ad → Server selects best match
3. Impression logged → $0.005 deducted from advertiser balance
4. Revenue split (off-chain ledger):
   - 50% → user ($0.0025)
   - 30% → operator ($0.0015)
   - 20% → protocol treasury ($0.0010)
5. User hits $5 threshold → Batch USDC transfer on Base
```

### Ad Surfaces

| Surface | Where | Method |
|---------|-------|--------|
| WebUI thinking state | While agent is "thinking" | Plugin injects banner into thinkingRow DOM |
| WebUI response footer | After agent response | Plugin post_response hook |
| Telegram footer | After agent message | Plugin appends sponsored message |
| CLI banner | After terminal output | Plugin ANSI colored output |

---

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Chain | Base L2 | ~$0.0001 gas, 2s finality, Coinbase backing |
| Token | USDC | Stable, widely accepted, EIP-3009 gasless |
| Payment protocol | x402 | Open standard, micropayments native, no KYC |
| Facilitator | Coinbase CDP | 1,000 free tx/mo, reliable |
| Auth | Wallet signature | No accounts, no Google, no KYC |
| Revenue split | 50/30/20 | User/operator/protocol |
| Open source | Apache-2.0 | Trust, composability, adoption |
| Plugin system | Hermes plugin | Drop-in, no core modification |

---

## Revenue Model

| Action | Price | User Gets | Operator Gets | Protocol Gets |
|--------|-------|-----------|---------------|---------------|
| Impression | $0.005 | $0.0025 | $0.0015 | $0.0010 |
| Click | $0.15 | $0.075 | $0.045 | $0.030 |
| Premium (thinking state) | $0.01 | $0.005 | $0.003 | $0.002 |

**Unit economics (conservative):** 100 users × 5 ads/day × $0.005 = $2.50/day platform revenue.

---

## Name Meaning

**Latent** — from "latent time" / "latent value."
- In AI: "latent space" = the hidden representation where meaning lives
- In our context: the hidden value in agent idle time
- The value is there, latent, waiting to be extracted

---

## Current Status

- ✅ GitHub repo: https://github.com/enzoonchain/agent-kickbacks
- ✅ Product spec: PRODUCT.md (41KB)
- ✅ Implementation plan: docs/IMPLEMENTATION.md
- ✅ Plugin scaffold: plugin/__init__.py (working structure)
- ✅ Ad server scaffold: server/main.py (FastAPI + x402 commented)
- 🔴 Not yet deployed
- 🔴 No advertisers yet
- 🔴 No users yet

---

## Tech Stack

```
Frontend:  React 19, TypeScript, Vite, Tailwind CSS v4, motion (Framer Motion)
Backend:   FastAPI, Python 3.12, x402 Python SDK
Database:  Supabase (Postgres)
Payments:  x402 protocol, USDC on Base, Coinbase CDP facilitator
Plugin:    Hermes plugin system (Python)
Chain:     Base L2 (eip155:8453)
Fonts:     Italiana (serif headings), Manrope (sans body), Marck Script (decorative)
Design:    Viktor Oddy / MotionSites inspired — dark, minimal, animated, premium
```

---

## Links

| Resource | URL |
|----------|-----|
| GitHub | https://github.com/enzoonchain/agent-kickbacks |
| Product Spec | docs/PRODUCT.md |
| Implementation Plan | docs/IMPLEMENTATION.md |
| x402 Protocol | https://x402.org |
| Coinbase CDP Facilitator | https://x402.org/facilitator |
| Base Chain | https://base.org |
| Hermes Agent | https://hermes-agent.nousresearch.com |

---

*This document is for AI agent context. Read it to understand Latent before working on the project.*
