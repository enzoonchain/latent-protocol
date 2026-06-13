import Image from "next/image";

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
            <Image
              src="/plate.png"
              alt="Latent Protocol — an engraving of value exchanged across the void"
              width={800}
              height={533}
              className="w-full h-full object-cover opacity-80"
              priority
            />
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
