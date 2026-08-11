/**
 * Coding-agent surfaces — Cursor, Codex, MiMo, Gemini CLI.
 *
 * These MCP-capable coding agents don't expose a statusLine like Claude Code,
 * so we monetize them the way STATUS.md describes for the "Codex / MiMo" row:
 * a session-start skill plus a hook. Concretely, for each detected agent we:
 *
 *   1. Register the `latent-protocol` MCP server in the agent's own MCP config
 *      (real, supported integration point — all four load MCP servers), so the
 *      agent can call `request_ad` / `check_balance` during a session.
 *   2. Write a marker-delimited instructions block into the agent's global
 *      instructions file (AGENTS.md / GEMINI.md / a Cursor rule), telling it to
 *      surface one sponsored line at session start.
 *
 * Both edits are marker-delimited or key-scoped so `uninstall` reverts cleanly
 * without touching the user's own MCP servers or instructions.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { loadConfig, resolveServer, resolveWallet } from "../config.js";

const MCP_ID = "latent-protocol";
const MCP_COMMAND = "latent-mcp";
const BLOCK_BEGIN = "<!-- BEGIN latent-protocol -->";
const BLOCK_END = "<!-- END latent-protocol -->";

type McpFormat = "json" | "toml";

interface CodingAgent {
  id: string;
  name: string;
  /** Env var that overrides the agent home dir. */
  homeEnv: string;
  /** Home dir relative to $HOME when the env var is unset. */
  homeRel: string;
  /** Possible executable names to look for on PATH. */
  binaries: string[];
  /** MCP config file relative to the agent home dir + its format. */
  mcp: { file: string; format: McpFormat };
  /** Global instructions file relative to the agent home dir. */
  instructions: { file: string; mdc?: boolean };
}

const AGENTS: CodingAgent[] = [
  {
    id: "cursor",
    name: "Cursor",
    homeEnv: "CURSOR_HOME",
    homeRel: ".cursor",
    binaries: ["cursor-agent", "cursor"],
    mcp: { file: "mcp.json", format: "json" },
    instructions: { file: join("rules", "latent-protocol.mdc"), mdc: true },
  },
  {
    id: "codex",
    name: "Codex",
    homeEnv: "CODEX_HOME",
    homeRel: ".codex",
    binaries: ["codex"],
    mcp: { file: "config.toml", format: "toml" },
    instructions: { file: "AGENTS.md" },
  },
  {
    id: "mimo",
    name: "MiMo",
    homeEnv: "MIMO_HOME",
    homeRel: ".mimo",
    binaries: ["mimo"],
    mcp: { file: "mcp.json", format: "json" },
    instructions: { file: "AGENTS.md" },
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    homeEnv: "GEMINI_HOME",
    homeRel: ".gemini",
    binaries: ["gemini"],
    mcp: { file: "settings.json", format: "json" },
    instructions: { file: "GEMINI.md" },
  },
];

export interface CodingAgentState {
  agent: CodingAgent;
  home: string;
  bin: string | null;
  present: boolean;
}

function which(bin: string): string | null {
  const res = spawnSync("bash", ["-lc", `command -v ${bin}`], {
    encoding: "utf8",
  });
  const out = (res.stdout || "").trim();
  return res.status === 0 && out ? out : null;
}

function agentHome(a: CodingAgent, home = homedir()): string {
  return process.env[a.homeEnv] || join(home, a.homeRel);
}

export function detectCodingAgents(home = homedir()): CodingAgentState[] {
  return AGENTS.map((agent) => {
    const dir = agentHome(agent, home);
    let bin: string | null = null;
    for (const b of agent.binaries) {
      bin = which(b);
      if (bin) break;
    }
    return {
      agent,
      home: dir,
      bin,
      present: existsSync(dir) || Boolean(bin),
    };
  });
}

/** MCP server entry we register (carries wallet/server so the server can bill). */
function mcpServerEntry(): {
  command: string;
  args: string[];
  env: Record<string, string>;
} {
  const cfg = loadConfig();
  const env: Record<string, string> = { ADS_SERVER: resolveServer(cfg) };
  const wallet = resolveWallet(cfg);
  if (wallet) env.ADS_WALLET = wallet;
  return { command: MCP_COMMAND, args: [], env };
}

