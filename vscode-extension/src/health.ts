/**
 * Killswitch + incident-guard state, shared with the CLI via
 * ~/.latent-protocol/health.json.
 *
 * The CLI's turn hooks own writes to this file; the extension reads it and,
 * when it is the only surface installed (no CLI hooks running), refreshes the
 * remote killswitch itself. Fail-safe: unreachable ⇒ not killed, but a cached
 * kill is honoured for a bounded window.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KILL_TTL_MS = 5 * 60_000;
const KILL_STALE_GRACE_MS = 60 * 60_000;
const GUARD_TRIP_AFTER = 5;
const GUARD_COOLDOWN_MS = 10 * 60_000;

interface HealthState {
  killCheckedAt?: number;
  killed?: boolean;
  killReason?: string;
  consecutiveFailures?: number;
  guardOpenUntil?: number;
}

function healthFile(): string {
  return join(homedir(), ".latent-protocol", "health.json");
}

function load(): HealthState {
  try {
    return JSON.parse(readFileSync(healthFile(), "utf8")) as HealthState;
  } catch {
    return {};
  }
}

function save(s: HealthState): void {
  try {
    mkdirSync(join(homedir(), ".latent-protocol"), { recursive: true });
    writeFileSync(healthFile(), JSON.stringify(s));
  } catch {
    /* best-effort */
  }
}

export interface ServeDecision {
  ok: boolean;
  reason?: "killswitch" | "incident-backoff";
}

export function shouldServe(now = Date.now(), state: HealthState = load()): ServeDecision {
  if (
    state.killed &&
    state.killCheckedAt !== undefined &&
    now - state.killCheckedAt < KILL_TTL_MS + KILL_STALE_GRACE_MS
  ) {
    return { ok: false, reason: "killswitch" };
  }
  if (state.guardOpenUntil !== undefined && now < state.guardOpenUntil) {
    return { ok: false, reason: "incident-backoff" };
  }
  return { ok: true };
}

export async function refreshKillswitch(server: string, now = Date.now()): Promise<void> {
  const s = load();
  if (s.killCheckedAt !== undefined && now - s.killCheckedAt < KILL_TTL_MS) return;
  try {
    const res = await fetch(`${server.replace(/\/+$/, "")}/killswitch`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.status === 404) {
      save({ ...s, killCheckedAt: now, killed: false, killReason: undefined });
      return;
    }
    if (!res.ok) return;
    const j = (await res.json()) as { killed?: boolean; reason?: string };
    save({ ...s, killCheckedAt: now, killed: Boolean(j.killed), killReason: j.reason });
  } catch {
    /* keep prior cached state */
  }
}

export function recordServerResult(ok: boolean, now = Date.now()): void {
  const s = load();
  if (ok) {
    if (s.consecutiveFailures || s.guardOpenUntil !== undefined) {
      save({ ...s, consecutiveFailures: 0, guardOpenUntil: undefined });
    }
    return;
  }
  const n = (s.consecutiveFailures ?? 0) + 1;
  const next: HealthState = { ...s, consecutiveFailures: n };
  if (n >= GUARD_TRIP_AFTER) next.guardOpenUntil = now + GUARD_COOLDOWN_MS;
  save(next);
}
