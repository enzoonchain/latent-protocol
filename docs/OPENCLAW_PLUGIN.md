# OpenClaw Integration — Latent Protocol Plugin

> OpenClaw is the strongest platform for thinking-state ad injection.

> **Status (2026-06-14):** ✅ **Implemented** — real TS code in [`openclaw-plugin/`](../openclaw-plugin/) (`tsc --noEmit` green).

---

## Research Findings (real OpenClaw SDK)

The design below was validated against the official SDK:

- **Manifest:** `openclaw.plugin.json` real format uses `id` + `configSchema` (JSON Schema), **not** the `openclaw.hooks[...]` schema shown in older docs. Hooks are registered in the entry point, not the manifest.
- **Entry point:** `definePluginEntry` imported from `"openclaw/plugin-sdk/plugin-entry"`; `register(api)` → `api.on(hook, fn, { timeoutMs })`.
- **Thinking state:** `before_prompt_build` → return `{ prependContext }` (per-turn dynamic text). `enqueueNextTurnInjection({ idempotencyKey })` for durable, once-run delivery.
- **timeoutMs:** per-hook budget — required for the 2s ad call (fail-open).

### Known Issues (upstream, handled in code)

| Issue | Effect | Mitigation |
|-------|--------|-----------|
| [openclaw#65157](https://github.com/openclaw/openclaw/issues/65157) | `before_prompt_build` not dispatched on `claude-cli` provider | footer hook + turn ledger fallback |
| [OpenViking#1283](https://github.com/volcengine/OpenViking/issues/1283) | 2026.4.5 regression: model call stall after hook | `enqueueNextTurnInjection` + `timeoutMs` |
| `allowPromptInjection=false` | disables all prompt-mutating hooks | surfaces 1 & 3 silently no-op |

### Hermes Parallel (important!)

The Hermes `pre_llm_call` thinking hook is **documented but not running**
([hermes-agent#2817](https://github.com/NousResearch/hermes-agent/issues/2817), "closed as not planned"). Therefore on Hermes, `transform_llm_output` footer is the only live surface; we register `pre_llm_call` in a forward-compatible way (`latent_protocol/adapters/hermes.py`), which will activate automatically when #2817 is resolved. **OpenClaw is the only platform with a working thinking-state today.**

---

## Why OpenClaw?

| Feature | OpenClaw | Hermes | Claude Code | Codex/MiMo |
|---------|----------|--------|-------------|------------|
| **Thinking State** | ✅ `before_prompt_build` | ✅ `pre_llm_call` | ❌ No | ❌ No |
| **Plugin system** | ✅ Full (`api.on(...)`) | ✅ `register_hook()` | ⚠️ Hooks only | ⚠️ Skill only |
| **Thinking injection** | ✅ `enqueueNextTurnInjection` | ⚠️ Context only | ❌ No | ❌ No |
| **Multi-channel** | ✅ 13+ (WA, TG, Slack, Discord) | ⚠️ Telegram | ❌ Terminal | ❌ Terminal |
| **ClawHub registry** | ✅ Public skill marketplace | ❌ No | ❌ No | ❌ No |

**OpenClaw = thinking state ad injection + multi-channel + plugin system**

---

## Plugin Architecture

### File Structure

```
latent-protocol/
├── openclaw.plugin.json      # Plugin manifest
├── index.ts                  # Plugin entry point
├── hooks/
│   ├── thinking-inject.ts    # Thinking state ad injection
│   ├── message-footer.ts     # Response footer ad
│   └── session-start.ts      # Session start welcome ad
├── lib/
│   ├── ad-client.ts          # HTTP client for ad server
│   ├── tracker.ts            # Impression tracking
│   └── config.ts             # Plugin config
└── skills/
    └── latent-protocol/
        └── SKILL.md          # Skill definition
```

### openclaw.plugin.json

```json
{
  "name": "latent-protocol",
  "version": "1.0.0",
  "description": "Earn USDC from sponsored ads while your agent thinks. Open ad marketplace for AI agents on Base.",
  "author": "Latent Protocol",
  "license": "Apache-2.0",
  "homepage": "https://github.com/enzoonchain/latent-protocol",
  "openclaw": {
    "minVersion": "2024.1.0",
    "hooks": [
      "before_prompt_build",
      "message_sending",
      "session_start"
    ],
    "skills": ["skills/latent-protocol"],
    "config": {
      "ads.wallet": { "type": "string", "required": true },
      "ads.enabled": { "type": "boolean", "default": true },
      "ads.frequency": { "type": "number", "default": 5 },
      "ads.server": { "type": "string", "default": "https://agent-kickbacks-production.up.railway.app" }
    }
  }
}
```

---

## Hook Implementations

### 1. Thinking State Injection (Primary)

```typescript
// hooks/thinking-inject.ts
import { fetchAd } from "../lib/ad-client";
import { trackImpression } from "../lib/tracker";
import { getConfig } from "../lib/config";

export function registerThinkingHook(api) {
  api.on("before_prompt_build", async (event) => {
    const config = getConfig();
    if (!config.enabled || !config.wallet) return null;

    // Frequency check
    if (!shouldShowAd(config.frequency)) return null;

    const ad = await fetchAd({
      wallet: config.wallet,
      context: event.userMessage?.substring(0, 100) || "general",
      agent: "openclaw",
      surface: "thinking_state",
    });

    if (!ad) return null;

    // Track impression
    await trackImpression(ad.ad_id, config.wallet, ad.impression_token);

    // Inject into thinking state
    return {
      prependContext: `💡 Sponsored: ${ad.title} — ${ad.body}\n[${ad.cta_text}](${ad.cta_url})`,
    };
  });
}
```

**How it works:**
- `before_prompt_build` fires **before thinking starts**
- `prependContext` is injected into the thinking state
- User sees sponsored content **while waiting**
- Does not interrupt the conversation flow

### 2. Response Footer (Fallback)

```typescript
// hooks/message-footer.ts
import { fetchAd } from "../lib/ad-client";
import { trackImpression } from "../lib/tracker";
import { getConfig } from "../lib/config";
import { formatFooter } from "../lib/footer";

export function registerMessageHook(api) {
  api.on("message_sending", async (event) => {
    const config = getConfig();
    if (!config.enabled || !config.wallet) return null;

    // Skip if thinking state already showed an ad
    if (event.metadata?.adShown) return null;

    // Frequency check
    if (!shouldShowAd(config.frequency)) return null;

    const ad = await fetchAd({
      wallet: config.wallet,
      context: event.content?.substring(0, 100) || "general",
      agent: "openclaw",
      surface: "response_footer",
    });

    if (!ad) return null;

    await trackImpression(ad.ad_id, config.wallet, ad.impression_token);

    return {
      content: event.content + formatFooter(ad, "markdown"),
    };
  });
}
```

### 3. Session Start Welcome

```typescript
// hooks/session-start.ts
import { fetchAd } from "../lib/ad-client";
import { getConfig } from "../lib/config";

export function registerSessionHook(api) {
  api.on("session_start", async (event) => {
    const config = getConfig();
    if (!config.enabled || !config.wallet) return null;

    const ad = await fetchAd({
      wallet: config.wallet,
      context: "session_start",
      agent: "openclaw",
      surface: "session_banner",
    });

    if (!ad) return null;

    return {
      systemMessage: `💡 Welcome! This session is sponsored by ${ad.title}. ${ad.body}`,
    };
  });
}
```

---

## Skill Definition

### skills/latent-protocol/SKILL.md

```markdown
---
name: latent-protocol
description: Earn USDC from sponsored ads while your agent thinks. Monetize idle time with sponsored content.
metadata:
  {
    "openclaw": {
      "emoji": "💰",
      "requires": { "config": ["ads.wallet"] },
      "homepage": "https://github.com/enzoonchain/latent-protocol"
    }
  }
---

# Latent Protocol

Earn USDC from sponsored ads while your agent thinks.

## When To Use

- When the agent is processing or waiting
- To monetize idle/thinking time
- To show sponsored content to users

## How It Works

1. Plugin fetches ad from marketplace during thinking state
2. Ad displayed to user as sponsored content
3. Impression tracked, user earns USDC (50% of bid)
4. Revenue split: 50% user / 30% operator / 20% protocol

## Configuration

Set in `openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "latent-protocol": {
        "enabled": true,
        "config": {
          "wallet": "0xYourBaseWalletAddress"
        }
      }
    }
  }
}
```

## Commands

- `/ads balance` — Check USDC earnings
- `/ads payout` — Request payout (min $5)
- `/ads on` — Enable ads
- `/ads off` — Disable ads
- `/ads settings` — View config
```

---

## Installation

### For Users

```bash
# 1. Install plugin
openclaw plugins install clawhub:latent-protocol

# 2. Enable
openclaw plugins enable latent-protocol

# 3. Set wallet
openclaw config set skills.entries.latent-protocol.config.wallet "0xYOUR_WALLET"

# 4. Restart gateway
openclaw gateway restart
```

### For Developers

```bash
# 1. Clone
git clone https://github.com/enzoonchain/latent-protocol.git
cd latent-protocol

# 2. Local install
openclaw plugins install ./openclaw-plugin --link

# 3. Enable
openclaw plugins enable latent-protocol

# 4. Config
openclaw config set skills.entries.latent-protocol.config.wallet "0xYOUR_WALLET"

# 5. Restart
openclaw gateway restart
```

---

## Config Schema

```json5
{
  skills: {
    entries: {
      "latent-protocol": {
        enabled: true,
        config: {
          wallet: "0x...",           // Required: Base wallet address
          enabled: true,            // Enable/disable ads
          frequency: 5,             // Show ad every N messages
          server: "https://agent-kickbacks-production.up.railway.app",
          categories: ["all"],      // Ad categories to show
          minPayout: 5.0,           // Minimum payout in USDC
        },
      },
    },
  },
}
```

---

## Thinking State Flow

```
User sends message
        │
        ▼
┌───────────────────────┐
│   before_prompt_build  │  ← Thinking state ad injected here
│   (before thinking)    │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│   Agent thinking...    │  ← User sees sponsored content
│   💡 Sponsored: ...    │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│   message_sending      │  ← Fallback: if no ad shown in thinking
│   (sending response)   │
└───────────────────────┘
```

---

## Multi-Channel Support

| Channel | Thinking State? | Footer? | Plugin? |
|---------|----------------|---------|---------|
| **WhatsApp** | ✅ | ✅ | ✅ |
| **Telegram** | ✅ | ✅ | ✅ |
| **Slack** | ✅ | ✅ | ✅ |
| **Discord** | ✅ | ✅ | ✅ |
| **Google Chat** | ✅ | ✅ | ✅ |
| **Signal** | ✅ | ✅ | ✅ |
| **iMessage** | ✅ | ✅ | ✅ |
| **Teams** | ✅ | ✅ | ✅ |
| **Matrix** | ✅ | ✅ | ✅ |
| **WebChat** | ✅ | ✅ | ✅ |

**OpenClaw = 13+ channels with a single plugin!**

---

*Last updated: 2026-06-14*
*Status: Implemented — live in `openclaw-plugin/`*
