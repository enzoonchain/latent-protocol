#!/usr/bin/env node
import { loadConfig, resolveServer, resolveWallet, saveConfig, configFile } from "./config.js";
import {
  detectAgents,
  formatDetectionTable,
  formatSurfaceMatrix,
} from "./detect.js";
import { ensureWallet } from "./wallet.js";
import { getBalance } from "./api.js";
import { readSessionFromStdin, render } from "./statusline.js";
import {
  claudeCodeStatus,
  installClaudeCode,
  uninstallClaudeCode,
} from "./surfaces/claude-code.js";
import { hermesStatus, installHermes, uninstallHermes } from "./surfaces/hermes.js";
import {
  installOpenclaw,
  openclawStatus,
  uninstallOpenclaw,
} from "./surfaces/openclaw.js";
import {
  CODEX_AGENTS,
  codexDetected,
  codexFamilyStatus,
  installCodexFamily,
  uninstallCodexFamily,
} from "./surfaces/codex.js";
import { runHook, type HookAgent, type HookEvent } from "./hook.js";
import { runPrelaunch, runActivate } from "./prelaunch.js";
import { runUpdate } from "./update.js";
import { DEFAULT_SCAN_DAYS } from "./scanners/types.js";

function printHelp(): void {
  console.log(`latent-protocol — earn USDC while your agent thinks

Usage:
  npx latent-protocol init [--yes] [--generate] [--wallet 0x…] [--server URL]
  npx latent-protocol status
  npx latent-protocol uninstall
  npx latent-protocol statusline [--install|--uninstall]
  npx latent-protocol hook <event> --agent <codex|claude-code|mimo>
  npx latent-protocol prelaunch [--yes] [--generate] [--wallet 0x…] [--days 30]
  npx latent-protocol activate
  npx latent-protocol update [--force]
  npx latent-protocol help

Commands:
  init         Detect agents, set up wallet, patch every found surface
  prelaunch    Pre-launch signup: wallet + local scan + register (ads OFF)
  activate     Enable ads and patch surfaces (after public launch)
  update       Update to latest version and re-patch surfaces
  status       Show config, balance, and patched surfaces
  uninstall    Revert Claude Code + Hermes + OpenClaw + Codex/MiMo patches
  statusline   Claude Code statusLine renderer (stdin → stdout)
  hook         Turn-lifecycle hook runtime (invoked by installed hooks)

Surfaces auto-installed when detected:
  • Hermes CLI / gateway (Telegram, Discord, …) — agent-ads plugin
  • Hermes WebUI — DOM patch (static/index.html)
  • Claude Code — statusLine + turn hooks
  • OpenClaw — thinking + footer plugin
  • Codex / MiMo — turn hooks (hooks.json)
  • Cursor / VS Code — extension (see vscode-extension/)
`);
}

function parseFlags(args: string[]): {
  yes: boolean;
  generate: boolean;
  wallet?: string;
  server?: string;
  rest: string[];
} {
  let yes = false;
  let generate = false;
  let wallet: string | undefined;
  let server: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--yes" || a === "-y") yes = true;
    else if (a === "--generate") generate = true;
    else if (a === "--wallet") {
      wallet = args[++i];
    } else if (a.startsWith("--wallet=")) {
      wallet = a.slice("--wallet=".length);
    } else if (a === "--server") {
      server = args[++i];
    } else if (a.startsWith("--server=")) {
      server = a.slice("--server=".length);
    } else {
      rest.push(a);
    }
  }
  return { yes, generate, wallet, server, rest };
}

async function cmdInit(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  console.log("🔍 Detecting agents…\n");
  const detected = detectAgents();
  console.log(formatDetectionTable(detected));
  console.log();

  const codexAgents = CODEX_AGENTS.filter(codexDetected);
  const anyAgent =
    detected.claudeCode ||
    detected.hermes ||
    detected.hermesWebui ||
    detected.openclaw ||
    codexAgents.length > 0;

  if (!anyAgent) {
    console.log(
      "No Claude Code / Hermes / Hermes WebUI / OpenClaw / Codex / MiMo install found.\n" +
        "Install an agent first, or pass --yes to still create a wallet/config.",
    );
    if (!flags.yes && !flags.generate && !flags.wallet) {
      process.exitCode = 1;
      return;
    }
  }

  const wallet = await ensureWallet({
    yes: flags.yes,
    generate: flags.generate,
    wallet: flags.wallet,
  });
  if (flags.server) {
    saveConfig({ server: flags.server.replace(/\/+$/, "") });
  }
  // Force every-message ads on init (overrides older frequency: 5 configs).
  saveConfig({ frequency: 1 });
  console.log(`\n💳 Wallet: ${wallet}`);
  console.log(`   Config: ${configFile()}`);
  console.log(`   Server: ${flags.server?.replace(/\/+$/, "") || resolveServer()}`);
  console.log(`   Frequency: 1 (every message)\n`);

  // Only install surfaces that are actually present (or --yes for Claude/Hermes legacy).
  if (detected.claudeCode) {
    console.log(installClaudeCode());
    console.log();
  }
  if (detected.hermes || detected.hermesWebui) {
    console.log(installHermes());
    console.log();
  }
  if (detected.openclaw) {
    console.log(installOpenclaw());
    console.log();
  }
  if (codexAgents.length > 0) {
    console.log(installCodexFamily());
    console.log();
  }

  // Re-detect after install for accurate matrix
  const after = detectAgents();
  console.log(formatSurfaceMatrix(after));
  console.log();
  console.log("🎉 Done. Earn USDC while your agent thinks.");
  console.log("   Check: npx latent-protocol status");
}

