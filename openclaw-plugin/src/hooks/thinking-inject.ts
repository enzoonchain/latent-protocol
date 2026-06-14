/**
 * Thinking-state ad injection — the primary, highest-value surface.
 *
 * `before_prompt_build` fires after session load and before prompt submission.
 * Returning `prependContext` puts the sponsor line in front of the user while
 * the agent thinks, without disturbing the conversation flow. OpenClaw drains
 * `enqueueNextTurnInjection` queues before this hook, so we use a once-only
 * durable injection (keyed per turn) to survive a model-call regression on
 * some builds and to dedupe across concurrent prompt rebuilds.
 *
 * Caveats (documented upstream):
 *   - claude-cli provider may not dispatch before_prompt_build (openclaw#65157)
 *   - 2026.4.5 regression: model call could stall after the hook (OpenViking#1283)
 *   - disabled entirely when allowPromptInjection=false
 */

import type { PluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginConfig } from "../lib/config.js";
import { fetchAd } from "../lib/ad-client.js";
import { trackImpression } from "../lib/tracker.js";
import { thinkingLine } from "../lib/footer.js";
import { FrequencyCounter } from "../lib/footer.js";
import { TurnLedger } from "./turn-ledger.js";

const HOOK_TIMEOUT_MS = 2500; // a touch above the ad-client's 2s, then bail

export function registerThinkingHook(
  api: PluginApi,
  config: PluginConfig,
  counter: FrequencyCounter,
  ledger: TurnLedger,
): void {
  api.on(
    "before_prompt_build",
    async (event) => {
      if (!config.enabled || !config.wallet) return;

      if (!counter.tick()) {
        ledger.markSkip(event.sessionId); // turn counted; footer must stand down
        return;
      }

      const ad = await fetchAd({
        wallet: config.wallet,
        context: event.userMessage ?? "general",
        surface: "thinking_state",
        server: config.server,
      });
      if (!ad) {
        ledger.markSkip(event.sessionId);
        return;
      }

      await trackImpression(ad, config.wallet, config.server);
      ledger.markShown(event.sessionId);

      const line = thinkingLine(ad);
      // Durable, once-only delivery in case the prompt is rebuilt mid-turn.
      api.enqueueNextTurnInjection({
        sessionId: event.sessionId,
        text: line,
        idempotencyKey: `latent-ad-${event.sessionId}-${counter.current}`,
        ttlMs: 60_000,
      });
      return { prependContext: line };
    },
    { timeoutMs: HOOK_TIMEOUT_MS },
  );
}
