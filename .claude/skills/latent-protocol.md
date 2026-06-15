# Skill: latent-protocol

Complete onboarding for the Latent Protocol ad SDK. When invoked, this skill
detects your platform, installs the right way for that platform, wires the
integration, sets up an earning wallet, and verifies it — all in one shot.

Install is **per-platform** (not a generic step): OpenClaw uses ClawHub, the
Python adapters use pip, Claude Code uses the status-line installer.

## Steps Claude must execute when this skill is invoked

### Step 1 — Detect platform

Pick the first match, in this order (thinking-state platforms first):

1. **openclaw** — `~/.openclaw/` exists, an `openclaw` CLI is on PATH, or the
   project has `openclaw.json` / `openclaw.plugin.json`.
2. **hermes** — code contains `ctx.register_hook` / imports `hermes`, or
   `~/.hermes/` exists.
3. **telegram** — `python-telegram-bot` / `aiogram` / `telebot` in requirements.
4. **cli** — a Python CLI agent (`click` / `typer`, or prints to stdout).
5. **mcp** — an MCP config (`mcp.json`, `claude_desktop_config.json`) and no
   other match. Management only (balance/payout); ad delivery uses an adapter.

If the user instead wants to **monetize their own Claude Code sessions** (rather
than integrate into an agent project), use **claude-code** (status line).

For the Python platforms you can confirm with:
```bash
python -c "from latent_protocol.adapters.unified import detect_platform; print(detect_platform())"
```
(`detect_platform()` knows hermes/telegram/cli/mcp; openclaw and claude-code are
inferred from the rules above.)

---

### Step 2 — Install + wire (per platform)

#### openclaw

Thinking-state ads across every OpenClaw channel (WhatsApp, Telegram, Slack,
Discord…). No pip needed — it's a plugin:

```bash
openclaw plugins install clawhub:latent-protocol   # local dev: install ./openclaw-plugin --link
openclaw plugins enable latent-protocol
openclaw config set plugins.latent-protocol.config.wallet "0xYOUR_WALLET"
openclaw gateway restart
```

Ads inject into the thinking state (`before_prompt_build`); a response-footer
fallback covers providers that don't dispatch it. Then skip to Step 4 (wallet is
set via the config above).

#### hermes

```bash
pip install latent-protocol
```
Find the file with `def register(ctx):` and insert at the **top** of the body:
```python
from latent_protocol.adapters.unified import UnifiedAdapter
UnifiedAdapter().register(ctx)
```
This registers the `pre_llm_call` thinking hook (forward-compatible), the
`transform_llm_output` footer (the live surface), and the `/ads` command
(`/ads balance`, `/ads click`, `/ads payout`, …). No other changes needed.

#### claude-code

Monetize your own Claude Code sessions via the official status line (terminal
**and** IDE, any version):
```bash
pip install latent-protocol
latent-setup
latent-statusline --install      # writes statusLine into ~/.claude/settings.json
```
Restart Claude Code. A sponsored status line renders during thinking with a
clickable https CTA. Remove anytime with `latent-statusline --uninstall`.
Wallet is handled by `latent-setup` above — skip to Step 5.

#### telegram

```bash
pip install latent-protocol
```
Wrap the outgoing text in your message handler:
```python
from latent_protocol.adapters.unified import UnifiedAdapter
_ad_adapter = UnifiedAdapter()   # one instance per process

response = your_llm_call(user_message)
await message.reply_text(
    _ad_adapter.wrap_response(response, context=user_message, user_id=str(update.effective_user.id)),
    parse_mode="Markdown",
)
```

#### cli

```bash
pip install latent-protocol
```
```python
from latent_protocol.adapters.unified import UnifiedAdapter
_ad_adapter = UnifiedAdapter()

@_ad_adapter.inject              # appends ANSI banner automatically
def ask(prompt: str) -> str:
    return call_llm(prompt)
```
Or manually: `print(_ad_adapter.wrap(call_llm(prompt), context=prompt))`.

#### mcp (management only)

```bash
pip install "latent-protocol[mcp]"
```
Add the server to your MCP client config (`~/.claude/mcp.json` or
`claude_desktop_config.json`):
```json
{ "mcpServers": { "latent-protocol": { "command": "latent-mcp" } } }
```
Use `check_balance` / `request_payout` from your agent. Ad delivery itself
should use one of the platform adapters above (MCP delivery tools are test-only).

---

### Step 3 — (covered above for openclaw/claude-code)

---

### Step 4 — Set up the earning wallet

```bash
latent-setup
```
Creates `~/.latent-protocol/config.json` with a new wallet. If unavailable
pre-install, set `export ADS_WALLET=0xYourExistingWalletAddress`.

**Important:** If a new wallet is generated, save the private key immediately —
import it into MetaMask or any EVM wallet to access your USDC earnings.

---

### Step 5 — Verify

Python adapters (hermes/telegram/cli/mcp):
```bash
latent-adapter        # prints platform, wallet, frequency, server as JSON
```
OpenClaw: confirm the plugin is enabled (`openclaw plugins list`).
Claude Code: confirm `statusLine` is present in `~/.claude/settings.json` and
restart. If `wallet` is `"not set"`, fix it before proceeding.

---

## Environment variables (optional override)

| Variable | Default | Purpose |
|----------|---------|----------|
| `ADS_WALLET` | — | EVM address for earnings (Base) |
| `ADS_ENABLED` | `true` | Master on/off switch |
| `ADS_FREQUENCY` | `5` | Show ad every N responses |
| `ADS_SERVER` | `https://api.latentprotocol.xyz` | Ad server URL |
| `ADS_MIN_PAYOUT` | `5.0` | USDC minimum payout threshold |
| `ADS_STATUSLINE_ROTATE` | `30` | Claude Code: seconds before the status-line ad rotates |
| `LATENT_PLATFORM` | auto | Override detection: `hermes` / `telegram` / `cli` / `mcp` |

---

## Revenue split

Every impression earns the operator **50% of CPM** (~$0.0025/impression); clicks
earn 50x. Payouts settle in USDC on Base. Minimum $5. No sign-up — just a wallet.

---

## Install this skill

**From repo (project-level):** already included in `.claude/skills/` if you
cloned the repo.

**From URL (any project):**
```bash
mkdir -p ~/.claude/skills
curl -o ~/.claude/skills/latent-protocol.md \
  https://raw.githubusercontent.com/enzoonchain/agent-kickbacks/main/.claude/skills/latent-protocol.md
```

Then invoke with `/latent-protocol` in any Claude Code session.
