/**
 * Run after `npm --prefix cli run build`:
 *   node cli/tests/config.test.mjs
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import {
  canonicalizeServer,
  DEFAULT_SERVER,
  loadConfig,
  resolveServer,
  saveConfig,
} from "../dist/config.js";

const root = mkdtempSync(join(tmpdir(), "latent-config-"));
const prevHome = process.env.HOME;
process.env.HOME = root;
delete process.env.ADS_SERVER;

try {
  assert.equal(canonicalizeServer(DEFAULT_SERVER), DEFAULT_SERVER);
  assert.equal(
    canonicalizeServer("https://agent-kickbacks-production.up.railway.app"),
    DEFAULT_SERVER,
  );
  assert.equal(
    canonicalizeServer("https://ad-server-production-bffc.up.railway.app/"),
    DEFAULT_SERVER,
  );
  assert.equal(
    canonicalizeServer("https://my-self-hosted.example.com"),
    "https://my-self-hosted.example.com",
  );

  saveConfig({
    server: "https://agent-kickbacks-production.up.railway.app",
    wallet: "0xabc",
  });
  assert.equal(resolveServer(loadConfig()), DEFAULT_SERVER);

  saveConfig({ server: "https://custom.ads.example" });
  assert.equal(resolveServer(loadConfig()), "https://custom.ads.example");

  console.log("config.test.mjs: ok");
} finally {
  process.env.HOME = prevHome;
  rmSync(root, { recursive: true, force: true });
}
