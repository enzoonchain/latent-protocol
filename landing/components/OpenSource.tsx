export function OpenSource() {
  return (
    <section id="opensource" className="section bg-ink">
      <div className="wrap">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="eyebrow">Apache-2.0</span>
            <h2 className="section-title mt-3 text-[clamp(1.9rem,4vw,3.2rem)]">
              Open by design.
              <br />
              Composable by default.
            </h2>
            <p className="lead mt-5">
              No black box between the agent and the wallet. Read the server,
              fork the plugin, run your own surface. Trust comes from being
              able to look.
            </p>
            <div className="flex gap-4 mt-8 flex-wrap">
              <a
                href="https://github.com/enzoonchain/latent-protocol"
                className="btn"
                target="_blank"
                rel="noopener noreferrer"
              >
                Star on GitHub <span className="arrow">→</span>
              </a>
              <a href="#install" className="btn ghost">
                Read the docs
              </a>
            </div>
          </div>

          <div className="border border-ivory-faint p-6 bg-teal-900/50 font-mono text-sm">
            <div className="text-ivory-dim mb-4 text-xs tracking-wider uppercase">
              Quick start
            </div>
            <div className="space-y-2">
              <div>
                <span className="text-bronze">$</span>{" "}
                <span className="text-ivory-soft">pip install latent-protocol</span>
              </div>
              <div>
                <span className="text-bronze">$</span>{" "}
                <span className="text-ivory-soft">latent-mcp serve</span>
              </div>
              <div className="text-ivory-dim mt-4">
                # Add to your agent config:
              </div>
              <div>
                <span className="text-ivory-soft">export ADS_WALLET=0x...</span>
              </div>
              <div>
                <span className="text-ivory-soft">export ADS_SERVER=https://agent-kickbacks-production.up.railway.app</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
