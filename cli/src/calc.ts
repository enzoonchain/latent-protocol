/** Missed-earnings math — mirrors server/tracker.py user share. */
export const USER_SHARE = 0.5;
export const DEFAULT_TOP_BID = 0.005;
export const MAX_IMPRESSIONS_PER_SESSION = 20;
export const MAX_IMPRESSIONS_PER_DAY = 100;

export function userEarningPerImpression(bid: number): number {
  return Math.round(bid * USER_SHARE * 1_000_000) / 1_000_000;
}

/** Apply session + daily caps to raw billable slot counts. */
export function applyCaps(
  totalSlots: number,
  sessionCount: number,
  daysScanned: number,
): number {
  if (totalSlots <= 0) return 0;
  const sessions = Math.max(sessionCount, 1);
  const perSessionCap = sessions * MAX_IMPRESSIONS_PER_SESSION;
  const dailyCap = Math.max(daysScanned, 1) * MAX_IMPRESSIONS_PER_DAY;
  return Math.min(totalSlots, perSessionCap, dailyCap);
}

export function missedUsdEstimate(billableSlots: number, topBid: number): number {
  return Math.round(billableSlots * userEarningPerImpression(topBid) * 100) / 100;
}
