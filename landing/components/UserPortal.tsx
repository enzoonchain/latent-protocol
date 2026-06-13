"use client";

import { useState } from "react";

const mockEarnings = {
  balance: 12.45,
  totalEarned: 24.9,
  totalImpressions: 4980,
  totalClicks: 87,
};

const mockHistory = [
  { id: "e-1", amount: 0.0025, kind: "impression", paid: false, date: "2026-06-13 14:32" },
  { id: "e-2", amount: 0.125, kind: "click", paid: false, date: "2026-06-13 14:28" },
  { id: "e-3", amount: 0.0025, kind: "impression", paid: false, date: "2026-06-13 14:15" },
  { id: "e-4", amount: 0.0025, kind: "impression", paid: true, date: "2026-06-13 13:50" },
  { id: "e-5", amount: 0.125, kind: "click", paid: true, date: "2026-06-13 13:42" },
  { id: "e-6", amount: 0.0025, kind: "impression", paid: true, date: "2026-06-13 13:30" },
  { id: "e-7", amount: 5.0, kind: "payout", paid: true, date: "2026-06-12 18:00" },
];

const mockPayouts = [
  { id: "p-1", amount: 5.0, txHash: "0xabc1...def2", status: "sent", date: "2026-06-12" },
  { id: "p-2", amount: 5.0, txHash: "0x789a...bc34", status: "sent", date: "2026-06-10" },
];

function shortenTx(tx: string) {
  return `${tx.slice(0, 6)}...${tx.slice(-4)}`;
}

export function UserPortal() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [tab, setTab] = useState<"earnings" | "payouts">("earnings");

  if (!wallet) {
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
          <button
            onClick={() => setWallet("0x3c1F...8d4A")}
            className="btn mt-10"
          >
            Connect Wallet <span className="arrow">→</span>
          </button>
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
            {shortenTx(wallet)}
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              ${mockEarnings.balance.toFixed(2)}
            </div>
            <div className="text-ivory-dim text-xs mt-1">Balance</div>
          </div>
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              ${mockEarnings.totalEarned.toFixed(2)}
            </div>
            <div className="text-ivory-dim text-xs mt-1">Total earned</div>
          </div>
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              {mockEarnings.totalImpressions.toLocaleString()}
            </div>
            <div className="text-ivory-dim text-xs mt-1">Impressions</div>
          </div>
          <div className="border border-ivory-faint p-4">
            <div className="text-2xl font-serif text-bronze">
              {mockEarnings.totalClicks}
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
            className="btn text-xs py-2 px-4"
            disabled={mockEarnings.balance < 5}
          >
            Request Payout
          </button>
        </div>

        {/* Tabs */}
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
                {mockHistory.map((e) => (
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
                {mockPayouts.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-ivory-faint last:border-0"
                  >
                    <td className="px-4 py-3 text-ivory-dim">{p.date}</td>
                    <td className="px-4 py-3 text-right text-bronze">
                      ${p.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ivory-dim">
                      {shortenTx(p.txHash)}
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
      </div>
    </section>
  );
}
