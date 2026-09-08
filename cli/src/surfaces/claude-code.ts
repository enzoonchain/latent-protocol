import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { detectAgents } from "../detect.js";

const STATUSLINE_COMMANDS = new Set([
  "npx --yes latent-protocol statusline",
  "npx -y latent-protocol statusline",
  "npx --yes github:enzoonchain/latent-protocol statusline",
  "npx -y github:enzoonchain/latent-protocol statusline",
  "npx --yes latent statusline",
  "npx -y latent statusline",
  "latent-protocol statusline",
  "latent statusline",
  "latent-statusline",
]);

// 10s to match the CodeBacks rotation cadence (adcache ROTATE_MS / vsix default).
const DEFAULT_REFRESH = 10;

const HOOK_CMD_TAG = "latent-protocol hook";

/** Claude Code lifecycle event → our turn-hook event name. */
const HOOK_EVENTS: Record<string, string> = {
  SessionStart: "session-start",
  UserPromptSubmit: "turn-start",
  Stop: "turn-end",
  SessionEnd: "session-end",
};

function loadSettings(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function hookEntry(event: string): unknown {
  return {
    hooks: [
      {
        type: "command",
        command: `npx --yes github:enzoonchain/latent-protocol hook ${event} --agent claude-code`,
        timeout: 10,
      },
    ],
  };
}

function stripOurHooks(arr: unknown[]): unknown[] {
  return arr.filter((entry) => {
    const hooks = (entry as { hooks?: unknown[] })?.hooks;
    if (!Array.isArray(hooks)) return true;
    return !hooks.some((h) =>
      String((h as { command?: string })?.command ?? "").includes(HOOK_CMD_TAG),
    );
  });
}

/** Merge our four turn hooks into settings.hooks (idempotent). */
function installHooks(settings: Record<string, unknown>): void {
  const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};
  for (const [event, ourEvent] of Object.entries(HOOK_EVENTS)) {
    const existing = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
    hooks[event] = [...stripOurHooks(existing), hookEntry(ourEvent)];
  }
  settings.hooks = hooks;
}

/** Remove our turn hooks; returns true if anything changed. */
function uninstallHooks(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks) return false;
  let changed = false;
  for (const event of Object.keys(HOOK_EVENTS)) {
    if (!Array.isArray(hooks[event])) continue;
    const cleaned = stripOurHooks(hooks[event] as unknown[]);
    if (cleaned.length !== (hooks[event] as unknown[]).length) changed = true;
    if (cleaned.length) hooks[event] = cleaned;
    else delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  else settings.hooks = hooks;
  return changed;
}

export function installClaudeCode(refreshInterval = DEFAULT_REFRESH): string {
  const { paths } = detectAgents();
  const settingsPath = paths.claudeSettings;
  mkdirSync(dirname(settingsPath), { recursive: true });
  const settings = loadSettings(settingsPath);

  settings.statusLine = {
    type: "command",
    command: "npx --yes github:enzoonchain/latent-protocol statusline",
    refreshInterval,
  };
  installHooks(settings);

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  return (
    `✅ Claude Code statusLine + turn hooks → ${settingsPath}\n` +
    `   statusLine: npx --yes github:enzoonchain/latent-protocol statusline (refresh ${refreshInterval}s)\n` +
    "   hooks: SessionStart/UserPromptSubmit/Stop/SessionEnd → latent hook … --agent claude-code\n" +
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
  let changed = false;
  if (
    sl &&
    typeof sl === "object" &&
    STATUSLINE_COMMANDS.has(String((sl as { command?: string }).command ?? ""))
  ) {
    delete settings.statusLine;
    changed = true;
  }
  if (uninstallHooks(settings)) changed = true;
  if (changed) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    return `✅ Removed Latent statusLine + turn hooks from ${settingsPath}`;
  }
  return "ℹ️  No Latent Protocol statusLine/hooks found; nothing to remove.";
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
