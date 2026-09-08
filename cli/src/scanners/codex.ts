/**
 * Codex CLI and MiMo Code.
 *
 * Codex writes rollouts to ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl with
 * a state.sqlite index beside them; the old scanner looked in
 * ~/.codex/projects, which Codex does not use, so it always reported zero.
 * MiMo keeps its data under ~/.config/mimocode (or a project-local
 * .mimocode), not ~/.mimo/projects.
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
  type TranscriptCounts,
} from "./transcripts.js";
import { countSqliteHistory } from "./sqlite.js";

export interface CodexFamilyAgent {
  id: string;
  label: string;
  homeEnv: string;
  /** Candidate home directories, first existing one wins. */
  homeRels: string[];
  /** Subdirectories under the home that hold transcripts. */
  transcriptDirs: string[];
  /** SQLite indexes, relative to the home. */
  databases: string[];
  binaries: string[];
}

export const CODEX_FAMILY: CodexFamilyAgent[] = [
  {
    id: "codex",
    label: "Codex",
    homeEnv: "CODEX_HOME",
    homeRels: [".codex"],
    transcriptDirs: ["sessions", "history", "projects"],
    databases: [join("sessions", "state.sqlite"), "state.sqlite"],
    binaries: ["codex"],
  },
  {
    id: "mimo",
    label: "MiMo",
    homeEnv: "MIMO_HOME",
    homeRels: [join(".config", "mimocode"), ".mimocode", ".mimo"],
    transcriptDirs: ["sessions", "projects", "history", "."],
    databases: ["state.sqlite", "mimocode.sqlite"],
    binaries: ["mimo"],
  },
];

function which(bin: string): boolean {
  const res = spawnSync("bash", ["-lc", `command -v ${bin}`], { encoding: "utf8" });
  return res.status === 0 && Boolean((res.stdout || "").trim());
}

function agentHome(a: CodexFamilyAgent): string {
  const fromEnv = process.env[a.homeEnv];
  if (fromEnv) return fromEnv;
  for (const rel of a.homeRels) {
    const path = join(homedir(), rel);
    if (existsSync(path)) return path;
  }
  return join(homedir(), a.homeRels[0]!);
}

function isDetected(a: CodexFamilyAgent, home: string): boolean {
  return existsSync(home) || a.binaries.some(which);
}

export function scanCodexFamily(days: number): AgentScanResult[] {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

  return CODEX_FAMILY.map((a) => {
    const home = agentHome(a);
    const detected = isDetected(a, home);
    let counts: TranscriptCounts = emptyCounts();

    if (detected) {
      for (const dir of a.transcriptDirs) {
        counts = addCounts(counts, countTranscriptTree(join(home, dir), cutoffMs));
      }
      if (counts.userTurns === 0 && counts.thinkingStates === 0) {
        for (const db of a.databases) {
          const fromDb = countSqliteHistory(join(home, db), cutoffMs);
          if (fromDb) counts = addCounts(counts, fromDb);
        }
      }
    }

    const billableSlots = Math.max(counts.userTurns, counts.thinkingStates);
    return {
      agent: a.id,
      label: a.label,
      detected,
      sessions: counts.sessions,
      userTurns: counts.userTurns,
      thinkingStates: counts.thinkingStates,
      billableSlots,
      detail: detected
        ? `${counts.sessions} sessions · ${counts.userTurns} turns · ${counts.thinkingStates} thinking states`
        : "not installed",
    };
  });
}
