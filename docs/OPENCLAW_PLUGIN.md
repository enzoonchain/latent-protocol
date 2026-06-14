# OpenClaw Integration — Latent Protocol Plugin

> OpenClaw a legerősebb platform a thinking state ad injection-hez.

---

## Miért OpenClaw?

| Feature | OpenClaw | Hermes | Claude Code | Codex/MiMo |
|---------|----------|--------|-------------|------------|
| **Thinking State** | ✅ `before_prompt_build` | ✅ `pre_llm_call` | ❌ Nincs | ❌ Nincs |
| **Plugin rendszer** | ✅ Full (`api.on(...)`) | ✅ `register_hook()` | ⚠️ Hooks only | ⚠️ Skill only |
| **Thinking injection** | ✅ `enqueueNextTurnInjection` | ⚠️ Context only | ❌ Nincs | ❌ Nincs |
| **Multi-channel** | ✅ 13+ (WA, TG, Slack, Discord) | ⚠️ Telegram | ❌ Terminal | ❌ Terminal |
| **ClawHub registry** | ✅ Publikus skill marketplace | ❌ Nincs | ❌ Nincs | ❌ Nincs |

**OpenClaw = thinking state ad injection + multi-channel + plugin system**

---

## Plugin Architektúra

### Fájlszerkezet

```
latent-protocol/
├── openclaw.plugin.json      # Plugin manifest
├── index.ts                  # Plugin entry point
├── hooks/
│   ├── thinking-inject.ts    # Thinking state ad injection
│   ├── message-footer.ts     # Response footer ad
│   └── session-start.ts      # Session elején welcome ad
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

## Hook Implementációk

### 1. Thinking State Injection (Legfontosabb)

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

**Hogyan működik:**
- `before_prompt_build` event fut **thinking ELŐTT**
- A `prependContext` a thinking state-be injectálódik
- A user látja a szponzorált tartalmat **várakozás közben**
- Nem zavarja a conversation flow-t

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

    // Thinking state már mutatott hirdetést? Akkor skip
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

## Telepítés

### Felhasználók Számára

```bash
# 1. Plugin telepítés
openclaw plugins install clawhub:latent-protocol

# 2. Engedélyezés
openclaw plugins enable latent-protocol

# 3. Wallet beállítás
openclaw config set skills.entries.latent-protocol.config.wallet "0xYOUR_WALLET"

# 4. Gateway restart
openclaw gateway restart
```

### Fejlesztők Számára

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
│   before_prompt_build  │  ← Ide jön a thinking state ad
│   (thinking ELŐTT)     │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│   Agent thinking...    │  ← User látja a szponzorált tartalmat
│   💡 Sponsored: ...    │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│   message_sending      │  ← Fallback: ha thinkingben nem volt ad
│   (válasz küldése)     │
└───────────────────────┘
```

---

## Multi-Channel Támogatás

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

**OpenClaw = 13+ channel egyetlen plugin-nal!**

---

## Implementációs Sorrend

| Fázis | Feladat | Idő |
|-------|---------|-----|
| 1 | `openclaw.plugin.json` scaffold | 0.5 nap |
| 2 | `ad-client.ts` + `tracker.ts` | 1 nap |
| 3 | `before_prompt_build` hook (thinking) | 1 nap |
| 4 | `message_sending` hook (footer) | 0.5 nap |
| 5 | `session_start` hook (welcome) | 0.5 nap |
| 6 | Skill definition + ClawHub | 0.5 nap |
| 7 | Tesztelés multi-channel | 1 nap |
| **Összesen** | | **5 nap** |

---

## Nyitott Kérdések

1. **Thinking state formátum** — Szöveg? Emoji? Link?
2. **Frequency** — Thinking state-ben minden thinking, vagy 5-ből 1?
3. **Multi-agent** — Mi van ha több agent fut egyszerre?
4. **ClawHub** — Publikus registry-be submitoljuk?
5. **x402** — OpenClaw plugin x402 payment-et használjon?

---

*Last updated: 2026-06-14*
*Status: OpenClaw plugin design completed, ready for implementation*
