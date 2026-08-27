/**
 * Run after `npm --prefix cli run build`:
 *   node cli/tests/detect.test.mjs
 */
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import {
  findHermesWebuiStatic,
  hermesWebuiStaticCandidates,
} from "../dist/detect.js";

const root = mkdtempSync(join(tmpdir(), "latent-detect-"));
try {
  const staticDir = join(root, "apps", "hermes-webui", "static");
  mkdirSync(staticDir, { recursive: true });
  writeFileSync(
    join(staticDir, "index.html"),
    "<html><body><!-- hermes-webui --><script>window.__HERMES_WEBUI_BUNDLE_VERSION__='1'</script></body></html>",
  );

  process.env.HOME = root;
  delete process.env.HERMES_WEBUI_STATIC;
  delete process.env.HERMES_WEBUI_ROOT;
  delete process.env.HERMES_WEBUI_DIR;

  const cands = hermesWebuiStaticCandidates(root);
  assert.ok(cands.some((c) => c.includes("hermes-webui")));

  const found = findHermesWebuiStatic(root);
  assert.equal(found, staticDir);

  console.log("ok - detect webui paths");
} finally {
  rmSync(root, { recursive: true, force: true });
}
