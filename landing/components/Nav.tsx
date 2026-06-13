"use client";

import { useState, useEffect } from "react";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

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
      <div className="flex gap-8 items-center max-md:hidden">
        {[
          ["#how", "How it works"],
          ["#surfaces", "Surfaces"],
          ["#economics", "Economics"],
          ["#protocol", "Protocol"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="text-ivory-soft no-underline text-xs tracking-widest uppercase font-medium hover:text-bronze transition-colors"
          >
            {label}
          </a>
        ))}
        <a
          href="#install"
          className="text-bronze border border-ivory-faint px-4 py-2.5 no-underline text-xs tracking-widest uppercase font-medium hover:border-bronze transition-colors"
        >
          Get paid to wait
        </a>
      </div>
    </nav>
  );
}
