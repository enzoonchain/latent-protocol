"use client";

import { useCallback, useRef, useState } from "react";

const REVERT_MS = 2800;

function CurtainIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <line
        x1="6"
        y1="5"
        x2="66"
        y2="5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="6" cy="5" r="2.2" stroke="currentColor" strokeWidth="1" fill="none" />
      <circle cx="66" cy="5" r="2.2" stroke="currentColor" strokeWidth="1" fill="none" />
      <path
        d="M18 5 C16 14 14 22 15 30 C16 38 14 44 13 48"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="rgba(239,233,214,0.08)"
      />
      <path
        d="M54 5 C56 14 58 22 57 30 C56 38 58 44 59 48"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="rgba(239,233,214,0.08)"
      />
      <path
        d="M18 5 C24 8 30 6 36 5 C42 6 48 8 54 5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path
        d="M15 30 C20 26 24 28 28 30 C32 32 36 33 40 30 C44 27 48 26 53 30"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M13 48 C18 46 22 47 26 49 C30 50 34 50 38 49 C42 47 46 46 51 48"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M13 48 C16 44 19 42 22 44"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M59 48 C56 44 53 42 50 44"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

type LatentLogoProps = {
  className?: string;
};

export function LatentLogo({ className = "font-script text-3xl text-ivory" }: LatentLogoProps) {
  const [showCurtain, setShowCurtain] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const onEnter = () => {
    clearTimer();
    setShowCurtain(true);
    timerRef.current = setTimeout(() => setShowCurtain(false), REVERT_MS);
  };

  const onLeave = () => {
    clearTimer();
    setShowCurtain(false);
  };

  return (
    <span
      className={`latent-logo relative inline-flex items-center justify-center h-[1.15em] min-w-[3.2em] ${className}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <span
        className={`latent-logo__text absolute inset-0 flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          showCurtain
            ? "opacity-0 -translate-x-2 scale-95 pointer-events-none"
            : "opacity-100 translate-x-0 scale-100"
        }`}
      >
        Latent
      </span>
      <span
        className={`latent-logo__icon absolute inset-0 flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          showCurtain
            ? "opacity-100 translate-x-0 scale-100"
            : "opacity-0 translate-x-2 scale-90 pointer-events-none"
        }`}
      >
        <CurtainIcon className="h-[0.95em] w-auto text-ivory" />
      </span>
    </span>
  );
}
