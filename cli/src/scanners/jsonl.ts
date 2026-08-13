import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface JsonlCounts {
  sessions: number;
  userTurns: number;
  thinkingStates: number;
}

function parseTimestamp(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 1e12 ? raw : raw * 1000;
  }
  if (typeof raw === "string" && raw.trim()) {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function contentHasThinking(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((block) => {
    if (!block || typeof block !== "object") return false;
    const b = block as Record<string, unknown>;
    const type = String(b.type ?? "");
    return type === "thinking" || type === "tool_use" || type === "tool-call";
  });
}

function scanJsonlFile(path: string, cutoffMs: number): JsonlCounts {
  const out: JsonlCounts = { sessions: 0, userTurns: 0, thinkingStates: 0 };
  let recent = false;
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let row: Record<string, unknown>;
      try {
        row = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }
      const ts =
        parseTimestamp(row.timestamp) ??
        parseTimestamp(row.created_at) ??
        parseTimestamp(row.createdAt);
      if (ts !== null && ts < cutoffMs) continue;
      if (ts !== null) recent = true;

      const type = String(row.type ?? "");
      if (type === "user") {
        out.userTurns += 1;
        recent = true;
      } else if (type === "assistant") {
        const msg = row.message as Record<string, unknown> | undefined;
        if (msg && contentHasThinking(msg.content)) {
          out.thinkingStates += 1;
          recent = true;
        }
      }
    }
  } catch {
    return out;
  }
  if (recent) out.sessions = 1;
  return out;
}

function walkJsonl(root: string, cutoffMs: number, depth = 0): JsonlCounts {
  const total: JsonlCounts = { sessions: 0, userTurns: 0, thinkingStates: 0 };
  if (depth > 8) return total;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return total;
  }
  for (const name of entries) {
    const path = join(root, name);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const sub = walkJsonl(path, cutoffMs, depth + 1);
      total.sessions += sub.sessions;
      total.userTurns += sub.userTurns;
      total.thinkingStates += sub.thinkingStates;
    } else if (name.endsWith(".jsonl") && st.mtimeMs >= cutoffMs) {
      const file = scanJsonlFile(path, cutoffMs);
      total.sessions += file.sessions;
      total.userTurns += file.userTurns;
      total.thinkingStates += file.thinkingStates;
    }
  }
  return total;
}

/** Scan a projects/ tree for Claude/Codex-style JSONL session logs. */
export function scanJsonlProjects(rootDir: string, days: number): JsonlCounts {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  return walkJsonl(rootDir, cutoffMs);
}
