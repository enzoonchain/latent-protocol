---
name: latent-protocol
description: "Monetize AI agent idle time with sponsored ads. Earn USDC on Base while your agent thinks. Use when: setting up ad monetization for an AI agent, installing latent-protocol, configuring earning wallets, integrating sponsored content into Hermes/Telegram/Claude Code/CLI agents, checking ad earnings balance, or requesting USDC payouts."
---

# Latent Protocol

Earn USDC on Base while your agent thinks. Sponsored ads appear during idle time — you get paid, user sees relevant content.

## Step 1 — Detect platform

Run:
```bash
python -c "from latent_protocol.adapters.unified import detect_platform; print(detect_platform())"
```

If not installed, install first:
```bash
pip install "latent-protocol[mcp]"
```
Then re-run the detection command.

If detection returns `mcp`, check for existing MCP config before proceeding:
```bash
cat ~/.claude/mcp.json 2>/dev/null || cat claude_desktop_config.json 2>/dev/null || echo "no_mcp_config"
```

If `no_mcp_config` and no Claude Code / Codex / MiMo present, fall back to `cli` mode.

## Step 2 — Install

Based on detected platform:

| Platform | Command |
|----------|---------|
| hermes, telegram, cli | `pip install latent-protocol` |
| mcp | `pip install "latent-protocol[mcp]"` |
| openclaw | `openclaw plugins install clawhub:latent-protocol` |
| claude-code | `pip install latent-protocol && latent-statusline --install` |

## Step 3 — Wire integration

### hermes

Find the file containing `def register(ctx):` and insert at the top of its body:
```python
from latent_protocol.adapters.unified import UnifiedAdapter
UnifiedAdapter().register(ctx)
```

### telegram

In the message handler, wrap the response:
```python
from latent_protocol.adapters.unified import UnifiedAdapter
_ad = UnifiedAdapter()

response = your_llm(message.text)
await message.reply_text(
    _ad.wrap_response(response, context=message.text, user_id=str(update.effective_user.id)),
    parse_mode="Markdown",
)
```

### claude-code / mcp

Add to MCP config (`~/.claude/mcp.json` or `claude_desktop_config.json`):
```json
{"mcpServers":{"latent-protocol":{"command":"latent-mcp"}}}
```

### cli

```python
from latent_protocol.adapters.unified import UnifiedAdapter
_ad = UnifiedAdapter()

@_ad.inject
def ask(prompt: str) -> str:
    return call_llm(prompt)
```

### universal (any platform)

```python
from latent_protocol.adapters.unified import UnifiedAdapter
_ad = UnifiedAdapter()
output = _ad.wrap(llm_response, context="general")
```

## Step 4 — Setup wallet

Check if wallet exists:
```bash
cat ~/.latent-protocol/config.json 2>/dev/null || echo "no_wallet"
```

If `no_wallet`, run:
```bash
latent-setup
```

**Important:** If a new wallet is generated, the private key is shown ONCE. Save it immediately — import into MetaMask or any EVM wallet to access USDC earnings.

If wallet already exists, skip this step.

## Step 5 — Verify

Run:
```bash
latent-adapter
```

Check the JSON output:
- `wallet` must NOT be `"not set"`
- `enabled` must be `true`
- `server` must be `https://api.latentprotocol.xyz`

Then verify API connectivity:
```bash
curl -s https://api.latentprotocol.xyz/health
```

Expected: `{"status":"ok",...}`

If all checks pass, report:
> Latent Protocol active. Earning USDC from ads on Base.

If any check fails, report the specific failure and suggest fixes.

## Revenue

Every impression earns **50% of CPM** (~$0.0025). Clicks earn 50x. Payouts in USDC on Base. Minimum $5. No signup — just a wallet.

## Config

| Variable | Default | Purpose |
|----------|---------|---------|
| `ADS_WALLET` | — | EVM address for earnings |
| `ADS_ENABLED` | `true` | Master on/off |
| `ADS_FREQUENCY` | `5` | Show ad every N responses |
| `ADS_SERVER` | `https://api.latentprotocol.xyz` | Ad server URL |
| `ADS_MIN_PAYOUT` | `5.0` | USDC minimum payout |
| `LATENT_PLATFORM` | auto | Override: hermes/telegram/cli/mcp |
