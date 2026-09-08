/**
 * Finding and counting transcript files on disk.
 *
 * Two things the previous scanner got wrong are fixed here:
 *
 * 1. It matched `*.jsonl` only. OpenClaw archives a session to
 *    `<name>.jsonl.reset.<ISO>Z` on `/new` and to `.jsonl.deleted.<ISO>Z` on
 *    delete, and those transcripts stay on disk and stay real history. A bare
 *    `.jsonl` glob silently drops every conversation the user has ever reset.
 *
 * 2. It gated whole files on mtime. A file's modification time says when it
 *    was last appended to, not when its turns happened, so a rotated file
 *    counted zero even when its contents fall inside the window. Files are
 *    now read whenever they *could* overlap the window, and each row is
 *    filtered on its own timestamp.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { classifyRecord, recordTimestamp } from "./records.js";

export interface TranscriptCounts {
  sessions: number;
  userTurns: number;
  thinkingStates: number;
}

export function emptyCounts(): TranscriptCounts {
  return { sessions: 0, userTurns: 0, thinkingStates: 0 };
}

export function addCounts(a: TranscriptCounts, b: TranscriptCounts): TranscriptCounts {
  return {
    sessions: a.sessions + b.sessions,
    userTurns: a.userTurns + b.userTurns,
    thinkingStates: a.thinkingStates + b.thinkingStates,
  };
}

/** True for any line-delimited transcript, including archived/deleted ones. */
export function isTranscriptFile(name: string): boolean {
  if (name.endsWith(".jsonl") || name.endsWith(".ndjson")) return true;
  // OpenClaw: "<session>.jsonl.reset.2026-09-01T10-00-00Z" / ".jsonl.deleted.…"
  return /\.jsonl\.(reset|deleted)\./.test(name);
}

/** Count one transcript file, filtering rows by their own timestamp. */
export function countTranscriptFile(path: string, cutoffMs: number): TranscriptCounts {
  const out = emptyCounts();
  let sawRow = false;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return out;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== "{") continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    const ts = recordTimestamp(row);
    if (ts !== null && ts < cutoffMs) continue;

    const kind = classifyRecord(row);
    if (kind === "user") {
      out.userTurns += 1;
      sawRow = true;
    } else if (kind === "thinking") {
      out.thinkingStates += 1;
      sawRow = true;
    }
  }

  if (sawRow) out.sessions = 1;
  return out;
}

/**
 * Walk a directory tree and count every transcript in it.
 *
 * `maxDepth` is generous because agents nest deeply — Codex buckets sessions
 * as sessions/YYYY/MM/DD/, OpenClaw as agents/<id>/sessions/.
 */
export function countTranscriptTree(
  root: string,
  cutoffMs: number,
  depth = 0,
  maxDepth = 10,
): TranscriptCounts {
  let total = emptyCounts();
  if (depth > maxDepth) return total;

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
      total = addCounts(total, countTranscriptTree(path, cutoffMs, depth + 1, maxDepth));
    } else if (isTranscriptFile(name)) {
      total = addCounts(total, countTranscriptFile(path, cutoffMs));
    }
  }

  return total;
}

/** List immediate subdirectory names, or [] when the path isn't readable. */
export function subdirectories(root: string): string[] {
  try {
    return readdirSync(root).filter((name) => {
      try {
        return statSync(join(root, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}
