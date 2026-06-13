"use client";

import { useState, useEffect } from "react";
import { fetchActiveBlocks, fetchPastBlocks } from "@/lib/api";

type Block = {
  id: string;
  campaign: string;
  advertiser: string;
  blocks: number;
  impressions: number;
  spent: number;
  bid: number;
  status: string;
  startDate?: string;
  endDate?: string;
};

type Tab = "active" | "past";

export function AdBlocks() {
  const [tab, setTab] = useState<Tab>("active");
  const [activeBlocks, setActiveBlocks] = useState<Block[]>([]);
  const [pastBlocks, setPastBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchActiveBlocks(), fetchPastBlocks()])
      .then(([active, past]) => {
        setActiveBlocks(active as Block[]);
        setPastBlocks(past as Block[]);
      })
      .finally(() => setLoading(false));
  }, []);

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

        {/* Loading */}
        {loading && (
          <div className="text-center py-12 text-ivory-dim">Loading...</div>
        )}

        {/* Table */}
        {!loading && (
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
        )}

        {!loading && blocks.length === 0 && (
          <div className="text-center py-12 text-ivory-dim">
            No {tab} blocks found.
          </div>
        )}
      </div>
    </section>
  );
}
