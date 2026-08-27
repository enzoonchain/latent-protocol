/** Config bridge: VS Code settings overlaid on ~/.latent-protocol/config.json. */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";

export interface LatentConfig {
  wallet: string;
  server: string;
  enabled: boolean;
  rotateSeconds: number;
  patchAgentBundles: boolean;
}

function sharedConfig(): { wallet?: string; server?: string; enabled?: boolean } {
  try {
    const p = join(homedir(), ".latent-protocol", "config.json");
    return JSON.parse(readFileSync(p, "utf8")) as {
      wallet?: string;
      server?: string;
      enabled?: boolean;
    };
  } catch {
    return {};
  }
}

export function loadConfig(): LatentConfig {
  const s = vscode.workspace.getConfiguration("latent");
  const shared = sharedConfig();
  return {
    wallet: (s.get<string>("wallet") || shared.wallet || "").trim(),
    server: (s.get<string>("server") || shared.server || "https://api.latentprotocol.xyz").replace(
      /\/+$/,
      "",
    ),
    enabled: s.get<boolean>("enabled", true) && shared.enabled !== false,
    rotateSeconds: Math.max(3, s.get<number>("rotateSeconds", 10)),
    patchAgentBundles: s.get<boolean>("patchAgentBundles", false),
  };
}
