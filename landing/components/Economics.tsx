const splits = [
  { who: "The user", pct: 50, desc: "Paid out in USDC on Base, batched at a $5 threshold." },
  { who: "The operator", pct: 30, desc: "Whoever runs the agent surface that hosts the inventory." },
  { who: "The protocol", pct: 20, desc: "Treasury that sustains the open marketplace." },
];

const rates = [
  { action: "Impression", pays: "$0.005", gets: "$0.0025" },
  { action: "Premium", pays: "$0.010", gets: "$0.0050" },
  { action: "Click", pays: "$0.150", gets: "$0.0750" },
];

const stats = [
  { big: "~$0.001", lab: "Per impression, settled via x402" },
  { big: "2s", lab: "Finality on Base L2" },
  { big: "0", lab: "Accounts. No KYC, no Google. Wallet only." },
];

export function Economics() {
  return (
    <section id="economics" className="section">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">The split</span>
          <h2 className="section-title">
            Revenue,
            <br />
            fairly divided
          </h2>
          <p className="lead mt-5">
            Advertisers fund a treasury with USDC over x402. Every impression
            deducts a few tenths of a cent and splits instantly across an
            off-chain ledger.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Split bars */}
          <div className="flex flex-col gap-6">
            {splits.map((s) => (
              <div key={s.who}>
                <div className="flex justify-between mb-2">
                  <span className="font-medium">{s.who}</span>
                  <span className="text-bronze font-serif text-2xl">{s.pct}%</span>
                </div>
                <div className="h-2 bg-ivory-faint rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-bronze to-bronze-soft rounded-full transition-all duration-700"
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
                <p className="text-ivory-dim text-sm mt-2">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* Rate table */}
          <div className="border border-ivory-faint">
            <div className="grid grid-cols-3 px-6 py-3 border-b border-ivory-faint text-xs tracking-wider uppercase text-ivory-dim">
              <span>Action</span>
              <span>Advertiser pays</span>
              <span>User gets</span>
            </div>
            {rates.map((r) => (
              <div
                key={r.action}
                className="grid grid-cols-3 px-6 py-4 border-b border-ivory-faint last:border-0"
              >
                <span className="text-ivory">{r.action}</span>
                <span className="text-ivory-soft">{r.pays}</span>
                <span className="text-bronze">{r.gets}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 py-10 border-y border-ivory-faint">
          {stats.map((s) => (
            <div key={s.big} className="text-center">
              <div className="font-serif text-4xl md:text-5xl text-bronze mb-2">
                {s.big}
              </div>
              <div className="text-ivory-dim text-sm">{s.lab}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
