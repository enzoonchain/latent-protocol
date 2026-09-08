/**
 * Bundle the Claude Code runtime surfaces into standalone, dependency-free
 * scripts that `init` copies to ~/.latent-protocol/bin/ and settings.json
 * invokes as plain `node <file>`.
 *
 * Why: the status line re-runs its command every few seconds and the turn
 * hooks run on every prompt. If that command is `npx … latent-protocol`, each
 * invocation re-resolves (and on a cold/corrupt cache, re-clones and re-builds)
 * the package — they pile up on the shared npm cache, time out, and leave
 * half-installed trees ("sh: latent: command not found"). A bundled local
 * script has none of that cost.
 *
 * The import graph of these two entrypoints (statusline/hook → config, api,
 * classify, adcache) never touches `viem`, so the bundles are pure Node
 * builtins + our own code.
 */
import { build } from "esbuild";
import { chmodSync } from "node:fs";
import { join } from "node:path";

const outdir = "dist/claude";

const result = await build({
  entryPoints: {
    statusline: "src/claude/statusline-entry.ts",
    hook: "src/claude/hook-entry.ts",
  },
  outdir,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  // Prefer packages' ESM builds — their UMD builds use dynamic require(),
  // which cannot be bundled into an ESM output (e.g. jsonc-parser).
  mainFields: ["module", "main"],
  conditions: ["import", "node"],
  // Inline everything — the whole point is a file with no node_modules.
  packages: "bundle",
  outExtension: { ".js": ".mjs" },
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});

if (result.errors.length) {
  process.exitCode = 1;
} else {
  for (const name of ["statusline", "hook"]) {
    chmodSync(join(outdir, `${name}.mjs`), 0o755);
  }
  console.log(`bundled → ${outdir}/statusline.mjs, ${outdir}/hook.mjs`);
}
