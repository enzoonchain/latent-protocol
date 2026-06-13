"use client";

import { useState } from "react";

const activeBlocks = [
  {
    id: "blk-001",
    campaign: "DeFi Yield Aggregator",
    advertiser: "0x7a3B...9f2E",
    blocks: 12,
    impressions: 12000,
    spent: 60.0,
    bid: 0.005,
    status: "active",
    startDate: "2026-06-10",
  },
  {
    id: "blk-002",
    campaign: "NFT Marketplace Launch",
    advertiser: "0x3c1F...8d4A",
    blocks: 5,
    impressions: 5000,
    spent: 25.0,
    bid: 0.005,
    status: "active",
    startDate: "2026-06-12",
  },
  {
    id: "blk-003",
    campaign: "Cross-chain Bridge Promo",
    advertiser: "0x9e2D...1b7C",
    blocks: 20,
    impressions: 20000,
    spent: 200.0,
    bid: 0.01,
    status: "active",
    startDate: "2026-06-11",
  },
];

const pastBlocks = [
  {
    id: "blk-004",
    campaign: "Wallet Security Audit",
    advertiser: "0x5f8A...3e1D",
    blocks: 8,
    impressions: 8000,
    spent: 40.0,
    bid: 0.005,
    status: "exhausted",
    endDate: "2026-06-09",
  },
  {
    id: "blk-005",
    campaign: "DAO Governance Tool",
    advertiser: "0x2b4C...7a9F",
    blocks: 3,
    impressions: 3000,
    spent: 15.0,
    bid: 0.005,
    status: "exhausted",
    endDate: "2026-06-08",
  },
];

type Tab = "active" | "past";

export function AdBlocks() {
  const [tab, setTab] = useState<Tab>("active");
  const blocks = tab === "active" ? activeBlocks : pastBlocks;

  const totalImpressions = activeBlocks.reduce((a, b) => a + b.impressions, 0);
  const totalSpent = activeBlocks.reduce((a, b) => a + b.spent, 0);

  return (
    <section id="blocks" className="section bg-ink">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Live marketplace</span>
          <h2 className="section-title">
            Active ad
            <br />
            blocks
          </h2>
          <p className="lead mt-5">
            Real campaigns running on the network right now. Every impression
            settles instantly via x402 on Base.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              {activeBlocks.length}
            </div>
            <div className="text-ivory-dim text-xs mt-1">Active campaigns</div>
          </div>
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              {totalImpressions.toLocaleString()}
            </div>
            <div className="text-ivory-dim text-xs mt-1">
              Total impressions
            </div>
          </div>
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              ${totalSpent.toFixed(2)}
            </div>
            <div className="text-ivory-dim text-xs mt-1">Total spent</div>
          </div>
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              ${(totalSpent * 0.5).toFixed(2)}
            </div>
            <div className="text-ivory-dim text-xs mt-1">User earnings</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-ivory-faint mb-6">
          {(["active", "past"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-3 text-sm uppercase tracking-wider transition-colors ${
                tab === t
                  ? "text-bronze border-b-2 border-bronze"
                  : "text-ivory-dim hover:text-ivory"
              }`}
            >
              {t === "active" ? "Active Blocks" : "Past Blocks"}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="border border-ivory-faint overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ivory-faint text-ivory-dim text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Campaign</th>
                <th className="px-4 py-3 text-left">Advertiser</th>
                <th className="px-4 py-3 text-right">Blocks</th>
                <th className="px-4 py-3 text-right">Impressions</th>
                <th className="px-4 py-3 text-right">Bid</th>
                <th className="px-4 py-3 text-right">Spent</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-ivory-faint last:border-0 hover:bg-bronze/5 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{b.campaign}</td>
                  <td className="px-4 py-3 text-ivory-dim font-mono text-xs">
                    {b.advertiser}
                  </td>
                  <td className="px-4 py-3 text-right">{b.blocks}</td>
                  <td className="px-4 py-3 text-right">
                    {b.impressions.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">${b.bid}</td>
                  <td className="px-4 py-3 text-right text-bronze">
                    ${b.spent.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded ${
                        b.status === "active"
                          ? "bg-green-900/50 text-green-400 border border-green-800"
                          : "bg-ivory-faint text-ivory-dim"
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {blocks.length === 0 && (
          <div className="text-center py-12 text-ivory-dim">
            No {tab} blocks found.
          </div>
        )}
      </div>
    </section>
  );
}
