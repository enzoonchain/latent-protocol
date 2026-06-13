export function Hero() {
  return (
    <header
      id="top"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ background: "var(--teal-900)" }}
    >
      {/* Stage glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-bronze/5 rounded-full blur-[120px]" />
      </div>

      {/* Curtain shapes */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-90"
        viewBox="0 0 1200 800"
        preserveAspectRatio="none"
      >
        <path
          d="M0 0 H300 C320 200 280 400 320 600 C340 720 300 780 240 800 H0 Z"
          fill="var(--ivory)"
          opacity="0.06"
        />
        <path
          d="M1200 0 H900 C880 200 920 400 880 600 C860 720 900 780 960 800 H1200 Z"
          fill="var(--ivory)"
          opacity="0.06"
        />
      </svg>

      <div className="relative z-10 text-center px-6 max-w-5xl">
        <span className="eyebrow flank mb-8">
          Open-source ad marketplace for AI agents
        </span>

        <h1 className="font-serif text-[clamp(3.4rem,11vw,10rem)] leading-[0.92] tracking-wider uppercase mt-8">
          Monetize
          <span className="block font-script text-bronze normal-case tracking-normal">
            the void
          </span>
        </h1>

        <p className="font-script text-2xl text-bronze mt-2">
          rent the latency.
        </p>

        <p className="text-ivory-soft max-w-xl mx-auto mt-8 text-[clamp(1.05rem,1.6vw,1.3rem)] font-light">
          Every AI agent waits — thinking, processing, calling tools. Latent
          turns that idle time into ad inventory, and pays the user{" "}
          <strong className="text-ivory font-medium">50% in USDC on Base</strong>.
          The value was always there. Latent.
        </p>

        <div className="flex gap-4 justify-center mt-10 flex-wrap">
          <a href="#install" className="btn">
            Get paid to wait <span className="arrow">→</span>
          </a>
          <a href="#advertise" className="btn ghost">
            Become an advertiser
          </a>
        </div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 text-ivory-dim text-sm">
        <span>Part the curtain</span>
        <span className="w-1.5 h-1.5 bg-bronze rounded-full animate-pulse" />
      </div>
    </header>
  );
}
