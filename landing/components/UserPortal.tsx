"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  fetchEarnings,
  fetchEarningsHistory,
  requestPayout,
  fetchPayouts,
  type Earnings,
  type EarningEvent,
  type Payout,
} from "@/lib/api";

export function UserPortal() {
  const { address, isConnected } = useAccount();
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [history, setHistory] = useState<EarningEvent[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [tab, setTab] = useState<"earnings" | "payouts">("earnings");

  useEffect(() => {
    if (!isConnected || !address) return;
    setLoading(true);
    Promise.all([
      fetchEarnings(address),
      fetchEarningsHistory(address),
      fetchPayouts(address),
    ])
      .then(([e, h, p]) => {
        setEarnings(e);
        setHistory(h);
        setPayouts(p);
      })
      .finally(() => setLoading(false));
  }, [isConnected, address]);

  const handlePayout = async () => {
    if (!address) return;
    setPayoutLoading(true);
    try {
      const result = await requestPayout(address);
      setPayouts((prev) => [result, ...prev]);
      setEarnings((prev) =>
        prev ? { ...prev, balance: 0 } : prev
      );
    } finally {
      setPayoutLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <section id="user" className="section">
        <div className="wrap max-w-2xl mx-auto text-center">
          <span className="eyebrow justify-center flex mb-6">
            For users
          </span>
          <h2 className="section-title text-[clamp(2rem,4vw,3.5rem)]">
            Track your earnings
          </h2>
          <p className="lead mt-4 mx-auto">
            Connect your wallet to see how much you&apos;ve earned from ad
            impressions and request USDC payouts on Base.
          </p>
          <div className="mt-10 flex justify-center">
            <ConnectButton />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="user" className="section">
      <div className="wrap">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <span className="eyebrow">User Dashboard</span>
            <h2 className="section-title text-3xl mt-2">Earnings</h2>
          </div>
          <span className="text-ivory-dim text-sm font-mono">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              ${earnings?.balance.toFixed(2) ?? "0.00"}
            </div>
            <div className="text-ivory-dim text-xs mt-1">Balance</div>
          </div>
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              ${earnings?.totalEarned.toFixed(2) ?? "0.00"}
            </div>
            <div className="text-ivory-dim text-xs mt-1">Total earned</div>
          </div>
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              {earnings?.totalImpressions.toLocaleString() ?? "0"}
            </div>
            <div className="text-ivory-dim text-xs mt-1">Impressions</div>
          </div>
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              {earnings?.totalClicks ?? 0}
            </div>
            <div className="text-ivory-dim text-xs mt-1">Clicks</div>
          </div>
        </div>

        {/* Payout CTA */}
        <div className="border border-bronze p-6 mb-8 bg-bronze/5 flex items-center justify-between">
          <div>
            <div className="font-medium">Ready to cash out?</div>
            <div className="text-ivory-dim text-sm mt-1">
              Minimum payout: $5.00 USDC on Base
            </div>
          </div>
          <button
            onClick={handlePayout}
            disabled={(earnings?.balance ?? 0) < 5 || payoutLoading}
            className="btn text-xs py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {payoutLoading ? "Processing..." : "Request Payout"}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12 text-ivory-dim">Loading...</div>
        )}

        {/* Tabs */}
        {!loading && (
          <>
            <div className="flex gap-1 border-b border-ivory-faint mb-6">
              {(["earnings", "payouts"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-6 py-3 text-sm uppercase tracking-wider transition-colors ${
                    tab === t
                      ? "text-bronze border-b-2 border-bronze"
                      : "text-ivory-dim hover:text-ivory"
                  }`}
                >
                  {t === "earnings" ? "Earning History" : "Payout History"}
                </button>
              ))}
            </div>

            {/* Earnings table */}
            {tab === "earnings" && (
              <div className="border border-ivory-faint overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ivory-faint text-ivory-dim text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((e) => (
                      <tr
                        key={e.id}
                        className="border-b border-ivory-faint last:border-0"
                      >
                        <td className="px-4 py-3 text-ivory-dim">{e.date}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs rounded ${
                              e.kind === "click"
                                ? "bg-bronze/20 text-bronze"
                                : "bg-ivory-faint text-ivory-dim"
                            }`}
                          >
                            {e.kind}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-bronze">
                          +${e.amount.toFixed(4)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`text-xs ${
                              e.paid ? "text-green-400" : "text-ivory-dim"
                            }`}
                          >
                            {e.paid ? "paid" : "pending"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payouts table */}
            {tab === "payouts" && (
              <div className="border border-ivory-faint overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ivory-faint text-ivory-dim text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-left">Tx Hash</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-ivory-faint last:border-0"
                      >
                        <td className="px-4 py-3 text-ivory-dim">{p.date}</td>
                        <td className="px-4 py-3 text-right text-bronze">
                          ${p.amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-ivory-dim">
                          {p.txHash}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs rounded ${
                              p.status === "sent"
                                ? "bg-green-900/50 text-green-400 border border-green-800"
                                : "bg-ivory-faint text-ivory-dim"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
