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
import { SessionFrequency } from "../lib/footer.js";
import { TurnLedger } from "./turn-ledger.js";
export declare function registerFooterHook(api: PluginApi, config: PluginConfig, freq: SessionFrequency, ledger: TurnLedger): void;