function instructionsBody(): string {
  return [
    "## Sponsored (Latent Protocol)",
    "",
    "This agent earns USDC on Base from a single sponsored line per session.",
    "At the **start of each session**, call the `latent-protocol` MCP tool",
    "`request_ad` once and render the returned line as a short footer, e.g.:",
    "",
    "> 💡 Sponsored — <ad text> — <link>",
    "",
    "Rules: show at most one sponsored line per session, never fabricate ad",
    "content (only render what `request_ad` returns), and skip silently if the",
    "tool is unavailable. Users can check earnings with `check_balance`.",
  ].join("\n");
}

function managedBlock(mdc: boolean): string {
  const body = instructionsBody();
  if (mdc) {
    // Cursor .mdc rule: YAML frontmatter so the rule always applies.
    return [
      BLOCK_BEGIN,
      "---",
      "description: Latent Protocol sponsored line",
      "alwaysApply: true",
      "---",
      "",
      body,
      BLOCK_END,
      "",
    ].join("\n");
  }
  return [BLOCK_BEGIN, "", body, BLOCK_END, ""].join("\n");
}

/** Replace an existing managed block or append a fresh one. */
function upsertBlock(existing: string, block: string): string {
  const start = existing.indexOf(BLOCK_BEGIN);
  const end = existing.indexOf(BLOCK_END);
  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start);
    const after = existing.slice(end + BLOCK_END.length).replace(/^\n/, "");
    return `${before}${block}${after}`;
  }
  const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
  return `${existing}${sep}${block}`;
}

/** Remove the managed block; returns null when nothing changed. */
function stripBlock(existing: string): string | null {
  const start = existing.indexOf(BLOCK_BEGIN);
  const end = existing.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) return null;
  const before = existing.slice(0, start).replace(/\n+$/, "\n");
  const after = existing.slice(end + BLOCK_END.length).replace(/^\n+/, "");
  const next = `${before}${after}`.replace(/\n{3,}/g, "\n\n");
  return next.trim() ? next : "";
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

// ── MCP config: JSON ────────────────────────────────────────────────────────

function installMcpJson(path: string): string {
  let obj: Record<string, unknown> = {};
  const raw = readText(path);
  if (raw.trim()) {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return `⚠️  ${path} is not valid JSON — left untouched, register ${MCP_ID} manually.`;
    }
  }
  const servers =
    (obj.mcpServers as Record<string, unknown> | undefined) ?? {};
  servers[MCP_ID] = mcpServerEntry();
  obj.mcpServers = servers;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
  return `✅ MCP server ${MCP_ID} → ${path}`;
}

function uninstallMcpJson(path: string): string | null {
  const raw = readText(path);
  if (!raw.trim()) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const servers = obj.mcpServers as Record<string, unknown> | undefined;
  if (!servers || !(MCP_ID in servers)) return null;
  delete servers[MCP_ID];
  if (Object.keys(servers).length === 0) delete obj.mcpServers;
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
  return `✅ Removed MCP server ${MCP_ID} from ${path}`;
}

// ── MCP config: TOML (Codex) ────────────────────────────────────────────────

const TOML_BEGIN = "# BEGIN latent-protocol";
const TOML_END = "# END latent-protocol";

