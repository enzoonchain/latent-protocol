/**
 * Locate files shipped inside the package (bundled runtime, templates) in a way
 * that works in BOTH layouts we run in:
 *
 *   - tsc per-file output   — this module is dist/pkg.js
 *   - esbuild bundle        — this module is inlined into dist/index.js
 *
 * In both, `import.meta.url` sits in dist/, so we can't hard-code a path
 * relative to a specific source file (a `new URL("../claude/…")` that is right
 * for dist/surfaces/claude-code.js points one level too high from dist/index.js).
 * Instead: walk up to the directory that has package.json — the package root —
 * and resolve everything from there.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

/** Directory containing the package's package.json (and dist/, templates/). */
export function packageRoot(): string {
  if (cached) return cached;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "package.json"))) return (cached = dir);
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  // Fallback: assume we're in dist/ and the root is its parent.
  return (cached = dirname(dirname(fileURLToPath(import.meta.url))));
}

/** `<root>/dist/<...segments>` — where the built runtime bundles live. */
export function distPath(...segments: string[]): string {
  return join(packageRoot(), "dist", ...segments);
}

/** `<root>/templates/<...segments>` — Hermes / OpenClaw plugin templates. */
export function templatePath(...segments: string[]): string {
  return join(packageRoot(), "templates", ...segments);
}
