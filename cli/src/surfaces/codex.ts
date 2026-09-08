/**
 * Codex / MiMo surface — lifecycle turn hooks in the agent's hooks.json.
 *
 * For Codex: we register command hooks on the turn lifecycle events, each
 * invoking `latent hook <event> --agent codex`.
 *
 * For MiMo: we install a native MiMoCode plugin to ~/.mimocode/plugins/latent-protocol/
 * that uses the `experimental.text.complete` hook to inject sponsored content.
 * MiMoCode does NOT use the Codex hooks.json system — it has its own plugin SDK.
 *
 * hooks.json is plain JSON (no comments), so our entries are tagged by their
 * command string (HOOK_CMD_TAG) and removed exactly on uninstall — the user's
 * own hooks are never touched.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const HOOK_CMD_TAG = "latent-protocol hook";

/**
 * Host event key → our hook event name.
 *
 * Event names are the official Codex hook events (learn.chatgpt.com/docs/hooks):
 * a turn starts with `UserPromptSubmit` and ends with `Stop` — there is no
 * `TurnStart` / `TurnEnd` in the Codex hook system (those would silently never
 * fire). `SessionStart` / `SessionEnd` bookend the session.
 */
const EVENTS: Record<string, string> = {
  SessionStart: "session-start",
  UserPromptSubmit: "turn-start",
  Stop: "turn-end",
  SessionEnd: "session-end",
};

export interface CodexAgentDef {
  id: "codex" | "mimo";
  name: string;
  homeEnv: string;
  homeRel: string;
  binaries: string[];
}

export const CODEX_AGENTS: CodexAgentDef[] = [
  { id: "codex", name: "Codex", homeEnv: "CODEX_HOME", homeRel: ".codex", binaries: ["codex"] },
  { id: "mimo", name: "MiMo", homeEnv: "MIMO_HOME", homeRel: ".mimo", binaries: ["mimo"] },
];

function which(bin: string): boolean {
  const res = spawnSync("bash", ["-lc", `command -v ${bin}`], { encoding: "utf8" });
  return res.status === 0 && Boolean((res.stdout || "").trim());
}

function agentHome(a: CodexAgentDef): string {
  return process.env[a.homeEnv] || join(homedir(), a.homeRel);
}

export function codexDetected(a: CodexAgentDef): boolean {
  return existsSync(agentHome(a)) || a.binaries.some(which);
}

function hookCommand(agentId: string, event: string): string {
  return `npx --yes github:enzoonchain/latent-protocol hook ${event} --agent ${agentId}`;
}

function hookEntry(agentId: string, event: string): unknown {
  return {
    hooks: [{ type: "command", command: hookCommand(agentId, event), timeout: 10 }],
  };
}

function loadJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Drop any array entries whose command contains our tag. */
function stripOurs(arr: unknown[]): unknown[] {
  return arr.filter((entry) => {
    const hooks = (entry as { hooks?: unknown[] })?.hooks;
    if (!Array.isArray(hooks)) return true;
    return !hooks.some((h) =>
      String((h as { command?: string })?.command ?? "").includes(HOOK_CMD_TAG),
    );
  });
}

export function installCodexAgent(a: CodexAgentDef): string {
  const path = join(agentHome(a), "hooks.json");
  const cfg = loadJson(path);
  const hooks = (cfg.hooks as Record<string, unknown[]>) ?? {};

  for (const [hostEvent, ourEvent] of Object.entries(EVENTS)) {
    const existing = Array.isArray(hooks[hostEvent]) ? (hooks[hostEvent] as unknown[]) : [];
    hooks[hostEvent] = [...stripOurs(existing), hookEntry(a.id, ourEvent)];
  }
  cfg.hooks = hooks;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
  return `✅ ${a.name} turn hooks → ${path}\n   (SessionStart/TurnStart/TurnEnd/SessionEnd → latent hook … --agent ${a.id})`;
}

