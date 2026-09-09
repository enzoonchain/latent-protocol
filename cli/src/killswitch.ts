/**
 * Two client-side safety valves, both fail-safe, both stored in
 * ~/.latent-protocol/health.json:
 *
 *   Killswitch — a remote off-switch. `GET <server>/killswitch` returns
 *   `{ killed: bool, reason?: string }`. Fail-SAFE: an explicit `killed:true`,
 *   OR a check that can't reach the server (timeout / connection refused / 5xx)
 *   both pause every surface — we never serve an ad while we can't confirm we
 *   should. Only a clean `killed:false` (200) or a 404 (endpoint not deployed
 *   yet — transition tolerance) resumes. Checked at most once per TTL. An
 *   explicit kill is honoured for up to an hour past its last check; an
 *   "unreachable" kill for a shorter window, so a brief blip self-heals.
 *
 *   Incident guard — a local circuit breaker. After N consecutive failed
 *   server calls we stop calling the server at all for a cooldown, then try
 *   again. Protects the user's turns from a flapping ad server and the ad
 *   server from a reconnect storm. Resets on the first success.
 *
 * Nothing here throws.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configDir, resolveServer } from "./config.js";

/** Re-check the remote killswitch this often. */
export const KILL_TTL_MS = 5 * 60_000;
/** Honour an EXPLICIT cached kill for this long past its last check, so
 *  pulling the plug still works if the box then goes down. */
export const KILL_STALE_GRACE_MS = 60 * 60_000;
/** Honour an "unreachable" (fail-safe) kill only briefly — a transient blip
 *  should not blank ads for an hour. Re-checked once per TTL regardless. */
export const KILL_SOFT_GRACE_MS = 10 * 60_000;
/** Consecutive server failures that trip the incident guard. */
export const GUARD_TRIP_AFTER = 5;
/** How long the guard stays open once tripped. */
export const GUARD_COOLDOWN_MS = 10 * 60_000;

interface HealthState {
  killCheckedAt?: number;
  killed?: boolean;
  /** "explicit" = server said killed:true; "unreachable" = we couldn't check. */
  killKind?: "explicit" | "unreachable";
  killReason?: string;
  consecutiveFailures?: number;
  guardOpenUntil?: number;
}

function healthFile(): string {
  return join(configDir(), "health.json");
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
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(healthFile(), JSON.stringify(s));
  } catch {
    /* best-effort */
  }
}

export interface ServeDecision {
  ok: boolean;
  reason?: "killswitch" | "incident-backoff";
}

/**
 * Cheap synchronous gate for every surface: may we contact the ad server and
 * show an ad right now? Uses only cached state — `refreshKillswitch` does the
 * network part, separately.
 */
export function shouldServe(now = Date.now(), state: HealthState = load()): ServeDecision {
  if (state.killed && state.killCheckedAt !== undefined) {
    const grace =
      KILL_TTL_MS + (state.killKind === "unreachable" ? KILL_SOFT_GRACE_MS : KILL_STALE_GRACE_MS);
    if (now - state.killCheckedAt < grace) return { ok: false, reason: "killswitch" };
  }
  if (state.guardOpenUntil !== undefined && now < state.guardOpenUntil) {
    return { ok: false, reason: "incident-backoff" };
  }
  return { ok: true };
}

/** Human-readable one-liner for `status` output. */
export function healthSummary(now = Date.now()): string | null {
  const s = load();
  const d = shouldServe(now, s);
  if (d.reason === "killswitch") {
    const what = s.killKind === "unreachable" ? "ad server unreachable" : "killswitch";
    return `paused — ${what}${s.killReason ? `: ${s.killReason}` : ""}`;
  }
  if (d.reason === "incident-backoff") {
    const mins = Math.ceil((s.guardOpenUntil! - now) / 60_000);
    return `paused — ad server unreachable, retrying in ~${mins}m`;
  }
  return null;
}

/**
 * Re-fetch the remote killswitch if the cached value is older than the TTL.
 * Call fire-and-forget from turn-start; it never blocks a turn (2s timeout)
 * and never throws.
 */
export async function refreshKillswitch(
  server: string = resolveServer(),
  now = Date.now(),
): Promise<void> {
  const s = load();
  if (s.killCheckedAt !== undefined && now - s.killCheckedAt < KILL_TTL_MS) return;

  const failSafe = (reason: string): void =>
    save({ ...s, killCheckedAt: now, killed: true, killKind: "unreachable", killReason: reason });

  try {
    const res = await fetch(`${server.replace(/\/+$/, "")}/killswitch`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.status === 404) {
      // Endpoint not deployed yet — don't fail safe on this (transition period).
      save({ ...s, killCheckedAt: now, killed: false, killKind: undefined, killReason: undefined });
      return;
    }
    if (!res.ok) {
      failSafe(`server ${res.status}`);
      return;
    }
    const j = (await res.json()) as { killed?: boolean; reason?: string };
    save({
      ...s,
      killCheckedAt: now,
      killed: Boolean(j.killed),
      killKind: j.killed ? "explicit" : undefined,
      killReason: j.reason,
    });
  } catch {
    // timeout / connection refused / DNS — assume killed, briefly.
    failSafe("server-unreachable");
  }
}

/**
 * Feed the local circuit breaker. Call after every ad-server request with
 * whether it succeeded. A run of `GUARD_TRIP_AFTER` failures opens the guard
 * for `GUARD_COOLDOWN_MS`; any success closes it.
 */
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

/** Test / `uninstall` helper — clear the local health cache. */
export function resetHealth(): void {
  try {
    if (existsSync(healthFile())) writeFileSync(healthFile(), "{}");
  } catch {
    /* best-effort */
  }
}
