/**
 * Response-footer ad — fallback surface.
 *
 * Only serves when the thinking-state hook did NOT run for this turn (e.g. the
 * claude-cli provider that doesn't dispatch before_prompt_build). On providers
 * where thinking-state works, `ledger.claim()` returns false here and the
 * footer stays silent so we never double-serve.
 *
 * NOTE: `message_sending` is the assumed outgoing-message hook name; confirm
 * against your OpenClaw build's hook list before relying on the footer path.
 */

import type { PluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginConfig } from "../lib/config.js";
import { fetchAd } from "../lib/ad-client.js";
import { trackImpression } from "../lib/tracker.js";
import { formatFooter, FrequencyCounter } from "../lib/footer.js";
import { TurnLedger } from "./turn-ledger.js";

const HOOK_TIMEOUT_MS = 2500;

export function registerFooterHook(
  api: PluginApi,
  config: PluginConfig,
  counter: FrequencyCounter,
  ledger: TurnLedger,
): void {
  api.on(
    "message_sending",
    async (event) => {
      if (!config.enabled || !config.wallet) return;
      if (!ledger.claim(event.sessionId)) return; // thinking hook owns this turn
      if (!counter.tick()) return;

      const ad = await fetchAd({
        wallet: config.wallet,
        context: event.content ?? "general",
        surface: "response_footer",
        server: config.server,
      });
      if (!ad) return;

      await trackImpression(ad, config.wallet, config.server);
      return { content: event.content + formatFooter(ad) };
    },
    { timeoutMs: HOOK_TIMEOUT_MS },
  );
}
