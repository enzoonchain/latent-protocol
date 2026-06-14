# Skill: latent-protocol

Complete onboarding for the Latent Protocol ad SDK. When invoked, this skill
detects your platform, installs the SDK, wires the adapter into your code,
sets up an earning wallet, and verifies the integration — all in one shot.

## Steps Claude must execute when this skill is invoked

### Step 1 — Check installation

Run:
```bash
python -c "import latent_protocol; print(latent_protocol.__version__)"
```

If it fails or isn't installed:
```bash
pip install "latent-protocol[mcp]"
```

---

### Step 2 — Detect platform

Run:
```bash
python -c "from latent_protocol.adapters.unified import detect_platform; print(detect_platform())"
```

If that fails (package not yet installed), infer from the project:
- Contains `ctx.register_hook` or imports `hermes` → **hermes**
- Contains `python-telegram-bot` / `aiogram` / `telebot` in requirements → **telegram**
- CLI script with `click` / `typer` / prints to stdout → **cli**
- Contains MCP config (`mcp.json`, `claude_desktop_config.json`) or no other match → **mcp**

---

### Step 3 — Wire the UnifiedAdapter

#### hermes

Find the file with `def register(ctx):` and insert at the **top** of the function body:

```python
from latent_protocol.adapters.unified import UnifiedAdapter
UnifiedAdapter().register(ctx)
```

This registers the `transform_llm_output` hook (response footer) and the
`/ads` command automatically. No other changes needed.

#### telegram

Find the main message handler function and wrap the outgoing text:

```python
from latent_protocol.adapters.unified import UnifiedAdapter
_ad_adapter = UnifiedAdapter()   # one instance per process

# In your handler, replace direct send with:
response = your_llm_call(user_message)
await message.reply_text(
    _ad_adapter.wrap_response(
        response,
        context=user_message,
        user_id=str(update.effective_user.id),
    ),
    parse_mode="Markdown",
)
```

#### cli

Find the function that calls the LLM and returns/prints its output:

```python
from latent_protocol.adapters.unified import UnifiedAdapter
_ad_adapter = UnifiedAdapter()

@_ad_adapter.inject              # appends ANSI banner automatically
def ask(prompt: str) -> str:
    return call_llm(prompt)
```

Or without a decorator:
```python
output = call_llm(prompt)
print(_ad_adapter.wrap(output, context=prompt))
```

#### mcp

Add the server to the MCP client config. For Claude Code (`~/.claude/mcp.json`
or via `/mcp add`):

```json
{
  "mcpServers": {
    "latent-protocol": {
      "command": "latent-mcp"
    }
  }
}
```

For Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "latent-protocol": {
      "command": "latent-mcp"
    }
  }
}
```

Available tools after adding:
| Tool | Purpose |
|------|---------|
| `setup_wallet` | Create or import earning wallet |
| `request_ad` | Fetch a sponsored ad for a context |
| `inject_footer` | Append formatted footer to any response |
| `check_balance` | See USDC earnings |
| `request_payout` | Withdraw $5+ USDC to wallet |
| `ad_status` | System status and current config |
| `platform_info` | Detect platform + get example code |

---

### Step 4 — Set up the earning wallet

Run:
```bash
latent-setup
```

This creates `~/.latent-protocol/config.json` with a new wallet.

If `latent-setup` isn't available yet (pre-install), use the MCP
tool `setup_wallet` with `mode="generate"`, or set the env var:
```bash
export ADS_WALLET=0xYourExistingWalletAddress
```

**Important:** If a new wallet is generated, save the private key immediately.
Import it into MetaMask or any EVM wallet to access USDC earnings.

---

### Step 5 — Verify integration

Run:
```bash
latent-adapter
```

Expected output (JSON):
```json
{
  "platform": "cli",
  "style": "cli",
  "enabled": true,
  "wallet": "0x...",
  "frequency": 5,
  "server": "https://ads.latentprotocol.io",
  "min_payout": 5.0,
  "detection_method": "auto",
  "setup": "..."
}
```

If `enabled` is `false` or `wallet` is `"not set"`, fix those before proceeding.

---

### Step 6 — Run a quick smoke test

```python
from latent_protocol.adapters.unified import UnifiedAdapter
adapter = UnifiedAdapter()
print(adapter.status())
result = adapter.wrap("Hello world", context="test")
print(result)
```

The output should include the original text. If an ad server is reachable, a
sponsored footer is appended.

---

## Environment variables (optional override)

| Variable | Default | Purpose |
|----------|---------|---------|
| `ADS_WALLET` | — | EVM address for earnings (Base) |
| `ADS_ENABLED` | `true` | Master on/off switch |
| `ADS_FREQUENCY` | `5` | Show ad every N responses |
| `ADS_SERVER` | `https://ads.latentprotocol.io` | Ad server URL |
| `ADS_MIN_PAYOUT` | `5.0` | USDC minimum payout threshold |
| `AGENT_KICKBACKS_PLATFORM` | auto | Override detection: `hermes` / `telegram` / `cli` / `mcp` |

---

## Revenue split

Every impression earns the operator **50% of CPM** (~$0.0025/impression).
Payouts settle in USDC on Base. Minimum $5. No sign-up required — just a wallet.

---

## Install this skill

**From repo (project-level):**
```bash
# Already included in .claude/skills/ if you cloned latent-protocol
```

**From URL (any project):**
```bash
mkdir -p ~/.claude/skills
curl -o ~/.claude/skills/latent-protocol.md \
  https://raw.githubusercontent.com/enzoonchain/latent-protocol/main/.claude/skills/latent-protocol.md
```

Then invoke with `/latent-protocol` in any Claude Code session.
