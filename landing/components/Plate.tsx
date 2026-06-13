export function Plate() {
  return (
    <section id="advertise" className="section">
      <div className="wrap text-center">
        <span className="eyebrow justify-center flex mb-8">
          For advertisers
        </span>

        {/* Decorative plate */}
        <div className="relative max-w-2xl mx-auto mb-8">
          <div className="aspect-[3/2] border border-ivory-faint bg-ink/50 flex items-center justify-center overflow-hidden">
            <svg
              viewBox="0 0 600 400"
              className="w-full h-full opacity-60"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="600" height="400" fill="none" />
              <text
                x="300"
                y="180"
                textAnchor="middle"
                fontFamily="Italiana, serif"
                fontSize="48"
                fill="#c6a868"
                opacity="0.6"
              >
                Latent
              </text>
              <text
                x="300"
                y="230"
                textAnchor="middle"
                fontFamily="Manrope, sans-serif"
                fontSize="14"
                fill="#efe9d6"
                opacity="0.4"
              >
                Protocol
              </text>
              <path
                d="M200 260 q50 -28 100 0 q50 28 100 0"
                fill="none"
                stroke="#c6a868"
                strokeWidth="2"
                opacity="0.4"
              />
            </svg>
          </div>
        </div>

        <p className="text-ivory-soft text-lg">
          Reach attention in the moments
          <br />
          nobody else can sell.
        </p>

        <div className="mt-8">
          <a href="#install" className="btn">
            Fund a campaign <span className="arrow">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
