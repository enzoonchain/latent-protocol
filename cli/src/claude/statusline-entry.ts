/**
 * Standalone Claude Code status-line renderer.
 *
 * esbuild bundles this (and its whole import graph — config, api, classify,
 * adcache; none of which touch `viem`) into a single dependency-free
 * `dist/claude/statusline.mjs`. `init` copies that file to
 * `~/.latent-protocol/bin/statusline.mjs` and points settings.json at
 * `node "<that path>"` — so the status line is a local script, never an `npx`
 * install.
 *
 * Contract: read the Claude Code session JSON on stdin, print the sponsor line
 * (or nothing) on stdout. Never throw — a broken status line must not break
 * the host.
 */
import { readSessionFromStdin, render } from "../statusline.js";

async function main(): Promise<void> {
  try {
    const line = await render(await readSessionFromStdin());
    if (line) process.stdout.write(line);
  } catch {
    // never break Claude Code's status line
  }
}

void main();
