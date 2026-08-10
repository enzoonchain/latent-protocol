# Development Plan — One-line `npx` installer + Hermes integration

> Scope: (1) migrate onboarding to a single `npx latent init` command, (2) map how
> Latent Protocol integrates into Hermes and the bugs that block it today, (3) a
> prioritized, phased engineering plan.
>
> Status date: 2026-08-10. This is a planning document, not shipped behavior.

---

## 0. TL;DR

- **Onboarding today is fragmented and multi-runtime**: `pip install` + `latent-setup`
  + `git clone` into `~/.hermes/plugins` + `latent-hermes-patch` + `openclaw plugins
  install` + a Claude Code `statusLine` written by a **Python** console script. There is
  **no npm entry point at all** (no root `package.json`, no `bin`, no built `dist/`,
  nothing published to npm). A one-line `npx` flow does not exist yet — it must be built.
- **The competitor (CodeBacks) wins on packaging**: `npx codebacks init` is all-Node,
  patches Claude Code / Codex / Cursor in one shot. To match it we need a Node CLI that
  *orchestrates* our surfaces — and, to be truly Python-free on Claude Code, a **Node port
  of the statusline renderer**.
- **Hermes native thinking-state is externally blocked** (`pre_llm_call` not dispatched,
  hermes-agent#2817). The only *working* Hermes thinking surface is the **WebUI DOM patch**,
  and that patch currently ships **an unverified/self-contradicting DOM selector** — a real
  functional blocker we can fix on our side.
- Plan: ship an all-Node `npx latent init` orchestrator (Phase 1–2), harden the Hermes
  WebUI patch behind a verified DOM contract (Phase 3), keep `pre_llm_call` forward-compat,
  and add the missing build/publish/CI plumbing so "Live" is actually true (Phase 4).

---

## 1. Current onboarding surface (what exists)

| Platform | Install path today | Runtime | Entry point in repo |
|----------|-------------------|---------|---------------------|
| Claude Code | `latent-statusline --install` → writes `~/.claude/settings.json` | **Python** | `latent_protocol/adapters/claude_code.py` |
| Hermes (plugin) | `git clone … ~/.hermes/plugins/…` + enable in config | **Python** | `plugin/__init__.py` → `adapters/hermes.py` |
| Hermes (WebUI) | `latent-hermes-patch` → patches `index.html` | **Python** | `latent_protocol/adapters/hermes_webui.py` |
| OpenClaw | `openclaw plugins install …` (needs `tsc` build) | **Node/TS** | `openclaw-plugin/` |
| Telegram / CLI | `pip install` + wrap code manually | **Python** | `adapters/telegram.py`, `adapters/cli.py` |
| MCP (any) | `pip install '.[mcp]'` + edit `mcp.json` | **Python** | `latent_protocol/mcp_server.py` |
| Wallet setup | `latent-setup` (interactive) | **Python** | `latent_protocol/setup.py` |

**Key gap:** every path except OpenClaw assumes Python is installed and on PATH. There is
no `npx`-reachable code. The console scripts (`latent-statusline`, `latent-hermes-patch`,
`latent-setup`, `latent-adapter`, `latent-mcp`) are all `[project.scripts]` in
`pyproject.toml` — pip-only.

---

## 2. Target: `npx latent init`

### 2.1 UX goal

```bash
npx latent init            # detect agents → wallet setup → patch every detected surface
npx latent status          # what's installed, balance, config
npx latent uninstall       # revert every patch
```

`init` should:
1. **Detect** installed agents by probing well-known dirs:
   `~/.claude` (Claude Code), `~/.hermes` (Hermes), `~/.openclaw` (OpenClaw),
   `~/.codex` (Codex), VS Code / Cursor extension dirs.
2. **Wallet**: generate (viem `generatePrivateKey`) or import a Base address; persist to
   `~/.latent-protocol/config.json` (same file the Python side already reads).
3. **Patch each detected surface** idempotently, with a clear per-surface success/skip line.
4. **Fail open + reversible**: every patch has a matching `uninstall`, never corrupts a
   user's `settings.json` (merge, never overwrite).

### 2.2 The core architectural decision (READ THIS FIRST)

CodeBacks is all-Node, so `npx` runs the actual runtime, not just an installer. We are
Python-first on the two most valuable surfaces (Claude Code statusline, Hermes). Two ways
to get to one-line `npx`:

- **Option A — Node orchestrator over existing Python runtime** (fast, less work):
  the Node CLI writes configs and shells out to the Python console scripts. Requires the
  user to have Python + our pip package. *Not really "one-line"* — still a hidden Python dep.
- **Option B — Node-native runtime for the flagship surfaces** (recommended):
  port the **Claude Code statusline renderer** and the **Hermes WebUI patch** to Node so
  `npx latent init` needs zero Python. Keep Python only for MCP/Telegram/CLI SDK users.
  This is what makes us match CodeBacks' "just works" install.

**Recommendation: Option B**, staged — ship the Node CLI + Node statusline first (covers
Claude Code, the strongest live surface), then fold Hermes in.

### 2.3 Proposed package layout

```
cli/                          # NEW — published to npm as `latent` (bin: latent)
├── package.json              # "bin": { "latent": "dist/index.js" }, engines node>=18
├── src/
│   ├── index.ts              # arg parse: init | status | uninstall
│   ├── detect.ts             # agent detection
│   ├── wallet.ts             # generate/import (viem), writes ~/.latent-protocol/config.json
│   ├── surfaces/
│   │   ├── claude-code.ts    # writes statusLine → "latent statusline" (node, self-invoke)
│   │   ├── hermes-webui.ts   # DOM patch (ported from hermes_webui.py, verified selectors)
│   │   ├── hermes-plugin.ts  # clone/link + enable
│   │   └── openclaw.ts       # build + install the existing TS plugin
│   └── statusline.ts         # NEW node port of claude_code.render() (rotation + OSC8)
└── tsconfig.json
```

`npx latent init` writes `statusLine.command = "npx --yes latent statusline"` (or a locally
linked bin), so the same package renders the live status line — no Python.

---

## 3. Hermes integration — reconnaissance

### 3.1 How Hermes plugins work (as targeted by this repo)

- Plugin lives in `~/.hermes/plugins/<name>/`, declared by a `plugin.yaml` manifest
  (`plugin/plugin.yaml`: `name: agent-ads`, `config: { ads.wallet, ads.enabled, … }`).
- The runtime calls a `register(ctx)` entry; `ctx.register_hook(name, fn)` and
  `ctx.register_command(name, fn, desc)` wire behavior. Our `plugin/__init__.py` re-exports
  `register` from `adapters/hermes.py`.
- Two ad surfaces are attempted, in priority order:
  1. `pre_llm_call` — **thinking-state** context injection (returns `{context: …}`).
  2. `transform_llm_output` (fallback `post_response`) — **response footer** (live today).
- Plus the WebUI DOM patch (`hermes_webui.py`), a *separate* browser-side surface.

### 3.2 Blocking bugs (mapped)

| # | Blocker | Where | Type | Effect | Fix owner |
|---|---------|-------|------|--------|-----------|
| B1 | `pre_llm_call` documented but **not dispatched** (hermes-agent#2817, "closed not planned") | upstream Hermes | External | Native thinking-state earns **$0**; hook is a no-op | Upstream — we stay forward-compat |
| B2 | **WebUI DOM contract is unverified & self-contradicting** | `hermes_webui.py` vs `PRODUCT.md` | Internal | Banner may never render → thinking surface silently dead | **Us** |
| B3 | `plugin.yaml` has **no entry pointer** to `register()` | `plugin/plugin.yaml` | Internal | Unclear/undocumented how Hermes discovers the entry; plugin may not load | **Us** |
| B4 | `pip install --upgrade hermes-webui` **overwrites `index.html`** | patch mechanism | Internal/UX | Patch silently lost after upgrade | **Us** (detect + re-apply) |
| B5 | Raw user prompt (first 100 chars) sent to server as `context` | `hermes.py`, `hermes_webui.py` | Internal/Privacy | Weaker privacy story than CodeBacks (slug-only) | **Us** |
| B6 | No test coverage for the injected WebUI JS | tests | Internal | Regressions in the DOM patch invisible to CI | **Us** |

#### B2 in detail (the real functional blocker)

Two different, incompatible DOM contracts ship in the repo:

- `adapters/hermes_webui.py` (the code that runs):
  - thinking element: `.agent-activity-thinking[data-thinking-active="1"]`
  - last user text: `.user-segment:last-of-type .msg-body`
- `PRODUCT.md` (the design spec):
  - thinking element: `#thinkingRow` with `dataset.thinkingActive === '1'`
  - hooks `window._thinkingTick`

At most one of these matches a real Hermes WebUI build; neither is validated against a
running instance. If the selector is wrong, the `MutationObserver` never fires and the
**entire thinking-state surface on Hermes produces nothing** — while all Python-side unit
tests stay green (they don't exercise the JS). This is the highest-value Hermes fix we
own outright.

### 3.3 What actually works on Hermes today

- ✅ `transform_llm_output` **response footer** — live revenue surface (multi-channel style
  mapping: telegram / cli-ANSI / markdown).
- ✅ `/ads` command suite (setup/on/off/click/balance/payout/settings).
- ⚠️ WebUI thinking banner — works *only if* the DOM selector is correct (B2).
- ❌ `pre_llm_call` native thinking — dead pending B1.

---

## 4. Phased engineering plan

### Phase 1 — Node CLI skeleton + wallet + Claude Code (highest ROI, fully in our control)
- [ ] Create `cli/` npm package, `bin: latent`, `node>=18`, TS build.
- [ ] `latent init` → agent detection (`detect.ts`) + summary table.
- [ ] `wallet.ts`: generate (viem) / import; write `~/.latent-protocol/config.json`
      (byte-compatible with the Python `setup.py` schema).
- [ ] Node port of the statusline renderer (`statusline.ts`): disk-cache rotation,
      OSC 8 https-only, fail-open. Reuse the exact anti-spam + security rules from
      `claude_code.py`.
- [ ] `latent init` writes the `statusLine` block into `~/.claude/settings.json`
      (merge, never overwrite) pointing at `latent statusline`.
- [ ] `latent uninstall` reverts it.
- **Exit criteria:** `npx latent init` on a machine with only Node installed shows a live
  sponsored status line in Claude Code, impressions billed once per rotation.

### Phase 2 — Multi-surface orchestration
- [ ] `openclaw.ts`: build (`tsc`) + `openclaw plugins install ./openclaw-plugin --link` +
      enable + set wallet.
- [ ] `hermes-plugin.ts`: clone/symlink into `~/.hermes/plugins/` + enable + set `ads.wallet`.
- [ ] `latent status`: read config + call `/earnings/{wallet}` for balance; list patched
      surfaces.
- [ ] Codex / Cursor / VS Code detection stubs (patch where a surface exists).

### Phase 3 — Hermes thinking-state hardening (fix B2–B6)
- [ ] **B2**: obtain a real Hermes WebUI build; capture the actual thinking-row DOM;
      pick ONE verified selector; delete the contradicting spec in `PRODUCT.md`.
      Add a resilient multi-selector fallback + a one-time console.warn when none match.
- [ ] **B6**: jsdom test that drives the injected script against a fixture of the real
      thinking-row markup (banner appears once, impression posted once, cleared on exit).
- [ ] **B4**: `hermes-webui.ts` records a content hash; `latent status` warns + offers
      re-patch when `index.html` no longer contains the marker (post-upgrade detection).
- [ ] **B3**: confirm the real Hermes plugin-discovery contract; add whatever
      entry/module pointer `plugin.yaml` needs (or document why re-export suffices).
- [ ] **B5** (privacy, cross-cutting): move to **client-side categorization** — send only a
      category slug to `/ad/request`, never raw prompt text. Matches CodeBacks' privacy
      claim and is a marketing differentiator. Applies to `claude_code.py`, `hermes.py`,
      `hermes_webui.py`, and the new Node renderer.

### Phase 4 — Make "Live" true (build/publish/CI)
- [ ] Build the OpenClaw plugin `dist/` in CI; add `tsc --noEmit` typecheck for both
      `cli/` and `openclaw-plugin/` (today CI runs Python tests only).
- [ ] Resolve the OpenClaw manifest question: `openclaw.plugin.json` currently declares
      `"kind": "skill"` while shipping a hook plugin with `definePluginEntry`; the
      `OPENCLAW_PLUGIN.md` example JSON contradicts the real manifest. Pick one, validate
      against the SDK, publish to ClawHub.
- [ ] Publish `latent` to npm; publish `latent-protocol` to PyPI (verify it isn't a
      phantom badge like the kickbacks lesson).
- [ ] End-to-end smoke against live `api.latentprotocol.xyz` with a seeded ad + real wallet
      (currently x402 + payout are stubs; no verified live inventory).

---

## 5. Risks / open questions

- **B1 is not ours to fix.** Native Hermes thinking-state depends on upstream #2817. Do not
  block the roadmap on it; the WebUI patch (B2) is the pragmatic thinking surface.
- **Do we require Python at all after Phase 1–3?** Only for MCP/Telegram/CLI SDK consumers.
  The flagship `npx` flow (Claude Code + Hermes WebUI + OpenClaw) becomes Python-free.
- **Real Hermes WebUI DOM is unknown to us.** Phase 3 is blocked on getting a real build to
  inspect; everything before it is not.
- **Config file is a shared contract** between Python and Node (`~/.latent-protocol/config.json`).
  Keep the schema identical so a user can mix installers.

---

## 6. Suggested first PR

Phase 1 only: `cli/` package + `latent init`/`uninstall` + Node statusline for Claude Code.
It is self-contained, needs no Hermes build to inspect, and immediately delivers the
one-line `npx` promise on our strongest live surface.
