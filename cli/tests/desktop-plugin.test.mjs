/**
 * Run after build: node cli/tests/desktop-plugin.test.mjs
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { writeDesktopPlugin } from "../dist/surfaces/hermes.js";

const root = mkdtempSync(join(tmpdir(), "latent-desktop-plugin-"));
try {
  const wallet = "0x" + "ab".repeat(20);

  // Wallet configured: chip should be templated in.
  const res = writeDesktopPlugin(root, {
    server: "https://api.latentprotocol.xyz/",
    wallet,
  });
  assert.ok(res.includes("desktop/plugin.js"));
  assert.ok(!res.includes("no wallet configured"));

  const rendered = readFileSync(join(root, "desktop", "plugin.js"), "utf8");
  assert.ok(rendered.includes(JSON.stringify("https://api.latentprotocol.xyz")));
  assert.ok(rendered.includes(JSON.stringify(wallet)));
  assert.ok(!rendered.includes("__SERVER__"));
  assert.ok(!rendered.includes("__WALLET__"));
  assert.ok(rendered.includes("STATUSBAR_AREAS"));
  assert.ok(rendered.includes("PALETTE_AREA"));
  // Disk plugins load uncompiled -- only these three specifiers may resolve.
  const importLines = rendered
    .split("\n")
    .filter((line) => /^import .* from ['"]/.test(line.trim()));
  for (const line of importLines) {
    assert.ok(
      /from ['"](@hermes\/plugin-sdk|react|react\/jsx-runtime)['"]/.test(line),
      `unexpected import: ${line}`,
    );
  }
  // No JSX syntax (disk plugins load uncompiled).
  assert.ok(!/<[A-Za-z]/.test(rendered.replace(/https?:\/\/[^\s"']*/g, "")));
  // Syntax check as an ES module -- disk plugins load uncompiled, so this
  // is the same check the app's own loader would fail on a typo.
  const syntaxCheckFile = join(root, "syntax-check.mjs");
  writeFileSync(syntaxCheckFile, rendered);
  execFileSync(process.execPath, ["--check", syntaxCheckFile], { stdio: "pipe" });

  // Server URL trailing slash must be stripped before templating.
  assert.ok(!rendered.includes("latentprotocol.xyz/\""));

  // No wallet configured: template still writes, but the plugin registers
  // nothing (mirrors the WebUI patch's `if (!WALLET) return` early-out).
  const root2 = mkdtempSync(join(tmpdir(), "latent-desktop-plugin-"));
  try {
    const res2 = writeDesktopPlugin(root2, {
      server: "https://api.latentprotocol.xyz",
      wallet: "",
    });
    assert.ok(res2.includes("no wallet configured"));
    const rendered2 = readFileSync(join(root2, "desktop", "plugin.js"), "utf8");
    assert.ok(rendered2.includes('var WALLET = ""'));
  } finally {
    rmSync(root2, { recursive: true, force: true });
  }

  // Malformed wallet is dropped rather than templated verbatim.
  const root3 = mkdtempSync(join(tmpdir(), "latent-desktop-plugin-"));
  try {
    writeDesktopPlugin(root3, {
      server: "https://api.latentprotocol.xyz",
      wallet: "not-a-wallet\"; alert(1); //",
    });
    const rendered3 = readFileSync(join(root3, "desktop", "plugin.js"), "utf8");
    assert.ok(rendered3.includes('var WALLET = ""'));
    assert.ok(!rendered3.includes("alert(1)"));
  } finally {
    rmSync(root3, { recursive: true, force: true });
  }

  console.log("ok - desktop plugin template");
} finally {
  rmSync(root, { recursive: true, force: true });
}
