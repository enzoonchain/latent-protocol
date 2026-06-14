"use client";

import { API_BASE } from "./wagmi";
import { payX402 } from "./x402Client";
import type { WalletClient } from "viem";

export type Campaign = {
  id: string;
  name: string;
  totalBudget: number;
  budgetRemaining: number;
  status: string;
  impressions: number;
  clicks: number;
  ctr: number;
  blocksRemaining: number;
  ads: { id: string; title: string; body: string; bid: number }[];
};

export type Earnings = {
  balance: number;
  totalEarned: number;
  totalImpressions: number;
  totalClicks: number;
};

export type EarningEvent = {
  id: string;
  amount: number;
  kind: string;
  paid: boolean;
  date: string;
};

export type Payout = {
  id: string;
  amount: number;
  txHash: string;
  status: string;
  date: string;
};

// ── API client ──

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    // Surface the FastAPI `detail` message when present, fall back to status.
    let detail = "";
    try {
      const body = await res.json();
      detail =
        typeof body?.detail === "string"
          ? body.detail
          : Array.isArray(body?.detail)
          ? body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ")
          : "";
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail || `API ${res.status}`);
  }
  return res.json();
}

// ── Response mappers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCampaign(c: any): Campaign {
  return {
    id: c.campaign_id ?? c.id ?? "",
    name: c.name,
    totalBudget: c.total_budget ?? c.totalBudget ?? 0,
    budgetRemaining: c.budget_remaining ?? c.budgetRemaining ?? 0,
    status: c.status,
    impressions: c.impressions ?? 0,
    clicks: c.clicks ?? 0,
    ctr: c.ctr ?? 0,
    blocksRemaining: c.blocks_remaining ?? c.blocksRemaining ?? 0,
    ads: (c.ads ?? []).map((a: any) => ({
      id: a.id ?? "",
      title: a.title ?? "",
      body: a.body ?? "",
      bid: a.bid_per_impression ?? a.bid ?? 0,
    })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEarnings(e: any): Earnings {
  return {
    balance: e.balance ?? 0,
    totalEarned: e.total_earned ?? e.totalEarned ?? 0,
    totalImpressions: e.total_impressions ?? e.totalImpressions ?? 0,
    totalClicks: e.total_clicks ?? e.totalClicks ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEarningEvent(e: any): EarningEvent {
  return {
    id: e.id ?? "",
    amount: e.amount ?? 0,
    kind: e.kind ?? "impression",
    paid: e.paid_out ?? e.paid ?? false,
    date: (e.created_at ?? e.date ?? "").replace("T", " ").slice(0, 16),
  };
}

// ── Public API functions ──

export async function fetchCampaigns(wallet: string): Promise<Campaign[]> {
  try {
    const data = await api<{ campaigns: unknown[] }>(`/campaign/?wallet=${wallet}`);
    return data.campaigns.map(mapCampaign);
  } catch {
    return [];
  }
}

export async function fetchCampaign(id: string): Promise<Campaign | null> {
  try {
    const data = await api<unknown>(`/campaign/${id}`);
    return mapCampaign(data);
  } catch {
    return null;
  }
}

export async function createCampaign(data: {
  advertiser_wallet: string;
  name: string;
  total_budget: number;
}): Promise<{ campaign_id: string }> {
  return api("/campaign/create", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function buyBlocks(
  campaignId: string,
  blocks: number,
  walletClient?: WalletClient,
  address?: `0x${string}`
): Promise<{ cost_usdc: number; impressions_added: number }> {
  const body = JSON.stringify({ blocks });
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  const res = await fetch(`${API_BASE}/campaign/${campaignId}/buy`, {
    method: "POST",
    headers,
    body,
  });

  if (res.status === 402) {
    if (!walletClient || !address) throw new Error("Wallet not connected — connect your wallet to buy blocks");
    const paymentHeader = res.headers.get("payment-required") ?? res.headers.get("x-payment-required");
    if (!paymentHeader) throw new Error("Missing payment-required header from server");

    const proof = await payX402(paymentHeader, walletClient, address);

    const res2 = await fetch(`${API_BASE}/campaign/${campaignId}/buy`, {
      method: "POST",
      headers: { ...headers, "X-Payment": proof },
      body,
    });

    if (!res2.ok) {
      const err = await res2.text().catch(() => "");
      throw new Error(`Payment rejected: ${res2.status} ${err}`);
    }
    return res2.json();
  }

  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function fetchEarnings(wallet: string): Promise<Earnings | null> {
  try {
    const data = await api<unknown>(`/earnings/${wallet}`);
    return mapEarnings(data);
  } catch {
    return null;
  }
}

export async function fetchEarningsHistory(wallet: string): Promise<EarningEvent[]> {
  try {
    const data = await api<{ history: unknown[] }>(`/earnings/${wallet}/history`);
    return data.history.map(mapEarningEvent);
  } catch {
    return [];
  }
}

export async function requestPayout(wallet: string): Promise<Payout> {
  const data = await api<{ payout_id: string; amount: number; tx_hash: string; status: string }>(
    "/payout/request",
    { method: "POST", body: JSON.stringify({ wallet_address: wallet }) }
  );
  return {
    id: data.payout_id,
    amount: data.amount,
    txHash: data.tx_hash,
    status: data.status,
    date: new Date().toISOString().split("T")[0],
  };
}

export async function fetchPayouts(wallet: string): Promise<Payout[]> {
  try {
    const data = await api<{ payouts: { payout_id: string; amount: number; tx_hash: string; status: string; created_at: string }[] }>(`/payout/${wallet}`);
    return data.payouts.map((p) => ({
      id: p.payout_id,
      amount: p.amount,
      txHash: p.tx_hash,
      status: p.status,
      date: (p.created_at ?? "").split("T")[0],
    }));
  } catch {
    return [];
  }
}

export async function fetchActiveBlocks() {
  try {
    const data = await api<{ campaigns: unknown[] }>("/campaign/");
    return data.campaigns.map(mapCampaign).filter((c) => c.status === "active");
  } catch {
    return [];
  }
}

export async function fetchPastBlocks() {
  try {
    const data = await api<{ campaigns: unknown[] }>("/campaign/");
    return data.campaigns.map(mapCampaign).filter((c) => c.status !== "active");
  } catch {
    return [];
  }
}

export type AdCreatePayload = {
  title: string;
  body: string;
  cta_url: string;
  cta_text?: string;
  image_url?: string;
  bid_per_impression: number;
  category?: string;
};

export async function createAd(
  campaignId: string,
  data: AdCreatePayload
): Promise<{ ad_id: string }> {
  return api(`/campaign/${campaignId}/ad`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export type LeaderboardEntry = {
  id: string;
  title: string;
  imageUrl: string | null;
  bid: number;
  campaignName: string;
  advertiserWallet: string;
  impressions: number;
  clicks: number;
  rank: number;
};

export async function fetchLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  try {
    const data = await api<{ leaderboard: unknown[] }>(`/ad/leaderboard?limit=${limit}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.leaderboard.map((e: any) => ({
      id: e.id,
      title: e.title,
      imageUrl: e.image_url ?? null,
      bid: e.bid_per_impression,
      campaignName: e.campaign_name,
      advertiserWallet: e.advertiser_wallet,
      impressions: e.impressions,
      clicks: e.clicks,
      rank: e.rank,
    }));
  } catch {
    return [];
  }
}

export async function fetchTopBid(): Promise<number> {
  try {
    const data = await api<{ top_bid: number }>("/ad/top-bid");
    return data.top_bid;
  } catch {
    return 0.005;
  }
}
