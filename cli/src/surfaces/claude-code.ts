import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { detectAgents } from "../detect.js";

const STATUSLINE_COMMANDS = new Set([
  "npx --yes latent-protocol statusline",
  "npx -y latent-protocol statusline",
  "npx --yes latent statusline",
  "npx -y latent statusline",
  "latent-protocol statusline",
  "latent statusline",
  "latent-statusline",
]);

const DEFAULT_REFRESH = 30;

function loadSettings(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function installClaudeCode(refreshInterval = DEFAULT_REFRESH): string {
  const { paths } = detectAgents();
  const settingsPath = paths.claudeSettings;
  mkdirSync(dirname(settingsPath), { recursive: true });
  const settings = loadSettings(settingsPath);

  settings.statusLine = {
    type: "command",
    command: "npx --yes latent-protocol statusline",
    refreshInterval,
  };

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  return (
    `✅ Claude Code statusLine → ${settingsPath}\n` +
    `   command: npx --yes latent-protocol statusline (refresh ${refreshInterval}s)\n` +
    "   Restart Claude Code to apply."
  );
}

export function uninstallClaudeCode(): string {
  const { paths } = detectAgents();
  const settingsPath = paths.claudeSettings;
  if (!existsSync(settingsPath)) {
    return "ℹ️  No Claude Code settings.json found; nothing to remove.";
  }
  const settings = loadSettings(settingsPath);
  const sl = settings.statusLine;
  if (
    sl &&
    typeof sl === "object" &&
    STATUSLINE_COMMANDS.has(String((sl as { command?: string }).command ?? ""))
  ) {
    delete settings.statusLine;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    return `✅ Removed Latent statusLine from ${settingsPath}`;
  }
  return "ℹ️  No Latent Protocol statusLine found; nothing to remove.";
}

export function claudeCodeStatus(): string {
  const { paths, claudeCode } = detectAgents();
  if (!claudeCode) return "Claude Code: not detected";
  const settings = loadSettings(paths.claudeSettings);
  const sl = settings.statusLine;
  if (
    sl &&
    typeof sl === "object" &&
    STATUSLINE_COMMANDS.has(String((sl as { command?: string }).command ?? ""))
  ) {
    return `Claude Code: patched (${(sl as { command: string }).command})`;
  }
  return "Claude Code: detected, not patched";
}
