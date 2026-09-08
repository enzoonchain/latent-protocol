/**
 * spinnerVerbs is only honoured by Claude Code >= 2.1.143. Gate on the CLI
 * version, fail-open when it cannot be determined.
 *
 * Run after `npm --prefix cli run build`:
 *   node --test cli/tests/claude-cli-version.test.mjs
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";

const {
  parseClaudeCliVersion,
  gte,
  supportsSpinnerVerbs,
  detectSpinnerVerbsSupport,
  SPINNER_VERBS_FLOOR,
} = await import("../dist/surfaces/claude-cli-version.js");

test("parseClaudeCliVersion", () => {
  assert.deepEqual(parseClaudeCliVersion("2.1.158 (Claude Code)"), [2, 1, 158]);
  assert.deepEqual(parseClaudeCliVersion("2.1.143"), [2, 1, 143]);
  assert.equal(parseClaudeCliVersion("Claude Code"), null);
  assert.equal(parseClaudeCliVersion(""), null);
});

test("gte orders by major, minor, patch", () => {
  assert.equal(gte([2, 1, 143], [2, 1, 143]), true);
  assert.equal(gte([2, 1, 158], [2, 1, 143]), true);
  assert.equal(gte([2, 2, 0], [2, 1, 143]), true);
  assert.equal(gte([3, 0, 0], [2, 1, 143]), true);
  assert.equal(gte([2, 1, 142], [2, 1, 143]), false);
  assert.equal(gte([2, 0, 999], [2, 1, 143]), false);
});

test("supportsSpinnerVerbs gates on the 2.1.143 floor; null => unsupported", () => {
  assert.deepEqual(SPINNER_VERBS_FLOOR, [2, 1, 143]);
  assert.equal(supportsSpinnerVerbs([2, 1, 158]), true);
  assert.equal(supportsSpinnerVerbs([2, 1, 143]), true);
  assert.equal(supportsSpinnerVerbs([2, 1, 142]), false);
  assert.equal(supportsSpinnerVerbs([2, 0, 44]), false);
  assert.equal(supportsSpinnerVerbs(null), false);
});

test("detectSpinnerVerbsSupport fails open when `claude` is not on PATH", async () => {
  const prev = process.env.PATH;
  process.env.PATH = "/nonexistent-dir-for-test";
  try {
    // spawn fails => null version => policy returns true (fail-open).
    assert.equal(await detectSpinnerVerbsSupport(), true);
  } finally {
    process.env.PATH = prev;
  }
});
