/**
 * Claude Code — transcripts at ~/.claude/projects/<encoded-path>/<id>.jsonl.
 *
 * This agent was detected by the installer but never scanned at all, so every
 * turn a user had ever taken in Claude Code was missing from their pre-launch
 * estimate. The CLI, the VS Code extension and the desktop app all share the
 * same ~/.claude directory, so one scan covers all three.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentScanResult } from "./types.js";
import { countTranscriptTree } from "./transcripts.js";

export function scanClaudeCode(days: number): AgentScanResult {
  const home = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const detected = existsSync(home);
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const counts = detected
    ? countTranscriptTree(join(home, "projects"), cutoffMs)
    : { sessions: 0, userTurns: 0, thinkingStates: 0 };

  return {
    agent: "claude-code",
    label: "Claude Code",
    detected,
    sessions: counts.sessions,
    userTurns: counts.userTurns,
    thinkingStates: counts.thinkingStates,
    billableSlots: Math.max(counts.userTurns, counts.thinkingStates),
    detail: detected
      ? `${counts.sessions} sessions · ${counts.userTurns} turns · ${counts.thinkingStates} thinking states`
      : "not installed",
  };
}
