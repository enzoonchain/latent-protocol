import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const DEFAULT_SERVER = "https://api.latentprotocol.xyz";

/**
 * Canonical host-agent identifier for Claude Code.
 *
 * Every surface of one agent must report the same `agent` value, or the ad
 * server sees two unrelated agents and splits targeting and reporting in half.
 * Claude Code has two surfaces — the status line and the turn hooks — so the
 * name lives here rather than as a literal in each of them.
 */
export const AGENT_CLAUDE_CODE = "claude-code";

/** Resolved at call time so HOME overrides (tests / sudo) are respected. */
export function configDir(): string {
  return join(homedir(), ".latent-protocol");
}

export function configFile(): string {
  return join(configDir(), "config.json");
}

export function cacheFile(): string {
  return join(configDir(), "statusline_cache.json");
}

/** @deprecated use configDir() — kept for status output compatibility */
export const CONFIG_DIR = join(homedir(), ".latent-protocol");
/** @deprecated use configFile() */
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
/** @deprecated use cacheFile() */
export const CACHE_FILE = join(CONFIG_DIR, "statusline_cache.json");

export interface LatentConfig {
  wallet?: string;
  enabled?: boolean;
  frequency?: number;
  server?: string;
  min_payout?: number;
  categories?: string;
  /** Cached path to hermes-webui static/ (auto-detected by init). */
  hermes_webui_static?: string;
  /** prelaunch = wallet + scan only; live = ads enabled. */
  mode?: "prelaunch" | "live";
  /** ISO timestamp when POST /prelaunch/register succeeded. */
  prelaunch_registered_at?: string;
}

export function loadConfig(): LatentConfig {
  try {
    return JSON.parse(readFileSync(configFile(), "utf8")) as LatentConfig;
  } catch {
    return {};
  }
}

export function saveConfig(data: Partial<LatentConfig>): LatentConfig {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const next = { ...loadConfig(), ...data };
  writeFileSync(configFile(), JSON.stringify(next, null, 2) + "\n");
  return next;
}

export function resolveServer(cfg: LatentConfig = loadConfig()): string {
  return (cfg.server || process.env.ADS_SERVER || DEFAULT_SERVER).replace(/\/+$/, "");
}

export function resolveWallet(cfg: LatentConfig = loadConfig()): string {
  return cfg.wallet || process.env.ADS_WALLET || "";
}

export function isEnabled(cfg: LatentConfig = loadConfig()): boolean {
  const env = process.env.ADS_ENABLED;
  if (env !== undefined) {
    return !["false", "0", "no"].includes(env.toLowerCase());
  }
  return cfg.enabled !== false;
}
