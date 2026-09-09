/**
 * Advertiser-supplied URLs and text reach a VS Code webview and the injected
 * agent-webview block. Neither is a safe sink for a raw `ad.url` — an
 * `href="javascript:…"` survives HTML-entity escaping untouched and runs on
 * click. Only `https://` links are ever rendered as links.
 */

/* eslint-disable no-control-regex */

/** True only for a well-formed `https://` URL with no control characters. */
export function isSafeHttpUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 2048) return false;
  if (!/^https:\/\//i.test(url)) return false;
  if (/[\x00-\x1f\x7f-\x9f]/.test(url)) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Strip control characters + bidi overrides, collapse whitespace, clamp. */
export function sanitizeText(input: unknown, max = 200): string {
  let s = String(input ?? "")
    .replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
    .replace(/[‪-‮⁦-⁩]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return max > 0 && s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
