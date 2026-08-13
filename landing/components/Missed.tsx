"use client";

import { useEffect, useState } from "react";
import {
  fetchPrelaunchCount,
  fetchPrelaunchFeed,
  type PrelaunchFeedEntry,
} from "@/lib/api";

const POLL_MS = 12_000;

const PRELAUNCH_CMD = "npx latent-protocol prelaunch --yes --generate";
const PRELAUNCH_GITHUB =
  "npx --yes github:enzoonchain/latent-protocol prelaunch --yes --generate";
const PRELAUNCH_SKILL_URL =
  "https://latentprotocol.xyz/latent-prelaunch-skill.md";
const PRELAUNCH_SKILL_CMD = `/skills add ${PRELAUNCH_SKILL_URL}`;

const STEPS = [
  {
    num: "01",
    title: "Scan what you already run",
    desc: "Hermes, Codex, MiMo, OpenClaw — the CLI reads local session logs. Prompts never leave your machine; only slot counts and estimates are sent.",
  },
  {
    num: "02",
    title: "See what you missed",
    desc: "Billable thinking time × live top bid × 50% user share. A straight counterfactual: USDC you would have earned if Latent had been installed.",
  },
  {
    num: "03",
    title: "See what you'll earn next",
    desc: "Same math, forward-looking. When you turn Latent on, idle waits become inventory — and half the revenue is yours on Base.",
  },
  {
    num: "04",
    title: "One command, ads off for now",
    desc: "Run the scan today. At public launch, activate with the same wallet — no re-setup, ads and payouts go live on the surfaces you actually use.",
  },
];

const AGENTS = [
  { name: "Hermes CLI / WebUI", note: "VPS-friendly" },
  { name: "Codex", note: "turn logs" },
  { name: "MiMo", note: "turn logs" },
  { name: "OpenClaw", note: "sessions" },
];

function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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

