# Development Plan — One-line `npx` installer + Hermes integration

> Scope: (1) migrate onboarding to a single `npx latent init` command, (2) map how
> Latent Protocol integrates into Hermes and the bugs that block it today, (3) a
> prioritized, phased engineering plan.
>
> Status date: 2026-08-10 (revised after Hermes upstream recon). This is a planning
> document; Phase 1 ships alongside the `cli/` package in this PR.

---

## 0. TL;DR

- **Onboarding today is fragmented**: Python console scripts + manual Hermes clone
  paths + OpenClaw TS plugin. Target: `npx latent init` orchestrates Claude Code
  (Node-native statusline) and Hermes (pip + plugin enable).
- **Hermes `pre_llm_call` is LIVE upstream.** Issue [#2817](https://github.com/NousResearch/hermes-agent/issues/2817)
  was fixed in PR #2820 (closed 2026-04-27 as implemented). Native thinking-state
  injection works on current Hermes — our adapter already registers it as primary.
- **Real Hermes blockers are install-path / config**, not the hook:
  clone layout puts `plugin.yaml` one level too deep, enable name mismatches
  (`agent-ads` vs `latent-protocol`), and wallet config is split between Hermes
  `ads.*` keys and `~/.latent-protocol/config.json`.
- **WebUI selector `.agent-activity-thinking[data-thinking-active="1"]` is correct**
  (confirmed against [hermes-webui](https://github.com/nesquena/hermes-webui));
  `PRODUCT.md`'s `#thinkingRow` / `_thinkingTick` is legacy.

---

## 1. Current onboarding surface (what exists)

| Platform | Install path today | Runtime | Entry point in repo |
|----------|-------------------|---------|---------------------|
| Claude Code | `latent-statusline --install` → writes `~/.claude/settings.json` | **Python** (→ Node via `cli/`) | `latent_protocol/adapters/claude_code.py` |
| Hermes (plugin) | pip / clone + `hermes plugins enable agent-ads` | **Python** | `plugin/` → `adapters/hermes.py` |
| Hermes (WebUI) | `latent-hermes-patch` → patches `index.html` | **Python** | `latent_protocol/adapters/hermes_webui.py` |
| OpenClaw | `openclaw plugins install …` (needs `tsc` build) | **Node/TS** | `openclaw-plugin/` |
| Telegram / CLI | `pip install` + wrap code manually | **Python** | `adapters/telegram.py`, `adapters/cli.py` |
| MCP (any) | `pip install '.[mcp]'` + edit `mcp.json` | **Python** | `latent_protocol/mcp_server.py` |
| Wallet setup | `latent-setup` / `npx latent init` | **Python / Node** | `setup.py` / `cli/src/wallet.ts` |

---

## 2. Target: `npx latent init`

```bash
npx latent init            # detect agents → wallet setup → patch every detected surface
npx latent status          # what's installed, balance, config
npx latent uninstall       # revert every patch
npx latent statusline      # Claude Code statusLine command (Node)
```

`init` should:
1. **Detect** installed agents (`~/.claude`, `~/.hermes`, `~/.openclaw`, …).
2. **Wallet**: generate (viem) or import a Base address → `~/.latent-protocol/config.json`
   (byte-compatible with the Python `setup.py` schema).
3. **Patch each detected surface** idempotently.
4. **Fail open + reversible**: merge, never overwrite user settings.

**Architecture:** Option B — Node-native for Claude Code statusline; Hermes stays
Python (pip + Hermes plugin entry point / flat plugin dir). Flagship `npx` flow
needs zero Python for Claude Code-only machines.

### Package layout

```
cli/                          # published to npm as `latent` (bin: latent)
├── package.json
├── src/
│   ├── index.ts              # init | status | uninstall | statusline
│   ├── detect.ts
│   ├── wallet.ts
│   ├── config.ts
│   ├── api.ts
│   ├── statusline.ts         # Node port of claude_code.render()
│   └── surfaces/
│       ├── claude-code.ts
│       └── hermes.ts
└── tsconfig.json
```

---

## 3. Hermes integration — recon (updated)

### 3.1 How Hermes plugins work

Official docs: [Build a Hermes Plugin](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins),
[Event Hooks](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks).

- Plugin lives in `~/.hermes/plugins/<name>/` with **flat** `plugin.yaml` + `__init__.py`
  exposing `register(ctx)`, **or** via pip entry point group `hermes_agent.plugins`.
- Opt-in: `hermes plugins enable <name>` → `plugins.enabled` in `~/.hermes/config.yaml`.
- Ad surfaces (priority order in our adapter):
  1. `pre_llm_call` — thinking-state context injection (`{"context": …}`) — **LIVE**.
  2. `transform_llm_output` — response footer (fallback when thinking hook did not own the turn).
- Plus optional WebUI DOM patch (`hermes_webui.py`) for the browser dashboard
  ([nesquena/hermes-webui](https://github.com/nesquena/hermes-webui)).

### 3.2 Blocking bugs (mapped, revised)

| # | Blocker | Where | Type | Effect | Fix owner |
|---|---------|-------|------|--------|-----------|
| ~~B1~~ | ~~`pre_llm_call` not dispatched~~ | ~~#2817~~ | ~~External~~ | **RESOLVED** — fixed in #2820, closed 2026-04-27 | Upstream ✅ |
| B2 | `PRODUCT.md` still documents legacy `#thinkingRow` | docs | Internal | Spec noise; runtime selector is fine | **Us** (docs) |
| B3 | Install path / name mismatch | README, PLUGIN.md, layout | Internal | Plugin never loads | **Us** |
| B4 | `pip upgrade hermes-webui` overwrites `index.html` | patch mechanism | Internal/UX | WebUI patch lost after upgrade | **Us** |
| B5 | Raw user prompt (first 100 chars) sent as `context` | hermes adapters | Privacy | Weaker than slug-only | **Us** |
| B6 | No jsdom coverage for WebUI JS | tests | Internal | DOM regressions invisible | **Us** |
| B7 | Config bridge: Hermes `ads.*` vs `~/.latent-protocol/config.json` | config | Internal | `hermes config set ads.wallet` may not reach adapter | **Us** |

#### B3 in detail (highest-value Hermes fix)

Hermes requires:

```
~/.hermes/plugins/<name>/plugin.yaml
~/.hermes/plugins/<name>/__init__.py   # register(ctx)
```

Cloning the whole monorepo into `~/.hermes/plugins/latent-protocol` puts
`plugin.yaml` one level too deep → discovery skips it.

Also: manifest `name: agent-ads` but docs tell users to enable `latent-protocol`.

**Fix:** pip entry point + `npx latent init` writes a flat `agent-ads` plugin dir
(or enables the entry-point plugin) and documents `hermes plugins enable agent-ads`.

#### B2 in detail (downgraded)

Runtime code uses `.agent-activity-thinking[data-thinking-active="1"]` — matches
current hermes-webui. `PRODUCT.md` `#thinkingRow` path is legacy; update the spec,
keep the runtime selector.

### 3.3 What works on Hermes today

- ✅ `pre_llm_call` thinking-state — live on current Hermes (post-#2820).
- ✅ `transform_llm_output` response footer — live fallback / older builds.
- ✅ `/ads` command suite.
- ⚠️ WebUI thinking banner — selector OK; upgrade still wipes the patch (B4).
- ⚠️ Install/docs — broken until B3/B7 fixed.

---

## 4. Phased engineering plan

### Phase 1 — Node CLI + Claude Code + Hermes install fix (this PR)
- [x] Create `cli/` npm package, `bin: latent`, `node>=18`, TS build.
- [x] `latent init` → agent detection + wallet + surface patching.
- [x] Node statusline renderer (rotation + OSC 8 https-only + fail-open).
- [x] Claude Code: merge `statusLine` → `npx --yes latent statusline`.
- [x] Hermes: pip entry point + flat plugin dir install + `hermes plugins enable agent-ads`.
- [x] Docs: B1 corrected, PLUGIN/README install paths fixed.
- **Exit criteria:** `npx latent init` on a Node-only machine lights Claude Code;
  with Python + Hermes present, also enables `agent-ads`.

### Phase 2 — Multi-surface orchestration
- [ ] OpenClaw surface in the CLI.
- [ ] `latent status` earnings + patched-surface list (partial in Phase 1).
- [ ] Codex / Cursor detection stubs.

### Phase 3 — Hermes hardening (B4–B7)
- [ ] B4: content-hash re-patch detection after hermes-webui upgrades.
- [ ] B5: client-side categorization (slug only, no raw prompt).
- [ ] B6: jsdom fixture tests for WebUI injected script.
- [ ] B7: read Hermes plugin config keys as a fallback in `Config.from_env()`.

### Phase 4 — Make "Live" true (build/publish/CI)
- [ ] Publish `latent` to npm; publish `latent-protocol` to PyPI.
- [ ] CI: `tsc --noEmit` for `cli/` + `openclaw-plugin/`.
- [ ] E2E smoke against live `api.latentprotocol.xyz`.

---

## 5. Risks / open questions

- **Hermes still needs Python** after Phase 1 (plugin runtime). Claude Code does not.
- **Config file is a shared contract** (`~/.latent-protocol/config.json`) between
  Python and Node — keep the schema identical.
- **npm package name `latent`** — verify availability before first publish.
- **PyPI publish** required for the cleanest Hermes path (`pip install latent-protocol`);
  until then init falls back to `pip install git+https://…`.

---

## 6. Suggested first PR

Phase 1: `cli/` package + docs correction + Hermes install path fix.
Self-contained, delivers one-line `npx` for Claude Code, and makes Hermes
actually load on current official Hermes.
