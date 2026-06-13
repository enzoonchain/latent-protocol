export function Install() {
  return (
    <section id="install" className="section text-center">
      <div className="wrap relative z-10">
        <span className="eyebrow flank justify-center flex mb-8">
          The curtain never has to be dead time again
        </span>

        <h1 className="font-serif text-[clamp(2.4rem,7.4vw,6.2rem)] leading-[0.92] uppercase tracking-wider">
          Monetize the void.
          <span className="block font-script text-bronze normal-case tracking-normal mt-2">
            Rent the latency.
          </span>
        </h1>

        <div className="flex gap-4 justify-center mt-12 flex-wrap">
          <a
            href="https://github.com/enzoonchain/agent-kickbacks"
            className="btn"
            target="_blank"
            rel="noopener noreferrer"
          >
            Install the plugin <span className="arrow">→</span>
          </a>
          <a href="#advertise" className="btn ghost">
            Advertise on Latent
          </a>
        </div>

        {/* Divider ornament */}
        <div className="flex items-center justify-center gap-4 mt-16">
          <span className="h-px w-40 bg-gradient-to-r from-transparent to-ivory-faint to-bronze" />
          <span className="text-bronze text-sm">✦</span>
          <span className="h-px w-40 bg-gradient-to-l from-transparent to-ivory-faint to-bronze" />
        </div>
      </div>
    </section>
  );
}
