/**
 * The spinnerVerbs surface: a comment-safe minimal edit of ~/.claude/
 * settings.json that never overwrites a `spinnerVerbs` the user set.
 *
 * Run after `npm --prefix cli run build`:
 *   node --test cli/tests/claude-spinner.test.mjs
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
  spinnerVerb,
  isOurSpinnerVerbs,
  writeSpinnerVerb,
  removeSpinnerVerb,
  SPINNER_TAGLINE,
} = await import("../dist/surfaces/claude-spinner.js");
const { readSettings } = await import("../dist/surfaces/json-settings.js");

const tmpFile = () => join(mkdtempSync(join(tmpdir(), "latent-spin-")), "settings.json");

test("spinnerVerb: marker + disclosure label, sanitised, clipped", () => {
  assert.match(spinnerVerb("Deploy faster"), /^✦ Ad: Deploy faster$/);
  assert.equal(spinnerVerb("a\n\n  b   c"), "✦ Ad: a b c");
  const long = spinnerVerb("x".repeat(200));
  assert.ok(long.length <= 58, long.length);
  assert.ok(long.endsWith("…"));
  // escape sequences never reach the shimmer
  assert.doesNotMatch(spinnerVerb("\x1b[2Jpwn"), /[\x00-\x1f]/);
});

test("isOurSpinnerVerbs only matches marker-prefixed verb arrays", () => {
  assert.equal(isOurSpinnerVerbs({ mode: "replace", verbs: ["✦ hi"] }), true);
  assert.equal(isOurSpinnerVerbs({ mode: "replace", verbs: ["Discombobulating…"] }), false);
  assert.equal(isOurSpinnerVerbs({ mode: "append", verbs: [] }), false);
  assert.equal(isOurSpinnerVerbs("nope"), false);
});

test("writeSpinnerVerb: inserts when absent, updates when ours, preserves comments", () => {
  const p = tmpFile();
  writeFileSync(p, '{\n  // my model\n  "model": "opus"\n}\n');
  assert.equal(writeSpinnerVerb("✦ First ad", p), true);
  let raw = readFileSync(p, "utf8");
  assert.ok(raw.includes("// my model"), "comment lost");
  assert.ok(raw.includes('"model": "opus"'));
  assert.deepEqual(readSettings(p).data.spinnerVerbs, { mode: "replace", verbs: ["✦ First ad"] });

  assert.equal(writeSpinnerVerb("✦ Second ad", p), true);
  assert.deepEqual(readSettings(p).data.spinnerVerbs.verbs, ["✦ Second ad"]);

  // Idempotent: same value → no write.
  assert.equal(writeSpinnerVerb("✦ Second ad", p), false);
});

test("writeSpinnerVerb: refuses to overwrite a user-set spinnerVerbs", () => {
  const p = tmpFile();
  writeFileSync(p, '{\n  "spinnerVerbs": { "mode": "append", "verbs": ["My verb"] }\n}\n');
  assert.equal(writeSpinnerVerb("✦ Ad", p), false);
  assert.deepEqual(readSettings(p).data.spinnerVerbs.verbs, ["My verb"]);
});

test("writeSpinnerVerb: no-op on missing / unparseable file", () => {
  assert.equal(writeSpinnerVerb("✦ Ad", join(tmpdir(), "does-not-exist-xyz.json")), false);
  const p = tmpFile();
  writeFileSync(p, "{ broken");
  assert.equal(writeSpinnerVerb("✦ Ad", p), false);
  assert.equal(readFileSync(p, "utf8"), "{ broken");
});

test("removeSpinnerVerb: drops ours, leaves a user-set one", () => {
  const p = tmpFile();
  writeFileSync(p, "{}\n");
  writeSpinnerVerb(SPINNER_TAGLINE, p);
  assert.equal(removeSpinnerVerb(p), true);
  assert.equal("spinnerVerbs" in (readSettings(p).data ?? {}), false);

  writeFileSync(p, '{ "spinnerVerbs": { "mode": "replace", "verbs": ["Mine"] } }');
  assert.equal(removeSpinnerVerb(p), false);
});
