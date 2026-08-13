import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import type { AgentScanResult } from "./types.js";
import { scanJsonlProjects } from "./jsonl.js";

function which(bin: string): boolean {
  const res = spawnSync("bash", ["-lc", `command -v ${bin}`], { encoding: "utf8" });
  return res.status === 0 && Boolean((res.stdout || "").trim());
}

function openclawHome(): string {
  return process.env.OPENCLAW_HOME || join(homedir(), ".openclaw");
}

function countRecentJsonl(root: string, cutoffMs: number, depth = 0): number {
  if (depth > 6) return 0;
  let n = 0;
  try {
    for (const name of readdirSync(root)) {
      const path = join(root, name);
      const st = statSync(path);
      if (st.isDirectory()) n += countRecentJsonl(path, cutoffMs, depth + 1);
      else if (name.endsWith(".jsonl") && st.mtimeMs >= cutoffMs) n += 1;
    }
  } catch {
    // skip
  }
  return n;
}

export function scanOpenclaw(days: number): AgentScanResult {
  const home = openclawHome();
  const detected = existsSync(home) || which("openclaw");
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const projects = scanJsonlProjects(join(home, "projects"), days);
  const sessionsDir = join(home, "sessions");
  const sessionFiles = existsSync(sessionsDir) ? countRecentJsonl(sessionsDir, cutoffMs) : 0;
  const dataDir = join(home, "data");
  const dataFiles = existsSync(dataDir) ? countRecentJsonl(dataDir, cutoffMs) : 0;

  const sessions = Math.max(projects.sessions, sessionFiles, dataFiles > 0 ? 1 : 0);
  const userTurns = projects.userTurns + sessionFiles;
  const thinkingStates = projects.thinkingStates;
  const billableSlots = Math.max(userTurns, thinkingStates);

  return {
    agent: "openclaw",
    label: "OpenClaw",
    detected,
    sessions,
    userTurns,
    thinkingStates,
    billableSlots,
    detail: detected
      ? `${sessions} sessions · ${userTurns} turns · ${thinkingStates} thinking states`
      : "not installed",
  };
}
