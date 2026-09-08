/**
 * The `spinnerVerbs` surface: put the sponsor line in Claude Code's
 * thinking-shimmer verb slot (`{ mode: "replace", verbs: [text] }` in
 * ~/.claude/settings.json, read by CC >= 2.1.143).
 *
 * Unlike the status line — a `node` script CC re-runs every few seconds — the
 * verb is a static string CC reads at session boot. So the turn-start hook
 * rewrites it with the freshly-fetched ad (a comment-safe minimal edit via
 * json-settings.ts); the new verb shows from the next session on.
 *
 * Every verb we write is prefixed with MARKER so we can recognise our own
 * entry and never clobber a `spinnerVerbs` the user set themselves.
 */
import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseable, readSettings, setPath } from "./json-settings.js";

const MARKER = "✦";

/** Shown until the first turn-start hook replaces it with a real ad. */
export const SPINNER_TAGLINE = `${MARKER} ads by latentprotocol.xyz`;

export function claudeSettingsPath(home = homedir()): string {
  return join(home, ".claude", "settings.json");
}

/** Compact thinking-shimmer verb for an ad body. Verbs are tiny; clip to ~56. */
export function spinnerVerb(adBody: string): string {
  const t = (adBody || "Sponsored").trim().replace(/\s+/g, " ");
  const clipped = t.length > 56 ? `${t.slice(0, 55).trimEnd()}…` : t;
  return `${MARKER} ${clipped}`;
}

export function isOurSpinnerVerbs(v: unknown): boolean {
  const verbs = (v as { verbs?: unknown })?.verbs;
  return (
    Array.isArray(verbs) &&
    verbs.length > 0 &&
    verbs.every((s) => typeof s === "string" && s.startsWith(MARKER))
  );
}

/** Whether we may write here: file exists, parses, and any existing
 *  `spinnerVerbs` is one of ours (never overwrite the user's own verbs). */
function writable(path: string): { raw: string } | null {
  const s = readSettings(path);
  if (s.raw === null || s.unparseable) return null;
  if (s.data && "spinnerVerbs" in s.data && !isOurSpinnerVerbs(s.data.spinnerVerbs)) {
    return null;
  }
  return { raw: s.raw };
}

/** Set `spinnerVerbs` to a single replacement verb. Returns true if the file
 *  was written. No-op (false) when missing, unparseable, user-owned, or
 *  already equal. Never throws. */
export function writeSpinnerVerb(verb: string, path = claudeSettingsPath()): boolean {
  try {
    const w = writable(path);
    if (!w) return false;
    const next = setPath(w.raw, ["spinnerVerbs"], { mode: "replace", verbs: [verb] });
    if (next === w.raw || !parseable(next)) return false;
    writeFileSync(path, next, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Remove our `spinnerVerbs` entry (leaves a user-set one alone). */
export function removeSpinnerVerb(path = claudeSettingsPath()): boolean {
  try {
    if (!existsSync(path)) return false;
    const w = writable(path);
    if (!w) return false;
    const s = readSettings(path);
    if (!s.data || !("spinnerVerbs" in s.data)) return false;
    const next = setPath(w.raw, ["spinnerVerbs"], undefined);
    writeFileSync(path, next, "utf8");
    return true;
  } catch {
    return false;
  }
}
