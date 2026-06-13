import { API_BASE } from "./wagmi";

// ── Types ──

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

// ── Mock data (fallback when server is unavailable) ──

const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: "cmp-001",
    name: "DeFi Yield Aggregator",
    totalBudget: 100,
    budgetRemaining: 40,
    status: "active",
    impressions: 12000,
    clicks: 340,
    ctr: 2.83,
    blocksRemaining: 8,
    ads: [
      { id: "ad-1", title: "Earn 12% APY", body: "Stake ETH, earn yields.", bid: 0.005 },
      { id: "ad-2", title: "DeFi Made Simple", body: "One-click yield strategies.", bid: 0.008 },
    ],
  },
  {
    id: "cmp-002",
    name: "NFT Marketplace Launch",
    totalBudget: 50,
    budgetRemaining: 25,
    status: "active",
    impressions: 5000,
    clicks: 120,
    ctr: 2.4,
    blocksRemaining: 5,
    ads: [
      { id: "ad-3", title: "Mint Free NFTs", body: "Zero gas, zero fees.", bid: 0.005 },
    ],
  },
];

const MOCK_EARNINGS: Earnings = {
  balance: 12.45,
  totalEarned: 24.9,
  totalImpressions: 4980,
  totalClicks: 87,
};

const MOCK_HISTORY: EarningEvent[] = [
  { id: "e-1", amount: 0.0025, kind: "impression", paid: false, date: "2026-06-13 14:32" },
  { id: "e-2", amount: 0.125, kind: "click", paid: false, date: "2026-06-13 14:28" },
  { id: "e-3", amount: 0.0025, kind: "impression", paid: false, date: "2026-06-13 14:15" },
  { id: "e-4", amount: 0.0025, kind: "impression", paid: true, date: "2026-06-13 13:50" },
  { id: "e-5", amount: 0.125, kind: "click", paid: true, date: "2026-06-13 13:42" },
];

const MOCK_PAYOUTS: Payout[] = [
  { id: "p-1", amount: 5.0, txHash: "0xabc1...def2", status: "sent", date: "2026-06-12" },
  { id: "p-2", amount: 5.0, txHash: "0x789a...bc34", status: "sent", date: "2026-06-10" },
];

const MOCK_ACTIVE_BLOCKS = [
  { id: "blk-001", campaign: "DeFi Yield Aggregator", advertiser: "0x7a3B...9f2E", blocks: 12, impressions: 12000, spent: 60.0, bid: 0.005, status: "active", startDate: "2026-06-10" },
  { id: "blk-002", campaign: "NFT Marketplace Launch", advertiser: "0x3c1F...8d4A", blocks: 5, impressions: 5000, spent: 25.0, bid: 0.005, status: "active", startDate: "2026-06-12" },
  { id: "blk-003", campaign: "Cross-chain Bridge Promo", advertiser: "0x9e2D...1b7C", blocks: 20, impressions: 20000, spent: 200.0, bid: 0.01, status: "active", startDate: "2026-06-11" },
];

const MOCK_PAST_BLOCKS = [
  { id: "blk-004", campaign: "Wallet Security Audit", advertiser: "0x5f8A...3e1D", blocks: 8, impressions: 8000, spent: 40.0, bid: 0.005, status: "exhausted", endDate: "2026-06-09" },
  { id: "blk-005", campaign: "DAO Governance Tool", advertiser: "0x2b4C...7a9F", blocks: 3, impressions: 3000, spent: 15.0, bid: 0.005, status: "exhausted", endDate: "2026-06-08" },
];

// ── API client ──

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ── Response mappers (backend is snake_case, frontend is camelCase) ──

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

// ── Public functions (with mock fallback) ──

export async function fetchCampaigns(wallet: string): Promise<Campaign[]> {
  try {
    const data = await api<{ campaigns: unknown[] }>(`/campaign/?wallet=${wallet}`);
    return data.campaigns.map(mapCampaign);
  } catch {
    return MOCK_CAMPAIGNS;
  }
}

export async function fetchCampaign(id: string): Promise<Campaign | null> {
  try {
    const data = await api<unknown>(`/campaign/${id}`);
    return mapCampaign(data);
  } catch {
    return MOCK_CAMPAIGNS.find((c) => c.id === id) || null;
  }
}

export async function createCampaign(data: {
  advertiser_wallet: string;
  name: string;
  total_budget: number;
}): Promise<{ campaign_id: string }> {
  try {
    return await api("/campaign/create", {
      method: "POST",
      body: JSON.stringify(data),
    });
  } catch {
    return { campaign_id: `cmp-${Date.now()}` };
  }
}

export async function buyBlocks(
  campaignId: string,
  blocks: number
): Promise<{ cost_usdc: number; impressions_added: number }> {
  try {
    return await api(`/campaign/${campaignId}/buy`, {
      method: "POST",
      body: JSON.stringify({ blocks }),
    });
  } catch {
    return { cost_usdc: blocks * 5, impressions_added: blocks * 1000 };
  }
}

export async function fetchEarnings(wallet: string): Promise<Earnings> {
  try {
    const data = await api<unknown>(`/earnings/${wallet}`);
    return mapEarnings(data);
  } catch {
    return MOCK_EARNINGS;
  }
}

export async function fetchEarningsHistory(wallet: string): Promise<EarningEvent[]> {
  try {
    const data = await api<{ history: unknown[] }>(`/earnings/${wallet}/history`);
    return data.history.map(mapEarningEvent);
  } catch {
    return MOCK_HISTORY;
  }
}

export async function requestPayout(wallet: string): Promise<Payout> {
  try {
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
  } catch {
    return { id: `p-${Date.now()}`, amount: MOCK_EARNINGS.balance, txHash: "pending", status: "pending", date: new Date().toISOString().split("T")[0] };
  }
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
    return MOCK_PAYOUTS;
  }
}

export async function fetchActiveBlocks() {
  try {
    const data = await api<{ campaigns: unknown[] }>("/campaign/");
    return data.campaigns.map(mapCampaign).filter((c) => c.status === "active");
  } catch {
    return MOCK_ACTIVE_BLOCKS;
  }
}

export async function fetchPastBlocks() {
  try {
    const data = await api<{ campaigns: unknown[] }>("/campaign/");
    return data.campaigns.map(mapCampaign).filter((c) => c.status !== "active");
  } catch {
    return MOCK_PAST_BLOCKS;
  }
}
