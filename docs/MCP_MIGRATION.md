# MCP Migration Plan — Agent Kickbacks

>从 Hermes plugin → MCP Server migráció. Univerzális agent integráció.

---

## Miért MCP?

| Régi (Hermes plugin) | Új (MCP Server) |
|----------------------|-----------------|
| Egyedi hook API (`ctx.register_tool()`) | Szabvány MCP protocol |
| Csak Hermes-ben működik | Bármilyen MCP-t támogató agentben |
| `hermes plugins install` | `pip install agent-kickbacks` |
| Közvetlen framework függőség | Framework-független |
| Egyedi életciklus hookok | MCP sampling + notifications |

### MCP-t támogató agentek:
- **Claude Code** ✅
- **OpenClaw** ✅
- **Aeon** (ha MCP-t támogat)
- **Hermes** (ha MCP-t támogat)
- Bármilyen jövőbeli agent

---

## Architektúra változás

### Régi:
```
Hermes Agent
    ↓
Hermes Plugin (__init__.py)
    ↓
Ad Server API
```

### Új:
```
Bármilyen Agent (Claude, OpenClaw, Aeon, Hermes)
    ↓
MCP Protocol (stdio/SSE)
    ↓
MCP Server (agent-kickbacks-mcp)
    ↓
Ad Server API
```

---

## Új Plugin Struktúra

```
agent-kickbacks/
├── src/
│   └── agent_kickbacks/
│       ├── __init__.py              # verzió
│       ├── mcp_server.py            # MCP szerver entry point
│       ├── tools/
│       │   ├── __init__.py
│       │   ├── request_ad.py        # /ads request eszköz
│       │   ├── check_balance.py     # /ads balance
│       │   └── payout.py            # /ads payout
│       ├── hooks/
│       │   ├── __init__.py
│       │   ├── thinking.py          # thinking state kezelés
│       │   └── response.py          # response footer
│       ├── ad_client.py             # Ad Server API kliens
│       ├── tracker.py               # impression/click tracking
│       ├── wallet.py                # USDC kezelés
│       └── config.py                # konfiguráció
├── server/                          # Ad Server (külön szolgáltatás)
│   ├── main.py                      # FastAPI + x402
│   └── ...
├── pyproject.toml                   # pip install
├── README.md
└── docs/
    ├── PRODUCT.md                   # termékleírás
    ├── IMPLEMENTATION.md            # implementációs terv
    └── MCP_MIGRATION.md             # ez a dokumentum
```

---

## MCP Server Implementation

### Fő belépési pont:

```python
# src/agent_kickbacks/mcp_server.py

from mcp.server.fastmcp import FastMCP
from .ad_client import AdClient
from .tracker import Tracker
from .wallet import Wallet
from .config import Config

mcp = FastMCP("Agent Kickbacks", version="0.1.0")

config = Config()
client = AdClient(config.ad_server_url)
tracker = Tracker(config.ad_server_url)
wallet = Wallet(config.private_key, config.rpc_url)
```

### Tool 1: Request Ad

```python
@mcp.tool()
def request_ad(
    context: str = "general",
    surface: str = "auto"
) -> dict:
    """Fetch a sponsored recommendation to display to the user.
    
    Args:
        context: What the user is working on (e.g., "coding", "research")
        surface: Display surface (auto, thinking, footer, cli)
    """
    ad = client.get_ad(
        wallet=config.user_wallet,
        context=context,
        surface=surface
    )
    
    if not ad:
        return {"show": False, "reason": "no_ads_available"}
    
    tracker.log_impression(ad["id"], config.user_wallet)
    
    return {
        "show": True,
        "ad": {
            "id": ad["id"],
            "title": ad["title"],
            "body": ad["body"],
            "cta_text": ad["cta_text"],
            "cta_url": ad["cta_url"],
            "earn_amount": ad["earn_amount"]
        }
    }
```

### Tool 2: Check Balance

```python
@mcp.tool()
def check_balance() -> dict:
    """Check your current earnings balance in USDC."""
    balance = wallet.get_balance()
    return {
        "balance_usdc": balance,
        "wallet": config.user_wallet,
        "network": "Base"
    }
```

### Tool 3: Request Payout

```python
@mcp.tool()
def request_payout() -> dict:
    """Request payout of earned USDC (minimum $5)."""
    balance = wallet.get_balance()
    
    if balance < 5.0:
        return {
            "success": False,
            "reason": f"Minimum $5.00 required. Current: ${balance:.4f}"
        }
    
    tx_hash = wallet.payout()
    return {
        "success": True,
        "tx_hash": tx_hash,
        "amount": balance
    }
```

### Tool 4: Ad Status

```python
@mcp.tool()
def ad_status() -> dict:
    """Check ad system status and settings."""
    return {
        "enabled": config.enabled,
        "frequency": config.frequency,
        "wallet": config.user_wallet,
        "total_earned": wallet.get_total_earned(),
        "today_earned": wallet.get_today_earned()
    }
```

