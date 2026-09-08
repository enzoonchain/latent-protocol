/**
 * Standalone Claude Code turn-lifecycle hook runtime.
 *
 * Bundled by esbuild into a dependency-free `dist/claude/hook.mjs`, copied by
 * `init` to `~/.latent-protocol/bin/hook.mjs`, and invoked from settings.json
 * as `node "<that path>" <event> --agent claude-code` — no `npx` at runtime.
 *
 * Usage: hook.mjs <session-start|turn-start|turn-end|session-end> --agent <id>
 * Reads the hook payload JSON on stdin; prints hook output (or nothing) on
 * stdout. Never throws — fail open so the host agent's turn is never blocked.
 */
import { runHook, type HookAgent, type HookEvent } from "../hook.js";
import { readSessionFromStdin } from "../statusline.js";

const VALID_EVENTS: HookEvent[] = [
  "session-start",
  "turn-start",
  "turn-end",
  "session-end",
];

function parseAgent(args: string[]): HookAgent {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--agent" && args[i + 1]) return args[i + 1] as HookAgent;
    if (args[i]!.startsWith("--agent=")) {
      return args[i]!.slice("--agent=".length) as HookAgent;
    }
  }
  return "claude-code";
}

async function main(): Promise<void> {
  const [event, ...rest] = process.argv.slice(2);
  if (!VALID_EVENTS.includes(event as HookEvent)) {
    // Unknown event — stay silent, never disturb the host agent.
    return;
  }
  try {
    const payload = await readSessionFromStdin();
    const out = await runHook(event as HookEvent, parseAgent(rest), payload);
    if (out) process.stdout.write(out);
  } catch {
    // fail open
  }
}

void main();
