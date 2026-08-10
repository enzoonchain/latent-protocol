/**
 * Run after build: node cli/tests/webui-patch.test.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import {
  assertAsciiInjectSource,
  CSP_SOURCE_MARKER,
  ensureWebuiCspConnectExtra,
  patchWebuiCspSource,
  patchWebuiIndex,
  unpatchWebuiIndex,
  upsertCspConnectExtra,
  WEBUI_MARKER,
} from "../dist/surfaces/hermes-webui-patch.js";

const root = mkdtempSync(join(tmpdir(), "latent-webui-patch-"));
try {
  const staticDir = join(root, "static");
  mkdirSync(staticDir);
  writeFileSync(
    join(staticDir, "index.html"),
    "<html><body><!-- hermes-webui --><div id='app'></div></body></html>",
  );

  const res = patchWebuiIndex({
    staticDir,
    server: "https://api.latentprotocol.xyz",
    wallet: "0x" + "ab".repeat(20),
    frequency: 1,
  });
  assert.equal(res.ok, true);
  const html = readFileSync(join(staticDir, "index.html"), "utf8");
  assert.ok(html.includes(WEBUI_MARKER));
  assert.ok(html.includes("api.latentprotocol.xyz"));
  assert.ok(html.includes("latent-ad-footer"));
  assert.ok(html.includes("__LATENT_WEBUI__"));
  assert.ok(html.includes("webui_footer"));
  assert.ok(html.includes("version: 4"));
  assert.ok(html.includes("_lastKey = key"));
  assert.ok(html.includes("ad fetch failed (CSP)"));
  assert.ok(html.includes("_CSP_CONNECT_BASE"));
  assert.ok(html.includes("</body>"));

  // String.replace must not corrupt "$'" sequences in the inject JS
  assert.ok(html.includes("+$' + parseFloat"), "earn amount concat must keep $'");
  assert.ok(!html.includes("+</html>"), "replace must not expand $' into trailing HTML");

  const script = html.split(WEBUI_MARKER)[1].split("</script>")[0];
  assertAsciiInjectSource(script.replace(/^[\s\S]*?<script>\n?/, ""));
  // node --check equivalent: no SyntaxError when evaluating as script body
  const body = script.replace(/^[\s\S]*?<script>\n?/, "");
  // eslint-disable-next-line no-new-func
  new Function(body);

  // Re-patch should not duplicate marker
  const res2 = patchWebuiIndex({
    staticDir,
    server: "https://api.example.test",
    wallet: "0x" + "cd".repeat(20),
    frequency: 1,
  });
  assert.equal(res2.ok, true);
  const html2 = readFileSync(join(staticDir, "index.html"), "utf8");
  assert.equal(html2.split(WEBUI_MARKER).length - 1, 1);
  assert.ok(html2.includes("api.example.test"));

  // CSP .env upsert: create + merge
  const envPath = join(root, ".env");
  const c1 = upsertCspConnectExtra(envPath, "https://api.latentprotocol.xyz");
  assert.equal(c1.ok, true);
  assert.ok(
    readFileSync(envPath, "utf8").includes(
      "HERMES_WEBUI_CSP_CONNECT_EXTRA=https://api.latentprotocol.xyz",
    ),
  );
  writeFileSync(
    envPath,
    "FOO=bar\nHERMES_WEBUI_CSP_CONNECT_EXTRA=https://other.example\n",
  );
  const c2 = upsertCspConnectExtra(envPath, "https://api.latentprotocol.xyz");
  assert.equal(c2.ok, true);
  const env2 = readFileSync(envPath, "utf8");
  assert.ok(env2.includes("https://other.example"));
  assert.ok(env2.includes("https://api.latentprotocol.xyz"));
  assert.ok(env2.includes("FOO=bar"));

  const hermesHome = join(root, "hermes-home");
  mkdirSync(hermesHome);
  const ensured = ensureWebuiCspConnectExtra({
    staticDir,
    server: "https://api.latentprotocol.xyz/v1/",
    hermesHome,
  });
  assert.equal(ensured.origin, "https://api.latentprotocol.xyz");
  assert.ok(ensured.updated.includes(join(root, ".env")));
  assert.ok(ensured.updated.includes(join(hermesHome, ".env")));

  // CSP source patch (helpers.py) — reliable path when .env is not loaded
  const apiDir = join(root, "api");
  mkdirSync(apiDir);
  writeFileSync(
    join(apiDir, "helpers.py"),
    [
      "_CSP_CONNECT_BASE = (",
      "    \"'self' http://127.0.0.1:* http://localhost:* http://ipc.localhost \"",
      '    "https://127.0.0.1:* https://localhost:* "',
      '    "ws://127.0.0.1:* ws://localhost:*"',
      ")",
      "",
      "def _csp_connect_src(extra_connect_src: str = \"\") -> str:",
      '    return f"{_CSP_CONNECT_BASE} https://cdn.jsdelivr.net{extra_connect_src}"',
      "",
    ].join("\n"),
  );
  const src1 = patchWebuiCspSource({
    staticDir,
    server: "https://api.latentprotocol.xyz",
  });
  assert.equal(src1.ok, true);
  if (src1.ok) assert.equal(src1.path, join(apiDir, "helpers.py"));
  let helpers = readFileSync(join(apiDir, "helpers.py"), "utf8");
  assert.ok(helpers.includes(CSP_SOURCE_MARKER));
  assert.ok(helpers.includes('https://api.latentprotocol.xyz'));
  // idempotent re-patch should not duplicate origin lines unboundedly
  const src2 = patchWebuiCspSource({
    staticDir,
    server: "https://api.latentprotocol.xyz",
  });
  assert.equal(src2.ok, true);
  helpers = readFileSync(join(apiDir, "helpers.py"), "utf8");
  assert.equal(
    helpers.split("https://api.latentprotocol.xyz").length - 1,
    1,
    "origin should appear once after re-patch",
  );

  const u = unpatchWebuiIndex(staticDir);
  assert.equal(u.ok, true);
  assert.ok(!readFileSync(join(staticDir, "index.html"), "utf8").includes(WEBUI_MARKER));

  console.log("ok - node webui patch");
} finally {
  rmSync(root, { recursive: true, force: true });
}