### Prompt: Thinking Ad (MCP sampling)

```python
@mcp.prompt()
def thinking_ad(context: str = "") -> str:
    """Called when agent starts thinking. Returns ad to display."""
    if not config.enabled:
        return ""
    
    ad = client.get_ad(
        wallet=config.user_wallet,
        context=context,
        surface="thinking"
    )
    
    if ad:
        tracker.log_impression(ad["id"], config.user_wallet)
        return f"💰 Sponsored: {ad['body']} → {ad['cta_url']}"
    
    return ""
```

### Prompt: Response Footer

```python
@mcp.prompt()
def response_footer(response_text: str) -> str:
    """Called after agent response. Returns footer ad."""
    if not config.enabled:
        return ""
    
    if not tracker.should_show(config.frequency):
        return ""
    
    ad = client.get_ad(
        wallet=config.user_wallet,
        context=response_text[:100],
        surface="footer"
    )
    
    if ad:
        tracker.log_impression(ad["id"], config.user_wallet)
        return (
            f"\n\n---\n"
            f"💰 **Sponsored:** {ad['body']}  \n"
            f"[{ad['cta_text']} →]({ad['cta_url']})  \n"
            f"_+${ad['earn_amount']} USDC earned_"
        )
    
    return ""
```

### Indítás:

```python
if __name__ == "__main__":
    mcp.run(transport="stdio")
```

---

## Telepítési folyamat (User)

### 1. Telepítés:
```bash
pip install agent-kickbacks
```

### 2. Konfiguráció (első alkalommal):
```bash
agent-kickbacks config \
  --wallet 0xYOUR_WALLET \
  --ad-server https://ads.agentkickbacks.ai
```

### 3. Hozzáadás agenthez:

#### Claude Code:
```bash
claude mcp add agent-kickbacks -- agent-kickbacks-mcp
```

#### Hermes (config.json):
```json
{
  "mcpServers": {
    "agent-kickbacks": {
      "command": "agent-kickbacks-mcp",
      "args": ["serve"]
    }
  }
}
```

#### Aeon:
```bash
aeon mcp add --name agent-kickbacks -- command agent-kickbacks-mcp
```

#### OpenClaw:
```bash
openclaw mcp add agent-kickbacks -- agent-kickbacks-mcp
```

### 4. Indítás:
Az agent automatikusan elindítja a MCP szerver indulásakor.

---

## Implementációs sorrend (frissített)

### Fázis 1: Ad Server (1 hét)

| Feladat | Státusz |
|---------|---------|
| FastAPI app + x402 middleware | 🟡 scaffold kész |
| Supabase schema | 🔴 |
| Ad matcher + tracker | 🔴 |
| Earnings calculator | 🔴 |

### Fázis 2: MCP Server (3-4 nap)

| Feladat | Státusz |
|---------|---------|
| MCP server scaffold | 🔴 |
| Tool: request_ad | 🔴 |
| Tool: check_balance | 🔴 |
| Tool: request_payout | 🔴 |
| Tool: ad_status | 🔴 |
| Prompt: thinking_ad | 🔴 |
| Prompt: response_footer | 🔴 |

### Fázis 3: Integration (2-3 nap)

| Feladat | Státusz |
|---------|---------|
| Ad Client ↔ MCP Server | 🔴 |
| Tracker integration | 🔴 |
| Wallet integration | 🔴 |
| Config management | 🔴 |

### Fázis 4: Testing + Docs (2-3 nap)

| Feladat | Státusz |
|---------|---------|
| Unit tests | 🔴 |
| Integration tests | 🔴 |
| README frissítés | 🔴 |
| Telepítési útmutató | 🔴 |

**Összesen:** ~2-3 hét

---

## CLI Commands

### agent-kickbacks-mcp

```bash
# MCP szerver indítása (stdio)
agent-kickbacks-mcp serve

# Konfiguráció
agent-kickbacks config --wallet 0x... --ad-server https://...

# Státusz ellenőrzése
agent-kickbacks status

# Egyenleg lekérdezése
agent-kickbacks balance

# Kifizetés
agent-kickbacks payout
```

---

## pyproject.toml (frissítés)

```toml
[project]
name = "agent-kickbacks"
version = "0.1.0"
description = "Crypto-native ad marketplace for AI agents. x402 micropayments on Base."
requires-python = ">=3.10"
dependencies = [
    "mcp>=1.0.0",
    "httpx>=0.25.0",
    "pydantic>=2.0.0",
    "supabase>=2.0.0",
]

[project.scripts]
agent-kickbacks-mcp = "agent_kickbacks.mcp_server:main"
agent-kickbacks = "agent_kickbacks.cli:main"
```

---

## Változtatások a meglévő fájlokban

### PRODUCT.md

