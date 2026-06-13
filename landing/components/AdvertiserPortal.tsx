"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  fetchCampaigns,
  createCampaign,
  buyBlocks,
  type Campaign,
} from "@/lib/api";

export function AdvertiserPortal() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", budget: "" });
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    setLoading(true);
    fetchCampaigns(address)
      .then(setCampaigns)
      .finally(() => setLoading(false));
  }, [isConnected, address]);

  const active = campaigns.filter((c) => c.status === "active");
  const totalSpent = active.reduce(
    (a, c) => a + (c.totalBudget - c.budgetRemaining),
    0
  );
  const totalImpressions = active.reduce((a, c) => a + c.impressions, 0);
  const totalClicks = active.reduce((a, c) => a + c.clicks, 0);

  const handleCreate = async () => {
    if (!address || !newCampaign.name || !newCampaign.budget) return;
    const result = await createCampaign({
      advertiser_wallet: address,
      name: newCampaign.name,
      total_budget: parseFloat(newCampaign.budget),
    });
    setCampaigns((prev) => [
      ...prev,
      {
        id: result.campaign_id,
        name: newCampaign.name,
        totalBudget: parseFloat(newCampaign.budget),
        budgetRemaining: parseFloat(newCampaign.budget),
        status: "active",
        impressions: 0,
        clicks: 0,
        ctr: 0,
        blocksRemaining: 0,
        ads: [],
      },
    ]);
    setNewCampaign({ name: "", budget: "" });
    setShowCreate(false);
  };

  const handleBuyBlocks = async (campaignId: string, blocks: number) => {
    setBuying(campaignId);
    try {
      await buyBlocks(campaignId, blocks);
      if (address) {
        const updated = await fetchCampaigns(address);
        setCampaigns(updated);
      }
    } finally {
      setBuying(null);
    }
  };

  if (!isConnected) {
    return (
      <section id="advertiser" className="section">
        <div className="wrap max-w-2xl mx-auto text-center">
          <span className="eyebrow justify-center flex mb-6">
            For advertisers
          </span>
          <h2 className="section-title text-[clamp(2rem,4vw,3.5rem)]">
            Fund a campaign
          </h2>
          <p className="lead mt-4 mx-auto">
            Connect your wallet to create campaigns, buy impression blocks, and
            track performance in real-time.
          </p>
          <div className="mt-10">
            <button onClick={openConnectModal} className="btn">
              Connect Wallet <span className="arrow">→</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="advertiser" className="section bg-ink">
      <div className="wrap">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <span className="eyebrow">Advertiser Dashboard</span>
            <h2 className="section-title text-3xl mt-2">Campaigns</h2>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-ivory-dim text-sm font-mono">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="btn text-xs py-2 px-4"
            >
              + New Campaign
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              {campaigns.length}
            </div>
            <div className="text-ivory-dim text-xs mt-1">Campaigns</div>
          </div>
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              ${totalSpent.toFixed(2)}
            </div>
            <div className="text-ivory-dim text-xs mt-1">Total spent</div>
          </div>
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              {totalImpressions.toLocaleString()}
            </div>
            <div className="text-ivory-dim text-xs mt-1">Impressions</div>
          </div>
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              {totalClicks.toLocaleString()}
            </div>
            <div className="text-ivory-dim text-xs mt-1">Clicks</div>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="border border-bronze p-6 mb-8 bg-bronze/5">
            <h3 className="font-serif text-lg mb-4">Create Campaign</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-ivory-dim text-xs uppercase tracking-wider">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) =>
                    setNewCampaign({ ...newCampaign, name: e.target.value })
                  }
                  placeholder="My Campaign"
                  className="w-full mt-1 px-4 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none"
                />
              </div>
              <div>
                <label className="text-ivory-dim text-xs uppercase tracking-wider">
                  Budget (USDC)
                </label>
                <input
                  type="number"
                  value={newCampaign.budget}
                  onChange={(e) =>
                    setNewCampaign({ ...newCampaign, budget: e.target.value })
                  }
                  placeholder="10.00"
                  min="10"
                  className="w-full mt-1 px-4 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleCreate} className="btn text-xs py-2 px-4">
                Create Campaign
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="btn ghost text-xs py-2 px-4"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12 text-ivory-dim">Loading...</div>
        )}

        {/* Campaign list */}
        {!loading && (
          <div className="space-y-4">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className={`border transition-colors cursor-pointer ${
                  selectedCampaign === c.id
                    ? "border-bronze"
                    : "border-ivory-faint hover:border-ivory-dim"
                }`}
                onClick={() =>
                  setSelectedCampaign(
                    selectedCampaign === c.id ? null : c.id
                  )
                }
              >
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        c.status === "active" ? "bg-green-500" : "bg-ivory-dim"
                      }`}
                    />
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-ivory-dim text-xs mt-0.5">
                        {c.blocksRemaining} blocks remaining · {c.ads.length} ads
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-bronze font-serif">
                      ${c.budgetRemaining.toFixed(2)}
                    </div>
                    <div className="text-ivory-dim text-xs">
                      of ${c.totalBudget}
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {selectedCampaign === c.id && (
                  <div className="border-t border-ivory-faint p-4 bg-teal-900/50">
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <div className="text-ivory-dim text-xs">Impressions</div>
                        <div className="text-lg">{c.impressions.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-ivory-dim text-xs">Clicks</div>
                        <div className="text-lg">{c.clicks}</div>
                      </div>
                      <div>
                        <div className="text-ivory-dim text-xs">CTR</div>
                        <div className="text-lg text-bronze">{c.ctr}%</div>
                      </div>
                    </div>

                    <h4 className="text-sm text-ivory-dim uppercase tracking-wider mb-2">
                      Ads
                    </h4>
                    <div className="space-y-2">
                      {c.ads.map((ad) => (
                        <div
                          key={ad.id}
                          className="flex items-center justify-between p-3 border border-ivory-faint"
                        >
                          <div>
                            <div className="font-medium text-sm">{ad.title}</div>
                            <div className="text-ivory-dim text-xs">{ad.body}</div>
                          </div>
                          <div className="text-bronze text-sm">${ad.bid}/imp</div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBuyBlocks(c.id, 1);
                        }}
                        disabled={buying === c.id}
                        className="btn text-xs py-2 px-4"
                      >
                        {buying === c.id ? "Buying..." : "Buy 1 Block"}
                      </button>
                      <button className="btn ghost text-xs py-2 px-4">
                        Add Ad
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
