/**
 * Agent-bundle patcher (advanced / invasive path).
 *
 * Locates an installed Claude Code / Codex (ChatGPT) editor extension, and —
 * only when the user opts in — appends the LATENT block to its webview bundle so
 * the sponsor line renders inside the agent's own spinner. Every change is
 * reversible: a pristine `.latent-backup` is written before the first edit, the
 * block is marker-delimited, and `restore()` puts the original bytes back and
 * removes the CSP relaxation.
 *
 * This modifies a third-party signed extension and relaxes its webview CSP to
 * reach the 127.0.0.1 loopback. It is off by default and gated behind an
 * explicit command / setting.
 */
import { existsSync, readdirSync, readFileSync, renameSync, copyFileSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { MARK_START, MARK_END } from "./block.js";

const BACKUP_SUFFIX = ".latent-backup";

/** Spinner "verb anchors" — presence confirms a known/compatible webview build. */
const VERB_ANCHORS = ["Discombobulating", "Clauding", "Reticulating", "Flibbertigibbeting", "Thinking"];

export type AgentKind = "claude-code" | "codex";

export interface AgentBundle {
  agent: AgentKind;
  extDir: string;
  bundlePath: string;
}

function extensionRoots(): string[] {
  const h = homedir();
  return [
    join(h, ".vscode", "extensions"),
    join(h, ".vscode-insiders", "extensions"),
    join(h, ".vscode-server", "extensions"),
    join(h, ".cursor", "extensions"),
    join(h, ".cursor-server", "extensions"),
  ].filter(existsSync);
}

function agentFor(dirName: string): AgentKind | null {
  const n = dirName.toLowerCase();
  if (n.startsWith("anthropic.claude-code")) return "claude-code";
  if (n.startsWith("openai.chatgpt") || n.startsWith("openai.codex")) return "codex";
  return null;
}

/** Recursively find .js bundle files that carry a verb anchor (bounded depth). */
function findBundleJs(dir: string, depth = 0): string | null {
  if (depth > 5) return null;
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const subdirs: string[] = [];
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      subdirs.push(p);
    } else if (name.endsWith(".js") && st.size < 12_000_000) {
      try {
        const head = readFileSync(p, "utf8");
        if (VERB_ANCHORS.some((v) => head.includes(v))) return p;
      } catch {
        /* ignore */
      }
    }
  }
  for (const sd of subdirs) {
    const hit = findBundleJs(sd, depth + 1);
    if (hit) return hit;
  }
  return null;
}

export function findAgentBundles(): AgentBundle[] {
  const out: AgentBundle[] = [];
  const seen = new Set<AgentKind>();
  for (const root of extensionRoots()) {
    let dirs: string[] = [];
    try {
      dirs = readdirSync(root);
    } catch {
      continue;
    }
    // Newest version dir wins (lexical sort is good enough for x.y.z suffixes).
    for (const name of dirs.sort().reverse()) {
      const agent = agentFor(name);
      if (!agent || seen.has(agent)) continue;
      const bundle = findBundleJs(join(root, name));
      if (bundle) {
        out.push({ agent, extDir: join(root, name), bundlePath: bundle });
        seen.add(agent);
      }
    }
  }
  return out;
}

export function isPatched(bundlePath: string): boolean {
  try {
    return readFileSync(bundlePath, "utf8").includes(MARK_START);
  } catch {
    return false;
  }
}

/** Add a 127.0.0.1 loopback allowance to any CSP connect-src in the bundle. */
function relaxCsp(content: string): string {
  // Broaden explicit connect-src directives.
  let out = content.replace(/connect-src([^;"'`]*)/g, (m, rest) =>
    rest.includes("127.0.0.1") ? m : `connect-src${rest} http://127.0.0.1:*`,
  );
  // Some builds only set default-src 'none' — add a connect-src alongside it.
  out = out.replace(/default-src 'none'/g, "default-src 'none'; connect-src http://127.0.0.1:*");
  return out;
}

export function patch(bundle: AgentBundle, block: string): "patched" | "incompatible" | "error" {
  try {
    const original = readFileSync(bundle.bundlePath, "utf8");
    if (!VERB_ANCHORS.some((v) => original.includes(v))) return "incompatible";

    const backup = bundle.bundlePath + BACKUP_SUFFIX;
    if (!existsSync(backup)) copyFileSync(bundle.bundlePath, backup);

    // Start from pristine so re-patching never stacks blocks.
    const pristine = readFileSync(backup, "utf8");
    const relaxed = relaxCsp(pristine);
    writeFileSync(bundle.bundlePath, relaxed + "\n" + block + "\n");
    return "patched";
  } catch {
    return "error";
  }
}

export function restore(bundle: AgentBundle): boolean {
  const backup = bundle.bundlePath + BACKUP_SUFFIX;
  if (!existsSync(backup)) {
    // No backup: best-effort strip of our marked block.
    try {
      const c = readFileSync(bundle.bundlePath, "utf8");
      const s = c.indexOf(MARK_START);
      const e = c.indexOf(MARK_END);
      if (s !== -1 && e !== -1 && e > s) {
        writeFileSync(bundle.bundlePath, (c.slice(0, s) + c.slice(e + MARK_END.length)).replace(/\n{3,}/g, "\n\n"));
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }
  try {
    renameSync(backup, bundle.bundlePath);
    return true;
  } catch {
    return false;
  }
}
