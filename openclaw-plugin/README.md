# Latent Protocol — OpenClaw Plugin

Earn USDC from sponsored ads injected into your agent's **thinking state**, across
every OpenClaw channel (WhatsApp, Telegram, Slack, Discord, …) from a single plugin.

## Why OpenClaw

OpenClaw's `before_prompt_build` hook lets us put a sponsor line in front of the
user *while the agent thinks* — the least intrusive, highest-value ad surface.
This is the primary reason OpenClaw is our #1 integration target alongside Hermes.

## Ad Surfaces

| # | Surface | Hook | Role |
|---|---------|------|------|
| 1 | Thinking state | `before_prompt_build` | **Primary** — `prependContext` while thinking |
| 2 | Response footer | `message_sending` | Fallback when (1) didn't run this turn |
| 3 | Session banner | `session_start` | One welcome line per session |

Surfaces 1 and 2 share a **per-session** frequency counter
(`SessionFrequency`) and a **turn ledger** (`src/hooks/turn-ledger.ts`) so a
single turn never serves two ads and each channel/conversation keeps its own
cadence (OpenClaw runs many channels through one plugin instance).

**Click attribution:** the CTA points at the server's `/ad/click` redirect,
which logs the click and 302s to the advertiser — so clicks (worth 50x
impressions) are attributable in every channel where the link is clickable.
Only safe `https://` targets are ever rendered as clickable links.

## Install

```bash
# From ClawHub (once published)
openclaw plugins install clawhub:latent-protocol
openclaw plugins enable latent-protocol
openclaw config set plugins.latent-protocol.config.wallet "0xYOUR_WALLET"
openclaw gateway restart

# Local dev
openclaw plugins install ./openclaw-plugin --link
```

## Config

| Key | Required | Default | Description |
|-----|----------|---------|-------------|
| `wallet` | ✅ | — | Base (EVM) address that receives USDC |
| `enabled` | | `true` | Master on/off switch |
| `frequency` | | `5` | Show an ad once every N turns |
| `server` | | `https://agent-kickbacks-production.up.railway.app` | Ad server URL |
| `minPayout` | | `5.0` | Minimum USDC before payout |

Env fallbacks (`ADS_WALLET`, `ADS_ENABLED`, `ADS_FREQUENCY`, `ADS_SERVER`,
`ADS_MIN_PAYOUT`) are honoured for local dev / CI.

## Build

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # → dist/
```

> The `openclaw` package is a **peer dependency**. Ambient types in
> `src/types/openclaw.d.ts` keep `typecheck` working before it's installed; the
> real SDK overrides them at build/runtime.

## Known Caveats (upstream)

| Issue | Effect | Our mitigation |
|-------|--------|----------------|
| [openclaw#65157](https://github.com/openclaw/openclaw/issues/65157) | `before_prompt_build` not dispatched on the `claude-cli` provider | Footer hook (surface 2) takes over via the turn ledger |
| [OpenViking#1283](https://github.com/volcengine/OpenViking/issues/1283) | 2026.4.5 regression: model call could stall after the hook | `timeoutMs` budget on every hook; fail-open |
| `allowPromptInjection=false` | Disables all prompt-mutating hooks | Surface 1 & 3 silently no-op; nothing breaks |

## Fail-open Guarantee

Every network call has a hard 2s timeout and fails open — if the ad server is
slow or unreachable, the agent runs exactly as if the plugin weren't installed.
