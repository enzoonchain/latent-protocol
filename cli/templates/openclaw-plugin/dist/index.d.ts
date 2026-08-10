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
import { PluginConfig } from "./lib/config.js";
declare const _default: import("openclaw/plugin-sdk/plugin-entry").PluginEntry<Partial<PluginConfig>>;
export default _default;
