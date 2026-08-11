/**
 * Latent Protocol VS Code / Cursor extension.
 *
 * Two display paths, matching CodeBacks:
 *  - Non-invasive (default): a status-bar sponsor line + a sidebar "ad card",
 *    both fed by the local loopback. No third-party files touched.
 *  - Advanced (opt-in): runtime-patch the Claude Code / Codex webview bundle so
 *    the sponsor line renders inside the agent's own spinner (reversible).
 */
import * as vscode from "vscode";
import { loadConfig } from "./config.js";
import { classifyWorkspace, type Category } from "./classify.js";
import { Loopback } from "./loopback.js";
import { buildBlock } from "./block.js";
import { findAgentBundles, patch, restore, isPatched } from "./patcher.js";

let loopback: Loopback | null = null;
let statusItem: vscode.StatusBarItem | null = null;
let rotateTimer: ReturnType<typeof setInterval> | null = null;
let reassertTimer: ReturnType<typeof setInterval> | null = null;
let category: Category = "general";

interface LoopAd {
  text: string;
  url: string;
  adId: string;
  token: string;
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function fetchAd(): Promise<LoopAd | null> {
  if (!loopback) return null;
  try {
    const r = await fetch(`${loopback.baseUrl}/ad?cat=${encodeURIComponent(category)}`);
    const j = (await r.json()) as { ad?: LoopAd | null };
    return j.ad ?? null;
  } catch {
    return null;
  }
}

async function reportImpression(ad: LoopAd, displayedMs: number): Promise<void> {
  if (!loopback || !ad.adId) return;
  try {
    await fetch(`${loopback.baseUrl}/impression`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adId: ad.adId, token: ad.token, displayedMs }),
    });
  } catch {
    /* best-effort */
  }
}

class SponsorViewProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: true };
    const render = async () => {
      const ad = await fetchAd();
      const cfg = loadConfig();
      view.webview.html = cardHtml(ad, cfg.wallet);
      if (ad) void reportImpression(ad, cfg.rotateSeconds * 1000);
    };
    void render();
    const iv = setInterval(render, Math.max(3000, loadConfig().rotateSeconds * 1000));
    view.onDidDispose(() => clearInterval(iv));
  }
}

