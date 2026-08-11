# Latent Protocol — VS Code / Cursor extension

Earn USDC while your coding agent thinks. Shows a **labeled** sponsor line in the
agent's spinner/status area, on the same 10-second rotation the CLI hooks use.

## Two display paths

| Path | Default | What it touches |
|------|---------|-----------------|
| **Status bar + sidebar card** | ✅ on | Nothing outside this extension |
| **In-agent spinner patch** (advanced) | ⛔ opt-in | Runtime-patches the Claude Code / Codex webview bundle |

The status-bar/sidebar path is fully non-invasive and always available.

The **advanced** path (`latent.patchAgentBundles` / command *"Latent: Patch agent
spinner"*) runtime-patches the installed Claude Code / Codex extension so the
sponsor line renders inside the agent's own spinner. It:

- writes a pristine `.latent-backup` before the first edit,
- appends a marker-delimited (`/* LATENT-START … LATENT-END */`) block,
- relaxes the webview CSP to allow `http://127.0.0.1:*` (the local loopback only),
- re-asserts every 60s in case the host extension updates, and
- is fully reversible via **"Latent: Restore agent bundles"** or uninstall.

It modifies a third-party signed extension, so it is **off by default** and gated
behind an explicit command/setting.

## Privacy

Categorization runs locally over your workspace manifests; only a category slug
leaves the machine. All ad traffic goes through a `127.0.0.1` loopback with a
random token — your wallet/server config never enters the webview context.

## Settings

- `latent.enabled` (default `true`)
- `latent.wallet` — falls back to `~/.latent-protocol/config.json`
- `latent.server` (default `https://api.latentprotocol.xyz`)
- `latent.patchAgentBundles` (default `false`)
- `latent.rotateSeconds` (default `10`)

## Build

```bash
npm install
npm run build      # → dist/extension.js
# package with: npx @vscode/vsce package
```
