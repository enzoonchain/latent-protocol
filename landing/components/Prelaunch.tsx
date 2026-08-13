"use client";

import { useEffect, useState } from "react";
import { fetchPrelaunchCount } from "@/lib/api";

const PRELAUNCH_CMD = "npx latent-protocol prelaunch --yes --generate";
const PRELAUNCH_GITHUB =
  "npx --yes github:enzoonchain/latent-protocol prelaunch --yes --generate";
const PRELAUNCH_SKILL_URL =
  "https://latentprotocol.xyz/latent-prelaunch-skill.md";
const PRELAUNCH_SKILL_CMD = `/skills add ${PRELAUNCH_SKILL_URL}`;

const STEPS = [
  {
    num: "01",
    title: "Scan your agents",
    desc: "The CLI looks for Hermes, Codex, MiMo, and OpenClaw on this machine. Session logs stay local — only counts leave.",
  },
  {
    num: "02",
    title: "Create a wallet",
    desc: "A Base address is generated (or you paste yours). Ads stay off. The private key is printed once — Latent only stores the address.",
  },
  {
    num: "03",
    title: "See what you left on the table",
    desc: "Billable thinking slots × live top bid × 50% user share. A counterfactual — what you would have earned with Latent installed.",
  },
  {
    num: "04",
    title: "Register for launch",
    desc: "Wallet + agent list + the estimate are saved. At public launch you run activate — same wallet, ads turn on.",
  },
];

const AGENTS = [
  { name: "Hermes CLI / WebUI", note: "VPS-friendly" },
  { name: "Codex", note: "turn logs" },
  { name: "MiMo", note: "turn logs" },
  { name: "OpenClaw", note: "sessions" },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative rounded bg-[#0d0c0b] border border-[rgba(180,140,80,0.2)] overflow-x-auto">
      <button
        onClick={copy}
        className="absolute top-2 right-3 text-[10px] text-ivory-soft hover:text-bronze transition-colors"
      >
        {copied ? "copied ✓" : "copy"}
      </button>
      <pre className="p-4 pr-14 text-[0.82rem] leading-relaxed text-bronze font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function CountDisplay() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPrelaunchCount().then((n) => {
      if (!cancelled) setCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="text-center border border-ivory-faint bg-ink/40 px-8 py-12">
      <span className="eyebrow justify-center flex mb-6">Pre-registered</span>
      <div className="font-serif text-[clamp(4.5rem,14vw,9rem)] leading-none text-bronze tracking-tight">
        {count === null ? "—" : count.toLocaleString("en-US")}
      </div>
      <p className="mt-5 text-ivory-soft text-sm tracking-widest uppercase">
        wallets waiting for launch
      </p>
    </div>
  );
}

export function Prelaunch() {
  return (
    <main className="relative z-10">
      <header className="section pt-36 pb-16">
        <div className="wrap text-center max-w-3xl mx-auto">
          <span className="eyebrow flank justify-center flex mb-8">
            Before the curtain rises
          </span>
          <h1 className="section-title">
            Claim your
            <span className="block font-script text-bronze normal-case tracking-normal text-[clamp(2.4rem,6vw,4.2rem)] mt-2">
              pre-launch seat
            </span>
          </h1>
          <p className="lead mx-auto mt-8">
            Ads are not live yet. Register a wallet, scan the agents you already
            run, and see how much you left on the table — so you are first in
            line when Latent opens.
          </p>
        </div>
      </header>

      <section className="section pt-0">
        <div className="wrap max-w-2xl mx-auto">
          <CountDisplay />
        </div>
      </section>

      <section className="section pt-0">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">The register</span>
            <h2 className="section-title">
              What pre-register
              <br />
              actually does
            </h2>
            <p className="lead mt-5">
              One command. No hooks. No sponsored lines. Your agent keeps
              working the way it does today.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {STEPS.map((step) => (
              <div key={step.num}>
                <div className="text-bronze font-serif text-5xl mb-3 opacity-40">
                  {step.num}
                </div>
                <h3 className="font-serif text-xl mb-3">{step.title}</h3>
                <p className="text-ivory-soft text-sm leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section pt-0">
        <div className="wrap max-w-2xl mx-auto">
          <div className="relative rounded-xl border border-bronze/40 bg-gradient-to-br from-[rgba(180,140,80,0.08)] to-transparent p-7 mb-10">
            <div className="absolute -top-3.5 left-6">
              <span className="bg-bronze text-ink text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full">
                ✦ Recommended
              </span>
            </div>
            <h3 className="font-serif text-lg text-ivory mt-1 mb-2">
              Let your agent do it
            </h3>
            <p className="text-ivory-soft text-sm mb-5 opacity-80">
              Load the pre-launch skill in Claude Code, Cursor, or any agent that
              supports skills. It runs the npx command for you — non-interactive,
              ads stay off.
            </p>
            <p className="text-xs text-ivory-soft tracking-widest uppercase opacity-60 mb-3">
              Add skill
            </p>
            <CodeBlock code={PRELAUNCH_SKILL_CMD} />
          </div>

          <div className="relative rounded-xl border border-bronze/40 bg-gradient-to-br from-[rgba(180,140,80,0.08)] to-transparent p-7">
            <div className="absolute -top-3.5 left-6">
              <span className="bg-bronze text-ink text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full">
                One-liner
              </span>
            </div>
            <h3 className="font-serif text-lg text-ivory mt-1 mb-2">
              Pre-register from the terminal
            </h3>
            <p className="text-ivory-soft text-sm mb-5 opacity-80">
              Hermes, Codex, MiMo, OpenClaw. Ads stay disabled until you run{" "}
              <code className="text-bronze">activate</code> at launch.
            </p>
            <p className="text-xs text-ivory-soft tracking-widest uppercase opacity-60 mb-3">
              After npm publish
            </p>
            <CodeBlock code={PRELAUNCH_CMD} />
            <p className="text-xs text-ivory-soft tracking-widest uppercase opacity-60 mt-5 mb-3">
              Until then
            </p>
            <CodeBlock code={PRELAUNCH_GITHUB} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10">
            {AGENTS.map((a) => (
              <div
                key={a.name}
                className="border border-ivory-faint px-4 py-4 text-center"
              >
                <div className="font-serif text-ivory text-sm">{a.name}</div>
                <div className="text-ivory-dim text-[11px] tracking-widest uppercase mt-1">
                  {a.note}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 border border-ivory-faint divide-y divide-ivory-faint">
            <div className="grid grid-cols-2 px-6 py-3 text-xs tracking-wider uppercase text-ivory-dim">
              <span>Happens now</span>
              <span>Does not happen</span>
            </div>
            <div className="grid grid-cols-2 px-6 py-4 text-sm">
              <span className="text-ivory">Wallet saved locally</span>
              <span className="text-ivory-soft">Ad hooks / plugins</span>
            </div>
            <div className="grid grid-cols-2 px-6 py-4 text-sm">
              <span className="text-ivory">Local usage scan</span>
              <span className="text-ivory-soft">Sponsored status lines</span>
            </div>
            <div className="grid grid-cols-2 px-6 py-4 text-sm">
              <span className="text-ivory">Signup on the server</span>
              <span className="text-ivory-soft">Impressions or payouts</span>
            </div>
          </div>

          <p className="text-ivory-dim text-sm mt-8 leading-relaxed">
            At launch:{" "}
            <code className="text-bronze">npx latent-protocol activate</code>
            {" — "}keeps this wallet, enables ads, and patches the surfaces
            that are actually installed.
          </p>
        </div>
      </section>
    </main>
  );
}
