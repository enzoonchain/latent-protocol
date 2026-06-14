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
} from "@/lib/api";

const DEFAULT_BLOCK_BID = 5.0; // $5.00 per block (= $0.005 per impression)

type LaunchForm = {
  title: string;
  body: string;
  cta_url: string;
  cta_text: string;
  image_url: string;
  blockBid: string; // USD per block (user-facing); divided by 1000 = bid_per_impression
};

const EMPTY_LAUNCH: LaunchForm = {
  title: "",
  body: "",
  cta_url: "",
  cta_text: "Learn more",
  image_url: "",
  blockBid: String(DEFAULT_BLOCK_BID),
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

  // Combined "Launch Ad" modal state
  const [launchCampaignId, setLaunchCampaignId] = useState<string | null>(null);
  const [launchForm, setLaunchForm] = useState<LaunchForm>(EMPTY_LAUNCH);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [topBidPerBlock, setTopBidPerBlock] = useState<number | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [buying, setBuying] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

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

  const MIN_BUDGET = 1;

  const handleCreate = async () => {
    if (!address) return;
    setCreateError(null);
    const name = newCampaign.name.trim();
    const budget = parseFloat(newCampaign.budget);
    if (!name) { setCreateError("Campaign name is required."); return; }
    if (!newCampaign.budget || Number.isNaN(budget)) { setCreateError("Enter a budget amount."); return; }
    if (budget < MIN_BUDGET) { setCreateError(`Minimum campaign budget is $${MIN_BUDGET.toFixed(2)} USDC.`); return; }
    setCreating(true);
    try {
      const result = await createCampaign({ advertiser_wallet: address, name, total_budget: budget });
      setCampaigns((prev) => [
        ...prev,
        {
          id: result.campaign_id, name, totalBudget: budget, budgetRemaining: budget,
          status: "active", impressions: 0, clicks: 0, ctr: 0,
          blocksRemaining: 0, minBid: 0.005, blockCostUsdc: 5.0, ads: [],
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

  const openLaunch = (campaignId: string) => {
    setLaunchCampaignId(campaignId);
    setLaunchForm(EMPTY_LAUNCH);
    setLaunchError(null);
    setIconPreview(null);
    fetchTopBid().then((bid) => setTopBidPerBlock(bid * 1000));
  };

  const handleIconFile = (file: File) => {
    setLaunchError(null);
    if (file.size > 10_000_000) { setLaunchError("Image must be under 10 MB"); return; }

    const useAsIs = () => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        setIconPreview(url);
        setLaunchForm((p) => ({ ...p, image_url: url }));
      };
      reader.readAsDataURL(file);
    };

    if (file.type === "image/svg+xml" || file.size <= 100_000) { useAsIs(); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.onload = () => {
        const MAX_DIM = 256;
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { useAsIs(); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL("image/png");
        setIconPreview(out);
        setLaunchForm((p) => ({ ...p, image_url: out }));
      };
      img.onerror = () => setLaunchError("Could not load that image — try another file");
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleLaunch = async () => {
    if (!launchCampaignId) return;
    const blockBid = parseFloat(launchForm.blockBid);
    if (!launchForm.title.trim()) { setLaunchError("Brand name is required"); return; }
    if (!launchForm.body.trim()) { setLaunchError("One-liner is required"); return; }
    if (!launchForm.cta_url.trim()) { setLaunchError("CTA URL is required"); return; }
    if (isNaN(blockBid) || blockBid <= 0) { setLaunchError("Enter a valid bid per block"); return; }

    const bidPerImpression = blockBid / 1000;
    setLaunching(true);
    setLaunchError(null);
    try {
      // 1. Buy the block (x402 payment, bid override from form)
      await buyBlocks(launchCampaignId, 1, walletClient ?? undefined, address, bidPerImpression);
      // 2. Create the ad after payment confirmed
      await createAd(launchCampaignId, {
        title: launchForm.title,
        body: launchForm.body,
        cta_url: launchForm.cta_url,
        cta_text: launchForm.cta_text || "Learn more",
        image_url: launchForm.image_url || undefined,
        bid_per_impression: bidPerImpression,
        category: "general",
      });
      if (address) {
        const updated = await fetchCampaigns(address);
        setCampaigns(updated);
      }
      setLaunchCampaignId(null);
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  };

  // Buy more blocks for a campaign that already has ads (no ad creation needed)
  const handleBuyMore = async (campaignId: string) => {
    setBuying(campaignId);
    setPayError(null);
    try {
      await buyBlocks(campaignId, 1, walletClient ?? undefined, address);
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
          <span className="eyebrow justify-center flex mb-6">For advertisers</span>
          <h2 className="section-title text-[clamp(2rem,4vw,3.5rem)]">Fund a campaign</h2>
          <p className="lead mt-4 mx-auto">
            Connect your wallet to create campaigns, buy impression blocks, and track performance in real-time.
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
            <button onClick={() => setShowCreate(!showCreate)} className="btn text-xs py-2 px-4">
              + New Campaign
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Campaigns", value: campaigns.length },
            { label: "Total spent", value: `$${totalSpent.toFixed(2)}` },
            { label: "Impressions", value: totalImpressions.toLocaleString() },
            { label: "Clicks", value: totalClicks.toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label} className="border border-ivory-faint p-4">
              <div className="text-2xl font-serif text-bronze">{value}</div>
              <div className="text-ivory-dim text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Create campaign form */}
        {showCreate && (
          <div className="border border-bronze p-6 mb-8 bg-bronze/5">
            <h3 className="font-serif text-lg mb-4">Create Campaign</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-ivory-dim text-xs uppercase tracking-wider">Campaign Name</label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  placeholder="My Campaign"
                  className="w-full mt-1 px-4 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none"
                />
              </div>
              <div>
                <label className="text-ivory-dim text-xs uppercase tracking-wider">Budget (USDC)</label>
                <input
                  type="number"
                  value={newCampaign.budget}
                  onChange={(e) => setNewCampaign({ ...newCampaign, budget: e.target.value })}
                  placeholder="10.00"
                  min="1"
                  className="w-full mt-1 px-4 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none"
                />
              </div>
            </div>
            <p className="text-ivory-dim text-xs mt-3">Minimum budget is $1.00 USDC.</p>
            {createError && <p className="text-red-400 text-xs mt-2">{createError}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={handleCreate} disabled={creating} className="btn text-xs py-2 px-4 disabled:opacity-50">
                {creating ? "Creating…" : "Create Campaign"}
              </button>
              <button onClick={() => { setShowCreate(false); setCreateError(null); }} className="btn ghost text-xs py-2 px-4">
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading && <div className="text-center py-12 text-ivory-dim">Loading...</div>}
        {!loading && campaigns.length === 0 && (
          <div className="text-center py-12 text-ivory-dim">No campaigns yet. Create your first campaign above.</div>
        )}

        {/* Campaign list */}
        {!loading && campaigns.length > 0 && (
          <div className="space-y-4">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className={`border transition-colors cursor-pointer ${
                  selectedCampaign === c.id ? "border-bronze" : "border-ivory-faint hover:border-ivory-dim"
                }`}
                onClick={() => setSelectedCampaign(selectedCampaign === c.id ? null : c.id)}
              >
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className={`w-2 h-2 rounded-full ${c.status === "active" ? "bg-green-500" : "bg-ivory-dim"}`} />
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-ivory-dim text-xs mt-0.5">
                        {c.blocksRemaining} blocks remaining · {c.ads.length} ad{c.ads.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-bronze font-serif">${c.budgetRemaining.toFixed(2)}</div>
                    <div className="text-ivory-dim text-xs">of ${c.totalBudget}</div>
                  </div>
                </div>

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

                    {c.ads.length > 0 && (
                      <>
                        <h4 className="text-sm text-ivory-dim uppercase tracking-wider mb-2">Ads</h4>
                        <div className="space-y-2 mb-4">
                          {c.ads.map((ad) => (
                            <div key={ad.id} className="flex items-center justify-between p-3 border border-ivory-faint">
                              <div>
                                <div className="font-medium text-sm">{ad.title}</div>
                                <div className="text-ivory-dim text-xs">{ad.body}</div>
                              </div>
                              <div className="text-bronze text-sm">${(ad.bid * 1000).toFixed(2)}/block</div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    <div className="flex flex-col gap-2">
                      <div className="flex gap-3">
                        {c.ads.length === 0 ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); openLaunch(c.id); }}
                            className="btn text-xs py-2 px-4"
                          >
                            Launch Ad →
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleBuyMore(c.id); }}
                            disabled={buying === c.id}
                            className="btn text-xs py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {buying === c.id ? "Sign payment →" : `Buy 1 More Block ($${c.blockCostUsdc.toFixed(2)})`}
                          </button>
                        )}
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

      {/* Launch Ad Modal */}
      {launchCampaignId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !launching && setLaunchCampaignId(null)}
        >
          <div
            className="bg-ink border border-bronze w-full max-w-lg p-6 space-y-4 overflow-y-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-xl">Launch Ad</h3>
            <p className="text-ivory-dim text-xs">
              Fill in your ad creative and bid. Payment is collected via x402 — your wallet will prompt you to sign.
            </p>

            {/* Brand name */}
            <div>
              <label className="text-ivory-dim text-xs uppercase tracking-wider flex justify-between">
                Brand Name <span>{launchForm.title.length}/30</span>
              </label>
              <input
                type="text"
                maxLength={30}
                value={launchForm.title}
                onChange={(e) => setLaunchForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Acme Corp"
                className="w-full mt-1 px-4 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none"
              />
            </div>

            {/* Brand icon */}
            <div>
              <label className="text-ivory-dim text-xs uppercase tracking-wider">
                Brand Icon (URL or upload — auto-resized, ≤ 10 MB)
              </label>
              <div className="flex gap-2 mt-1 items-center">
                {iconPreview && (
                  <img src={iconPreview} alt="preview" className="w-10 h-10 object-contain border border-ivory-faint flex-shrink-0" />
                )}
                <input
                  type="text"
                  value={launchForm.image_url.startsWith("data:") ? "" : launchForm.image_url}
                  onChange={(e) => {
                    setIconPreview(e.target.value || null);
                    setLaunchForm((p) => ({ ...p, image_url: e.target.value }));
                  }}
                  placeholder="https://example.com/logo.png"
                  className="flex-1 px-4 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none"
                />
                <button type="button" onClick={() => fileRef.current?.click()} className="btn ghost text-xs py-2 px-3 flex-shrink-0">
                  Upload
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIconFile(f); }}
                />
              </div>
            </div>

            {/* One-liner */}
            <div>
              <label className="text-ivory-dim text-xs uppercase tracking-wider flex justify-between">
                One-liner <span>{launchForm.body.length}/140</span>
              </label>
              <textarea
                maxLength={140}
                value={launchForm.body}
                onChange={(e) => setLaunchForm((p) => ({ ...p, body: e.target.value }))}
                placeholder="The best product for AI-native workflows."
                rows={2}
                className="w-full mt-1 px-4 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none resize-none"
              />
            </div>

            {/* CTA URL */}
            <div>
              <label className="text-ivory-dim text-xs uppercase tracking-wider">CTA URL</label>
              <input
                type="url"
                value={launchForm.cta_url}
                onChange={(e) => setLaunchForm((p) => ({ ...p, cta_url: e.target.value }))}
                placeholder="https://acme.com"
                className="w-full mt-1 px-4 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none"
              />
            </div>

            {/* Bid per block */}
            <div className="border border-ivory-faint p-4 bg-teal-900/30">
              <label className="text-ivory-dim text-xs uppercase tracking-wider">
                Your bid (USDC per block of 1,000 impressions)
              </label>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-ivory-dim text-sm">$</span>
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  value={launchForm.blockBid}
                  onChange={(e) => setLaunchForm((p) => ({ ...p, blockBid: e.target.value }))}
                  className="w-32 px-3 py-2 bg-teal-900 border border-ivory-faint text-ivory text-sm focus:border-bronze outline-none"
                />
                <span className="text-ivory-dim text-xs">= ${(parseFloat(launchForm.blockBid || "0") / 1000).toFixed(4)}/impression</span>
              </div>
              <p className="text-ivory-dim text-xs mt-2">
                {topBidPerBlock !== null
                  ? `Current top bid: $${topBidPerBlock.toFixed(2)}/block — bid higher to rank #1`
                  : "Loading current top bid…"}
              </p>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between border-t border-ivory-faint pt-4">
              <span className="text-ivory-dim text-sm">Total payment</span>
              <span className="text-bronze font-serif text-lg">
                ${parseFloat(launchForm.blockBid || "0").toFixed(2)} USDC
              </span>
            </div>

            {launchError && <div className="text-red-400 text-xs">{launchError}</div>}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleLaunch}
                disabled={launching}
                className="btn text-xs py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {launching ? "Signing…" : "Sign & Pay →"}
              </button>
              <button
                onClick={() => setLaunchCampaignId(null)}
                disabled={launching}
                className="btn ghost text-xs py-2 px-4 disabled:opacity-50"
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
