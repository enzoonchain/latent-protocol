# Latent Protocol — Plugin Installation Guide

Earn USDC from sponsored ads shown in your AI agent. Pick your platform below.

---

## Requirements

- Python 3.10+
- An EVM wallet address on Base (generated during setup, or bring your own)

---

## Option A — MCP Server (Universal)

Works with **Claude, OpenClaw, Cursor, Windsurf**, and any MCP-capable agent.

### 1. Install

```bash
pip install 'latent-protocol[mcp]'
```

### 2. Set up your wallet

```bash
latent-setup
```

Generates a new wallet or imports your existing address. Config saved to `~/.latent-protocol/config.json`. You only need to do this once.

### 3. Add to your MCP config

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "latent-protocol": {
      "command": "latent-mcp"
    }
  }
}
```

**OpenClaw** (`~/.openclaw/mcp.json`):

```json
{
  "mcpServers": {
    "latent-protocol": {
      "command": "latent-mcp"
    }
  }
}
```

### 4. Available MCP tools

| Tool | Description |
|------|-------------|
| `setup_wallet(mode, address)` | Generate or import your earning wallet |
| `request_ad(context, surface)` | Fetch a sponsored recommendation |
| `check_balance()` | Your current USDC earnings balance |
| `request_payout()` | Withdraw earned USDC (min $5) |
| `ad_status()` | Show current config and status |

---

## Option B — Hermes Plugin

### 1. Clone the plugin

```bash
git clone https://github.com/enzoonchain/latent-protocol \
  ~/.hermes/plugins/latent-protocol
```

### 2. Set up your wallet

```bash
latent-setup
```

Or set `ADS_WALLET=0x...` in your Hermes environment.

### 3. Enable in Hermes config

```json
{
  "plugins": ["latent-protocol"]
}
```

### 4. Use /ads commands in chat

```
/ads setup          — configure your wallet
/ads setup generate — generate a new wallet
/ads setup use 0x.. — use your existing address
/ads balance        — check USDC earnings
/ads payout         — withdraw to your wallet
/ads on / off       — toggle ads
/ads settings       — view current config
```

---

## Option C — Telegram Bot

Works with **python-telegram-bot**, **aiogram**, **telebot**, and any Python bot framework.

### 1. Install

```bash
pip install latent-protocol
```

### 2. Set up your wallet

```bash
latent-setup
```

### 3. Wrap your response handler

```python
from latent_protocol.adapters.telegram import TelegramAdAdapter

adapter = TelegramAdAdapter()

async def handle_message(update, context):
    response = await your_llm(update.message.text)
    await update.message.reply_text(
        adapter.wrap_response(response, context=update.message.text),
        parse_mode="Markdown",
    )
```

**Per-user frequency tracking:**

```python
adapter = TelegramAdAdapter(per_user=True)

# In your handler:
adapter.wrap_response(response, context=text, user_id=str(update.effective_user.id))
```

---

## Option D — CLI / Terminal

Works with **Click**, **Typer**, **argparse**, and plain Python scripts.

### 1. Install

```bash
pip install latent-protocol
```

### 2. Set up your wallet

```bash
latent-setup
```

### 3a. Decorator (zero boilerplate)

```python
from latent_protocol.adapters.cli import CliAdAdapter

adapter = CliAdAdapter()

@adapter.inject
def ask(prompt: str) -> str:
    return your_llm(prompt)

# calling ask("hello") automatically appends an ANSI ad banner
```

### 3b. Manual

```python
response = your_llm(prompt)
adapter.print_response(response, context=prompt)
```

---

## Configuration

Config is read in priority order: **config file > env vars > defaults**.

| Setting | Config file key | Env var | Default |
|---------|----------------|---------|---------|
| Wallet address | `wallet` | `ADS_WALLET` | — |
| Enabled | `enabled` | `ADS_ENABLED` | `true` |
| Ad frequency | `frequency` | `ADS_FREQUENCY` | `5` (every 5 msgs) |
| Server URL | `server` | `ADS_SERVER` | `https://ads.latentprotocol.io` |
| Min payout | `min_payout` | `ADS_MIN_PAYOUT` | `5.0` USDC |

Config file location: `~/.latent-protocol/config.json`

---

## Earnings & Payouts

- **50%** of every impression goes to you
- **50%** of every click goes to you (clicks worth 50× impressions by default)
- Minimum payout threshold: **$5 USDC**
- Payouts settle on **Base** (L2, near-zero gas)
- Check balance: `check_balance()` (MCP) or `/ads balance` (Hermes)
- Request payout: `request_payout()` (MCP) or `/ads payout` (Hermes)
