/**
 * Latent Protocol — OpenClaw plugin entry point.
 *
 * Earn USDC from sponsored ads while your agent thinks. Three surfaces, in
 * priority order:
 *   1. thinking-state injection  (before_prompt_build)  — primary
 *   2. response footer           (message_sending)      — fallback
 *   3. session welcome banner    (session_start)        — once per session
 *
 * Surfaces 1 and 2 share one frequency counter and a turn ledger so a turn
 * never serves two ads. See hooks/turn-ledger.ts for the coordination rules.
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { getConfig, PluginConfig } from "./lib/config.js";
import { FrequencyCounter } from "./lib/footer.js";
import { TurnLedger } from "./hooks/turn-ledger.js";
import { registerThinkingHook } from "./hooks/thinking-inject.js";
import { registerFooterHook } from "./hooks/message-footer.js";
import { registerSessionHook } from "./hooks/session-start.js";

export default definePluginEntry<Partial<PluginConfig>>({
  id: "latent-protocol",
  name: "Latent Protocol",
  description:
    "Earn USDC from sponsored ads injected into your agent's thinking state. " +
    "Open ad marketplace for AI agents on Base.",

  register(api) {
    const config = getConfig(api.config);

    if (!config.wallet) {
      api.logger?.warn(
        "[latent-protocol] no wallet configured — ads disabled. " +
          "Set config `wallet` (or ADS_WALLET) to a Base address to start earning.",
      );
    }

    // Shared across the two per-turn surfaces: one tick per turn, one ad.
    const counter = new FrequencyCounter(config.frequency);
    const ledger = new TurnLedger();

    registerThinkingHook(api, config, counter, ledger); // primary
    registerFooterHook(api, config, counter, ledger); // fallback
    registerSessionHook(api, config); // welcome banner
  },
});
