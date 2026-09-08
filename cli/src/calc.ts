/** Missed-earnings math — mirrors server/tracker.py user share. */
export const USER_SHARE = 0.5;
export const DEFAULT_TOP_BID = 0.005;
export const MAX_IMPRESSIONS_PER_SESSION = 20;
export const MAX_IMPRESSIONS_PER_DAY = 100;

export function userEarningPerImpression(bid: number): number {
  return Math.round(bid * USER_SHARE * 1_000_000) / 1_000_000;
}

/**
 * Apply session + daily caps to raw billable slot counts.
 *
 * The session cap models the live per-session impression limit, but it may
 * only be applied when the scan actually resolved a session count. Scanners
 * that read a flat transcript store can find thousands of turns while being
 * unable to tell where one session ended and the next began; the old code
 * defaulted those to a single session and clamped the estimate to 20 slots —
 * a few cents — no matter how much history existed. When the session count is
 * unknown, fall back to the daily cap alone, which is the limit that actually
 * bounds a day's earnings.
 */
export function applyCaps(
  totalSlots: number,
  sessionCount: number,
  daysScanned: number,
): number {
  if (totalSlots <= 0) return 0;
  const dailyCap = Math.max(daysScanned, 1) * MAX_IMPRESSIONS_PER_DAY;
  if (sessionCount <= 0) return Math.min(totalSlots, dailyCap);
  const perSessionCap = sessionCount * MAX_IMPRESSIONS_PER_SESSION;
  return Math.min(totalSlots, perSessionCap, dailyCap);
}

export function missedUsdEstimate(billableSlots: number, topBid: number): number {
  return Math.round(billableSlots * userEarningPerImpression(topBid) * 100) / 100;
}
