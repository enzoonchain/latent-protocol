/**
 * Thinking-state ad injection — the primary, highest-value surface.
 *
 * `before_prompt_build` fires after session load and before prompt submission.
 * Returning `prependContext` puts the sponsor line in front of the user while
 * the agent thinks, without disturbing the conversation flow.
 *
 * We return `prependContext` only (no `enqueueNextTurnInjection`): OpenClaw
 * drains queued injections at the *next* turn's prompt build, so doing both
 * would display the same ad twice across two turns while billing one
 * impression. prependContext shows it exactly once, this turn.
 *
 * Caveats (documented upstream):
 *   - claude-cli provider may not dispatch before_prompt_build (openclaw#65157)
 *   - 2026.4.5 regression: model call could stall after the hook (OpenViking#1283)
 *   - disabled entirely when allowPromptInjection=false
 */
import type { PluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginConfig } from "../lib/config.js";
import { SessionFrequency } from "../lib/footer.js";
import { TurnLedger } from "./turn-ledger.js";
export declare function registerThinkingHook(api: PluginApi, config: PluginConfig, freq: SessionFrequency, ledger: TurnLedger): void;
