/**
 * Run after build: node cli/tests/webui-patch.test.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import {
  assertAsciiInjectSource,
  patchWebuiIndex,
  unpatchWebuiIndex,
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
  assert.ok(html.includes("version: 3"));
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

  const u = unpatchWebuiIndex(staticDir);
  assert.equal(u.ok, true);
  assert.ok(!readFileSync(join(staticDir, "index.html"), "utf8").includes(WEBUI_MARKER));

  console.log("ok - node webui patch");
} finally {
  rmSync(root, { recursive: true, force: true });
}
