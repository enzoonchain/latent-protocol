/**
 * The scanners must find history where each agent actually stores it.
 *
 * Every fixture below is the real on-disk shape for that platform. Against
 * the previous scanner this file fails on all four: Claude Code was never
 * scanned, Codex was read from ~/.codex/projects (a directory it does not
 * use), OpenClaw was read one level above agents/<id>/sessions and counted
 * files instead of turns, and archived/deleted transcripts were skipped.
 *
 * Run after `npm --prefix cli run build`:
 *   node cli/tests/scanners.test.mjs
 */
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";

const root = mkdtempSync(join(tmpdir(), "latent-scan-"));
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

function writeLines(path, rows) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

try {
  process.env.HOME = root;
  for (const v of ["CODEX_HOME", "MIMO_HOME", "OPENCLAW_HOME", "HERMES_HOME", "CLAUDE_CONFIG_DIR"]) {
    delete process.env[v];
  }

  // ── Claude Code: ~/.claude/projects/<encoded>/<session>.jsonl ───────────
  const ccDir = join(root, ".claude", "projects", "-home-user-proj");
  mkdirSync(ccDir, { recursive: true });
  writeLines(join(ccDir, "sess-a.jsonl"), [
    { type: "user", timestamp: iso(2) },
    { type: "assistant", timestamp: iso(2), message: { content: [{ type: "thinking" }] } },
    { type: "user", timestamp: iso(1) },
    { type: "user", timestamp: iso(400) }, // outside the window
  ]);

  // ── Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl ────────────────
  const cxDir = join(root, ".codex", "sessions", "2026", "09", "01");
  mkdirSync(cxDir, { recursive: true });
  writeLines(join(cxDir, "rollout-2026-09-01-abc.jsonl"), [
    { type: "session_meta", timestamp: iso(3) },
    { type: "event_msg", timestamp: iso(3), payload: { type: "user_message", message: "hi" } },
    { type: "event_msg", timestamp: iso(3), payload: { type: "agent_message" } },
    { type: "event_msg", timestamp: iso(2), payload: { type: "user_message", message: "more" } },
  ]);

  // ── OpenClaw: ~/.openclaw/agents/<id>/sessions/, incl. archived + deleted
  const ocDir = join(root, ".openclaw", "agents", "work", "sessions");
  mkdirSync(ocDir, { recursive: true });
  const ocRows = (n) =>
    Array.from({ length: n }, (_, i) => ({
      type: "message",
      timestamp: iso(2),
      message: { role: i % 2 === 0 ? "user" : "assistant", content: [{ type: "thinking" }] },
    }));
  writeLines(join(ocDir, "live.jsonl"), ocRows(10));
  writeLines(join(ocDir, "old.jsonl.reset.2026-09-01T10-00-00Z"), ocRows(6));
  writeLines(join(ocDir, "gone.jsonl.deleted.2026-09-02T10-00-00Z"), ocRows(4));

  const { scanClaudeCode } = await import("../dist/scanners/claude-code.js");
  const { scanCodexFamily } = await import("../dist/scanners/codex.js");
  const { scanOpenclaw } = await import("../dist/scanners/openclaw.js");
  const { applyCaps } = await import("../dist/calc.js");

  const cc = scanClaudeCode(30);
  assert.equal(cc.detected, true, "Claude Code not detected");
  assert.equal(cc.userTurns, 2, `Claude Code user turns: got ${cc.userTurns}, want 2`);
  assert.equal(cc.thinkingStates, 1, "Claude Code thinking states");

  const codex = scanCodexFamily(30).find((a) => a.agent === "codex");
  assert.equal(codex.detected, true, "Codex not detected");
  assert.equal(codex.userTurns, 2, `Codex user turns: got ${codex.userTurns}, want 2`);

  const oc = scanOpenclaw(30);
  assert.equal(oc.detected, true, "OpenClaw not detected");
  // 20 rows total across live + archived + deleted, half of them user turns.
  assert.equal(oc.userTurns, 10, `OpenClaw user turns: got ${oc.userTurns}, want 10`);
  assert.equal(oc.thinkingStates, 10, `OpenClaw thinking states: got ${oc.thinkingStates}, want 10`);
  assert.equal(oc.sessions, 3, `OpenClaw sessions: got ${oc.sessions}, want 3 (live+reset+deleted)`);

  // ── The cap must not collapse when sessions are unknown ────────────────
  assert.equal(
    applyCaps(5000, 0, 30),
    3000,
    "an unknown session count must fall back to the daily cap, not clamp to 20",
  );
  assert.equal(applyCaps(5000, 2, 30), 40, "a known session count still caps per session");

  console.log("ok - every agent's real store is found, archived + deleted included");
} finally {
  rmSync(root, { recursive: true, force: true });
}
