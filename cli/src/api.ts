import { resolveServer, resolveWallet } from "./config.js";

export interface Ad {
  ad_id: string;
  id?: string;
  title?: string;
  body?: string;
  cta_text?: string;
  cta_url?: string;
  earn_amount?: number;
  impression_token?: string;
}

export async function requestAd(opts: {
  wallet: string;
  context: string;
  agent: string;
  surface: string;
  server?: string;
  sessionId?: string;
}): Promise<Ad | null> {
  const server = (opts.server || resolveServer()).replace(/\/+$/, "");
  try {
    const res = await fetch(`${server}/ad/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_wallet: opts.wallet,
        agent: opts.agent,
        // CodeBacks parity: category slug is the targeting signal; raw prompt
        // never leaves the machine. sessionId scopes rotation/frequency.
        context: opts.context.slice(0, 100),
        surface: opts.surface,
        tags: opts.context ? [opts.context] : [],
        ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
      }),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Ad;
  } catch {
    return null;
  }
}

export async function logImpression(
  adId: string,
  wallet: string,
  token: string,
  server?: string,
  displayedMs?: number,
): Promise<void> {
  const base = (server || resolveServer()).replace(/\/+$/, "");
  try {
    await fetch(`${base}/ad/impression`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ad_id: adId,
        user_wallet: wallet,
        token: token || "",
        // CodeBacks-style dwell reporting; server may ignore if unsupported.
        ...(typeof displayedMs === "number" ? { displayed_ms: Math.round(displayedMs) } : {}),
      }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // best effort
  }
}

export async function getBalance(wallet?: string, server?: string): Promise<number> {
  const w = wallet || resolveWallet();
  if (!w) return 0;
  const base = (server || resolveServer()).replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/earnings/${w}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { balance?: number };
    return Number(data.balance ?? 0);
  } catch {
    return 0;
  }
}

export async function getTopBid(server?: string): Promise<number | null> {
  const base = (server || resolveServer()).replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/ad/top-bid`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { top_bid?: number };
    return Number(data.top_bid ?? 0);
  } catch {
    return null;
  }
}

export interface PrelaunchMetrics {
  scan_version: string;
  days_scanned: number;
  billable_slots: number;
  missed_usd_estimate: number;
  top_bid: number;
  per_agent: Array<{
    agent: string;
    sessions: number;
    user_turns: number;
    thinking_states: number;
    billable_slots: number;
  }>;
}

export async function registerPrelaunch(opts: {
  wallet: string;
  agents: string[];
  metrics: PrelaunchMetrics;
  server?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const base = (opts.server || resolveServer()).replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/prelaunch/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: opts.wallet,
        agents: opts.agents,
        metrics: opts.metrics,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: text || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
