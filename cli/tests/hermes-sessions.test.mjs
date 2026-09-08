/**
 * Hermes stores one row per session with aggregate counts, not one row per
 * message — and it tags each session with a `source`.
 *
 * The scanner used to find ~/.hermes/state.db and then read nothing out of
 * it: its table matcher looked for message/event/turn tables, and `sessions`
 * matches none of those; even when reached, the table has no per-message role
 * column to count. An account with months of conversations scored zero.
 *
 * `cron` sessions are excluded on purpose. They are scheduled jobs that post
 * a single message to themselves — nobody is waiting on one, so a sponsor
 * line there could never be seen, and counting them would inflate the
 * estimate with impressions that could never be served.
 *
 * Requires a SQLite reader (Node 22+ or the sqlite3 CLI); skips otherwise.
 * Run after `npm --prefix cli run build`.
 */
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
let DatabaseSync;
try {
  ({ DatabaseSync } = require_("node:sqlite"));
} catch {
  console.log("ok - skipped: no node:sqlite on this runtime");
  process.exit(0);
}

const home = mkdtempSync(join(tmpdir(), "latent-hermes-"));
try {
  mkdirSync(join(home, ".hermes"), { recursive: true });
  const db = new DatabaseSync(join(home, ".hermes", "state.db"));
  db.exec(
    "CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, message_count INTEGER," +
      " tool_call_count INTEGER, started_at INTEGER, title TEXT)",
  );
  const now = Math.floor(Date.now() / 1000);
  const day = 86_400;
  const insert = db.prepare("INSERT INTO sessions VALUES (?,?,?,?,?,?)");
  for (const row of [
    ["s1", "telegram", 142, 61, now - day * 2, "real conversation"],
    ["s2", "telegram", 88, 34, now - day * 5, "real conversation"],
    ["s3", "webui", 213, 97, now - day * 9, "real conversation"],
    ["s4", "webui", 56, 12, now - day * 20, "real conversation"],
    ["s5", "cron", 1, 0, now - day * 1, "scheduled job"],
    ["s6", "cron", 1, 0, now - day * 2, "scheduled job"],
    ["s7", "telegram", 40, 15, now - day * 400, "outside the window"],
  ]) {
    insert.run(...row);
  }
  db.close();

  process.env.HOME = home;
  delete process.env.HERMES_HOME;

  const { scanHermes } = await import("../dist/scanners/hermes.js");
  const r = scanHermes(30);

  assert.equal(r.detected, true, "Hermes not detected");
  assert.equal(r.sessions, 4, `sessions: got ${r.sessions}, want 4 (cron and out-of-window excluded)`);

  // floor(142/2)+floor(88/2)+floor(213/2)+floor(56/2)
  assert.equal(r.userTurns, 249, `userTurns: got ${r.userTurns}, want 249`);
  // 61+34+97+12
  assert.equal(r.thinkingStates, 204, `thinkingStates: got ${r.thinkingStates}, want 204`);
  assert.ok(r.billableSlots > 0, "billable slots must not be zero for a populated store");

  assert.match(
    r.detail,
    /automated session/,
    `detail should say automated sessions were excluded, got: ${r.detail}`,
  );

  console.log("ok - Hermes session aggregates counted, cron excluded");
} finally {
  rmSync(home, { recursive: true, force: true });
}
