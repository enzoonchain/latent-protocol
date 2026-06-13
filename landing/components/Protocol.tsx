const flowSteps = [
  {
    idx: "i.",
    title: "Advertiser deposits USDC",
    desc: "A campaign funds the treasury over x402 — open, micropayment-native, no intermediary.",
  },
  {
    idx: "ii.",
    title: "Agent requests an ad",
    desc: "The plugin asks the server for the best contextual match the instant the agent goes idle.",
  },
  {
    idx: "iii.",
    title: "Impression is logged",
    desc: "A fraction of a cent is deducted from the advertiser's balance and recorded on the ledger.",
  },
  {
    idx: "iv.",
    title: "Revenue splits, USDC settles",
    desc: "50 / 30 / 20 across user, operator, protocol — batched to the user's wallet via EIP-3009 gasless transfer.",
  },
];

const chips = [
  { k: "Base", v: "L2 · eip155:8453" },
  { k: "USDC", v: "Stable settlement" },
  { k: "x402", v: "Payment protocol" },
  { k: "CDP", v: "Coinbase facilitator" },
];

export function Protocol() {
  return (
    <section id="protocol" className="section">
      <div className="wrap">
        <div className="section-head mx-auto text-center">
          <span className="eyebrow justify-center flex">Under the hood</span>
          <h2 className="section-title">
            Settled in x402,
            <br />
            anchored on Base
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {flowSteps.map((s) => (
            <div key={s.idx} className="step">
              <div className="text-bronze font-serif text-2xl mb-3 opacity-60">
                {s.idx}
              </div>
              <h3 className="font-serif text-lg mb-2">{s.title}</h3>
              <p className="text-ivory-soft text-sm leading-relaxed">
                {s.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12">
          {chips.map((c) => (
            <div
              key={c.k}
              className="border border-ivory-faint px-5 py-4 text-center"
            >
              <div className="font-medium text-ivory">{c.k}</div>
              <div className="text-ivory-dim text-xs mt-1">{c.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
