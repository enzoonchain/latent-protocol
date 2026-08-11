/**
 * Turn-hook runtime — the logic the installed lifecycle hooks invoke.
 *
 *   latent hook <event> --agent <codex|claude-code|mimo> [< payload.json]
 *
 * Events (CodeBacks parity): session-start, turn-start, turn-end, session-end.
 * Flow: at turn-start we classify locally, fetch one ad by category slug, and
 * cache it; at turn-end / session-end we report the on-screen dwell time
 * (displayedMs) as the billable impression. The raw prompt never leaves the
 * machine — only the category slug is sent.
 */
import { cacheFile, configDir, isEnabled, loadConfig, resolveServer, resolveWallet } from "./config.js";
import { logImpression, requestAd, type Ad } from "./api.js";
import { classifyPrompt } from "./classify.js";
import { loadState, saveState, MAX_DISPLAY_MS, type HookState } from "./adcache.js";
import { mkdirSync, writeFileSync } from "node:fs";

export type HookEvent = "session-start" | "turn-start" | "turn-end" | "session-end";
export type HookAgent = "codex" | "claude-code" | "mimo";

/** Plain-text (no ANSI) sponsor line for context-injection hosts. */
export function sponsorLine(ad: Ad): string {
  const body = ad.body || ad.title || "Sponsored";
  const cta = ad.cta_url ? ` — ${ad.cta_url}` : "";
  return `💡 Sponsored: ${body}${cta}`;
}

/** Pull the user's prompt text out of whatever payload shape the host sends. */
function extractPrompt(payload: Record<string, unknown>): string {
  for (const key of ["prompt", "user_message", "message", "input", "text", "context"]) {
    const v = payload[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  // Codex/Claude sometimes nest the latest user turn under a transcript array.
  const t = payload.transcript ?? payload.messages;
  if (Array.isArray(t)) {
    for (let i = t.length - 1; i >= 0; i--) {
      const m = t[i] as { role?: string; content?: unknown };
      if (m && m.role === "user" && typeof m.content === "string") return m.content;
    }
  }
  return "";
}

function extractSessionId(payload: Record<string, unknown>): string {
  for (const key of ["session_id", "sessionId", "conversation_id", "id"]) {
    const v = payload[key];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

/** Mirror the statusLine cache so the Claude Code status line shows this ad. */
function writeStatuslineCache(ad: Ad, sessionId: string): void {
  try {
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(
      cacheFile(),
      JSON.stringify({ ad, fetched_at: Date.now() / 1000, session_id: sessionId }),
    );
  } catch {
    // best-effort
  }
}

/** Accrue on-screen time and report it as one impression. */
async function flushImpression(state: HookState, server: string, wallet: string): Promise<void> {
  if (!state.ad || !state.displayStartedAt) return;
  const shown = Math.min(Date.now() - state.displayStartedAt, MAX_DISPLAY_MS);
  const displayedMs = state.displayedMs + Math.max(shown, 0);
  const adId = state.ad.ad_id || state.ad.id || "";
  if (adId && displayedMs > 0) {
    await logImpression(adId, wallet, state.ad.impression_token || "", server, displayedMs);
  }
  state.displayedMs = 0;
  state.displayStartedAt = 0;
}

/**
 * Run a hook event. Returns the string to print on stdout (host-specific hook
 * output), or "" when nothing should be emitted. Never throws.
 */
export async function runHook(
  event: HookEvent,
  agent: HookAgent,
  payload: Record<string, unknown> = {},
): Promise<string> {
  const cfg = loadConfig();
  if (!isEnabled(cfg)) return "";
  const wallet = resolveWallet(cfg);
  if (!wallet) return "";
  const server = resolveServer(cfg);

  const state = loadState();
  const payloadSession = extractSessionId(payload);

  try {
    switch (event) {
      case "session-start": {
        saveState({
          sessionId: payloadSession || state.sessionId || String(Date.now()),
          category: "",
          ad: null,
          fetchedAt: 0,
          displayStartedAt: 0,
          displayedMs: 0,
        });
        return "";
      }

      case "turn-start": {
        // Report the previous turn's dwell before fetching the next ad.
        await flushImpression(state, server, wallet);

        const prompt = extractPrompt(payload);
        const category = classifyPrompt(prompt);
        const ad = await requestAd({
          wallet,
          context: category, // slug only — no raw prompt leaves the machine
          agent,
          surface: agent === "claude-code" ? "status_line" : "hook",
          server,
        });
        if (!ad) {
          saveState(state);
          return "";
        }
        const next: HookState = {
          sessionId: payloadSession || state.sessionId,
          category,
          ad,
          fetchedAt: Date.now(),
          displayStartedAt: Date.now(),
          displayedMs: 0,
        };
        saveState(next);
        writeStatuslineCache(ad, next.sessionId);

        // Claude Code shows the ad via its statusLine (kept out of the model
        // context). Codex/MiMo have no status line, so we surface the sponsor
        // line through the hook's context channel.
        if (agent === "claude-code") return "";
        return JSON.stringify({ additionalContext: sponsorLine(ad) });
      }

      case "turn-end": {
        await flushImpression(state, server, wallet);
        saveState(state);
        return "";
      }

      case "session-end": {
        await flushImpression(state, server, wallet);
        saveState({
          sessionId: state.sessionId,
          category: "",
          ad: null,
          fetchedAt: 0,
          displayStartedAt: 0,
          displayedMs: 0,
        });
        return "";
      }
    }
  } catch {
    // fail open — never break the host agent's turn
    return "";
  }
  return "";
}
