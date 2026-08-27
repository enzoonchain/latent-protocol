/**
 * Session-start welcome banner — a single sponsored line when a session opens.
 * Independent of the per-turn frequency counter (fires at most once per session).
 */
import type { PluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginConfig } from "../lib/config.js";
export declare function registerSessionHook(api: PluginApi, config: PluginConfig): void;
