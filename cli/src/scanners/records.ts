/**
 * Transcript record classification, across every agent's on-disk shape.
 *
 * Each agent writes its history in its own JSON dialect, and the old scanner
 * only understood one of them (Claude Code's `{"type":"user"}`), which is why
 * agents that store history in any other shape reported zero. The shapes we
 * handle, all confirmed against the platforms' own formats:
 *
 *   Claude Code  {"type":"user"} / {"type":"assistant","message":{"content":[…]}}
 *   OpenClaw     {"type":"message","message":{"role":…,"content":[…]}}
 *   Codex CLI    {"type":"event_msg","payload":{"type":"user_message"}}
 *                {"type":"response_item","payload":{…}}
 *   Generic      {"role":"user"} — the plain chat-log shape
 *
 * A record is classified at most once: a row is either a user turn or a
 * thinking state, never counted as both.
 */

export type RecordKind = "user" | "thinking" | null;

/** Content-block types that mean the agent was working, not just replying. */
const THINKING_BLOCKS = new Set([
  "thinking",
  "redacted_thinking",
  "tool_use",
  "tool-call",
  "toolCall",
  "tool_call",
  "function_call",
]);

function blocksHaveThinking(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((block) => {
    if (!block || typeof block !== "object") return false;
    const type = String((block as Record<string, unknown>).type ?? "");
    return THINKING_BLOCKS.has(type);
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Milliseconds for whichever timestamp field this dialect uses, or null. */
export function recordTimestamp(row: Record<string, unknown>): number | null {
  const candidates = [
    row.timestamp,
    row.created_at,
    row.createdAt,
    row.ts,
    row.time,
    asRecord(row.payload)?.timestamp,
    asRecord(row.message)?.timestamp,
  ];
  for (const raw of candidates) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      // Seconds vs milliseconds: anything below ~2001 in ms is really seconds.
      return raw > 1e12 ? raw : raw * 1000;
    }
    if (typeof raw === "string" && raw.trim()) {
      const ms = Date.parse(raw);
      if (Number.isFinite(ms)) return ms;
    }
  }
  return null;
}

/** Classify one parsed transcript row. Returns null for rows we don't bill on. */
export function classifyRecord(row: Record<string, unknown>): RecordKind {
  const type = String(row.type ?? "");

  // ── Codex CLI ──────────────────────────────────────────────────────────
  if (type === "event_msg") {
    const payloadType = String(asRecord(row.payload)?.type ?? "");
    if (payloadType === "user_message") return "user";
    if (payloadType === "agent_message" || payloadType === "task_started") return "thinking";
    return null;
  }
  if (type === "response_item") {
    const payload = asRecord(row.payload);
    if (!payload) return null;
    const role = String(payload.role ?? "");
    if (role === "user") return "user";
    if (blocksHaveThinking(payload.content)) return "thinking";
    const payloadType = String(payload.type ?? "");
    return THINKING_BLOCKS.has(payloadType) ? "thinking" : null;
  }

  // ── OpenClaw ───────────────────────────────────────────────────────────
  if (type === "message") {
    const message = asRecord(row.message);
    if (!message) return null;
    const role = String(message.role ?? "");
    if (role === "user") return "user";
    if (role === "assistant" && blocksHaveThinking(message.content)) return "thinking";
    if (role === "toolResult") return "thinking";
    return null;
  }

  // ── Claude Code ────────────────────────────────────────────────────────
  if (type === "user") return "user";
  if (type === "assistant") {
    const message = asRecord(row.message);
    return message && blocksHaveThinking(message.content) ? "thinking" : null;
  }

  // ── Generic chat log ───────────────────────────────────────────────────
  const role = String(row.role ?? "");
  if (role === "user") return "user";
  if (role === "assistant" && blocksHaveThinking(row.content)) return "thinking";

  return null;
}
