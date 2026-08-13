import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import type { AgentScanResult } from "./types.js";
import { scanJsonlProjects } from "./jsonl.js";

export interface CodexFamilyAgent {
  id: string;
  label: string;
  homeEnv: string;
  homeRel: string;
  binaries: string[];
}

export const CODEX_FAMILY: CodexFamilyAgent[] = [
  { id: "codex", label: "Codex", homeEnv: "CODEX_HOME", homeRel: ".codex", binaries: ["codex"] },
  { id: "mimo", label: "MiMo", homeEnv: "MIMO_HOME", homeRel: ".mimo", binaries: ["mimo"] },
];

function which(bin: string): boolean {
  const res = spawnSync("bash", ["-lc", `command -v ${bin}`], { encoding: "utf8" });
  return res.status === 0 && Boolean((res.stdout || "").trim());
}

function agentHome(a: CodexFamilyAgent): string {
  return process.env[a.homeEnv] || join(homedir(), a.homeRel);
}

function isDetected(a: CodexFamilyAgent): boolean {
  return existsSync(agentHome(a)) || a.binaries.some(which);
}

export function scanCodexFamily(days: number): AgentScanResult[] {
  return CODEX_FAMILY.map((a) => {
    const detected = isDetected(a);
    const home = agentHome(a);
    const projects = join(home, "projects");
    const counts = detected ? scanJsonlProjects(projects, days) : { sessions: 0, userTurns: 0, thinkingStates: 0 };
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