async function cmdStatus(): Promise<void> {
  const cfg = loadConfig();
  const wallet = resolveWallet(cfg);
  const server = resolveServer(cfg);
  const detected = detectAgents();
  console.log("Latent Protocol status\n");
  console.log(`  Config:  ${configFile()}`);
  console.log(`  Wallet:  ${wallet || "(not set)"}`);
  console.log(`  Server:  ${server}`);
  console.log(`  Enabled: ${cfg.enabled === false ? "false" : "true"}`);
  console.log(`  Mode:    ${cfg.mode ?? "live"}`);
  if (cfg.prelaunch_registered_at) {
    console.log(`  Prelaunch registered: ${cfg.prelaunch_registered_at}`);
  }
  console.log(`  Frequency: ${cfg.frequency ?? 1}`);
  if (wallet) {
    const bal = await getBalance(wallet, server);
    console.log(`  Balance: $${bal.toFixed(4)} USDC`);
  }
  console.log();
  console.log("Surfaces:");
  console.log(`  ${claudeCodeStatus()}`);
  console.log(`  ${hermesStatus()}`);
  console.log(`  ${openclawStatus()}`);
  for (const line of codexFamilyStatus()) console.log(`  ${line}`);
  console.log();
  console.log("Detected:");
  console.log(formatDetectionTable(detected));
  console.log();
  console.log(formatSurfaceMatrix(detected));
}

async function cmdUninstall(): Promise<void> {
  console.log(uninstallClaudeCode());
  console.log(uninstallHermes());
  console.log(uninstallOpenclaw());
  console.log(uninstallCodexFamily());
}

async function cmdStatusline(args: string[]): Promise<void> {
  const sub = args[0];
  if (sub === "--install" || sub === "install") {
    console.log(installClaudeCode());
    return;
  }
  if (sub === "--uninstall" || sub === "uninstall") {
    console.log(uninstallClaudeCode());
    return;
  }

  try {
    const session = await readSessionFromStdin();
    const line = await render(session);
    if (line) process.stdout.write(line);
  } catch {
    // never break Claude Code's status line
  }
}

async function cmdHook(args: string[]): Promise<void> {
  const event = (args[0] || "") as HookEvent;
  const valid: HookEvent[] = ["session-start", "turn-start", "turn-end", "session-end"];
  if (!valid.includes(event)) {
    // Unknown event — stay silent, never disturb the host agent.
    return;
  }
  let agent: HookAgent = "codex";
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--agent" && args[i + 1]) agent = args[++i] as HookAgent;
    else if (args[i]!.startsWith("--agent=")) agent = args[i]!.slice("--agent=".length) as HookAgent;
  }
  try {
    const payload = await readSessionFromStdin();
    const out = await runHook(event, agent, payload);
    if (out) process.stdout.write(out);
  } catch {
    // fail open
  }
}

async function cmdUpdate(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  await runUpdate({ yes: flags.yes, force: flags.rest.includes("--force") });
}

async function cmdPrelaunch(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  let days = DEFAULT_SCAN_DAYS;
  for (let i = 0; i < flags.rest.length; i++) {
    if (flags.rest[i] === "--days" && flags.rest[i + 1]) {
      days = Math.max(1, parseInt(flags.rest[++i]!, 10) || DEFAULT_SCAN_DAYS);
    } else if (flags.rest[i]!.startsWith("--days=")) {
      days = Math.max(1, parseInt(flags.rest[i]!.slice("--days=".length), 10) || DEFAULT_SCAN_DAYS);
    }
  }
  const skipRegister = flags.rest.includes("--skip-register");
  await runPrelaunch({
    yes: flags.yes,
    generate: flags.generate,
    wallet: flags.wallet,
    server: flags.server,
    days,
    skipRegister,
  });
}

async function main(): Promise<void> {
  const [, , cmd = "help", ...args] = process.argv;
  switch (cmd) {
    case "init":
      await cmdInit(args);
      break;
    case "prelaunch":
      await cmdPrelaunch(args);
      break;
    case "activate":
      await runActivate();
      break;
    case "update":
      await cmdUpdate(args);
      break;
    case "status":
      await cmdStatus();
      break;
    case "uninstall":
      await cmdUninstall();
      break;
    case "statusline":
      await cmdStatusline(args);
      break;
    case "hook":
      await cmdHook(args);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      printHelp();
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
