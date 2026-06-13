const steps = [
  {
    num: "01",
    title: "The agent waits",
    desc: "Hermes, Claude Code, a Telegram bot — every turn has 3–10s of dead time waiting on an LLM or a tool call.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="w-6 h-6">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Latent fetches an ad",
    desc: "The plugin requests a contextual recommendation from the marketplace and matches it to the moment.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="w-6 h-6">
        <path d="M4 12h16M14 6l6 6-6 6" />
        <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "It's shown, tastefully",
    desc: "A single sponsored line in the thinking state, response footer, or CLI banner. No takeover. No spinner waste.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="w-6 h-6">
        <rect x="3" y="5" width="18" height="14" rx="1.5" />
        <path d="M3 9h18M7 14h7" />
      </svg>
    ),
  },
  {
    num: "04",
    title: "The user earns",
    desc: "Half of every impression and click flows back to the user as USDC, batched to their wallet on Base.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="w-6 h-6">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M9.2 9.4c0-1.2 1.3-1.9 2.8-1.9s2.8.6 2.8 1.9-1.3 1.8-2.8 1.8-2.8.7-2.8 1.9 1.3 1.9 2.8 1.9 2.8-.7 2.8-1.9" />
      </svg>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="section">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">The mechanism</span>
          <h2 className="section-title">
            How idle time
            <br />
            becomes income
          </h2>
          <p className="lead mt-5">
            A drop-in plugin sits between the agent and the user. When the agent
            goes quiet, Latent fills the silence — and settles payment in the
            same breath.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step) => (
            <div key={step.num} className="step">
              <div className="text-bronze font-serif text-5xl mb-4 opacity-40">
                {step.num}
              </div>
              <div className="text-bronze mb-4">{step.icon}</div>
              <h3 className="font-serif text-xl mb-3">{step.title}</h3>
              <p className="text-ivory-soft text-sm leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
