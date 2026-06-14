/**
 * Session-start welcome banner — a single sponsored line when a session opens.
 * Independent of the per-turn frequency counter (fires at most once per session).
 */

import type { PluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginConfig } from "../lib/config.js";
import { fetchAd } from "../lib/ad-client.js";
import { trackImpression } from "../lib/tracker.js";

export function registerSessionHook(api: PluginApi, config: PluginConfig): void {
  api.on(
    "session_start",
    async (event) => {
      if (!config.enabled || !config.wallet) return;

      const ad = await fetchAd({
        wallet: config.wallet,
        context: "session_start",
        surface: "session_banner",
        server: config.server,
      });
      if (!ad) return;

      await trackImpression(ad, config.wallet, config.server);
      const title = ad.title ?? ad.body ?? "a sponsor";
      return { systemMessage: `💡 This session is sponsored by ${title}. ${ad.body ?? ""}`.trim() };
    },
    { timeoutMs: 2500 },
  );
}
