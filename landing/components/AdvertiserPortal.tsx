"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  fetchCampaigns,
  createCampaign,
  buyBlocks,
  createAd,
  fetchTopBid,
  type Campaign,
  type AdCreatePayload,
} from "@/lib/api";

const EMPTY_AD: AdCreatePayload = {
  title: "",
  body: "",
  cta_url: "",
  cta_text: "Learn more",
  image_url: "",
  bid_per_impression: 0.005,
  category: "general",
};

export function AdvertiserPortal() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { openConnectModal } = useConnectModal();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", budget: "" });
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  // Ad creation state
  const [addAdCampaignId, setAddAdCampaignId] = useState<string | null>(null);
  const [newAd, setNewAd] = useState<AdCreatePayload>(EMPTY_AD);
  const [adSubmitting, setAdSubmitting] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);
  const [topBid, setTopBid] = useState<number | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const MIN_BUDGET = 10;

  const handleCreate = async () => {
    if (!address) return;
    setCreateError(null);

    const name = newCampaign.name.trim();
    const budget = parseFloat(newCampaign.budget);

    if (!name) {
      setCreateError("Campaign name is required.");
      return;
    }
    if (!newCampaign.budget || Number.isNaN(budget)) {
      setCreateError("Enter a budget amount.");
      return;
    }
    if (budget < MIN_BUDGET) {
      setCreateError(`Minimum campaign budget is $${MIN_BUDGET.toFixed(2)} USDC.`);
      return;
    }

    setCreating(true);
    try {
      const result = await createCampaign({
        advertiser_wallet: address,
        name,
        total_budget: budget,
      });
      setCampaigns((prev) => [
        ...prev,
        {
          id: result.campaign_id,
          name,
          totalBudget: budget,
          budgetRemaining: budget,
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
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create campaign.");
    } finally {
      setCreating(false);
    }
  };

  const openAddAd = (campaignId: string) => {
    setAddAdCampaignId(campaignId);
    setNewAd(EMPTY_AD);
    setAdError(null);
    setIconPreview(null);
    fetchTopBid().then(setTopBid);
  };

  const handleIconFile = (file: File) => {
    if (file.size > 500_000) {
      setAdError("Icon must be under 500 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setIconPreview(url);
      setNewAd((p) => ({ ...p, image_url: url }));
    };
    reader.readAsDataURL(file);
  };

  const handleAdSubmit = async () => {
    if (!addAdCampaignId) return;
    if (!newAd.title.trim()) { setAdError("Brand name is required"); return; }
    if (!newAd.body.trim()) { setAdError("One-liner is required"); return; }
    if (!newAd.cta_url.trim()) { setAdError("CTA URL is required"); return; }
    if (newAd.bid_per_impression < 0.001) { setAdError("Minimum bid is $0.001"); return; }
    setAdSubmitting(true);
    setAdError(null);
    try {
      await createAd(addAdCampaignId, newAd);
      if (address) {
        const updated = await fetchCampaigns(address);
        setCampaigns(updated);
      }
      setAddAdCampaignId(null);
    } catch (e) {
      setAdError(e instanceof Error ? e.message : "Failed to create ad");
    } finally {
      setAdSubmitting(false);
    }
  };

  const handleBuyBlocks = async (campaignId: string, blocks: number) => {
    setBuying(campaignId);
    setPayError(null);
    try {
      await buyBlocks(campaignId, blocks, walletClient ?? undefined, address);
      if (address) {
        const updated = await fetchCampaigns(address);
        setCampaigns(updated);
      }
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Payment failed");
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
            <p className="text-ivory-dim text-xs mt-3">
              Minimum budget is $10.00 USDC.
            </p>
            {createError && (
              <p className="text-red-400 text-xs mt-2">{createError}</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="btn text-xs py-2 px-4 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create Campaign"}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setCreateError(null);
                }}
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

        {/* Empty state */}
        {!loading && campaigns.length === 0 && (
          <div className="text-center py-12 text-ivory-dim">
            No campaigns yet. Create your first campaign above.
          </div>
        )}

        {/* Campaign list */}
        {!loading && campaigns.length > 0 && (
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
                    <div className="space-y-2 mb-4">
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
                      {c.ads.length === 0 && (
                        <div className="text-ivory-dim text-xs py-2">
                          No ads yet — add one below.
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBuyBlocks(c.id, 1);
                          }}
                          disabled={buying === c.id}
                          className="btn text-xs py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {buying === c.id ? "Sign payment →" : "Buy 1 Block"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openAddAd(c.id);
                          }}
                          className="btn ghost text-xs py-2 px-4"
                        >
                          Add Ad
                        </button>
                      </div>
                      {payError && selectedCampaign === c.id && (
                        <div className="text-red-400 text-xs mt-1">{payError}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Ad Modal */}
      {addAdCampaignId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setAddAdCampaignId(null)}
        >
          <div
            className="bg-ink border border-bronze w-full max-w-lg p-6 space-y-4 overflow-y-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-xl">Create Ad</h3>

            {/* Brand name */}
            <div>
              <label className="text-ivory-dim text-xs uppercase tracking-wider flex justify-between">
                Brand Name <span>{newAd.title.length}/30</span>
              </label>
              <input
                type="text"
                maxLength={30}
                value={newAd.title}
                onChange={(e) => setNewAd((p) => ({ ...p, title: e.target.value }))}
                placeholder="Acme Corp"
                className="w-full mt-1 px-4 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none"
              />
            </div>

            {/* Brand icon */}
            <div>
              <label className="text-ivory-dim text-xs uppercase tracking-wider">
                Brand Icon (URL or upload PNG/SVG ≤ 500 KB)
              </label>
              <div className="flex gap-2 mt-1 items-center">
                {iconPreview && (
                  <img
                    src={iconPreview}
                    alt="preview"
                    className="w-10 h-10 object-contain border border-ivory-faint flex-shrink-0"
                  />
                )}
                <input
                  type="text"
                  value={newAd.image_url?.startsWith("data:") ? "" : (newAd.image_url ?? "")}
                  onChange={(e) => {
                    setIconPreview(e.target.value || null);
                    setNewAd((p) => ({ ...p, image_url: e.target.value }));
                  }}
                  placeholder="https://example.com/logo.png"
                  className="flex-1 px-4 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="btn ghost text-xs py-2 px-3 flex-shrink-0"
                >
                  Upload
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleIconFile(f);
                  }}
                />
              </div>
            </div>

            {/* One-liner */}
            <div>
              <label className="text-ivory-dim text-xs uppercase tracking-wider flex justify-between">
                One-liner <span>{newAd.body.length}/140</span>
              </label>
              <textarea
                maxLength={140}
                value={newAd.body}
                onChange={(e) => setNewAd((p) => ({ ...p, body: e.target.value }))}
                placeholder="The best product for AI-native workflows."
                rows={2}
                className="w-full mt-1 px-4 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none resize-none"
              />
            </div>

            {/* CTA URL */}
            <div>
              <label className="text-ivory-dim text-xs uppercase tracking-wider">
                CTA URL
              </label>
              <input
                type="url"
                value={newAd.cta_url}
                onChange={(e) => setNewAd((p) => ({ ...p, cta_url: e.target.value }))}
                placeholder="https://acme.com"
                className="w-full mt-1 px-4 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none"
              />
            </div>

            {/* Bid panel */}
            <div>
              <label className="text-ivory-dim text-xs uppercase tracking-wider">
                Bid per Impression (USDC)
              </label>
              <input
                type="number"
                min={0.001}
                step={0.001}
                value={newAd.bid_per_impression}
                onChange={(e) =>
                  setNewAd((p) => ({
                    ...p,
                    bid_per_impression: parseFloat(e.target.value) || 0.001,
                  }))
                }
                className="w-full mt-1 px-4 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none"
              />
              <p className="text-ivory-dim text-xs mt-1">
                {topBid !== null
                  ? `Current highest bid: $${topBid.toFixed(3)}/impression — bid higher to rank #1`
                  : "Loading current top bid…"}
              </p>
            </div>

            {adError && <div className="text-red-400 text-xs">{adError}</div>}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAdSubmit}
                disabled={adSubmitting}
                className="btn text-xs py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adSubmitting ? "Creating…" : "Create Ad"}
              </button>
              <button
                onClick={() => setAddAdCampaignId(null)}
                className="btn ghost text-xs py-2 px-4"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
