"use client";

import { useState } from "react";

const surfaces = [
  {
    id: "thinking",
    tag: "i",
    title: "WebUI — thinking state",
    desc: "A sponsored banner injected into the thinking row while the agent reasons. Premium inventory.",
    mock: {
      title: "hermes · thinking",
      content: (
        <div className="p-4">
          <div className="flex items-center gap-2 text-ivory-dim text-sm mb-3">
            <span className="w-2 h-2 bg-bronze rounded-full animate-pulse" />
            Thinking...
          </div>
          <div className="border border-ivory-faint rounded p-3 bg-ink/50">
            <div className="text-xs text-bronze uppercase tracking-wider mb-1">
              💰 Sponsored
            </div>
            <div className="text-sm text-ivory-soft">
              Earn USDC while your agent thinks. Latent monetizes idle time.
            </div>
          </div>
        </div>
      ),
    },
  },
  {
    id: "footer",
    tag: "ii",
    title: "WebUI — response footer",
    desc: "One line beneath the agent's answer, via the post-response hook.",
    mock: {
      title: "hermes · response",
      content: (
        <div className="p-4">
          <div className="text-sm text-ivory-soft mb-3">
            Here&apos;s the analysis of your code...
          </div>
          <div className="border-t border-ivory-faint pt-3">
            <div className="text-xs text-bronze">💰 Sponsored</div>
            <div className="text-sm text-ivory-soft">
              Supercharge your workflow with DeFi tools.
            </div>
          </div>
        </div>
      ),
    },
  },
  {
    id: "telegram",
    tag: "iii",
    title: "Telegram footer",
    desc: "A sponsored message appended after the bot replies in chat.",
    mock: {
      title: "telegram bot",
      content: (
        <div className="p-4">
          <div className="text-sm text-ivory-soft mb-3">
            📊 Market analysis complete. BTC up 2.3% today.
          </div>
          <div className="text-sm italic text-ivory-dim">
            💰 <em>Sponsored:</em> Stake your ETH, earn 4.2% APY.
            <br />
            <span className="text-bronze">Learn more</span> (+$0.0025 USDC)
          </div>
        </div>
      ),
    },
  },
  {
    id: "cli",
    tag: "iv",
    title: "CLI banner",
    desc: "ANSI-colored sponsor line printed after terminal output. Native to the shell.",
    mock: {
      title: "terminal",
      content: (
        <div className="p-4 font-mono text-sm">
          <div className="text-ivory-soft mb-2">$ npm run build</div>
          <div className="text-green-400 mb-3">✓ Build complete (2.3s)</div>
          <div className="text-yellow-600">💰 Sponsored:</div>
          <div className="text-ivory-dim text-xs">
            Supercharge your workflow with DeFi tools.
            <br />
            Learn more → +$0.0025 USDC earned
          </div>
        </div>
      ),
    },
  },
];

export function AdSurfaces() {
  const [active, setActive] = useState("thinking");

  const activeSurface = surfaces.find((s) => s.id === active) || surfaces[0];

  return (
    <section id="surfaces" className="section bg-ink">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Where it appears</span>
          <h2 className="section-title">
            Four quiet
            <br />
            surfaces
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Surface list */}
          <div className="flex flex-col gap-4">
            {surfaces.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`text-left p-4 border transition-all ${
                  active === s.id
                    ? "border-bronze bg-bronze/5"
                    : "border-ivory-faint hover:border-ivory-dim"
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="text-bronze font-serif text-lg opacity-60">
                    {s.tag}
                  </span>
                  <div>
                    <h3 className="font-medium text-ivory">{s.title}</h3>
                    <p className="text-ivory-dim text-sm mt-1">{s.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Mock window */}
          <div className="border border-ivory-faint rounded-lg overflow-hidden bg-teal-900">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-ivory-faint bg-ink/50">
              <span className="w-3 h-3 rounded-full bg-red-500/60" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <span className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="ml-4 text-xs text-ivory-dim">
                {activeSurface.mock.title}
              </span>
            </div>
            {activeSurface.mock.content}
          </div>
        </div>
      </div>
    </section>
  );
}
