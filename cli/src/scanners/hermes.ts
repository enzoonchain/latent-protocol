import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentScanResult } from "./types.js";
import { scanJsonlProjects } from "./jsonl.js";

const USER_PATTERNS = [
  /user[_-]?message/i,
  /pre_llm_call/i,
  /"role"\s*:\s*"user"/i,
  /incoming message/i,
];

const THINKING_PATTERNS = [
  /thinking/i,
  /tool_use/i,
  /agent-activity-thinking/i,
  /pre_llm_call/i,
];

function countPatterns(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const re of patterns) {
    const m = text.match(new RegExp(re.source, "gi"));
    if (m) n += m.length;
  }
  return n;
}

function scanLogFile(path: string, cutoffMs: number): { userTurns: number; thinkingStates: number } {
  try {
    const st = statSync(path);
    if (st.mtimeMs < cutoffMs) return { userTurns: 0, thinkingStates: 0 };
    const text = readFileSync(path, "utf8");
    return {
      userTurns: countPatterns(text, USER_PATTERNS),
      thinkingStates: countPatterns(text, THINKING_PATTERNS),
    };
  } catch {
    return { userTurns: 0, thinkingStates: 0 };
  }
}

function scanHermesLogs(hermesHome: string, days: number): { userTurns: number; thinkingStates: number } {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  let userTurns = 0;
  let thinkingStates = 0;
  const candidates = [
    join(hermesHome, "webui.log"),
    join(hermesHome, "hermes.log"),
    join(hermesHome, "gateway.log"),
    join(hermesHome, "logs"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const st = statSync(path);
      if (st.isDirectory()) {
        for (const name of readdirSync(path)) {
          const sub = scanLogFile(join(path, name), cutoffMs);
          userTurns += sub.userTurns;
          thinkingStates += sub.thinkingStates;
        }
      } else {
        const sub = scanLogFile(path, cutoffMs);
        userTurns += sub.userTurns;
        thinkingStates += sub.thinkingStates;
      }
    } catch {
      // skip unreadable paths
    }
  }
  return { userTurns, thinkingStates };
}

export function scanHermes(days: number, hermesHome?: string): AgentScanResult {
  const home = hermesHome ?? join(homedir(), ".hermes");
  const detected = existsSync(home);
  const jsonl = scanJsonlProjects(join(home, "projects"), days);
  const logs = scanHermesLogs(home, days);
  const userTurns = jsonl.userTurns + logs.userTurns;
  const thinkingStates = jsonl.thinkingStates + logs.thinkingStates;
  const sessions = jsonl.sessions || (userTurns > 0 ? 1 : 0);
  const billableSlots = Math.max(userTurns, thinkingStates);

  return {
    agent: "hermes",
    label: "Hermes CLI / gateway",
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
