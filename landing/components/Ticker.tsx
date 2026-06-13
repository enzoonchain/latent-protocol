export function Ticker() {
  const items = [
    "Get paid to wait",
    "Monetize the void",
    "x402 micropayments",
    "USDC on Base",
    "Idle time = ad inventory",
    "Apache-2.0",
  ];

  return (
    <div className="relative overflow-hidden border-y border-ivory-faint py-4 bg-ink/50">
      <div className="flex w-max animate-marquee">
        {[...items, ...items, ...items].map((item, i) => (
          <span
            key={i}
            className="mx-8 text-xs tracking-widest uppercase text-ivory-dim whitespace-nowrap"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