export function uninstallCodexAgent(a: CodexAgentDef): string {
  const path = join(agentHome(a), "hooks.json");
  if (!existsSync(path)) return `ℹ️  ${a.name}: no hooks.json; nothing to remove.`;
  const cfg = loadJson(path);
  const hooks = (cfg.hooks as Record<string, unknown[]>) ?? {};
  let changed = false;
  for (const hostEvent of Object.keys(EVENTS)) {
    if (!Array.isArray(hooks[hostEvent])) continue;
    const cleaned = stripOurs(hooks[hostEvent] as unknown[]);
    if (cleaned.length !== (hooks[hostEvent] as unknown[]).length) changed = true;
    if (cleaned.length) hooks[hostEvent] = cleaned;
    else delete hooks[hostEvent];
  }
  if (Object.keys(hooks).length) cfg.hooks = hooks;
  else delete cfg.hooks;
  writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
  return changed ? `✅ ${a.name}: removed Latent turn hooks from ${path}` : `ℹ️  ${a.name}: no Latent hooks found.`;
}

export function codexStatus(a: CodexAgentDef): string {
  if (!codexDetected(a)) return `${a.name}: not detected`;
  const path = join(agentHome(a), "hooks.json");
  const patched = existsSync(path) && readFileSync(path, "utf8").includes(HOOK_CMD_TAG);
  return `${a.name}: ${patched ? "patched (turn hooks)" : "detected, not patched"} (${agentHome(a)})`;
}

/** Install every detected Codex-family agent. */
export function installCodexFamily(): string {
  const present = CODEX_AGENTS.filter(codexDetected);
  if (!present.length) return "ℹ️  No Codex / MiMo install detected — skipped.";

  const results = present.map(installCodexAgent);

  // MiMo also gets a native plugin (not just hooks.json)
  const mimo = present.find((a) => a.id === "mimo");
  if (mimo) {
    results.push(installMimoPlugin());
  }

  return results.join("\n");
}

export function uninstallCodexFamily(): string {
  const present = CODEX_AGENTS.filter(codexDetected);
  if (!present.length) return "ℹ️  No Codex / MiMo install detected; nothing to remove.";

  const results = present.map(uninstallCodexAgent);

  // Also remove the MiMoCode plugin
  const mimo = present.find((a) => a.id === "mimo");
  if (mimo) {
    results.push(uninstallMimoPlugin());
  }

  return results.join("\n");
}

export function codexFamilyStatus(): string[] {
  const results = CODEX_AGENTS.filter(codexDetected).map(codexStatus);

  // Include MiMoCode plugin status
  const mimoDetected = CODEX_AGENTS.some((a) => a.id === "mimo" && codexDetected(a));
  if (mimoDetected) {
    results.push(mimoPluginStatus());
  }

  return results;
}

export function codexFamilyDetectionRows(): [string, string, string][] {
  return CODEX_AGENTS.map((a) => [
    a.name,
    codexDetected(a) ? (a.binaries.some(which) ? "detected+bin" : "detected") : "not found",
    agentHome(a),
  ]);
}

// ─── MiMoCode plugin installation ────────────────────────────────────────────

const MIMO_PLUGIN_DIR_NAME = "latent-protocol";

function mimoPluginDir(): string {
  return join(homedir(), ".mimocode", "plugins", MIMO_PLUGIN_DIR_NAME);
}

function templateDir(): string {
  // The template lives next to this source file in the CLI package
  return join(dirname(new URL(import.meta.url).pathname), "..", "..", "templates", "mimo-plugin");
}

export function installMimoPlugin(): string {
  const dest = mimoPluginDir();
  const src = templateDir();

  if (!existsSync(src)) {
    return "ℹ️  MiMo plugin template not found — skipped.";
  }

  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  return `✅ MiMoCode plugin → ${dest}\n   (experimental.text.complete hook injects sponsored footers)`;
}

export function uninstallMimoPlugin(): string {
  const dest = mimoPluginDir();
  if (!existsSync(dest)) return "ℹ️  MiMoCode plugin not installed — nothing to remove.";

  rmSync(dest, { recursive: true, force: true });
  return `✅ MiMoCode plugin removed from ${dest}`;
}

export function mimoPluginStatus(): string {
  const dest = mimoPluginDir();
  if (!existsSync(dest)) return "MiMoCode plugin: not installed";
  const indexExists = existsSync(join(dest, "index.ts"));
  return `MiMoCode plugin: ${indexExists ? "installed" : "incomplete"} (${dest})`;
}
