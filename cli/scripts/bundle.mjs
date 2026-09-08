/**
 * Produce the shipped artifacts with esbuild:
 *
 *   dist/index.js            the CLI (`bin`) — every dependency inlined, so a
 *                            registry install needs no node_modules and
 *                            `npx latent-protocol` is a single small download.
 *   dist/claude/statusline.mjs
 *   dist/claude/hook.mjs     runtime surfaces `init` copies into
 *                            ~/.latent-protocol/bin/ — invoked as plain
 *                            `node <file>`, never `npx` (see surfaces/claude-code.ts).
 *
 * Everything is bundled to one file per entrypoint, ESM, Node 18+. The UMD
 * builds of some deps (jsonc-parser) use dynamic require() which cannot live in
 * an ESM bundle — `mainFields`/`conditions` steer resolution to their ESM builds.
 */
import { build } from "esbuild";
import { chmodSync } from "node:fs";
import { join } from "node:path";

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  mainFields: ["module", "main"],
  conditions: ["import", "node"],
  packages: "bundle",
  logLevel: "info",
};

// The CLI entrypoint → dist/index.js (overwrites tsc's per-module emit of the
// same name with the self-contained bundle that `bin` points at). No banner —
// src/index.ts already starts with its own `#!/usr/bin/env node` and esbuild
// preserves a leading shebang.
await build({ ...common, entryPoints: ["src/index.ts"], outfile: "dist/index.js" });

// Runtime surfaces staged by `init`. Their source has no shebang, so add one.
const RUNTIME = {
  "claude/statusline": "src/claude/statusline-entry.ts",
  "claude/hook": "src/claude/hook-entry.ts",
};
await build({
  ...common,
  entryPoints: RUNTIME,
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  banner: { js: "#!/usr/bin/env node" },
});
for (const name of Object.keys(RUNTIME)) chmodSync(join("dist", `${name}.mjs`), 0o755);
chmodSync("dist/index.js", 0o755);

console.log("bundled → dist/index.js, dist/claude/statusline.mjs, dist/claude/hook.mjs");
