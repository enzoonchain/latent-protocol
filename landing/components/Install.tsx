"use client";

import { useState } from "react";

const SKILL_URL = "https://agent-kickblocks-enzodefi.vercel.app/latent-protocol-skill.md";

type Platform = {
  id: string;
  label: string;
  tag: string;
  steps: { title: string; code?: string; lang?: string; note?: string }[];
};

const platforms: Platform[] = [
  {
    id: "mcp",
    label: "MCP",
    tag: "Universal — Claude, OpenClaw, Cursor, Windsurf…",
    steps: [
      {
        title: "1. Install the package",
        code: "pip install 'latent-protocol[mcp]'",
        lang: "bash",
      },
      {
        title: "2. Set up your earning wallet",
        code: "latent-setup",
        lang: "bash",
        note: "Generates a new wallet or imports your existing address. Saves to ~/.latent/config.json",
      },
      {
        title: "3. Add to your MCP config",
        code: JSON.stringify(
          {
            mcpServers: {
              "latent-protocol": {
                command: "latent-mcp",
              },
            },
          },
          null,
          2
        ),
        lang: "json",
        note: "Claude: ~/Library/Application Support/Claude/claude_desktop_config.json · OpenClaw: ~/.openclaw/mcp.json",
      },
      {
        title: "4. Start earning",
        note: "Ask your agent to call request_ad() or check_balance() — ads will flow automatically.",
      },
    ],
  },
  {
    id: "hermes",
    label: "Hermes",
    tag: "Hermes agent — push adapter, response footer",
    steps: [
      {
        title: "1. Clone the plugin into Hermes skills",
        code: "git clone https://github.com/enzoonchain/agent-kickbacks \\\n  ~/.hermes/plugins/latent-protocol",
        lang: "bash",
      },
      {
        title: "2. Set up your wallet",
        code: "latent-setup",
        lang: "bash",
        note: "Or set ADS_WALLET=0x... in your Hermes environment.",
      },
      {
        title: "3. Enable in Hermes config",
        code: JSON.stringify({ plugins: ["latent-protocol"] }, null, 2),
        lang: "json",
        note: "Add to your hermes.config.json",
      },
      {
        title: "4. Use /ads commands in chat",
        code: "/ads setup    # configure wallet\n/ads balance  # check earnings\n/ads payout   # withdraw USDC\n/ads off      # disable anytime",
        lang: "bash",
      },
    ],
  },
  {
    id: "telegram",
    label: "Telegram Bot",
    tag: "Standalone Telegram bots — python-telegram-bot, aiogram",
    steps: [
      { title: "1. Install", code: "pip install latent-protocol", lang: "bash" },
      { title: "2. Set up wallet", code: "latent-setup", lang: "bash" },
      {
        title: "3. Wrap your handler",
        code: `from latent_protocol.adapters.telegram import TelegramAdAdapter

adapter = TelegramAdAdapter()

async def handle_message(update, context):
    response = await your_llm(update.message.text)
    await update.message.reply_text(
        adapter.wrap_response(response, context=update.message.text),
        parse_mode="Markdown",
    )`,
        lang: "python",
        note: "Works with python-telegram-bot v20+, aiogram, and telebot.",
      },
    ],
  },
  {
    id: "cli",
    label: "CLI / Terminal",
    tag: "Any Python CLI agent — Click, Typer, plain scripts",
    steps: [
      { title: "1. Install", code: "pip install latent-protocol", lang: "bash" },
      { title: "2. Set up wallet", code: "latent-setup", lang: "bash" },
      {
        title: "3a. Decorator (zero boilerplate)",
        code: `from latent_protocol.adapters.cli import CliAdAdapter

adapter = CliAdAdapter()

@adapter.inject
def ask(prompt: str) -> str:
    return your_llm(prompt)`,
        lang: "python",
      },
      {
        title: "3b. Or manual",
        code: `response = your_llm(prompt)
adapter.print_response(response, context=prompt)`,
        lang: "python",
        note: "ANSI-colored banner, respects ADS_FREQUENCY (default: every 5 responses).",
      },
    ],
  },
];

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  void lang;

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative mt-2 rounded bg-[#0d0c0b] border border-[rgba(180,140,80,0.15)] overflow-x-auto">
      <button
        onClick={copy}
        className="absolute top-2 right-3 text-[10px] text-ivory-soft hover:text-bronze transition-colors"
      >
        {copied ? "copied ✓" : "copy"}
      </button>
      <pre className="p-4 pr-14 text-[0.78rem] leading-relaxed text-ivory-soft font-mono overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function Install() {
  const [active, setActive] = useState("mcp");
  const [skillCopied, setSkillCopied] = useState(false);
  const [pipCopied, setPipCopied] = useState(false);
  const platform = platforms.find((p) => p.id === active)!;

  const copySkill = () => {
    navigator.clipboard.writeText(`/skills add ${SKILL_URL}`);
    setSkillCopied(true);
    setTimeout(() => setSkillCopied(false), 1500);
  };

  const copyPip = () => {
    navigator.clipboard.writeText("pip install latent-protocol");
    setPipCopied(true);
    setTimeout(() => setPipCopied(false), 1500);
  };

  return (
    <section id="install" className="section">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow flank justify-center flex">
            Start earning in minutes
          </span>
          <h2 className="section-title text-center">
            Install on your
            <span className="block font-script text-bronze normal-case tracking-normal">
              platform of choice
            </span>
          </h2>
        </div>

        {/* ── Skill install — hero card ── */}
        <div className="max-w-2xl mx-auto mb-14">
          <div className="relative rounded-xl border border-bronze/40 bg-gradient-to-br from-[rgba(180,140,80,0.08)] to-transparent p-7">
            {/* Badge */}
            <div className="absolute -top-3.5 left-6">
              <span className="bg-bronze text-ink text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full">
                ✦ Recommended
              </span>
            </div>

            <div className="flex items-start gap-4 mb-5 mt-1">
              <div className="w-10 h-10 rounded-lg bg-bronze/10 border border-bronze/30 flex items-center justify-center shrink-0 text-xl">
                🧠
              </div>
              <div>
                <h3 className="text-ivory font-serif text-lg leading-snug">
                  Claude Code Skill
                </h3>
                <p className="text-ivory-soft text-sm mt-0.5 opacity-80">
                  One command — auto-detects your platform, wires the adapter, sets up your wallet. Works in Claude Code, Cursor, Windsurf and any MCP-compatible agent.
                </p>
              </div>
            </div>

            {/* Step 1 */}
            <div className="space-y-3">
              <p className="text-xs text-ivory-soft tracking-widest uppercase opacity-60">
                Step 1 — load the skill in your agent
              </p>
              <div className="relative rounded bg-[#0d0c0b] border border-[rgba(180,140,80,0.2)] overflow-x-auto">
                <button
                  onClick={copySkill}
                  className="absolute top-2 right-3 text-[10px] text-ivory-soft hover:text-bronze transition-colors"
                >
                  {skillCopied ? "copied ✓" : "copy"}
                </button>
                <pre className="p-4 pr-14 text-[0.82rem] leading-relaxed text-bronze font-mono">
                  <code>/skills add {SKILL_URL}</code>
                </pre>
              </div>

              {/* Step 2 */}
              <p className="text-xs text-ivory-soft tracking-widest uppercase opacity-60 pt-1">
                Step 2 — install the Python package
              </p>
              <div className="relative rounded bg-[#0d0c0b] border border-[rgba(180,140,80,0.2)] overflow-x-auto">
                <button
                  onClick={copyPip}
                  className="absolute top-2 right-3 text-[10px] text-ivory-soft hover:text-bronze transition-colors"
                >
                  {pipCopied ? "copied ✓" : "copy"}
                </button>
                <pre className="p-4 pr-14 text-[0.82rem] leading-relaxed text-ivory-soft font-mono">
                  <code>pip install latent-protocol</code>
                </pre>
              </div>

              <p className="text-[0.72rem] text-ivory-soft opacity-50 leading-relaxed">
                The skill guides you through wallet setup, platform detection, and a smoke test — all interactively.
              </p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-10 max-w-2xl mx-auto">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[rgba(180,140,80,0.2)]" />
          <span className="text-ivory-soft text-xs tracking-widest uppercase opacity-50">or set up manually</span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[rgba(180,140,80,0.2)]" />
        </div>

        {/* Platform tabs */}
        <div className="flex gap-2 flex-wrap justify-center mb-10">
          {platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className={`px-5 py-2 rounded text-sm border transition-all ${
                active === p.id
                  ? "border-bronze text-bronze bg-[rgba(180,140,80,0.08)]"
                  : "border-[rgba(180,140,80,0.2)] text-ivory-soft hover:border-bronze hover:text-bronze"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <p className="text-center text-ivory-soft text-sm mb-8 opacity-70">
          {platform.tag}
        </p>

        {/* Steps */}
        <div className="max-w-2xl mx-auto space-y-6">
          {platform.steps.map((step, i) => (
            <div key={i} className="step border border-[rgba(180,140,80,0.1)] rounded p-5">
              <h3 className="font-serif text-base text-ivory mb-2">{step.title}</h3>
              {step.code && <CodeBlock code={step.code} lang={step.lang} />}
              {step.note && (
                <p className="mt-2 text-[0.75rem] text-ivory-soft opacity-60 leading-relaxed">
                  {step.note}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* CTA row */}
        <div className="flex gap-4 justify-center mt-12 flex-wrap">
          <a
            href="https://github.com/enzoonchain/agent-kickbacks"
            className="btn"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub <span className="arrow">→</span>
          </a>
          <a href="#advertiser" className="btn ghost">
            Advertise on Latent
          </a>
        </div>

        <div className="flex items-center justify-center gap-4 mt-16">
          <span className="h-px w-40 bg-gradient-to-r from-transparent to-bronze opacity-30" />
          <span className="text-bronze text-sm">✦</span>
          <span className="h-px w-40 bg-gradient-to-l from-transparent to-bronze opacity-30" />
        </div>
      </div>
    </section>
  );
}
