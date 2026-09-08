/**
 * ~/.claude/settings.json is JSONC that users hand-tune. Editing it must:
 *   - refuse to write a file we could not parse (no clobbering a settings.json
 *     with a syntax error someone is mid-way through fixing)
 *   - preserve comments, whitespace and key order everywhere we did not edit
 *   - keep one pristine backup so uninstall can revert byte-exact
 *
 * Run after `npm --prefix cli run build`:
 *   node --test cli/tests/json-settings.test.mjs
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
  parseable,
  readSettings,
  setPath,
  ensureBackup,
  restoreFromBackup,
  hasBackup,
  BACKUP_SUFFIX,
} = await import("../dist/surfaces/json-settings.js");

const tmp = () => mkdtempSync(join(tmpdir(), "latent-settings-"));

test("parseable: plain JSON, JSONC, and broken", () => {
  assert.equal(parseable('{"a":1}'), true);
  assert.equal(parseable('{\n // c\n "a":1, /* b */ "z":2,\n}'), true);
  assert.equal(parseable("{ not json "), false);
  assert.equal(parseable(""), false);
});

test("readSettings: absent / parsed / unparseable", () => {
  const dir = tmp();
  const p = join(dir, "settings.json");
  assert.deepEqual(readSettings(p), { raw: null, data: null, unparseable: false });

  writeFileSync(p, '{\n  // keep\n  "model": "opus"\n}\n');
  const ok = readSettings(p);
  assert.equal(ok.unparseable, false);
  assert.equal(ok.data.model, "opus");

  writeFileSync(p, "{ broken");
  const bad = readSettings(p);
  assert.equal(bad.unparseable, true);
  assert.equal(bad.data, null);
  assert.equal(bad.raw, "{ broken");
});

test("setPath preserves comments and untouched keys", () => {
  const src =
    '{\n  // a comment\n  "model": "opus", /* trailing */\n  "statusLine": { "command": "old" }\n}\n';
  const out = setPath(src, ["statusLine"], { type: "command", command: "new" });
  assert.ok(out.includes("// a comment"), "line comment dropped");
  assert.ok(out.includes("/* trailing */"), "block comment dropped");
  assert.ok(out.includes('"model": "opus"'), "sibling key lost");
  assert.ok(out.includes('"command": "new"'));
  assert.ok(!out.includes('"command": "old"'));
  assert.equal(parseable(out), true);
});

test("setPath creates nested paths and deletes with undefined", () => {
  let src = "{}\n";
  src = setPath(src, ["hooks", "Stop"], [{ hooks: [{ command: "x" }] }]);
  assert.equal(readSettings2(src).hooks.Stop[0].hooks[0].command, "x");
  src = setPath(src, ["hooks", "Stop"], undefined);
  assert.equal("Stop" in (readSettings2(src).hooks ?? {}), false);
});

function readSettings2(raw) {
  const dir = tmp();
  const p = join(dir, "s.json");
  writeFileSync(p, raw);
  return readSettings(p).data;
}

test("ensureBackup writes once, restoreFromBackup reverts byte-exact and consumes it", () => {
  const dir = tmp();
  const p = join(dir, "settings.json");
  const pristine = '{\n  // mine\n  "model": "opus"\n}\n';
  writeFileSync(p, pristine);

  ensureBackup(p, pristine);
  assert.ok(hasBackup(p));
  assert.equal(readFileSync(p + BACKUP_SUFFIX, "utf8"), pristine);

  // A second ensureBackup (e.g. re-run init on an already-patched file) must
  // not overwrite the pristine copy.
  writeFileSync(p, '{ "model": "opus", "statusLine": {} }');
  ensureBackup(p, readFileSync(p, "utf8"));
  assert.equal(readFileSync(p + BACKUP_SUFFIX, "utf8"), pristine);

  const r = restoreFromBackup(p);
  assert.equal(r.restored, true);
  assert.equal(readFileSync(p, "utf8"), pristine);
  assert.equal(hasBackup(p), false);
});

test("restoreFromBackup deletes settings.json when it did not exist at patch time", () => {
  const dir = tmp();
  const p = join(dir, "settings.json");
  ensureBackup(p, null); // file absent
  writeFileSync(p, '{ "statusLine": {} }');
  const r = restoreFromBackup(p);
  assert.equal(r.restored, true);
  assert.equal(existsSync(p), false);
});

test("restoreFromBackup is a benign no-op with no backup", () => {
  const r = restoreFromBackup(join(tmp(), "settings.json"));
  assert.equal(r.restored, false);
  assert.match(r.reason, /no backup/);
});
