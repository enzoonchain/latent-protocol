---
name: latent-prelaunch
description: "Pre-register for Latent Protocol before public launch. Scan Hermes, Codex, MiMo, or OpenClaw usage locally, create a wallet, estimate missed earnings, and register — ads stay OFF. Use when: pre-launch, pre-register, latent prelaunch, missed earnings scan, join waitlist, or user asks to set up Latent before ads go live."
---

# Latent Protocol — Pre-launch

Register for Latent **before ads go live**. One CLI command: scan local agent logs, create a Base wallet, estimate what you left on the table, and save your signup. **No ad hooks. No sponsored lines. No impressions.**

Supported agents for this flow: **Hermes CLI / WebUI, Codex, MiMo, OpenClaw** (non-extension surfaces).

## Rules (read first)

1. Run **`prelaunch`**, not `init` or `activate` — ads must stay off until public launch.
2. Always use **`--yes --generate`** so the command is non-interactive.
3. If a **new wallet** is generated, the **private key prints once** — stop and tell the user to save it before continuing.
4. **Never** upload prompts or session content — only the CLI's aggregated counts go to the server.
5. **Do not** install Hermes plugins, OpenClaw extensions, Codex hooks, or WebUI patches in pre-launch mode.

## Step 1 — Prerequisites

Check Node.js 18+ and npx:

```bash
node -v && command -v npx
```

If missing, tell the user to install Node 18+ from https://nodejs.org and retry.

## Step 2 — Run pre-register

**Preferred** (after npm publish):

```bash
npx latent-protocol prelaunch --yes --generate
```

**Until npm publish** (from GitHub):

```bash
npx --yes github:enzoonchain/latent-protocol prelaunch --yes --generate
```

Optional flags:

| Flag | Purpose |
|------|---------|
| `--wallet 0x…` | Use existing Base address instead of generating |
| `--days 30` | Scan window (default 30 days) |
| `--server URL` | Override API (default `https://api.latentprotocol.xyz`) |

The command will:

1. Detect Hermes / Codex / MiMo / OpenClaw on this machine
2. Create or reuse a wallet in `~/.latent-protocol/config.json`
3. Set `"enabled": false` and `"mode": "prelaunch"`
4. Scan local JSONL/logs (prompts never leave the machine)
5. Print missed-earnings estimate
6. `POST /prelaunch/register` with wallet + agent list + counts

## Step 3 — Private key (critical)

If the output shows **"New wallet generated"** with a **private key**:

> **Stop.** Tell the user: "Save this private key now — Latent only stores your address. Import it into MetaMask or any EVM wallet to access future USDC earnings. I cannot recover it for you."

Wait for confirmation before proceeding.

## Step 4 — Verify

Check local config:

```bash
cat ~/.latent-protocol/config.json
```

Expected:

- `"wallet": "0x…"` — present
- `"enabled": false` — ads off
- `"mode": "prelaunch"` — pre-launch mode
- `"prelaunch_registered_at"` — ISO timestamp (if server registration succeeded)

Check CLI status:

```bash
npx latent-protocol status
```

Confirm **Enabled: false** and wallet is set.

Optional — global signup count:

```bash
curl -s https://api.latentprotocol.xyz/prelaunch/count
```

Expected: `{"count": N}`

## Step 5 — Report to user

If verification passes, report something like:

> Pre-launch registration complete.
> - Wallet: `0x…`
> - Ads: **disabled** until launch
> - Estimated missed earnings: $X.XX USDC (from local scan)
> - Config: `~/.latent-protocol/config.json`
>
> At public launch run: `npx latent-protocol activate` (same wallet, ads turn on).

If server registration failed but local wallet exists:

> Wallet saved locally. Server registration failed — re-run `npx latent-protocol prelaunch --yes` when online.

## What NOT to run (pre-launch)

| Command | Why |
|---------|-----|
| `npx latent-protocol init` | Installs ad hooks — wrong for pre-launch |
| `npx latent-protocol activate` | Enables ads — wait until launch |
| `pip install latent-protocol` + plugin wiring | Not needed for pre-register |

## At public launch

When Latent opens and the user wants to earn:

```bash
npx latent-protocol activate
```

This keeps the existing wallet, sets `enabled: true`, and patches detected surfaces (Hermes, Codex, MiMo, OpenClaw, Claude Code, etc.).

## Full live setup (after launch)

For the full ad-monetization flow (not pre-launch), use the main skill:

```bash
/skills add https://latentprotocol.xyz/latent-protocol-skill.md
```

Or: `npx latent-protocol init --yes --generate`

## FAQ

**Which agents are scanned?** Hermes (`~/.hermes`), Codex (`~/.codex`), MiMo (`~/.mimo`), OpenClaw (`~/.openclaw`). Claude Code / Cursor use the separate `init` flow after launch.

**Is my data uploaded?** Only wallet address, agent names, and aggregate counts (turns, billable slots, USD estimate). No prompts.

**Landing page:** https://latentprotocol.xyz/prelaunch