function tomlBlock(): string {
  const entry = mcpServerEntry();
  const envLines = Object.entries(entry.env)
    .map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)}`)
    .join(", ");
  return [
    TOML_BEGIN,
    `[mcp_servers.${MCP_ID}]`,
    `command = ${JSON.stringify(entry.command)}`,
    `args = []`,
    envLines ? `env = { ${envLines} }` : "",
    TOML_END,
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

function installMcpToml(path: string): string {
  const raw = readText(path);
  const block = tomlBlock();
  const start = raw.indexOf(TOML_BEGIN);
  const end = raw.indexOf(TOML_END);
  let next: string;
  if (start !== -1 && end !== -1 && end > start) {
    next = raw.slice(0, start) + block + raw.slice(end + TOML_END.length).replace(/^\n/, "");
  } else {
    const sep = raw && !raw.endsWith("\n") ? "\n\n" : raw ? "\n" : "";
    next = `${raw}${sep}${block}`;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next.endsWith("\n") ? next : next + "\n");
  return `✅ MCP server ${MCP_ID} → ${path}`;
}

function uninstallMcpToml(path: string): string | null {
  const raw = readText(path);
  const start = raw.indexOf(TOML_BEGIN);
  const end = raw.indexOf(TOML_END);
  if (start === -1 || end === -1 || end < start) return null;
  const next =
    raw.slice(0, start).replace(/\n+$/, "\n") +
    raw.slice(end + TOML_END.length).replace(/^\n+/, "");
  writeFileSync(path, next.replace(/\n{3,}/g, "\n\n"));
  return `✅ Removed MCP server ${MCP_ID} from ${path}`;
}

// ── Per-agent install / uninstall / status ──────────────────────────────────

function installOne(st: CodingAgentState): string {
  const { agent, home } = st;
  const lines: string[] = [`${agent.name}:`];

  // 1. MCP server registration
  const mcpPath = join(home, agent.mcp.file);
  lines.push(
    "  " +
      (agent.mcp.format === "json"
        ? installMcpJson(mcpPath)
        : installMcpToml(mcpPath)),
  );

  // 2. Session-start instructions block
  const insPath = join(home, agent.instructions.file);
  const current = readText(insPath);
  const merged = upsertBlock(current, managedBlock(Boolean(agent.instructions.mdc)));
  mkdirSync(dirname(insPath), { recursive: true });
  writeFileSync(insPath, merged.endsWith("\n") ? merged : merged + "\n");
  lines.push(`  ✅ Session-start ad instructions → ${insPath}`);

  return lines.join("\n");
}

function uninstallOne(st: CodingAgentState): string {
  const { agent, home } = st;
  const lines: string[] = [];

  const mcpPath = join(home, agent.mcp.file);
  const mcpMsg =
    agent.mcp.format === "json"
      ? uninstallMcpJson(mcpPath)
      : uninstallMcpToml(mcpPath);
  if (mcpMsg) lines.push(`  ${mcpMsg}`);

  const insPath = join(home, agent.instructions.file);
  const current = readText(insPath);
  const stripped = current ? stripBlock(current) : null;
  if (stripped !== null) {
    if (stripped === "") {
      // Only our block lived here (typical for the Cursor rule) — blank it.
      writeFileSync(insPath, "");
    } else {
      writeFileSync(insPath, stripped.endsWith("\n") ? stripped : stripped + "\n");
    }
    lines.push(`  ✅ Removed ad instructions from ${insPath}`);
  }

  return lines.length
    ? `${agent.name}:\n${lines.join("\n")}`
    : `${agent.name}: nothing to remove`;
}

function hasBlock(path: string): boolean {
  return readText(path).includes(BLOCK_BEGIN);
}

function hasMcp(st: CodingAgentState): boolean {
  const raw = readText(join(st.home, st.agent.mcp.file));
  return st.agent.mcp.format === "json"
    ? raw.includes(`"${MCP_ID}"`)
    : raw.includes(`[mcp_servers.${MCP_ID}]`);
}

/** Install every detected coding agent. Returns human-readable report lines. */
export function installCodingAgents(): string {
  const states = detectCodingAgents().filter((s) => s.present);
  if (states.length === 0) {
    return "ℹ️  No Cursor / Codex / MiMo / Gemini install detected — skipped.";
  }
  return states.map(installOne).join("\n");
}

export function uninstallCodingAgents(): string {
  const states = detectCodingAgents().filter((s) => s.present);
  if (states.length === 0) {
    return "ℹ️  No Cursor / Codex / MiMo / Gemini install detected; nothing to remove.";
  }
  return states.map(uninstallOne).join("\n");
}

/** One status line per coding agent (detected ones only). */
export function codingAgentsStatus(): string[] {
  return detectCodingAgents()
    .filter((s) => s.present)
    .map((s) => {
      const insPath = join(s.home, s.agent.instructions.file);
      const patched = hasMcp(s) && hasBlock(insPath);
      const via = s.bin ? "bin" : "home";
      return `${s.agent.name}: ${patched ? "patched" : "detected"} (${via}: ${s.home})`;
    });
}

/** Rows for the detection table: [name, status, path]. */
export function codingAgentsDetectionRows(): [string, string, string][] {
  return detectCodingAgents().map((s) => [
    s.agent.name,
    s.present ? (s.bin ? "detected+bin" : "detected") : "not found",
    s.home,
  ]);
}

/** Matrix lines for `formatSurfaceMatrix`, detected agents only. */
export function codingAgentsMatrix(): string[] {
  return detectCodingAgents()
    .filter((s) => s.present)
    .map(
      (s) =>
        `  • ${s.agent.name.padEnd(11)} (MCP + session-start ad):        ${
          hasMcp(s) ? "MCP latent-protocol + instructions" : "pending init"
        }`,
    );
}
