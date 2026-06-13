"use client";

import { useEffect, useState } from "react";

export function Hero() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), 650);
    return () => clearTimeout(timer);
  }, []);

  return (
    <header
      id="top"
      className={`hero ${open ? "curtains-open" : ""}`}
    >
      {/* Stage glow */}
      <div className="stage-glow" />

      {/* Valance shadow */}
      <div className="valance" />

      {/* Curtains */}
      <div className="curtain left" />
      <div className="curtain right" />

      {/* Hero inner content */}
      <div className="hero-inner">
        <div className="kicker">
          <span className="eyebrow flank">
            Open-source ad marketplace for AI agents
          </span>
        </div>

        <h1 className="display">
          Monetize
          <span className="void">the void</span>
        </h1>

        <div className="wordmark">rent the latency.</div>

        <p className="lead">
          Every AI agent waits — thinking, processing, calling tools. Latent
          turns that idle time into ad inventory, and pays the user{" "}
          <strong>50% in USDC on Base</strong>. The value was always there.
          Latent.
        </p>

        <div className="cta-row">
          <a href="#install" className="btn">
            Get paid to wait <span className="arrow">→</span>
          </a>
          <a href="#advertise" className="btn ghost">
            Become an advertiser
          </a>
        </div>
      </div>

      {/* Scroll cue */}
      <div className="scroll-cue">
        <span>Part the curtain</span>
        <span className="dot" />
      </div>
    </header>
  );
}
