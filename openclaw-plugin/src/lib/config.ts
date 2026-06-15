/**
 * Plugin configuration.
 *
 * OpenClaw validates the user's config against `openclaw.plugin.json`'s
 * `configSchema` and hands the resulting object to the plugin. We merge it with
 * `process.env` fallbacks (handy for local dev / CI) and defaults so a single
 * `getConfig(raw)` call is the only config source the hooks ever touch.
 */

export interface PluginConfig {
  wallet: string;
  enabled: boolean;
  frequency: number;
  server: string;
  minPayout: number;
}

const DEFAULT_SERVER = "https://api.latentprotocol.xyz";

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return !["false", "0", "no"].includes(value.toLowerCase());
}

function envNum(value: string | undefined, fallback: number): number {
  const n = value === undefined ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Merge the SDK-provided config with env fallbacks and defaults. */
export function getConfig(raw: Partial<PluginConfig> = {}): PluginConfig {
  return {
    wallet: raw.wallet ?? process.env.ADS_WALLET ?? "",
    enabled: raw.enabled ?? envBool(process.env.ADS_ENABLED, true),
    frequency: raw.frequency ?? envNum(process.env.ADS_FREQUENCY, 5),
    server: (raw.server ?? process.env.ADS_SERVER ?? DEFAULT_SERVER).replace(/\/+$/, ""),
    minPayout: raw.minPayout ?? envNum(process.env.ADS_MIN_PAYOUT, 5.0),
  };
}
