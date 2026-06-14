"use client";

import { useState, useEffect } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";

const NAV_LINKS = [
  ["#how", "How it works"],
  ["#blocks", "Live Ads"],
  ["#advertiser", "Advertise"],
  ["#user", "Earnings"],
] as const;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menu on resize to desktop
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between transition-all duration-400 border-b border-transparent ${
          scrolled || open
            ? "bg-ink/95 backdrop-blur-xl border-ivory-faint py-3.5"
            : "bg-transparent py-5"
        }`}
        style={{ paddingInline: "var(--gutter)" }}
      >
        <a href="#top" className="font-script text-3xl text-ivory no-underline leading-none">
          Latent
        </a>

        {/* Desktop links */}
        <div className="flex gap-6 items-center max-md:hidden">
          {NAV_LINKS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-ivory-soft no-underline text-xs tracking-widest uppercase font-medium hover:text-bronze transition-colors"
            >
              {label}
            </a>
          ))}
          {isConnected ? (
            <button onClick={() => disconnect()} className="btn ghost text-xs py-2 px-4">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </button>
          ) : (
            <button onClick={openConnectModal} className="btn text-xs py-2 px-4">
              Connect Wallet <span className="arrow">→</span>
            </button>
          )}
        </div>

        {/* Burger button — mobile only */}
        <button
          className="md:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <span
            className={`block h-0.5 w-6 bg-ivory transition-all duration-300 ${open ? "rotate-45 translate-y-2" : ""}`}
          />
          <span
            className={`block h-0.5 w-6 bg-ivory transition-all duration-300 ${open ? "opacity-0" : ""}`}
          />
          <span
            className={`block h-0.5 w-6 bg-ivory transition-all duration-300 ${open ? "-rotate-45 -translate-y-2" : ""}`}
          />
        </button>
      </nav>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-40 bg-ink/97 flex flex-col justify-center items-center gap-8 transition-all duration-300 md:hidden ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        {NAV_LINKS.map(([href, label]) => (
          <a
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className="text-ivory no-underline text-lg tracking-widest uppercase font-medium hover:text-bronze transition-colors"
          >
            {label}
          </a>
        ))}
        {isConnected ? (
          <button
            onClick={() => { disconnect(); setOpen(false); }}
            className="btn ghost text-sm py-2 px-6 mt-2"
          >
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </button>
        ) : (
          <button
            onClick={() => { openConnectModal?.(); setOpen(false); }}
            className="btn text-sm py-2 px-6 mt-2"
          >
            Connect Wallet <span className="arrow">→</span>
          </button>
        )}
      </div>
    </>
  );
}
