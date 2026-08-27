/**
 * Hook session state: the ad currently being shown, when it was fetched, and
 * how long it has been on screen. Mirrors CodeBacks' turn-based model — a
 * sponsor line is fetched at turn-start, rotated on a fixed cadence, and its
 * on-screen dwell time (displayedMs) is reported at turn-end for payout.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "./config.js";
import type { Ad } from "./api.js";
import type { Category } from "./classify.js";

/** Rotate the shown ad every 10s (CodeBacks parity). */
export const ROTATE_MS = 10_000;
/** Stop billing a single fetched ad after 10 minutes on screen. */
export const MAX_DISPLAY_MS = 600_000;

export interface HookState {
  sessionId: string;
  category: Category | "";
  ad: Ad | null;
  /** epoch ms when the ad was fetched from the server */
  fetchedAt: number;
  /** epoch ms when the current on-screen span started (0 = not shown) */
  displayStartedAt: number;
  /** accumulated on-screen time not yet reported */
  displayedMs: number;
}

function stateFile(): string {
  return join(configDir(), "hook-state.json");
}

export function loadState(): HookState {
  try {
    return JSON.parse(readFileSync(stateFile(), "utf8")) as HookState;
  } catch {
    return {
      sessionId: "",
      category: "",
      ad: null,
      fetchedAt: 0,
      displayStartedAt: 0,
      displayedMs: 0,
    };
  }
}

export function saveState(s: HookState): void {
  try {
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(stateFile(), JSON.stringify(s));
  } catch {
    // best-effort; hooks must never throw into the host agent
  }
}

/** True when the cached ad is still within its rotation + max-dwell window. */
export function isFresh(s: HookState, now = Date.now()): boolean {
  if (!s.ad) return false;
  const age = now - s.fetchedAt;
  return age < ROTATE_MS && age < MAX_DISPLAY_MS;
}
