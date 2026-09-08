/**
 * OpenClaw — transcripts live per agent at
 * ~/.openclaw/agents/<agentId>/sessions/, with a SQLite index beside them.
 *
 * Two bugs made this scanner report zero for installs with real history:
 * it looked under ~/.openclaw/{projects,sessions,data} — one directory level
 * above where sessions actually are — and it counted session *files* as
 * turns, so a 200-turn conversation scored 1. Archived (`.jsonl.reset.*Z`)
 * and deleted (`.jsonl.deleted.*Z`) transcripts are counted too: they stay on
 * disk and they are real usage.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import type { AgentScanResult } from "./types.js";
import {
  addCounts,
  countTranscriptTree,
  emptyCounts,
  subdirectories,
  type TranscriptCounts,
} from "./transcripts.js";
import { countSqliteHistory } from "./sqlite.js";

function which(bin: string): boolean {
  const res = spawnSync("bash", ["-lc", `command -v ${bin}`], { encoding: "utf8" });
  return res.status === 0 && Boolean((res.stdout || "").trim());
}

function openclawHome(): string {
  return process.env.OPENCLAW_HOME || join(homedir(), ".openclaw");
}

export function scanOpenclaw(days: number): AgentScanResult {
  const home = openclawHome();
  const detected = existsSync(home) || which("openclaw");
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

  let counts: TranscriptCounts = emptyCounts();
  let agentCount = 0;

  const agentsRoot = join(home, "agents");
  for (const agentId of subdirectories(agentsRoot)) {
    agentCount += 1;
    const agentDir = join(agentsRoot, agentId);

    // Active + archived + deleted transcripts.
    counts = addCounts(counts, countTranscriptTree(join(agentDir, "sessions"), cutoffMs));

    // The SQLite index only supplements the files; never double-count when
    // the transcripts already produced numbers for this agent.
    const db = join(agentDir, "agent", "openclaw-agent.sqlite");
    if (counts.userTurns === 0 && counts.thinkingStates === 0) {
      const fromDb = countSqliteHistory(db, cutoffMs);
      if (fromDb) counts = addCounts(counts, fromDb);
    }
  }

  // Older layouts kept sessions directly under the home directory.
  if (counts.userTurns === 0 && counts.thinkingStates === 0) {
    for (const legacy of ["sessions", "projects", "data"]) {
      counts = addCounts(counts, countTranscriptTree(join(home, legacy), cutoffMs));
    }
  }

  const billableSlots = Math.max(counts.userTurns, counts.thinkingStates);
  const scope = agentCount ? `${agentCount} agent${agentCount === 1 ? "" : "s"}` : "legacy layout";
  return {
    agent: "openclaw",
    label: "OpenClaw",
    detected,
    sessions: counts.sessions,
    userTurns: counts.userTurns,
    thinkingStates: counts.thinkingStates,
    billableSlots,
    detail: detected
      ? `${counts.sessions} sessions · ${counts.userTurns} turns · ${counts.thinkingStates} thinking states (${scope})`
      : "not installed",
  };
}
