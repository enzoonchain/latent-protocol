/**
 * Ad copy → terminal / shimmer / model context. Advertiser-controlled, so it
 * must not carry escape sequences, control chars, or bidi overrides, and must
 * respect the length caps.
 *
 * Run after `npm --prefix cli run build`:
 *   node --test cli/tests/sanitize.test.mjs
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";

const { sanitizeAdText } = await import("../dist/sanitize.js");

const ESC = "\x1b";
const C1_CSI = "\x9b";

/** No control chars (C0/DEL/C1) survive — the security invariant. */
const NO_CONTROL = /^[^\x00-\x1f\x7f-\x9f]*$/;

test("strips CSI cursor/erase/colour sequences", () => {
  const out = sanitizeAdText(`${ESC}[2J${ESC}[H PWNED ${ESC}[31mred${ESC}[0m`);
  assert.match(out, NO_CONTROL);
  assert.doesNotMatch(out, /\[2J|\[31m|\[0m/);
  assert.match(out, /PWNED red/);
});

test("strips OSC window-title / hyperlink sequences", () => {
  const title = sanitizeAdText(`${ESC}]0;pwn${ESC}\\hi`);
  assert.match(title, NO_CONTROL);
  assert.doesNotMatch(title, /]0;|pwn/);
  assert.match(title, /hi/);

  const link = sanitizeAdText(`${ESC}]8;;https://evil${ESC}\\click${ESC}]8;;${ESC}\\`);
  assert.match(link, NO_CONTROL);
  assert.doesNotMatch(link, /]8;|evil/);
  assert.match(link, /click/);
});

test("strips 8-bit C1 CSI and bare control chars", () => {
  const out = sanitizeAdText(`a${C1_CSI}31mb\x07c\x1bd`);
  assert.match(out, NO_CONTROL);
});

test("neutralises bidi overrides", () => {
  const out = sanitizeAdText("Bank‮gro.evil‬com");
  assert.doesNotMatch(out, /[‪-‮⁦-⁩]/);
});

test("collapses whitespace, clamps to max with ellipsis", () => {
  assert.equal(sanitizeAdText("  a\t\t b \n c  "), "a b c");
  const long = sanitizeAdText("x".repeat(200), 30);
  assert.ok(long.length <= 30, `len ${long.length}`);
  assert.ok(long.endsWith("…"));
});

test("preserves ordinary unicode + punctuation", () => {
  assert.equal(
    sanitizeAdText("Try Ramp.com — free for 30 days! 🚀"),
    "Try Ramp.com — free for 30 days! 🚀",
  );
});

test("nullish → empty string", () => {
  assert.equal(sanitizeAdText(null), "");
  assert.equal(sanitizeAdText(undefined), "");
  assert.equal(sanitizeAdText(""), "");
});