function cardHtml(ad: LoopAd | null, wallet: string): string {
  const w = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "not set";
  const body = ad
    ? `<div class="ad"><div class="tag">💡 Sponsored</div><div class="txt">${escapeHtml(ad.text)}</div>${
        ad.url ? `<a href="${escapeHtml(ad.url)}">Learn more →</a>` : ""
      }</div>`
    : `<div class="idle">No sponsor right now — you still earn while your agent thinks.</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:var(--vscode-font-family);padding:10px;color:var(--vscode-foreground)}
    .tag{font-size:11px;opacity:.7;text-transform:uppercase;letter-spacing:.05em}
    .txt{margin:6px 0;font-size:13px}
    a{color:var(--vscode-textLink-foreground)}
    .wallet{margin-top:14px;font-size:11px;opacity:.6}
    .idle{font-size:12px;opacity:.7}
  </style></head><body>${body}<div class="wallet">Earnings wallet: ${w}</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}

async function startStatusRotation(): Promise<void> {
  if (!statusItem) return;
  let current: LoopAd | null = null;
  let shownAt = 0;
  const cfg = loadConfig();
  const tick = async () => {
    if (current) await reportImpression(current, Date.now() - shownAt);
    current = await fetchAd();
    if (current) {
      shownAt = Date.now();
      statusItem!.text = `💡 ${current.text}`.slice(0, 60);
      statusItem!.tooltip = current.url || "Latent Protocol — sponsored";
      statusItem!.show();
    } else {
      statusItem!.text = "💡 Latent";
      statusItem!.show();
    }
  };
  await tick();
  rotateTimer = setInterval(tick, Math.max(3000, cfg.rotateSeconds * 1000));
}

async function applyBundlePatch(context: vscode.ExtensionContext, announce: boolean): Promise<void> {
  const cfg = loadConfig();
  const bundles = findAgentBundles();
  if (!bundles.length) {
    if (announce) void vscode.window.showInformationMessage("Latent: no Claude Code / Codex extension bundle found to patch.");
    return;
  }
  let ok = 0;
  for (const b of bundles) {
    if (!loopback) continue;
    const block = buildBlock(loopback.baseUrl, cfg.rotateSeconds, category);
    const res = patch(b, block);
    if (res === "patched") ok++;
  }
  if (announce) {
    const msg =
      ok > 0
        ? `Latent: patched ${ok} agent bundle(s). Reload the agent window (Developer: Reload Window) to apply.`
        : "Latent: no compatible bundle patched.";
    void vscode.window.showInformationMessage(msg);
  }
  // Reassert every 60s in case the host extension updates/reverts.
  if (!reassertTimer) {
    reassertTimer = setInterval(() => {
      const cur = loadConfig();
      if (!cur.patchAgentBundles || !loopback) return;
      for (const b of findAgentBundles()) {
        if (!isPatched(b.bundlePath)) patch(b, buildBlock(loopback.baseUrl, cur.rotateSeconds, category));
      }
    }, 60_000);
    context.subscriptions.push({ dispose: () => reassertTimer && clearInterval(reassertTimer) });
  }
}

function restoreAll(announce: boolean): void {
  let n = 0;
  for (const b of findAgentBundles()) if (restore(b)) n++;
  if (reassertTimer) {
    clearInterval(reassertTimer);
    reassertTimer = null;
  }
  if (announce) void vscode.window.showInformationMessage(`Latent: restored ${n} agent bundle(s).`);
}

async function startDisplay(context: vscode.ExtensionContext): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.enabled) return;
  category = classifyWorkspace(workspaceRoot());

  loopback = new Loopback("vscode", () => category);
  await loopback.start();

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusItem);
  await startStatusRotation();

  if (cfg.patchAgentBundles) await applyBundlePatch(context, false);
}

function stopDisplay(): void {
  if (rotateTimer) clearInterval(rotateTimer);
  rotateTimer = null;
  statusItem?.hide();
  loopback?.stop();
  loopback = null;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("latentSponsor", new SponsorViewProvider()),
    vscode.commands.registerCommand("latent.enable", async () => {
      await vscode.workspace.getConfiguration("latent").update("enabled", true, true);
      stopDisplay();
      await startDisplay(context);
      void vscode.window.showInformationMessage("Latent: sponsored spinner enabled.");
    }),
    vscode.commands.registerCommand("latent.disable", async () => {
      await vscode.workspace.getConfiguration("latent").update("enabled", false, true);
      stopDisplay();
      void vscode.window.showInformationMessage("Latent: sponsored spinner disabled.");
    }),
    vscode.commands.registerCommand("latent.patchAgentBundles", async () => {
      await vscode.workspace.getConfiguration("latent").update("patchAgentBundles", true, true);
      if (!loopback) await startDisplay(context);
      await applyBundlePatch(context, true);
    }),
    vscode.commands.registerCommand("latent.restore", () => restoreAll(true)),
    vscode.commands.registerCommand("latent.showEarnings", async () => {
      const cfg = loadConfig();
      if (!cfg.wallet) return void vscode.window.showWarningMessage("Latent: no wallet set (run `npx latent-protocol init`).");
      try {
        const r = await fetch(`${cfg.server}/earnings/${cfg.wallet}`);
        const j = (await r.json()) as { balance?: number };
        void vscode.window.showInformationMessage(`Latent balance: $${Number(j.balance ?? 0).toFixed(4)} USDC`);
      } catch {
        void vscode.window.showErrorMessage("Latent: could not reach the ad server.");
      }
    }),
  );

  await startDisplay(context);
}

export function deactivate(): void {
  stopDisplay();
  // Leave bundle patches in place across reloads; `Latent: Restore` / uninstall removes them.
}
