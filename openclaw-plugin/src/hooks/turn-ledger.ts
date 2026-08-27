/**
 * Per-turn coordination between the thinking-state hook and the footer hook so
 * a single turn never serves two ads (or double-counts the frequency tick).
 *
 *   markShown(s) → thinking-state ad served this turn; footer must skip.
 *   markSkip(s)  → frequency said "not now"; the turn is counted; footer skips.
 *   claim(s)     → footer asks "is this turn mine?"; true only if neither
 *                  mark was set (i.e. before_prompt_build never ran — e.g. the
 *                  claude-cli provider that doesn't dispatch the hook).
 *
 * Entries are one-shot: `claim` consumes the record so the next turn starts
 * clean. Bounded so a long-lived gateway never leaks memory.
 */

const MAX_ENTRIES = 1000;

export class TurnLedger {
  private state = new Map<string, "shown" | "skip">();

  private set(sessionId: string, value: "shown" | "skip"): void {
    if (this.state.size >= MAX_ENTRIES) {
      // drop the oldest insertion (Map preserves insertion order)
      const oldest = this.state.keys().next().value;
      if (oldest !== undefined) this.state.delete(oldest);
    }
    this.state.set(sessionId, value);
  }

  markShown(sessionId: string): void {
    this.set(sessionId, "shown");
  }

  markSkip(sessionId: string): void {
    this.set(sessionId, "skip");
  }

  /** Footer claims the turn iff the thinking hook didn't touch it. */
  claim(sessionId: string): boolean {
    if (this.state.has(sessionId)) {
      this.state.delete(sessionId); // consume — turn owned by thinking hook
      return false;
    }
    return true;
  }
}
