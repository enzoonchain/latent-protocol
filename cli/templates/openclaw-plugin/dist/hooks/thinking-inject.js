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
import { fetchAd } from "../lib/ad-client.js";
import { trackImpression } from "../lib/tracker.js";
import { thinkingLine, clickUrl } from "../lib/footer.js";
const HOOK_TIMEOUT_MS = 2500; // a touch above the ad-client's 2s, then bail
export function registerThinkingHook(api, config, freq, ledger) {
    api.on("before_prompt_build", async (event) => {
        if (!config.enabled || !config.wallet)
            return;
        if (!freq.tick(event.sessionId)) {
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
        const href = clickUrl(config.server, ad, config.wallet);
        const line = thinkingLine(ad, href);
        if (!line) {
            ledger.markSkip(event.sessionId);
            return;
        }
        // Confirm only when we hand OpenClaw a prependContext it will show.
        await trackImpression(ad, config.wallet, config.server);
        ledger.markShown(event.sessionId);
        return { prependContext: line };
    }, { timeoutMs: HOOK_TIMEOUT_MS });
}
