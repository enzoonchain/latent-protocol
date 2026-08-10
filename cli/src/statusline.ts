import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { configDir, cacheFile, isEnabled, loadConfig, resolveServer, resolveWallet } from "./config.js";
import { logImpression, requestAd, type Ad } from "./api.js";

const DEFAULT_ROTATE_SECONDS = 30;

interface Cache {
  ad?: Ad;
  fetched_at?: number;
  session_id?: string;
}

function isSafeUrl(url: string): boolean {
  if (typeof url !== "string" || !url.startsWith("https://")) return false;
  return [...url].every((c) => c.charCodeAt(0) >= 0x20 && c !== "\u001b" && c !== "\u0007");
}

function osc8Link(text: string, url: string): string {
  if (!isSafeUrl(url)) return text;
  return `\u001b]8;;${url}\u001b\\${text}\u001b]8;;\u001b\\`;
}

export function formatStatusline(ad: Ad): string {
  const body = ad.body || ad.title || "";
  const ctaText = ad.cta_text || "Learn more";
  const ctaUrl = ad.cta_url || "";
  const earn = ad.earn_amount ?? 0;
  const cta = osc8Link(`${ctaText} →`, ctaUrl);
  return `\u001b[33m💰 Sponsored:\u001b[0m ${body}  ${cta}  \u001b[2m·  +$${earn} USDC\u001b[0m`;
}

function loadCache(): Cache {
  try {
    return JSON.parse(readFileSync(cacheFile(), "utf8")) as Cache;
  } catch {
    return {};
  }
}

function saveCache(data: Cache): void {
  try {
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(cacheFile(), JSON.stringify(data));
  } catch {
    // best-effort
  }
}

function rotateSeconds(): number {
  const raw = process.env.ADS_STATUSLINE_ROTATE || String(DEFAULT_ROTATE_SECONDS);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ROTATE_SECONDS;
}

function contextFromSession(session: Record<string, unknown>): string {
  for (const key of ["prompt", "user_message", "context"]) {
    const val = session[key];
    if (typeof val === "string" && val) return val;
  }
  const model = session.model;
  if (model && typeof model === "object" && "display_name" in model) {
    const name = (model as { display_name?: string }).display_name;
    if (name) return `coding with ${name}`;
  }
  return "coding";
}

export async function render(session: Record<string, unknown> = {}): Promise<string> {
  const cfg = loadConfig();
  if (!isEnabled(cfg)) return "";
  const wallet = resolveWallet(cfg);
  if (!wallet) return "";

  const sessionId = String(session.session_id ?? "");
  const cache = loadCache();
  const now = Date.now() / 1000;

  const fresh =
    cache.ad &&
    (now - (cache.fetched_at ?? 0)) < rotateSeconds() &&
    (cache.session_id ?? sessionId) === sessionId;

  if (fresh && cache.ad) {
    return formatStatusline(cache.ad);
  }

  const ad = await requestAd({
    wallet,
    context: contextFromSession(session),
    agent: "claude_code",
    surface: "status_line",
    server: resolveServer(cfg),
  });
  if (!ad) return "";

  // Reserve → render → confirm. Bill only after we have a statusline string
  // Claude Code will display.
  const line = formatStatusline(ad);
  if (!line) return "";
  const adId = ad.ad_id || ad.id || "";
  await logImpression(adId, wallet, ad.impression_token || "", resolveServer(cfg));
  saveCache({ ad, fetched_at: now, session_id: sessionId });
  return line;
}

export async function readSessionFromStdin(): Promise<Record<string, unknown>> {
  if (process.stdin.isTTY) return {};
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
