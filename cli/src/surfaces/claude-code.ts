import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_CLAUDE_CODE, binDir } from "../config.js";
import { detectAgents } from "../detect.js";

/**
 * Legacy statusLine commands we still recognise so a re-install or `uninstall`
 * cleans them up. Newer installs never write any of these — the status line is
 * a local `node <bundle>` invocation now (see `statuslineCommand`).
 */
const LEGACY_STATUSLINE_COMMANDS = new Set([
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

/** Claude Code lifecycle event → our turn-hook event name. */
const HOOK_EVENTS: Record<string, string> = {
  SessionStart: "session-start",
  UserPromptSubmit: "turn-start",
  Stop: "turn-end",
  SessionEnd: "session-end",
};

/** Bundled runtime scripts shipped in the package (built by scripts/bundle-claude-runtime.mjs). */
const RUNTIME_DIR = fileURLToPath(new URL("../claude/", import.meta.url));
const RUNTIME_FILES = { statusline: "statusline.mjs", hook: "hook.mjs" } as const;

function bundledRuntime(name: keyof typeof RUNTIME_FILES): string {
  return join(RUNTIME_DIR, RUNTIME_FILES[name]);
}

function installedRuntime(name: keyof typeof RUNTIME_FILES): string {
  return join(binDir(), RUNTIME_FILES[name]);
}

function hasBundledRuntime(): boolean {
  return existsSync(bundledRuntime("statusline")) && existsSync(bundledRuntime("hook"));
}

/** `node "<abs>"` — quote so paths with spaces survive the shell. */
function nodeInvocation(script: string, extra = ""): string {
  return `node "${script}"${extra ? ` ${extra}` : ""}`;
}

function statuslineCommand(): string {
  return nodeInvocation(installedRuntime("statusline"));
}

function hookCommand(event: string): string {
  return nodeInvocation(installedRuntime("hook"), `${event} --agent ${AGENT_CLAUDE_CODE}`);
}

/** Any statusLine command — current or legacy — that belongs to us. */
function isOurStatuslineCommand(cmd: string): boolean {
  return (
    LEGACY_STATUSLINE_COMMANDS.has(cmd) ||
    /latent-protocol[/\\]bin[/\\]statusline\.mjs/.test(cmd)
  );
}

/** Any hook command — current or legacy — that belongs to us. */
function isOurHookCommand(cmd: string): boolean {
  return (
    cmd.includes("latent-protocol hook") ||
    cmd.includes("latent hook") ||
    /latent-protocol[/\\]bin[/\\]hook\.mjs/.test(cmd)
  );
}

function loadSettings(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function hookEntry(event: string): unknown {
  return {
    hooks: [{ type: "command", command: hookCommand(event), timeout: 10 }],
  };
}

function stripOurHooks(arr: unknown[]): unknown[] {
  return arr.filter((entry) => {
    const hooks = (entry as { hooks?: unknown[] })?.hooks;
    if (!Array.isArray(hooks)) return true;
    return !hooks.some((h) =>
      isOurHookCommand(String((h as { command?: string })?.command ?? "")),
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

/**
 * Copy the bundled runtime into ~/.latent-protocol/bin/ so settings.json can
 * point a bare `node` at it. Returns the install dir, or null when the package
 * has no bundle (running straight from `src/` without a build).
 */
function stageRuntime(): string | null {
  if (!hasBundledRuntime()) return null;
  const dir = binDir();
  mkdirSync(dir, { recursive: true });
  for (const name of Object.keys(RUNTIME_FILES) as (keyof typeof RUNTIME_FILES)[]) {
    copyFileSync(bundledRuntime(name), installedRuntime(name));
  }
  return dir;
}

export function installClaudeCode(refreshInterval = DEFAULT_REFRESH): string {
  const { paths } = detectAgents();
  const settingsPath = paths.claudeSettings;
  mkdirSync(dirname(settingsPath), { recursive: true });
  const settings = loadSettings(settingsPath);

  const staged = stageRuntime();
  if (!staged) {
    return (
      "⚠️  Claude Code: runtime bundle missing — run `npm run build` in cli/ first.\n" +
      "   (Published installs always have it; this only happens running from source.)"
    );
  }

  settings.statusLine = {
    type: "command",
    command: statuslineCommand(),
    refreshInterval,
  };
  installHooks(settings);

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  return (
    `✅ Claude Code statusLine + turn hooks → ${settingsPath}\n` +
    `   runtime: ${staged}/ (statusline.mjs, hook.mjs)\n` +
    `   statusLine: ${statuslineCommand()} (refresh ${refreshInterval}s)\n` +
    "   hooks: SessionStart/UserPromptSubmit/Stop/SessionEnd → node hook.mjs … --agent claude-code\n" +
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
    isOurStatuslineCommand(String((sl as { command?: string }).command ?? ""))
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
    isOurStatuslineCommand(String((sl as { command?: string }).command ?? ""))
  ) {
    return `Claude Code: patched (${(sl as { command: string }).command})`;
  }
  return "Claude Code: detected, not patched";
}