| Szekció | Változtatás |
|---------|-------------|
| §1 Vision | "Hermes plugin" → "MCP Server" |
| §3 What We Build | Plugin → MCP Server |
| §4 Technical Architecture | Plugin structúra → MCP structúra |
| §8 File Structure | plugin/ → src/agent_kickbacks/ |
| §9 Open Source Strategy | hermes plugins → pip install |

### IMPLEMENTATION.md

| Szekció | Változtatás |
|---------|-------------|
| §1.4 Hermes Plugin | → §1.4 MCP Server |
| §2.x Display | Hermes hooks → MCP prompts |
| §2.4 Slash Commands | MCP tools |
| Q5 | Hermes hookok → MCP protocol |

---

## Nyitott kérdések

| # | Kérdés | Válasz |
|---|--------|--------|
| M1 | MCP transport? | **stdio** (alapértelmezett) + SSE (távoli) |
| M2 | MCP SDK? | **mcp** (hivatalos Python SDK) |
| M3 | Thinking state hogyan? | MCP **prompt** (sampling) vagy **notification** |
| M4 | Config hol tárolódik? | `~/.agent-kickbacks/config.json` |
| M5 | Több wallet? | Egyelőre egy wallet per user |

---

## Thinking State Kutatás — Platformok

### Összefoglaló

| Platform | Thinking State | Plugin Injection | MCP támogatás |
|----------|---------------|------------------|---------------|
| **OpenClaw** | ✅ 6 szint (off→xhigh) | ✅ `before_prompt_build`, `enqueueNextTurnInjection` | ✅ Full |
| **Hermes** | ✅ Van (thinking_callback) | ⚠️ Csak `pre_llm_call` (thinking ELŐTT) | ❌ Nem ismert |
| **Claude Code** | ✅ Van (collapsed) | ❌ Nincs thinking injection | ✅ Full, de thinking közben nem |
| **Aeon** | ❌ Nincs | ❌ Nincs hook | ✅ MCP client |

### Részletes eredmények

#### OpenClaw 🟢 (legjobb)
- `before_prompt_build` → thinking ELŐTT injectálás
- `before_tool_call` → thinking KÖZBEN (tool use között)
- `enqueueNextTurnInjection` → exactly-once context injection
- Full MCP support
- **6 thinking szint:** off, minimal, low, medium, high, xhigh

#### Hermes 🟡 (korlátozott)
- `pre_llm_call` → thinking ELŐTT (prompt-ba szúrás)
- `thinking_callback` → csak observer, nem módosítható
- NINCS `on_thinking_start` hook
- **19 plugin hook** elérhető

#### Claude Code 🟡 (korlátozott)
- Thinking és tool use szekvenciális (think → then tool)
- MCP nem tud injectálni thinking közben
- `UserPromptSubmit` hook → thinking ELŐTT
- **10 hook event** elérhető

#### Aeon 🔴 (nincs thinking state)
- Nincs thinking state
- Skills prompt-alapúak
- MCP clientként működik
- **17 ad placement mechanism** (de thinking nélkül)

### Következtetés

**A thinking state injection csak OpenClaw-nál működik rendesen.** A többi platformon:
- **Hermes:** `pre_llm_call` → thinking ELŐTT injectálás
- **Claude Code:** `Stop` hook → amikor leáll, hirdetés szúrása
- **Aeon:** Skill output → chain context injektálás

**A legjobb megoldás:** Response footer (válasz végén) MINDEN platformon működik!
- OpenClaw: `message_sending` hook
- Hermes: `transform_llm_output` hook
- Claude Code: `Stop` hook
- Aeon: Skill output

→ Részletek: `docs/AD_PLACEMENT_STRATEGY.md`

---

## Kockázatok

| Kockázat | Kezelés |
|----------|---------|
| MCP nem minden agentben támogatott | Fallback: CLI mode + platform-specific plugins |
| MCP SDK instabil | Pinelt verzió |
| Thinking state nem mindenhol hívható | Response footer mindenhol működik |
| Platform specifikus hookok eltérőek | Adapter minta: egy MCP server + platform adapterek |

---

## Nyitott kérdések (frissítve)

| # | Kérdés | Válasz |
|---|--------|--------|
| M1 | MCP transport? | **stdio** (alapértelmezett) + SSE (távoli) |
| M2 | MCP SDK? | **mcp** (hivatalos Python SDK) |
| M3 | Thinking state hogyan? | **MCP nem tudja** — platform adapterek kellenek |
| M4 | Config hol tárolódik? | `~/.agent-kickbacks/config.json` |
| M5 | Több wallet? | Egyelőre egy wallet per user |
| M6 | Melyik platform a legjobb? | **OpenClaw** (thinking + injection), második: **Hermes** |
| M7 | Response footer mindenhol? | **Igen** — `message_sending`, `transform_llm_output`, `Stop` hook |
| M8 | MCP + platform adapter? | **Igen** — MCP server univerzális, adapterek platformonként |

---

*Last updated: 2026-06-13*
*Status: MCP Migration Planning — Thinking State Research Complete*
