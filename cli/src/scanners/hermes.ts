/**
 * Hermes — history lives in a per-profile SQLite database with an FTS5 index
 * under ~/.hermes/profiles/<name>/, not in log files.
 *
 * The previous scanner grepped webui.log / hermes.log / gateway.log for
 * regexes like /thinking/i. On a gateway that keeps its transcripts in the
 * database those files hold startup noise and little else, so the scan
 * reported a couple of dozen turns for accounts with months of history. Logs
 * are still read, but only as a fallback for installs with no readable
 * database.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentScanResult } from "./types.js";
import {
  addCounts,
  countTranscriptTree,
  emptyCounts,
  type TranscriptCounts,
} from "./transcripts.js";
import {
  countSqliteHistory,
  countSqliteSessionAggregate,
  sqliteAvailable,
} from "./sqlite.js";

/** Every .db/.sqlite file under ~/.hermes/profiles/<name>/, plus legacy roots. */
function databaseFiles(home: string): string[] {
  const found: string[] = [];
  const roots = [join(home, "profiles"), home];

  const visit = (dir: string, depth: number): void => {
    if (depth > 3) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const path = join(dir, name);
      let st;
      try {
        st = statSync(path);
      } catch {
        continue;
      }
      if (st.isDirectory()) visit(path, depth + 1);
      else if (/\.(db|sqlite3?)$/i.test(name)) found.push(path);
    }
  };

  for (const root of roots) {
    if (existsSync(root)) visit(root, 0);
  }
  return [...new Set(found)];
}

export function scanHermes(days: number, hermesHome?: string): AgentScanResult {
  const home = hermesHome ?? process.env.HERMES_HOME ?? join(homedir(), ".hermes");
  const detected = existsSync(home);
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

  let counts: TranscriptCounts = emptyCounts();
  let source = "no history found";

  if (detected) {
    const dbs = databaseFiles(home);
    let dbCounts: TranscriptCounts | null = null;
    let automatedSkipped = 0;
    let fromAggregate = false;

    for (const db of dbs) {
      // Hermes' own store keeps one row per session with message and
      // tool-call totals, so try that shape first; the per-message path below
      // covers builds that keep a message log instead.
      const agg = countSqliteSessionAggregate(db, cutoffMs);
      if (agg) {
        automatedSkipped += agg.automatedSkipped;
        fromAggregate = true;
        const { automatedSkipped: _skip, ...rest } = agg;
        dbCounts = dbCounts ? addCounts(dbCounts, rest) : rest;
        continue;
      }
      const one = countSqliteHistory(db, cutoffMs);
      if (one) dbCounts = dbCounts ? addCounts(dbCounts, one) : one;
    }

    if (dbCounts) {
      counts = dbCounts;
      const skipNote = automatedSkipped
        ? `, ${automatedSkipped} automated session${automatedSkipped === 1 ? "" : "s"} excluded`
        : "";
      source = fromAggregate
        ? `session db, turns estimated from message totals${skipNote}`
        : `${dbs.length} profile db${dbs.length === 1 ? "" : "s"}`;
    }

    // JSONL transcripts, where a build writes them alongside the database.
    const files = addCounts(
      countTranscriptTree(join(home, "projects"), cutoffMs),
      countTranscriptTree(join(home, "sessions"), cutoffMs),
    );
    if (files.userTurns || files.thinkingStates) {
      counts = addCounts(counts, files);
      source = dbCounts ? `${source} + transcripts` : "transcripts";
    }

    if (!dbCounts && dbs.length && !sqliteAvailable()) {
      source = "database found but unreadable (install sqlite3 or use Node 22+)";
    }
  }

  const billableSlots = Math.max(counts.userTurns, counts.thinkingStates);
  return {
    agent: "hermes",
    label: "Hermes CLI / gateway",
    detected,
    sessions: counts.sessions,
    userTurns: counts.userTurns,
    thinkingStates: counts.thinkingStates,
    billableSlots,
    detail: detected
      ? `${counts.sessions} sessions · ${counts.userTurns} turns · ${counts.thinkingStates} thinking states (${source})`
      : "not installed",
  };
}
