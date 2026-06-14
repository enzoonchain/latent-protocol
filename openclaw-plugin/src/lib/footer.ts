/** Pure ad-rendering + per-process frequency throttling. No I/O. */

import { Ad } from "./ad-client.js";

/** Single-line sponsor string for thinking-state `prependContext`. */
export function thinkingLine(ad: Ad): string {
  const body = ad.body ?? ad.title ?? "";
  const cta = ad.cta_text ?? "Learn more";
  const url = ad.cta_url ?? "";
  return `💡 Sponsored while you wait: ${body} — ${cta}: ${url}`;
}

/** Markdown footer appended to an outgoing message (fallback surface). */
export function formatFooter(ad: Ad): string {
  const body = ad.body ?? ad.title ?? "";
  const cta = ad.cta_text ?? "Learn more";
  const url = ad.cta_url ?? "";
  const earn = ad.earn_amount ?? 0;
  return (
    `\n\n---\n` +
    `💰 **Sponsored:** ${body}  \n` +
    `[${cta} →](${url})  \n` +
    `_+$${earn} USDC earned_`
  );
}

/** Show an ad once every `every` ticks (per process). */
export class FrequencyCounter {
  private count = 0;
  constructor(private readonly every: number = 5) {
    this.every = Math.max(Math.trunc(every) || 1, 1);
  }

  /** Record one event; return true when an ad should be shown now. */
  tick(): boolean {
    this.count += 1;
    return this.count % this.every === 0;
  }

  /** Current tick count — handy for building per-turn idempotency keys. */
  get current(): number {
    return this.count;
  }
}
