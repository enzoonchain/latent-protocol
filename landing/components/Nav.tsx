"use client";

import { useState, useEffect } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between transition-all duration-400 border-b border-transparent ${
        scrolled
          ? "bg-ink/80 backdrop-blur-xl border-ivory-faint py-3.5"
          : "bg-transparent py-5"
      }`}
      style={{ paddingInline: "var(--gutter)" }}
    >
      <a href="#top" className="font-script text-3xl text-ivory no-underline leading-none">
        Latent
      </a>
      <div className="flex gap-6 items-center max-md:hidden">
        {[
          ["#how", "How it works"],
          ["#blocks", "Live Ads"],
          ["#advertiser", "Advertise"],
          ["#user", "Earnings"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="text-ivory-soft no-underline text-xs tracking-widest uppercase font-medium hover:text-bronze transition-colors"
          >
            {label}
          </a>
        ))}
        {isConnected ? (
          <button
            onClick={() => disconnect()}
            className="btn ghost text-xs py-2 px-4"
          >
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </button>
        ) : (
          <button onClick={openConnectModal} className="btn text-xs py-2 px-4">
            Connect Wallet <span className="arrow">→</span>
          </button>
        )}
      </div>
    </nav>
  );
}
