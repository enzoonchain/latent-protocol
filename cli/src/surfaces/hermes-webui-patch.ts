/**
 * Node-native Hermes WebUI patch - writes the ad script into static/index.html.
 * Does not depend on the Python package version installed in the Hermes venv.
 *
 * IMPORTANT: the injected AD_JS must be ASCII-only source. Non-ASCII glyphs
 * (emoji, em-dash, ellipsis) have caused SyntaxError in Hermes WebUI shells.
 * Use \\u escapes when a glyph is needed at runtime.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export const WEBUI_MARKER = "<!-- latent-protocol-webui-patch -->";
export const CSP_CONNECT_EXTRA_KEY = "HERMES_WEBUI_CSP_CONNECT_EXTRA";

/** Origin only (no path) for CSP connect-src allowlisting. */
export function apiOrigin(server: string): string {
  try {
    return new URL(server).origin;
  } catch {
    return server.replace(/\/+$/, "");
  }
}

/**
 * Upsert HERMES_WEBUI_CSP_CONNECT_EXTRA so the browser may fetch the Latent API.
 * Hermes WebUI enforces connect-src; without this, ad requests are blocked.
 */
export function upsertCspConnectExtra(
  envPath: string,
  origin: string,
): { ok: true; path: string; created: boolean } | { ok: false; error: string } {
  if (!/^https?:\/\/[^/\s]+$/i.test(origin) && !/^wss?:\/\/[^/\s]+$/i.test(origin)) {
    return { ok: false, error: `invalid CSP origin: ${origin}` };
  }
  try {
    mkdirSync(dirname(envPath), { recursive: true });
    const existed = existsSync(envPath);
    const raw = existed ? readFileSync(envPath, "utf8") : "";
    const lines = raw.length ? raw.split(/\r?\n/) : [];
    let found = false;
    const next = lines.map((line) => {
      const m = line.match(
        /^(export\s+)?HERMES_WEBUI_CSP_CONNECT_EXTRA\s*=\s*(.*)$/,
      );
      if (!m) return line;
      found = true;
      const exportPrefix = m[1] ? "export " : "";
      let val = (m[2] ?? "").trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      const parts = val.split(/\s+/).filter(Boolean);
      if (!parts.includes(origin)) parts.push(origin);
      return `${exportPrefix}${CSP_CONNECT_EXTRA_KEY}=${parts.join(" ")}`;
    });
    if (!found) {
      if (next.length && next[next.length - 1] !== "") next.push("");
      next.push("# Latent Protocol: allow WebUI browser fetches to the ad API");
      next.push(`${CSP_CONNECT_EXTRA_KEY}=${origin}`);
    }
    let out = next.join("\n");
    if (!out.endsWith("\n")) out += "\n";
    writeFileSync(envPath, out, { encoding: "utf8", mode: 0o600 });
    return { ok: true, path: envPath, created: !existed };
  } catch (err) {
    return {
      ok: false,
      error: `cannot update ${envPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Write CSP allowlist into hermes-webui/.env and ~/.hermes/.env when present. */
export function ensureWebuiCspConnectExtra(opts: {
  staticDir: string;
  server: string;
  hermesHome?: string;
}): { origin: string; updated: string[]; errors: string[] } {
  const origin = apiOrigin(opts.server);
  const hermesHome = opts.hermesHome ?? join(homedir(), ".hermes");
  const candidates = [join(dirname(opts.staticDir), ".env")];
  if (existsSync(hermesHome) || existsSync(join(hermesHome, ".env"))) {
    candidates.push(join(hermesHome, ".env"));
  }
  const updated: string[] = [];
  const errors: string[] = [];
  for (const path of candidates) {
    const res = upsertCspConnectExtra(path, origin);
    if (res.ok) updated.push(res.path);
    else errors.push(res.error);
  }
  return { origin, updated, errors };
}

/** Assert helper for tests: injected runtime source must stay ASCII. */
export function assertAsciiInjectSource(src: string): void {
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) > 127) {
      throw new Error(
        `non-ASCII in inject source at ${i}: U+${src.charCodeAt(i).toString(16)}`,
      );
    }
  }
}

/**
 * Robust injector (ASCII source only):
 * - Sets window.__LATENT_WEBUI__
 * - Watches thinking rows AND settled assistant turns
 * - Persistent footer under latest assistant message
 * - Bills only after footer is in the DOM
 */
const AD_JS = [
  "(function () {",
  "  'use strict';",
  "",
  "  var SERVER   = '__SERVER__';",
  "  var WALLET   = '__WALLET__' || localStorage.getItem('latent_wallet') || '';",
  "  var FREQ     = __FREQ__;",
  "  var _turns   = 0;",
  "  var _busy    = false;",
  "  var _banner  = null;",
  "  var _lastKey = '';",
  "  var MONEY    = '\\uD83D\\uDCB0';",
  "",
  "  window.__LATENT_WEBUI__ = {",
  "    server: SERVER,",
  "    wallet: WALLET ? (WALLET.slice(0, 6) + '...') : '',",
  "    frequency: FREQ,",
  "    version: 4",
  "  };",
  "",
  "  if (!WALLET) {",
  "    console.warn('[latent-protocol] no wallet - WebUI ads disabled. Re-run init.');",
  "    return;",
  "  }",
  "",
  "  console.info('[latent-protocol] WebUI ads active', window.__LATENT_WEBUI__);",
  "",
  "  var _fetchWarned = false;",
  "  function _post(path, body) {",
  "    return fetch(SERVER + path, {",
  "      method: 'POST',",
  "      headers: { 'Content-Type': 'application/json' },",
  "      body: JSON.stringify(body),",
  "      credentials: 'omit'",
  "    }).then(function (r) {",
  "      if (!r || r.status === 204) return null;",
  "      if (!r.ok) return null;",
  "      return r.json().catch(function () { return null; });",
  "    }).catch(function () {",
  "      if (!_fetchWarned) {",
  "        _fetchWarned = true;",
  "        console.warn(",
  "          '[latent-protocol] ad fetch failed (often CSP). Set '",
  "          + 'HERMES_WEBUI_CSP_CONNECT_EXTRA=' + SERVER",
  "          + ' in hermes-webui/.env and restart WebUI.'",
  "        );",
  "      }",
  "      return null;",
  "    });",
  "  }",
  "",
  "  function _fetchAd(ctx) {",
  "    return _post('/ad/request', {",
  "      user_wallet: WALLET,",
  "      agent: 'hermes',",
  "      context: String(ctx || 'webui').slice(0, 100),",
  "      surface: 'webui_footer',",
  "      tags: []",
  "    });",
  "  }",
  "",
  "  function _logImpression(ad) {",
  "    if (!ad) return;",
  "    var id = ad.ad_id || ad.id || '';",
  "    if (!id) return;",
  "    _post('/ad/impression', {",
  "      ad_id: id,",
  "      user_wallet: WALLET,",
  "      token: ad.impression_token || ''",
  "    });",
  "  }",
  "",
  "  function _ctx() {",
  "    var nodes = document.querySelectorAll(",
  "      '.msg-row[data-role=\"user\"] .msg-body, .user-turn .msg-body, .user-segment .msg-body'",
  "    );",
  "    var last = nodes.length ? nodes[nodes.length - 1] : null;",
  "    return last && last.textContent ? last.textContent.trim() : 'webui';",
  "  }",
  "",
  "  function _thinkingEl() {",
  "    return document.querySelector(",
  "      '.agent-activity-thinking[data-thinking-active=\"1\"],' +",
  "      '.agent-activity-thinking[data-live-thinking=\"1\"],' +",
  "      '.thinking[data-thinking-active=\"1\"]'",
  "    );",
  "  }",
  "",
  "  function _isLive(el) {",
  "    if (!el || !el.closest) return false;",
  "    return !!(",
  "      el.closest('#liveAssistantTurn') ||",
  "      el.closest('[data-live-assistant-turn=\"1\"]') ||",
  "      el.closest('.msg-body.stream-fade-active') ||",
  "      el.querySelector('.msg-body.stream-fade-active, .stream-fade-word')",
  "    );",
  "  }",
  "",
  "  function _turnKey(host) {",
  "    if (!host) return '';",
  "    var idx = host.getAttribute('data-msg-idx') || '';",
  "    var body = host.querySelector('.msg-body');",
  "    var text = body && body.textContent ? body.textContent.trim().slice(0, 80) : '';",
  "    return idx + '|' + text.length + '|' + text.slice(0, 24);",
  "  }",
  "",
  "  function _latestSettledHost() {",
  "    var turns = document.querySelectorAll(",
  "      '.assistant-turn, .msg-row[data-role=\"assistant\"], .assistant-segment'",
  "    );",
  "    for (var i = turns.length - 1; i >= 0; i--) {",
  "      var t = turns[i];",
  "      if (!t || _isLive(t)) continue;",
  "      if (t.querySelector && t.querySelector('.latent-ad-footer')) continue;",
  "      var body = t.querySelector('.msg-body');",
  "      if (!body || !(body.textContent || '').trim()) continue;",
  "      var text = body.textContent || '';",
  "      if (text.indexOf('Sponsored:') !== -1 || text.indexOf(MONEY + ' Sponsored') !== -1) continue;",
  "      return t;",
  "    }",
  "    return null;",
  "  }",
  "",
  "  function _esc(s) {",
  "    return String(s || '')",
  "      .replace(/&/g, '&amp;')",
  "      .replace(/</g, '&lt;')",
  "      .replace(/>/g, '&gt;')",
  "      .replace(/\"/g, '&quot;');",
  "  }",
  "",
  "  function _adHtml(ad, persistent) {",
  "    var earn = ad.earn_amount != null",
  "      ? ' | <span style=\"color:#34d399\">+$' + parseFloat(ad.earn_amount).toFixed(4) + ' USDC</span>'",
  "      : '';",
  "    var cta = ad.cta_url",
  "      ? '<a href=\"' + _esc(ad.cta_url) + '\" target=\"_blank\" rel=\"noopener noreferrer\" '",
  "        + 'style=\"color:#60a5fa;text-decoration:none;white-space:nowrap\">'",
  "        + _esc(ad.cta_text || 'Learn more') + ' -></a>'",
  "      : '';",
  "    var label = persistent ? (MONEY + ' Sponsored') : 'Sponsored';",
  "    return '<span style=\"color:#f59e0b;font-size:10px;letter-spacing:.06em;'",
  "      + 'text-transform:uppercase;flex-shrink:0\">' + label + '</span>'",
  "      + '<span style=\"flex:1;color:inherit\">' + _esc(ad.body || ad.title || '') + '</span>'",
  "      + cta + earn;",
  "  }",
  "",
  "  function _styleBox() {",
  "    return 'margin:8px 0 4px;padding:8px 12px;border:1px solid rgba(251,191,36,.35);'",
  "      + 'background:rgba(251,191,36,.08);border-radius:6px;font-size:12px;'",
  "      + 'display:flex;align-items:center;gap:8px;opacity:.95;line-height:1.45;'",
  "      + 'max-width:var(--msg-max, 720px);margin-left:var(--msg-rail, 0);'",
  "      + 'position:relative;z-index:5';",
  "  }",
  "",
  "  function _renderThinkingBanner(ad, container) {",
  "    if (!ad || !container) return;",
  "    if (container.querySelector('.latent-ad')) return;",
  "    var el = document.createElement('div');",
  "    el.className = 'latent-ad';",
  "    el.style.cssText = _styleBox();",
  "    el.innerHTML = _adHtml(ad, false);",
  "    container.appendChild(el);",
  "    _banner = el;",
  "  }",
  "",
  "  function _attachFooter(ad, host) {",
  "    if (!ad || !host) return false;",
  "    if (host.querySelector('.latent-ad-footer')) return true;",
  "    var el = document.createElement('div');",
  "    el.className = 'latent-ad-footer';",
  "    el.setAttribute('data-latent-ad', ad.ad_id || ad.id || '');",
  "    el.style.cssText = _styleBox();",
  "    el.innerHTML = _adHtml(ad, true);",
  "    var foot = host.querySelector('.msg-foot');",
  "    var body = host.querySelector('.msg-body');",
  "    if (foot && foot.parentNode) {",
  "      foot.parentNode.insertBefore(el, foot);",
  "    } else if (body && body.parentNode) {",
  "      body.parentNode.insertBefore(el, body.nextSibling);",
  "    } else {",
  "      host.appendChild(el);",
  "    }",
  "    _logImpression(ad);",
  "    console.info('[latent-protocol] footer attached', ad.ad_id || ad.id);",
  "    return true;",
  "  }",
  "",
  "  function _clearBanner() {",
  "    if (_banner) { _banner.remove(); _banner = null; }",
  "  }",
  "",
  "  function _serveTurn(reason) {",
  "    if (_busy) return;",
  "    var host = _latestSettledHost();",
  "    if (!host) return;",
  "    var key = _turnKey(host);",
  "    if (!key || key === _lastKey) return;",
  "    _turns++;",
  "    if ((_turns - 1) % FREQ !== 0) {",
  "      _lastKey = key;",
  "      return;",
  "    }",
  "    _busy = true;",
  "    var ctx = _ctx();",
  "    _fetchAd(ctx).then(function (ad) {",
  "      _busy = false;",
  "      // Always consume the turn key so CSP/empty responses do not retry-spam.",
  "      _lastKey = key;",
  "      if (!ad) {",
  "        console.info('[latent-protocol] no ad for turn', reason, ctx.slice(0, 40));",
  "        return;",
  "      }",
  "      var h = _latestSettledHost() || host;",
  "      _attachFooter(ad, h);",
  "    });",
  "  }",
  "",
  "  var _wasThinking = false;",
  "  var _pendingThinkAd = null;",
  "",
  "  function _onThinkingStart() {",
  "    _fetchAd(_ctx()).then(function (ad) {",
  "      if (!ad) return;",
  "      _pendingThinkAd = ad;",
  "      var el = _thinkingEl();",
  "      if (el) _renderThinkingBanner(ad, el);",
  "    });",
  "  }",
  "",
  "  function _onThinkingEnd() {",
  "    _clearBanner();",
  "    if (_pendingThinkAd) {",
  "      var ad = _pendingThinkAd;",
  "      _pendingThinkAd = null;",
  "      var tries = 0;",
  "      (function attempt() {",
  "        var host = _latestSettledHost();",
  "        if (host && _attachFooter(ad, host)) {",
  "          _lastKey = _turnKey(host);",
  "          return;",
  "        }",
  "        tries++;",
  "        if (tries < 12) setTimeout(attempt, 200);",
  "        else _serveTurn('think-end-fallback');",
  "      })();",
  "    } else {",
  "      _serveTurn('think-end');",
  "    }",
  "  }",
  "",
  "  var obs = new MutationObserver(function () {",
  "    var el = _thinkingEl();",
  "    var active = !!el;",
  "    if (active && !_wasThinking) _onThinkingStart();",
  "    else if (!active && _wasThinking) _onThinkingEnd();",
  "    else if (active && _pendingThinkAd && el && !el.querySelector('.latent-ad')) {",
  "      _renderThinkingBanner(_pendingThinkAd, el);",
  "    }",
  "    _wasThinking = active;",
  "    if (!_isLive(document.body)) _serveTurn('mutation');",
  "  });",
  "",
  "  function _start() {",
  "    obs.observe(document.body, {",
  "      childList: true,",
  "      subtree: true,",
  "      attributes: true,",
  "      attributeFilter: [",
  "        'data-thinking-active',",
  "        'data-live-thinking',",
  "        'data-live-assistant-turn',",
  "        'data-latest-assistant-response',",
  "        'class'",
  "      ]",
  "    });",
  "    setInterval(function () { _serveTurn('poll'); }, 1500);",
  "    _serveTurn('boot');",
  "  }",
  "",
  "  if (document.readyState === 'loading') {",
  "    document.addEventListener('DOMContentLoaded', _start);",
  "  } else {",
  "    _start();",
  "  }",
  "})();",
].join("\n");

// Fail CI/dev early if someone reintroduces non-ASCII into the inject source.
assertAsciiInjectSource(AD_JS);

function stripExistingPatch(html: string): string {
  return html.replace(
    /\n?<!-- latent-protocol-webui-patch -->\n<script>[\s\S]*?<\/script>\n?/g,
    "",
  );
}

export function patchWebuiIndex(opts: {
  staticDir: string;
  server: string;
  wallet: string;
  frequency: number;
}): { ok: true; indexPath: string } | { ok: false; error: string } {
  const indexPath = join(opts.staticDir, "index.html");
  if (!existsSync(indexPath)) {
    return { ok: false, error: `index.html missing at ${indexPath}` };
  }

  let html: string;
  try {
    html = readFileSync(indexPath, "utf8");
  } catch (err) {
    return {
      ok: false,
      error: `cannot read ${indexPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  html = stripExistingPatch(html);
  const server = opts.server.replace(/\/+$/, "");
  const js = AD_JS.replace("__SERVER__", () => server)
    .replace("__WALLET__", () => opts.wallet)
    .replace("__FREQ__", () => String(opts.frequency));
  try {
    assertAsciiInjectSource(js);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const block = `\n${WEBUI_MARKER}\n<script>\n${js}\n</script>\n`;
  // Use a replacer function so "$" sequences in the inject JS (e.g. +$')
  // are not interpreted as String.prototype.replace special patterns.
  html = html.includes("</body>")
    ? html.replace("</body>", () => `${block}</body>`)
    : html + block;

  try {
    writeFileSync(indexPath, html, "utf8");
  } catch (err) {
    return {
      ok: false,
      error: `cannot write ${indexPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return { ok: true, indexPath };
}

export function unpatchWebuiIndex(staticDir: string): {
  ok: true;
  message: string;
} | { ok: false; error: string } {
  const indexPath = join(staticDir, "index.html");
  if (!existsSync(indexPath)) {
    return { ok: false, error: `index.html missing at ${indexPath}` };
  }
  try {
    const html = readFileSync(indexPath, "utf8");
    if (!html.includes(WEBUI_MARKER)) {
      return { ok: true, message: "Not patched - nothing to remove." };
    }
    writeFileSync(indexPath, stripExistingPatch(html), "utf8");
    return { ok: true, message: `Unpatched: ${indexPath}` };
  } catch (err) {
    return {
      ok: false,
      error: `cannot unpatch ${indexPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
