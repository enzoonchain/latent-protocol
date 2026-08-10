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
}): Promise<Ad | null> {
  const server = (opts.server || resolveServer()).replace(/\/+$/, "");
  try {
    const res = await fetch(`${server}/ad/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_wallet: opts.wallet,
        agent: opts.agent,
        context: opts.context.slice(0, 100),
        surface: opts.surface,
        tags: [],
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
