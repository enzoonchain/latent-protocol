/**
 * Impression + click tracking. Best-effort, fail-open — the server is the
 * authority on what is billable, so a dropped report just means no earnings.
 */
import { Ad } from "./ad-client.js";
/** Report a confirmed display. `impression_token` from /ad/request is required. */
export declare function trackImpression(ad: Ad, wallet: string, server: string): Promise<void>;
export declare function trackClick(ad: Ad, wallet: string, server: string): Promise<void>;