function HeroInstall() {
  return (
    <div className="flex flex-col gap-5">
      <div className="relative rounded-xl border border-bronze/40 bg-gradient-to-br from-[rgba(180,140,80,0.08)] to-transparent p-6">
        <div className="absolute -top-3 left-5">
          <span className="bg-bronze text-ink text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full">
            ✦ Recommended
          </span>
        </div>
        <h2 className="font-serif text-base text-ivory mt-1 mb-2">
          Let your agent scan for you
        </h2>
        <p className="text-ivory-soft text-sm mb-4 opacity-80">
          Add the skill in Claude Code, Cursor, or any skills-capable agent.
          It runs the scan and prints your missed-USD estimate.
        </p>
        <p className="text-xs text-ivory-soft tracking-widest uppercase opacity-60 mb-2">
          Add skill
        </p>
        <CodeBlock code={PRELAUNCH_SKILL_CMD} />
      </div>

      <div className="relative rounded-xl border border-bronze/40 bg-gradient-to-br from-[rgba(180,140,80,0.08)] to-transparent p-6">
        <div className="absolute -top-3 left-5">
          <span className="bg-bronze text-ink text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full">
            Terminal
          </span>
        </div>
        <h2 className="font-serif text-base text-ivory mt-1 mb-2">
          Run the scan yourself
        </h2>
        <p className="text-ivory-soft text-sm mb-4 opacity-80">
          Hermes, Codex, MiMo, OpenClaw — one command, ~30 seconds, ads stay
          off until you choose to activate.
        </p>
        <p className="text-xs text-ivory-soft tracking-widest uppercase opacity-60 mb-2">
          After npm publish
        </p>
        <CodeBlock code={PRELAUNCH_CMD} />
        <p className="text-xs text-ivory-soft tracking-widest uppercase opacity-60 mt-4 mb-2">
          Until then
        </p>
        <CodeBlock code={PRELAUNCH_GITHUB} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {AGENTS.map((a) => (
          <div
            key={a.name}
            className="border border-ivory-faint px-3 py-3 text-center"
          >
            <div className="font-serif text-ivory text-xs">{a.name}</div>
            <div className="text-ivory-dim text-[10px] tracking-widest uppercase mt-1">
              {a.note}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedLine({ entry }: { entry: PrelaunchFeedEntry }) {
  return (
    <div className="flex items-baseline gap-2 py-2.5 border-b border-ivory-faint/40 last:border-0 text-sm font-mono">
      <span className="text-bronze shrink-0">{entry.walletShort}</span>
      <span className="text-ivory-soft">left</span>
      <span className="text-ivory font-medium">{formatUsd(entry.missedUsd)}</span>
      <span className="text-ivory-soft">on the table</span>
      {entry.agents.length > 0 && (
        <span className="text-ivory-dim text-xs ml-auto hidden sm:inline truncate max-w-[140px]">
          {entry.agents.join(", ")}
        </span>
      )}
    </div>
  );
}

function LiveActivity() {
  const [count, setCount] = useState<number | null>(null);
  const [feed, setFeed] = useState<PrelaunchFeedEntry[]>([]);
  const [live, setLive] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const [n, entries] = await Promise.all([
        fetchPrelaunchCount(),
        fetchPrelaunchFeed(25),
      ]);
      if (cancelled) return;
      setCount(n);
      setFeed(entries);
      setLive(true);
    };

    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const totalMissed = feed.reduce((sum, e) => sum + e.missedUsd, 0);

  return (
    <div className="wrap max-w-4xl mx-auto">
      <div className="section-head text-center max-w-2xl mx-auto mb-10">
        <span className="eyebrow justify-center flex">Live tally</span>
        <h2 className="section-title mt-4">
          What others
          <br />
          left behind
        </h2>
        <p className="lead mt-4 mx-auto">
          Real scans from agents on real machines — counterfactual earnings,
          updated as new wallets run the check.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="text-center border border-ivory-faint bg-ink/40 px-8 py-10 relative">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${live ? "bg-emerald-500 animate-pulse" : "bg-ivory-dim"}`}
              aria-hidden
            />
            <span className="text-[10px] tracking-widest uppercase text-ivory-dim">
              Live
            </span>
          </div>
          <span className="eyebrow justify-center flex mb-6">Scans run</span>
          <div className="font-serif text-[clamp(3rem,10vw,5.5rem)] leading-none text-bronze tracking-tight tabular-nums">
            {count === null ? "—" : count.toLocaleString("en-US")}
          </div>
          <p className="mt-4 text-ivory-soft text-sm tracking-widest uppercase">
            wallets checked their missed earnings
          </p>
        </div>

        <div className="text-center border border-ivory-faint bg-ink/40 px-8 py-10">
          <span className="eyebrow justify-center flex mb-6">In this feed</span>
          <div className="font-serif text-[clamp(3rem,10vw,5.5rem)] leading-none text-bronze tracking-tight tabular-nums">
            {feed.length === 0 ? "—" : formatUsd(totalMissed)}
          </div>
          <p className="mt-4 text-ivory-soft text-sm tracking-widest uppercase">
            left on the table (recent scans)
          </p>
        </div>
      </div>

      <div className="mt-8 border border-ivory-faint bg-ink/30">
        <div className="px-5 py-3 border-b border-ivory-faint flex items-center justify-between">
          <span className="text-xs tracking-widest uppercase text-ivory-dim">
            Missed earnings log
          </span>
          <span className="text-[10px] text-ivory-dim">
            updates every {POLL_MS / 1000}s
          </span>
        </div>
        <div className="px-5 py-2 max-h-[320px] overflow-y-auto">
          {feed.length === 0 ? (
            <p className="py-6 text-center text-ivory-dim text-sm">
              {count === null
                ? "Loading scans…"
                : "No scans yet — run the command above and see your number."}
            </p>
          ) : (
            feed.map((entry, i) => (
              <FeedLine key={`${entry.walletShort}-${entry.createdAt}-${i}`} entry={entry} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function Missed() {
  return (
    <main className="relative z-10">
      <header className="section pt-36 pb-16">
        <div className="wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 xl:gap-20 items-start">
            <div className="lg:pt-2">
              <span className="eyebrow flank mb-8">
                Your agent already waits
              </span>
              <h1 className="section-title">
                How much did you
                <span className="block font-script text-bronze normal-case tracking-normal text-[clamp(2.4rem,6vw,4.2rem)] mt-2">
                  leave on the table?
                </span>
              </h1>
              <p className="lead mt-8">
                Every thinking pause is ad inventory you never sold. Run one
                command to scan Hermes, Codex, MiMo, or OpenClaw — see the USDC
                you <strong className="text-ivory font-medium">could have earned</strong>{" "}
                without Latent, and what you{" "}
                <strong className="text-ivory font-medium">will earn</strong> when
                you turn it on.
              </p>
              <p className="text-ivory-dim text-sm mt-6 leading-relaxed max-w-lg">
                50% of every impression goes to you on Base. The scan is free,
                local, and read-only — no sponsored lines until you activate.
              </p>
            </div>

            <HeroInstall />
          </div>
        </div>
      </header>

      <section className="section pt-0">
        <LiveActivity />
      </section>

      <section className="section pt-0">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">The math</span>
            <h2 className="section-title">
              Past tense,
              <br />
              then future tense
            </h2>
            <p className="lead mt-5">
              One scan answers two questions: what you missed, and what changes
              the moment Latent monetizes your idle time.
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

      <section className="section pt-0 pb-20">
        <div className="wrap max-w-2xl mx-auto">
          <div className="border border-ivory-faint divide-y divide-ivory-faint">
            <div className="grid grid-cols-2 px-6 py-3 text-xs tracking-wider uppercase text-ivory-dim">
              <span>You get today</span>
              <span>Not yet</span>
            </div>
            <div className="grid grid-cols-2 px-6 py-4 text-sm">
              <span className="text-ivory">Missed-USD estimate</span>
              <span className="text-ivory-soft">Live ad impressions</span>
            </div>
            <div className="grid grid-cols-2 px-6 py-4 text-sm">
              <span className="text-ivory">Local agent scan</span>
              <span className="text-ivory-soft">Sponsored status lines</span>
            </div>
            <div className="grid grid-cols-2 px-6 py-4 text-sm">
              <span className="text-ivory">Wallet ready for payouts</span>
              <span className="text-ivory-soft">USDC in your balance</span>
            </div>
          </div>

          <p className="text-ivory-dim text-sm mt-8 leading-relaxed">
            When you are ready to earn for real:{" "}
            <code className="text-bronze">npx latent-protocol activate</code>
            {" — "}same wallet, ads on, 50% of revenue to you.
          </p>
        </div>
      </section>
    </main>
  );
}
