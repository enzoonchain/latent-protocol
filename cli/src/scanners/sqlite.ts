/**
 * Reading agent history out of SQLite stores.
 *
 * Hermes keeps conversations in a per-profile SQLite database with an FTS5
 * index — not in log files — so a scanner that only greps logs sees almost
 * nothing. Codex and OpenClaw keep a SQLite index alongside their JSONL.
 *
 * Two access paths, tried in order, because neither is guaranteed:
 *   1. `node:sqlite`, built in from Node 22 — no dependency, no subprocess.
 *   2. the `sqlite3` CLI, if the user happens to have it.
 * When neither is available the caller falls back to file-based counting and
 * says so in its detail line, rather than silently reporting zero.
 *
 * The schema is discovered at runtime rather than hard-coded: we ask the
 * database what tables and columns it has and pick the ones that look like a
 * message log. A hard-coded schema would break the first time an agent
 * renames a column, and would be a guess besides.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { TranscriptCounts } from "./transcripts.js";
import { emptyCounts } from "./transcripts.js";

type Row = Record<string, unknown>;

/** A query runner, or null when this machine can't read SQLite at all. */
type Runner = ((sql: string) => Row[]) | null;

let cachedRunner: Runner | undefined;

function nodeSqliteRunner(dbPath: string): Runner {
  try {
    // Node 22 ships node:sqlite; older runtimes throw here and we fall back.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createRequire } = require("node:module") as typeof import("node:module");
    const req = createRequire(import.meta.url);
    const sqlite = req("node:sqlite") as { DatabaseSync: new (p: string, o?: unknown) => unknown };
    const db = new sqlite.DatabaseSync(dbPath, { readOnly: true }) as {
      prepare: (sql: string) => { all: () => Row[] };
      close: () => void;
    };
    return (sql: string) => {
      try {
        return db.prepare(sql).all();
      } catch {
        return [];
      }
    };
  } catch {
    return null;
  }
}

function sqlite3CliRunner(dbPath: string): Runner {
  const probe = spawnSync("bash", ["-lc", "command -v sqlite3"], { encoding: "utf8" });
  if (probe.status !== 0 || !(probe.stdout || "").trim()) return null;
  return (sql: string) => {
    const res = spawnSync("sqlite3", ["-readonly", "-json", dbPath, sql], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    if (res.status !== 0 || !res.stdout.trim()) return [];
    try {
      return JSON.parse(res.stdout) as Row[];
    } catch {
      return [];
    }
  };
}

function openDatabase(dbPath: string): Runner {
  if (!existsSync(dbPath)) return null;
  return nodeSqliteRunner(dbPath) ?? sqlite3CliRunner(dbPath);
}

/** True when this machine can read SQLite by either route. */
export function sqliteAvailable(): boolean {
  if (cachedRunner !== undefined) return cachedRunner !== null;
  const probe = spawnSync("bash", ["-lc", "command -v sqlite3"], { encoding: "utf8" });
  const hasCli = probe.status === 0 && Boolean((probe.stdout || "").trim());
  let hasNode = false;
  try {
    const { createRequire } = require("node:module") as typeof import("node:module");
    createRequire(import.meta.url)("node:sqlite");
    hasNode = true;
  } catch {
    hasNode = false;
  }
  cachedRunner = hasCli || hasNode ? ((): Row[] => []) : null;
  return cachedRunner !== null;
}

const ROLE_COLUMNS = ["role", "sender", "author", "kind", "type", "message_type"];
const TIME_COLUMNS = ["created_at", "timestamp", "ts", "time", "created", "inserted_at"];
const MESSAGE_TABLE = /(message|event|turn|entry|transcript)/i;

function quote(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Count user turns and thinking states in a SQLite history store.
 *
 * Returns null when the database can't be read or has no table that looks
 * like a message log — the caller then falls back rather than reporting a
 * confident zero.
 */
export function countSqliteHistory(dbPath: string, cutoffMs: number): TranscriptCounts | null {
  const run = openDatabase(dbPath);
  if (!run) return null;

  const tables = run(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  )
    .map((r) => String(r.name ?? ""))
    .filter(Boolean);
  if (!tables.length) return null;

  const candidates = tables.filter((t) => MESSAGE_TABLE.test(t) && !/_fts($|_)/i.test(t));
  if (!candidates.length) return null;

  const total = emptyCounts();
  let matched = false;

  for (const table of candidates) {
    const columns = run(`PRAGMA table_info(${quote(table)})`).map((r) =>
      String(r.name ?? "").toLowerCase(),
    );
    if (!columns.length) continue;

    const roleCol = ROLE_COLUMNS.find((c) => columns.includes(c));
    if (!roleCol) continue;
    const timeCol = TIME_COLUMNS.find((c) => columns.includes(c));

    // Timestamps are stored as epoch seconds, epoch millis or ISO text
    // depending on the agent; compare in a way that tolerates all three.
    const cutoffSec = Math.floor(cutoffMs / 1000);
    const cutoffIso = new Date(cutoffMs).toISOString();
    const where = timeCol
      ? `WHERE (CAST(${quote(timeCol)} AS INTEGER) >= ${cutoffMs}
                OR CAST(${quote(timeCol)} AS INTEGER) BETWEEN ${cutoffSec} AND ${cutoffSec * 1000}
                OR ${quote(timeCol)} >= '${cutoffIso}')`
      : "";

    const rows = run(
      `SELECT LOWER(${quote(roleCol)}) AS role, COUNT(*) AS n FROM ${quote(table)} ${where} GROUP BY 1`,
    );
    if (!rows.length) continue;

    matched = true;
    for (const row of rows) {
      const role = String(row.role ?? "");
      const n = Number(row.n ?? 0);
      if (!Number.isFinite(n) || n <= 0) continue;
      if (role.includes("user") || role.includes("human")) total.userTurns += n;
      else if (role.includes("assistant") || role.includes("tool") || role.includes("agent")) {
        total.thinkingStates += n;
      }
    }
  }

  if (!matched) return null;

  // Prefer a real session table for the session count; fall back to "at least
  // one" so a populated store never reports zero sessions.
  const sessionTable = tables.find((t) => /^sessions?$/i.test(t) || /session/i.test(t));
  if (sessionTable) {
    const rows = run(`SELECT COUNT(*) AS n FROM ${quote(sessionTable)}`);
    const n = Number(rows[0]?.n ?? 0);
    if (Number.isFinite(n) && n > 0) total.sessions = n;
  }
  if (total.sessions === 0 && (total.userTurns > 0 || total.thinkingStates > 0)) {
    total.sessions = 1;
  }

  return total;
}
