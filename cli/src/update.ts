import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectAgents, formatDetectionTable, formatSurfaceMatrix } from "./detect.js";
import { loadConfig, resolveWallet } from "./config.js";
import { installClaudeCode } from "./surfaces/claude-code.js";
import { installHermes } from "./surfaces/hermes.js";
import { installOpenclaw } from "./surfaces/openclaw.js";
import {
  CODEX_AGENTS,
  codexDetected,
  installCodexFamily,
} from "./surfaces/codex.js";

/** Read the bundled package version from package.json next to dist/. */
function bundledVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(here, "..", "package.json"), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Fetch the latest version from the npm registry (network). */
function latestNpmVersion(): string | null {
  try {
    const res = spawnSync(
      "npm",
      ["view", "latent-protocol", "version"],
      { encoding: "utf8", timeout: 10_000 },
    );
    if (res.status === 0 && res.stdout.trim()) return res.stdout.trim();
  } catch {
    // network failure — not fatal
  }
  return null;
}

/** Force npx to re-fetch the latest package from npm. */
function npxForceUpdate(): { ok: boolean; version: string | null } {
  try {
    const res = spawnSync(
      "npx",
      ["--yes", "latent-protocol@latest", "--version"],
      { encoding: "utf8", timeout: 30_000 },
    );
    const version = res.stdout.trim() || null;
    return { ok: res.status === 0, version };
  } catch {
    return { ok: false, version: null };
  }
}

export interface UpdateFlags {
  yes: boolean;
  force: boolean;
}

/**
 * `npx latent-protocol update`
 *
 * 1. Show current bundled version + latest npm version
 * 2. Re-detect all surfaces
 * 3. Uninstall old patches, then re-install with latest code
 * 4. Print surface coverage matrix
 */
export async function runUpdate(flags: UpdateFlags): Promise<void> {
  const current = bundledVersion();
  console.log("🔄 Latent Protocol — update\n");
  console.log(`  Current version:  ${current}`);

  // Check npm registry
  const latest = latestNpmVersion();
  if (latest) {
    console.log(`  Latest version:   ${latest}`);
    if (latest !== current) {
      console.log(
        `\n  ⬆️  New version available: ${latest} (you have ${current})`,
      );
      if (!flags.force) {
        console.log("  Re-fetching latest from npm…\n");
        const fetch = npxForceUpdate();
        if (fetch.ok && fetch.version) {
          console.log(`  ✅ npx fetched ${fetch.version}`);
        } else {
          console.log("  ⚠️  Could not force-fetch latest; proceeding with current version.");
        }
      }
    } else {
      console.log("  ✅ Already on the latest version.");
      if (!flags.force) {
        console.log("  Use --force to re-patch surfaces anyway.\n");
      }
    }
  } else {
    console.log("  Latest version:   (could not reach npm registry)");
    if (!flags.force) {
      console.log("\n  ℹ️  Skipping surface re-patch. Use --force to re-patch anyway.");
      return;
    }
  }

  if (!flags.force && latest === current) {
    // Nothing to do — surfaces are already patched from init
    console.log("\n✅ Everything is up to date. No action needed.");
    console.log("   Run: npx latent-protocol status   — to verify patches");
    console.log("   Run: npx latent-protocol update --force   — to force re-patch");
    return;
  }

  // ── Re-patch surfaces ──
  console.log("\n🔍 Detecting agents…\n");
  const detected = detectAgents();
  console.log(formatDetectionTable(detected));
  console.log();

  const codexAgents = CODEX_AGENTS.filter(codexDetected);

  // Ensure wallet + config
  const cfg = loadConfig();
  const wallet = resolveWallet(cfg);

  if (!wallet) {
    console.log(
      "⚠️  No wallet configured. Run: npx latent-protocol init --generate\n",
    );
  }

  // Re-patch Claude Code
  if (detected.claudeCode) {
    console.log("── Claude Code ──");
    console.log(installClaudeCode());
    console.log();
  }

  // Re-patch Hermes + WebUI
  if (detected.hermes || detected.hermesWebui) {
    console.log("── Hermes ──");
    console.log(installHermes());
    console.log();
  }

  // Re-patch OpenClaw
  if (detected.openclaw) {
    console.log("── OpenClaw ──");
    console.log(installOpenclaw());
    console.log();
  }

  // Re-patch Codex / MiMo
  if (codexAgents.length > 0) {
    console.log("── Codex / MiMo ──");
    console.log(installCodexFamily());
    console.log();
  }

  // Re-detect after install for accurate matrix
  const after = detectAgents();
  console.log(formatSurfaceMatrix(after));
  console.log();

  if (latest && latest !== current) {
    console.log(`✅ Updated to ${latest} and re-patched all surfaces.`);
  } else {
    console.log("✅ Re-patched all surfaces.");
  }
  console.log("   Check: npx latent-protocol status");
}
