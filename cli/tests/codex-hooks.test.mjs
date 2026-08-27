/**
 * Run after `npm --prefix cli run build`:
 *   node cli/tests/codex-hooks.test.mjs
 *
 * Verifies that the installed Codex / MiMo hooks.json uses the OFFICIAL Codex
 * hook event names (learn.chatgpt.com/docs/hooks): UserPromptSubmit = turn
 * start, Stop = turn end. `TurnStart` / `TurnEnd` do not exist in Codex and
 * would silently never fire.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import {
  CODEX_AGENTS,
  installCodexAgent,
  codexDetected,
} from "../dist/surfaces/codex.js";

const root = mkdtempSync(join(tmpdir(), "latent-codex-hooks-"));
try {
  // Give both agents a fake home so detection finds them.
  for (const a of CODEX_AGENTS) {
    writeFileSync(join(root, `${a.id}-marker`), "");
    process.env[a.homeEnv] = join(root, a.homeRel);
  }
  // Ensure detection passes (home dir exists).
  for (const a of CODEX_AGENTS) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(process.env[a.homeEnv], { recursive: true });
  }
  assert.ok(CODEX_AGENTS.every(codexDetected), "both agents should be detected");

  for (const a of CODEX_AGENTS) {
    const msg = installCodexAgent(a);
    assert.ok(msg.includes(a.name), `install message names ${a.name}`);
    const path = join(process.env[a.homeEnv], "hooks.json");
    const cfg = JSON.parse(readFileSync(path, "utf8"));

    // Official event names present:
    assert.ok(
      cfg.hooks.UserPromptSubmit,
      `${a.id}: UserPromptSubmit (turn start) must be registered`,
    );
    assert.ok(cfg.hooks.Stop, `${a.id}: Stop (turn end) must be registered`);
    assert.ok(cfg.hooks.SessionStart, `${a.id}: SessionStart registered`);
    assert.ok(cfg.hooks.SessionEnd, `${a.id}: SessionEnd registered`);

    // Non-existent TurnStart/TurnEnd must NOT be present:
    assert.ok(
      !cfg.hooks.TurnStart,
      `${a.id}: TurnStart is not a valid Codex event and must not be written`,
    );
    assert.ok(
      !cfg.hooks.TurnEnd,
      `${a.id}: TurnEnd is not a valid Codex event and must not be written`,
    );

    // Each entry is a command hook tagged with our marker, firing our runtime.
    for (const event of ["UserPromptSubmit", "Stop", "SessionStart", "SessionEnd"]) {
      const entries = cfg.hooks[event];
      assert.ok(Array.isArray(entries) && entries.length >= 1, `${a.id}: ${event} has entries`);
      const cmd = entries[0].hooks[0].command;
      assert.ok(cmd.includes("latent-protocol hook"), `${a.id}: ${event} uses latent hook`);
      assert.ok(cmd.includes(`--agent ${a.id}`), `${a.id}: ${event} targets ${a.id}`);
    }
  }

  console.log("ok - codex hooks use official event names");
} finally {
  for (const a of CODEX_AGENTS) delete process.env[a.homeEnv];
  rmSync(root, { recursive: true, force: true });
}
