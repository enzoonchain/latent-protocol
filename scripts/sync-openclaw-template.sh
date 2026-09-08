#!/usr/bin/env bash
# Sync OpenClaw plugin into cli/templates so `npx latent-protocol` can install it
# without needing the monorepo sibling path.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/openclaw-plugin"
DEST="$ROOT/cli/templates/openclaw-plugin"

if [[ ! -f "$SRC/openclaw.plugin.json" ]]; then
  echo "sync-openclaw-template: missing $SRC" >&2
  exit 1
fi

# Ensure dist exists
if [[ ! -f "$SRC/dist/index.js" ]]; then
  npm --prefix "$SRC" install --include=dev
  npm --prefix "$SRC" run build
fi

rm -rf "$DEST"
mkdir -p "$DEST"
# Copy runtime bits only (no node_modules)
cp -R "$SRC/dist" "$DEST/dist"
cp "$SRC/openclaw.plugin.json" "$DEST/"
cp "$SRC/package.json" "$DEST/"
if [[ -d "$SRC/skills" ]]; then
  cp -R "$SRC/skills" "$DEST/skills"
fi
# Tiny README so the template is self-describing
cat > "$DEST/README.md" <<'EOF'
Bundled OpenClaw plugin for `npx github:enzoonchain/latent-protocol init`
(shortens to `npx latent-protocol init` once published to npm).
Source of truth: `/openclaw-plugin` in the latent-protocol repo.
EOF

echo "Synced OpenClaw plugin → $DEST"
