import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  AGENT_CLAUDE_CODE,
  configDir,
  cacheFile,
  isEnabled,
  loadConfig,
  resolveServer,
  resolveWallet,
} from "./config.js";
import { randomUUID } from "node:crypto";
import { logImpression, requestAd, type Ad } from "./api.js";
import { classifyPrompt } from "./classify.js";
import { AD_LIMITS, sanitizeAdText } from "./sanitize.js";

// 10s rotation = CodeBacks parity (ADS_STATUSLINE_ROTATE still overrides).
const DEFAULT_ROTATE_SECONDS = 10;

interface Cache {
  ad?: Ad;
  fetched_at?: number;
  session_id?: string;
  /**
   * True once POST /ad/impression has been sent for this cached ad.
   *
   * The cache is shared with the turn hook, which prefetches an ad at
   * turn-start using the classified prompt. That ad has not been billed by
   * anyone yet, so the flag — not the presence of the entry — is what decides
   * whether we still owe an impression.
   */
  billed?: boolean;
  /** Idempotency key for this ad's one impression — stable so a resend
   *  (flag lost, cache shared between terminals) dedupes server-side. */
  event_uuid?: string;
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
  // Advertiser-controlled — strip escape sequences / control chars before this
  // reaches the terminal. isSafeUrl() already guards the OSC 8 link target.
  const body = sanitizeAdText(ad.body || ad.title || "", AD_LIMITS.body);
  const ctaText = sanitizeAdText(ad.cta_text || "Learn more", AD_LIMITS.cta_text) || "Learn more";
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
    // Atomic swap — the cache is shared with the turn hook and (with several
    // terminals) other status-line processes; never leave a half-written file.
    const tmp = `${cacheFile()}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, cacheFile());
  } catch {
    // best-effort
  }
}

function rotateSeconds(): number {
  const raw = process.env.ADS_STATUSLINE_ROTATE || String(DEFAULT_ROTATE_SECONDS);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ROTATE_SECONDS;
}

/**
 * A coarse category slug for ad targeting — never the raw prompt. The Claude
 * Code session payload carries the user's prompt; classify it locally (as the
 * turn hook does) so only the slug leaves the machine.
 */
function contextFromSession(session: Record<string, unknown>): string {
  for (const key of ["prompt", "user_message", "context"]) {
    const val = session[key];
    if (typeof val === "string" && val.trim()) return classifyPrompt(val);
  }
  return "general";
}

export async function render(session: Record<string, unknown> = {}): Promise<string> {
  const cfg = loadConfig();
  if (!isEnabled(cfg)) return "";
  const wallet = resolveWallet(cfg);
  if (!wallet) return "";

  const sessionId = String(session.session_id ?? "");
  const cache = loadCache();
  const now = Date.now() / 1000;

  const server = resolveServer(cfg);

  const fresh =
    cache.ad &&
    (now - (cache.fetched_at ?? 0)) < rotateSeconds() &&
    (cache.session_id ?? sessionId) === sessionId;

  // On Claude Code the status line is the only thing the user actually sees,
  // so it owns the impression: it bills for exactly what it puts on screen,
  // once, whoever fetched the ad. The turn hook deliberately does not bill
  // (see HOOK_OWNS_IMPRESSION in hook.ts) — if both did, one displayed ad
  // would be charged to the advertiser twice.
  if (fresh && cache.ad) {
    const line = formatStatusline(cache.ad);
    if (!line) return "";
    if (!cache.billed) {
      const eventId = cache.event_uuid ?? randomUUID();
      await logImpression(
        cache.ad.ad_id || cache.ad.id || "",
        wallet,
        cache.ad.impression_token || "",
        server,
        undefined,
        eventId,
      );
      saveCache({ ...cache, billed: true, event_uuid: eventId });
    }
    return line;
  }

  const ad = await requestAd({
    wallet,
    context: contextFromSession(session),
    agent: AGENT_CLAUDE_CODE,
    surface: "status_line",
    server,
  });
  if (!ad) return "";

  // Reserve → render → confirm. Bill only after we have a statusline string
  // Claude Code will display.
  const line = formatStatusline(ad);
  if (!line) return "";
  const adId = ad.ad_id || ad.id || "";
  const eventId = randomUUID();
  await logImpression(adId, wallet, ad.impression_token || "", server, undefined, eventId);
  saveCache({ ad, fetched_at: now, session_id: sessionId, billed: true, event_uuid: eventId });
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
