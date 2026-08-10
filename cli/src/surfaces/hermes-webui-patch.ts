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
export const CSP_SOURCE_MARKER = "# latent-protocol-csp-connect";

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

const CSP_CONNECT_NEEDLE = "https://cdn.jsdelivr.net{extra_connect_src}";

function stripCspSourcePatch(src: string, origin: string): string {
  let out = src.replace(
    new RegExp(
      String.raw`\n${CSP_SOURCE_MARKER}\n_CSP_CONNECT_BASE = _CSP_CONNECT_BASE \+ "[^"]*"\n`,
      "g",
    ),
    "\n",
  );
  // Normalize prior needle patches back to stock before re-applying.
  out = out.split(`https://cdn.jsdelivr.net ${origin}{extra_connect_src}`).join(
    CSP_CONNECT_NEEDLE,
  );
  return out;
}

function applyCspOriginToSource(src: string, origin: string): string | null {
  let next = stripCspSourcePatch(src, origin);

  // 1) Preferred: rewrite _csp_connect_src return f-string (exact Hermes stock).
  if (next.includes(CSP_CONNECT_NEEDLE)) {
    next = next.split(CSP_CONNECT_NEEDLE).join(
      `https://cdn.jsdelivr.net ${origin}{extra_connect_src}`,
    );
    return next;
  }

  // 2) Fallback: append after _CSP_CONNECT_BASE = (...)
  if (next.includes("_CSP_CONNECT_BASE")) {
    const m = next.match(/_CSP_CONNECT_BASE\s*=\s*\([\s\S]*?\)/);
    if (m && m.index !== undefined) {
      const insert =
        `\n${CSP_SOURCE_MARKER}\n` +
        `_CSP_CONNECT_BASE = _CSP_CONNECT_BASE + " ${origin}"\n`;
      const end = m.index + m[0].length;
      return next.slice(0, end) + insert + next.slice(end);
    }
  }

  // 3) Older builds: inline connect-src string containing cdn.jsdelivr.net
  if (next.includes("connect-src") && next.includes("cdn.jsdelivr.net")) {
    if (next.includes(` ${origin}`)) return next;
    const replaced = next.replace(
      /(connect-src[^"'\n]*https:\/\/cdn\.jsdelivr\.net)/g,
      `$1 ${origin}`,
    );
    if (replaced !== next) return replaced;
  }

  return null;
}

/**
 * Patch Hermes WebUI Python CSP builder so connect-src always includes the
 * Latent API origin. Rewrites the _csp_connect_src return value directly —
 * more reliable than .env (often not loaded) or BASE append alone.
 */
export function patchWebuiCspSource(opts: {
  staticDir: string;
  server: string;
}):
  | { ok: true; path: string; origin: string }
  | { ok: false; error: string } {
  const origin = apiOrigin(opts.server);
  if (!/^https?:\/\/[^/\s]+$/i.test(origin)) {
    return { ok: false, error: `invalid CSP origin: ${origin}` };
  }
  const webuiRoot = dirname(opts.staticDir);
  const candidates = [
    join(webuiRoot, "api", "helpers.py"),
    join(webuiRoot, "helpers.py"),
    join(webuiRoot, "server.py"),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    let src: string;
    try {
      src = readFileSync(path, "utf8");
    } catch (err) {
      return {
        ok: false,
        error: `cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const next = applyCspOriginToSource(src, origin);
    if (next == null) continue;
    if (next === src) {
      return { ok: true, path, origin };
    }
    try {
      writeFileSync(path, next, "utf8");
    } catch (err) {
      return {
        ok: false,
        error: `cannot write ${path}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    return { ok: true, path, origin };
  }

  return {
    ok: false,
    error: `no CSP connect-src source found under ${webuiRoot} (tried api/helpers.py, helpers.py, server.py)`,
  };
}

/**
 * Force HERMES_WEBUI_CSP_CONNECT_EXTRA export inside ctl.sh so restart always
 * loads the Latent origin even when .env dotenv loading is skipped.
 */
export function patchWebuiCtlShCsp(opts: {
  staticDir: string;
  server: string;
}):
  | { ok: true; path: string; origin: string }
  | { ok: false; error: string } {
  const origin = apiOrigin(opts.server);
  const ctlPath = join(dirname(opts.staticDir), "ctl.sh");
  if (!existsSync(ctlPath)) {
    return { ok: false, error: `ctl.sh missing at ${ctlPath}` };
  }
  const marker = "# latent-protocol-csp-connect-ctl";
  try {
    let src = readFileSync(ctlPath, "utf8");
    src = src.replace(
      new RegExp(
        String.raw`${marker}\nexport HERMES_WEBUI_CSP_CONNECT_EXTRA=.*\n`,
        "g",
      ),
      "",
    );
    const line =
      `${marker}\n` +
      `export HERMES_WEBUI_CSP_CONNECT_EXTRA="\${HERMES_WEBUI_CSP_CONNECT_EXTRA:+\$HERMES_WEBUI_CSP_CONNECT_EXTRA }${origin}"\n`;
    // Insert after shebang if present, else at top.
    if (src.startsWith("#!")) {
      const nl = src.indexOf("\n");
      src = src.slice(0, nl + 1) + line + src.slice(nl + 1);
    } else {
      src = line + src;
    }
    writeFileSync(ctlPath, src, "utf8");
    return { ok: true, path: ctlPath, origin };
  } catch (err) {
    return {
      ok: false,
      error: `cannot patch ${ctlPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
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
  "  // Prefer /api/latent (usually reverse-proxied); /__latent__ is fallback.",
  "  var PROXIES  = ['/api/latent', '/__latent__'];",
  "  var WALLET   = '__WALLET__' || localStorage.getItem('latent_wallet') || '';",
  "  var FREQ     = __FREQ__;",
  "  var _turns   = 0;",
  "  var _busy    = false;",
  "  var _banner  = null;",
  "  var _lastKey = '';",
  "  var _proxy   = PROXIES[0];",
  "  var MONEY    = '\\uD83D\\uDCB0';",
  "",
  "  window.__LATENT_WEBUI__ = {",
  "    server: SERVER,",
  "    proxy: _proxy,",
  "    proxies: PROXIES,",
  "    wallet: WALLET ? (WALLET.slice(0, 6) + '...') : '',",
  "    frequency: FREQ,",
  "    version: 7",
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
  "  function _postOnce(base, path, body) {",
  "    return fetch(base + path, {",
  "      method: 'POST',",
  "      headers: { 'Content-Type': 'application/json' },",
  "      body: JSON.stringify(body),",
  "      // Include session cookie so Hermes auth passes if proxy hook misses.",
  "      credentials: 'include'",
  "    }).then(function (r) {",
  "      if (!r) return { ad: null, status: 0, base: base };",
  "      if (r.status === 204) return { ad: null, status: 204, base: base };",
  "      if (!r.ok) {",
  "        return r.text().then(function (t) {",
  "          return { ad: null, status: r.status, base: base, body: String(t || '').slice(0, 160) };",
  "        }).catch(function () {",
  "          return { ad: null, status: r.status, base: base };",
  "        });",
  "      }",
  "      return r.json().then(function (ad) {",
  "        return { ad: ad, status: r.status, base: base };",
  "      }).catch(function () {",
  "        return { ad: null, status: r.status, base: base, body: 'invalid-json' };",
  "      });",
  "    }).catch(function (err) {",
  "      return { ad: null, status: 0, base: base, body: String(err && err.message || err || 'fetch-failed') };",
  "    });",
  "  }",
  "  function _post(path, body) {",
  "    var bases = [_proxy].concat(PROXIES.filter(function (p) { return p !== _proxy; }));",
  "    var i = 0;",
  "    function next() {",
  "      if (i >= bases.length) return Promise.resolve(null);",
  "      var base = bases[i++];",
  "      return _postOnce(base, path, body).then(function (res) {",
  "        if (res.ad) {",
  "          _proxy = res.base;",
  "          window.__LATENT_WEBUI__.proxy = _proxy;",
  "          return res.ad;",
  "        }",
  "        // 404/502 on proxy path -> try next base; 204 means no fill.",
  "        if (res.status === 204) return null;",
  "        if (res.status === 404 || res.status === 502 || res.status === 0) {",
  "          if (!_fetchWarned) {",
  "            console.warn('[latent-protocol] proxy miss', res.status, res.base + path, res.body || '');",
  "          }",
  "          return next();",
  "        }",
  "        if (!_fetchWarned) {",
  "          _fetchWarned = true;",
  "          console.warn('[latent-protocol] ad HTTP', res.status, res.base + path, res.body || '');",
  "        }",
  "        return null;",
  "      });",
  "    }",
  "    return next().then(function (ad) {",
  "      if (!ad && !_fetchWarned) {",
  "        _fetchWarned = true;",
  "        console.warn(",
  "          '[latent-protocol] no ad from proxies', PROXIES,",
  "          '- check server.py hook + api/latent_ads_proxy.py, then ctl.sh restart'",
  "        );",
  "      }",
  "      return ad;",
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
  "      token: ad.impression_token || '',",
  "      agent: 'hermes',",
  "      surface: 'webui_footer',",
  "      context: String(_ctx()).slice(0, 100)",
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

export const LATENT_PROXY_MARKER = "# latent-protocol-proxy";
export const LATENT_PROXY_PREFIX = "/__latent__";
export const LATENT_PROXY_PREFIX_API = "/api/latent";

function latentProxyPy(server: string): string {
  const origin = apiOrigin(server);
  return [
    '"""Latent Protocol same-origin ad proxy for Hermes WebUI.',
    "",
    "Browser CSP blocks connect-src to the Latent API. Exposes",
    "/api/latent/ad/* and /__latent__/ad/* and forwards to Latent.",
    '"""',
    LATENT_PROXY_MARKER,
    "from __future__ import annotations",
    "",
    "import json",
    "import urllib.error",
    "import urllib.request",
    "",
    `LATENT_SERVER = ${JSON.stringify(origin)}`,
    "PREFIXES = (",
    `    ${JSON.stringify(LATENT_PROXY_PREFIX_API)},`,
    `    ${JSON.stringify(LATENT_PROXY_PREFIX)},`,
    ")",
    'ALLOWED = {"/ad/request", "/ad/impression"}',
    "MAX_BODY = 1_000_000",
    "",
    "",
    "def _suffix_for(path):",
    "    # Support subpath mounts: /hermes/api/latent/ad/request -> /ad/request",
    "    for prefix in PREFIXES:",
    "        needle = prefix + \"/\"",
    "        idx = path.find(needle)",
    "        if idx >= 0:",
    "            return path[idx + len(prefix) :] or \"\"",
    "        if path.endswith(prefix):",
    "            return \"\"",
    "    return None",
    "",
    "",
    "def handle_latent_proxy(handler, parsed):",
    '    """Proxy POST /api/latent/ad/* and /__latent__/ad/* to Latent API."""',
    "    suffix = _suffix_for(parsed.path)",
    "    if suffix is None or suffix not in ALLOWED:",
    '        body = json.dumps({"error": "not found", "path": parsed.path}).encode()',
    "        handler.send_response(404)",
    '        handler.send_header("Content-Type", "application/json")',
    '        handler.send_header("Content-Length", str(len(body)))',
    "        handler.end_headers()",
    "        handler.wfile.write(body)",
    "        return True",
    "",
    "    try:",
    '        length = int(handler.headers.get("Content-Length", "0") or "0")',
    "    except ValueError:",
    "        length = 0",
    "    if length < 0 or length > MAX_BODY:",
    '        body = b\'{"error":"body too large"}\'',
    "        handler.send_response(413)",
    '        handler.send_header("Content-Type", "application/json")',
    '        handler.send_header("Content-Length", str(len(body)))',
    "        handler.end_headers()",
    "        handler.wfile.write(body)",
    "        return True",
    "",
    '    raw = handler.rfile.read(length) if length else b"{}"',
    '    url = LATENT_SERVER.rstrip("/") + suffix',
    "    req = urllib.request.Request(",
    "        url,",
    "        data=raw,",
    "        headers={",
    '            "Content-Type": "application/json",',
    '            "Accept": "application/json",',
    '            "User-Agent": "latent-protocol-webui-proxy/1",',
    "        },",
    '        method="POST",',
    "    )",
    "    status = 502",
    '    ctype = "application/json"',
    '    data = b\'{"error":"proxy_failed"}\'',
    "    try:",
    "        with urllib.request.urlopen(req, timeout=20) as resp:",
    "            data = resp.read()",
    '            status = getattr(resp, "status", 200) or 200',
    '            ctype = resp.headers.get("Content-Type", "application/json")',
    "    except urllib.error.HTTPError as err:",
    "        data = err.read() or data",
    "        status = err.code",
    '        ctype = err.headers.get("Content-Type", "application/json") if err.headers else ctype',
    "    except Exception as exc:",
    '        data = json.dumps({"error": "proxy_failed", "detail": str(exc)}).encode()',
    "        status = 502",
    "",
    "    handler.send_response(status)",
    '    handler.send_header("Content-Type", ctype)',
    '    handler.send_header("Content-Length", str(len(data)))',
    '    handler.send_header("Cache-Control", "no-store")',
    "    handler.end_headers()",
    "    try:",
    "        handler.wfile.write(data)",
    "    except Exception:",
    "        pass",
    "    return True",
    "",
  ].join("\n");
}

const SERVER_PROXY_BEGIN = "# latent-protocol-proxy-begin";
const SERVER_PROXY_END = "# latent-protocol-proxy-end";

function pathMatchExpr(pathVar: string): string {
  // Match even under subpath mounts (/hermes/api/latent/...).
  return (
    `("${LATENT_PROXY_PREFIX_API}/" in ${pathVar} or ` +
    `"${LATENT_PROXY_PREFIX}/" in ${pathVar})`
  );
}

function serverProxyHook(indent = "        "): string {
  // On path match: always return (502 on failure). Never fall through to check_auth.
  return [
    `${indent}${SERVER_PROXY_BEGIN}`,
    `${indent}try:`,
    `${indent}    from urllib.parse import urlparse as _latent_urlparse`,
    `${indent}    _latent_parsed = _latent_urlparse(self.path)`,
    `${indent}    _latent_path = _latent_parsed.path or ""`,
    `${indent}    if ${pathMatchExpr("_latent_path")}:`,
    `${indent}        try:`,
    `${indent}            from api.latent_ads_proxy import handle_latent_proxy`,
    `${indent}            return handle_latent_proxy(self, _latent_parsed)`,
    `${indent}        except Exception as _latent_exc:`,
    `${indent}            _latent_log = getattr(self, "_safe_webui_print", print)`,
    `${indent}            try:`,
    `${indent}                _latent_log("[latent-protocol] proxy error: %r" % (_latent_exc,))`,
    `${indent}            except Exception:`,
    `${indent}                pass`,
    `${indent}            _latent_body = b'{"error":"proxy_failed"}'`,
    `${indent}            try:`,
    `${indent}                self.send_response(502)`,
    `${indent}                self.send_header("Content-Type", "application/json")`,
    `${indent}                self.send_header("Content-Length", str(len(_latent_body)))`,
    `${indent}                self.end_headers()`,
    `${indent}                self.wfile.write(_latent_body)`,
    `${indent}            except Exception:`,
    `${indent}                pass`,
    `${indent}            return`,
    `${indent}except Exception:`,
    `${indent}    pass`,
    `${indent}${SERVER_PROXY_END}`,
  ].join("\n");
}

function routesProxyHook(indent = "    "): string {
  return [
    `${indent}${SERVER_PROXY_BEGIN}`,
    `${indent}try:`,
    `${indent}    _latent_path = getattr(parsed, "path", "") or ""`,
    `${indent}    if ${pathMatchExpr("_latent_path")}:`,
    `${indent}        from api.latent_ads_proxy import handle_latent_proxy`,
    `${indent}        return handle_latent_proxy(handler, parsed)`,
    `${indent}except Exception:`,
    `${indent}    pass`,
    `${indent}${SERVER_PROXY_END}`,
  ].join("\n");
}

const AUTH_EXEMPT_BEGIN = "# latent-protocol-auth-exempt-begin";
const AUTH_EXEMPT_END = "# latent-protocol-auth-exempt-end";
const AUTH_SHADOW_BEGIN = "# latent-protocol-auth-shadow-begin";
const AUTH_SHADOW_END = "# latent-protocol-auth-shadow-end";
const PRE_AUTH_BEGIN = "# latent-protocol-pre-auth-begin";
const PRE_AUTH_END = "# latent-protocol-pre-auth-end";
const CSRF_EXEMPT_BEGIN = "# latent-protocol-csrf-exempt-begin";
const CSRF_EXEMPT_END = "# latent-protocol-csrf-exempt-end";
const NUCLEAR_BEGIN = "# latent-protocol-nuclear-begin";
const NUCLEAR_END = "# latent-protocol-nuclear-end";

function nuclearWrapSnippet(): string {
  // Must be placed BEFORE `if __name__ == "__main__"` so it runs at import time.
  return [
    NUCLEAR_BEGIN,
    "try:",
    "    import http.server as _latent_http_server",
    "    _latent_handler_cls = None",
    "    for _latent_name, _latent_obj in list(globals().items()):",
    "        if (",
    "            isinstance(_latent_obj, type)",
    "            and issubclass(_latent_obj, _latent_http_server.BaseHTTPRequestHandler)",
    "            and _latent_obj is not _latent_http_server.BaseHTTPRequestHandler",
    '            and hasattr(_latent_obj, "do_POST")',
    "        ):",
    "            _latent_handler_cls = _latent_obj",
    "            break",
    "    if _latent_handler_cls is not None:",
    "        _latent_orig_do_POST = _latent_handler_cls.do_POST",
    "",
    "        def _latent_nuclear_do_POST(self, *args, **kwargs):",
    "            try:",
    "                from urllib.parse import urlparse as _latent_urlparse",
    '                _latent_parsed = _latent_urlparse(getattr(self, "path", "") or "")',
    '                _latent_path = _latent_parsed.path or ""',
    '                if ("/api/latent/" in _latent_path) or ("/__latent__/" in _latent_path):',
    "                    from api.latent_ads_proxy import handle_latent_proxy",
    "                    return handle_latent_proxy(self, _latent_parsed)",
    "            except Exception as _latent_exc:",
    "                try:",
    '                    print("[latent-protocol] nuclear do_POST error: %r" % (_latent_exc,), flush=True)',
    "                except Exception:",
    "                    pass",
    "                try:",
    `                    _latent_body = b'{"error":"proxy_failed","where":"nuclear"}'`,
    "                    self.send_response(502)",
    '                    self.send_header("Content-Type", "application/json")',
    "                    self.send_header(\"Content-Length\", str(len(_latent_body)))",
    "                    self.end_headers()",
    "                    self.wfile.write(_latent_body)",
    "                    return",
    "                except Exception:",
    "                    pass",
    "            return _latent_orig_do_POST(self, *args, **kwargs)",
    "",
    "        _latent_handler_cls.do_POST = _latent_nuclear_do_POST",
    '        print("[latent-protocol] nuclear do_POST wrap installed on %s" % (_latent_handler_cls.__name__,), flush=True)',
    "    else:",
    '        print("[latent-protocol] nuclear wrap: no Handler class found", flush=True)',
    "except Exception as _latent_nuclear_exc:",
    '    print("[latent-protocol] nuclear wrap failed: %r" % (_latent_nuclear_exc,), flush=True)',
    NUCLEAR_END,
  ].join("\n");
}

function authExemptSnippet(indent = "        "): string {
  return [
    `${indent}${AUTH_EXEMPT_BEGIN}`,
    `${indent}or ("/api/latent/" in parsed.path)`,
    `${indent}or ("/__latent__/" in parsed.path)`,
    `${indent}${AUTH_EXEMPT_END}`,
  ].join("\n");
}

function authShadowSnippet(): string {
  // Shadow the imported name in server.py so bound check_auth always exempts.
  return [
    AUTH_SHADOW_BEGIN,
    "_latent_check_auth_bound = check_auth",
    "def check_auth(handler, parsed):",
    '    _lp = getattr(parsed, "path", "") or ""',
    '    if ("/api/latent/" in _lp) or ("/__latent__/" in _lp):',
    "        return True",
    "    return _latent_check_auth_bound(handler, parsed)",
    AUTH_SHADOW_END,
  ].join("\n");
}

function preAuthBypassSnippet(indent = "            "): string {
  // Runs immediately before check_auth(...) so 401 cannot fire first.
  return [
    `${indent}${PRE_AUTH_BEGIN}`,
    `${indent}_latent_path = getattr(parsed, "path", "") or ""`,
    `${indent}if ("/api/latent/" in _latent_path) or ("/__latent__/" in _latent_path):`,
    `${indent}    from api.latent_ads_proxy import handle_latent_proxy`,
    `${indent}    return handle_latent_proxy(self, parsed)`,
    `${indent}${PRE_AUTH_END}`,
  ].join("\n");
}

function csrfExemptSnippet(indent = "    "): string {
  return [
    `${indent}${CSRF_EXEMPT_BEGIN}`,
    `${indent}if ("/api/latent/" in (path or "")) or ("/__latent__/" in (path or "")):`,
    `${indent}    return True`,
    `${indent}${CSRF_EXEMPT_END}`,
  ].join("\n");
}

function stripMarkedBlock(src: string, begin: string, end: string): string {
  return src.replace(
    new RegExp(String.raw`\n?[ \t]*${begin}[\s\S]*?${end}\n?`, "g"),
    "\n",
  );
}

function insertAfterMatch(
  src: string,
  re: RegExp,
  insert: string,
): { src: string; ok: boolean } {
  const m = src.match(re);
  if (!m || m.index === undefined) return { src, ok: false };
  const at = m.index + m[0].length;
  return { src: src.slice(0, at) + insert + "\n" + src.slice(at), ok: true };
}

function insertBeforeMatch(
  src: string,
  re: RegExp,
  insert: string,
): { src: string; ok: boolean; count: number } {
  let count = 0;
  const next = src.replace(re, (matched) => {
    count += 1;
    return `${insert}\n${matched}`;
  });
  return { src: next, ok: count > 0, count };
}

/**
 * Install same-origin ad proxy so browser ads bypass CSP connect-src.
 * - api/latent_ads_proxy.py
 * - server.py do_POST + _handle_write hooks (before auth)
 * - server.py shadow of imported check_auth (bound-name fix)
 * - server.py pre-auth bypass immediately before check_auth(...) calls
 * - api/routes.py handle_post early return + CSRF exempt
 * - api/auth.py check_auth path exempt (so 401 cannot fire first)
 */
export function patchWebuiLatentProxy(opts: {
  staticDir: string;
  server: string;
}):
  | { ok: true; proxyPath: string; serverPath: string; origin: string; notes: string[] }
  | { ok: false; error: string } {
  const webuiRoot = dirname(opts.staticDir);
  const apiDir = join(webuiRoot, "api");
  const proxyPath = join(apiDir, "latent_ads_proxy.py");
  const serverPath = join(webuiRoot, "server.py");
  const routesPath = join(apiDir, "routes.py");
  const authPath = join(apiDir, "auth.py");
  const notes: string[] = [];

  if (!existsSync(serverPath)) {
    return { ok: false, error: `server.py missing at ${serverPath}` };
  }
  if (!existsSync(apiDir)) {
    return { ok: false, error: `api/ missing at ${apiDir}` };
  }

  try {
    writeFileSync(proxyPath, latentProxyPy(opts.server), "utf8");
    notes.push(`wrote ${proxyPath}`);
  } catch (err) {
    return {
      ok: false,
      error: `cannot write ${proxyPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // --- server.py: hook do_POST/_handle_write, shadow check_auth, pre-auth bypass ---
  try {
    let serverSrc = readFileSync(serverPath, "utf8");
    serverSrc = stripMarkedBlock(serverSrc, SERVER_PROXY_BEGIN, SERVER_PROXY_END);
    serverSrc = stripMarkedBlock(serverSrc, AUTH_SHADOW_BEGIN, AUTH_SHADOW_END);
    serverSrc = stripMarkedBlock(serverSrc, PRE_AUTH_BEGIN, PRE_AUTH_END);
    serverSrc = stripMarkedBlock(serverSrc, NUCLEAR_BEGIN, NUCLEAR_END);

    let serverInserted = 0;
    for (const { re, indent } of [
      { re: /def do_POST\(self\)\s*(?:->\s*None)?:\r?\n/, indent: "        " },
      {
        re: /def _handle_write\(self,\s*route_func\)\s*(?:->\s*None)?:\r?\n/,
        indent: "        ",
      },
    ]) {
      const res = insertAfterMatch(serverSrc, re, serverProxyHook(indent));
      if (res.ok) {
        serverSrc = res.src;
        serverInserted++;
      }
    }
    if (serverInserted === 0) {
      notes.push("server.py: no do_POST/_handle_write anchor");
    } else {
      notes.push(`server.py: ${serverInserted} hook(s)`);
    }

    // Shadow imported check_auth so the name used by _handle_write is exempt.
    // Handles: `from api.auth import check_auth` and `..., check_auth, ...`
    let shadowOk = false;
    if (!serverSrc.includes(AUTH_SHADOW_BEGIN)) {
      const shadowRes = insertAfterMatch(
        serverSrc,
        /^from api\.auth import[^\n]*\bcheck_auth\b[^\n]*\r?\n/m,
        authShadowSnippet(),
      );
      if (shadowRes.ok) {
        serverSrc = shadowRes.src;
        shadowOk = true;
      }
    }
    notes.push(
      shadowOk
        ? "server.py: check_auth shadowed"
        : "server.py: check_auth shadow skipped",
    );

    // Proxy immediately before every check_auth(self, parsed) call site.
    const pre = insertBeforeMatch(
      serverSrc,
      /^[ \t]*if (?:not _is_csp_report_post and )?not check_auth\(self, parsed\):[^\n]*$/gm,
      preAuthBypassSnippet("            "),
    );
    if (pre.ok) {
      serverSrc = pre.src;
      notes.push(`server.py: pre-auth bypass x${pre.count}`);
    } else {
      notes.push("server.py: pre-auth bypass anchor missing");
    }

    // Last resort: wrap Handler.do_POST before the main guard (import-time).
    const nuclear = insertBeforeMatch(
      serverSrc,
      /^if __name__\s*==\s*['"]__main__['"]\s*:\s*$/m,
      `${nuclearWrapSnippet()}\n`,
    );
    if (nuclear.ok && nuclear.count === 1) {
      serverSrc = nuclear.src;
      notes.push("server.py: nuclear do_POST wrap");
    } else {
      const nuclearMain = insertBeforeMatch(
        serverSrc,
        /^def main\(\s*\)\s*(?:->\s*None)?:\s*$/m,
        `${nuclearWrapSnippet()}\n`,
      );
      if (nuclearMain.ok) {
        serverSrc = nuclearMain.src;
        notes.push("server.py: nuclear do_POST wrap (before main)");
      } else {
        notes.push("server.py: nuclear wrap FAILED");
      }
    }

    writeFileSync(serverPath, serverSrc, "utf8");
  } catch (err) {
    return {
      ok: false,
      error: `cannot patch ${serverPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // --- api/routes.py: early return in handle_post + CSRF exempt ---
  if (existsSync(routesPath)) {
    try {
      let routesSrc = readFileSync(routesPath, "utf8");
      routesSrc = stripMarkedBlock(routesSrc, SERVER_PROXY_BEGIN, SERVER_PROXY_END);
      routesSrc = stripMarkedBlock(routesSrc, CSRF_EXEMPT_BEGIN, CSRF_EXEMPT_END);
      const res = insertAfterMatch(
        routesSrc,
        /def handle_post\(\s*handler\s*,\s*parsed\s*\)\s*(?:->\s*bool)?:\r?\n/,
        routesProxyHook("    "),
      );
      if (res.ok) {
        routesSrc = res.src;
        notes.push("routes.py: handle_post hooked");
      } else {
        notes.push("routes.py: handle_post anchor missing");
      }
      const csrf = insertAfterMatch(
        routesSrc,
        /def _csrf_exempt_path\(\s*path\s*(?::\s*str)?\s*\)\s*(?:->\s*bool)?:\r?\n(?:[ \t]*"""[\s\S]*?"""\r?\n)?/,
        csrfExemptSnippet("    "),
      );
      if (csrf.ok) {
        routesSrc = csrf.src;
        notes.push("routes.py: CSRF exempt");
      } else {
        notes.push("routes.py: CSRF exempt anchor missing");
      }
      writeFileSync(routesPath, routesSrc, "utf8");
    } catch (err) {
      notes.push(
        `routes.py patch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // --- api/auth.py: early-return at top of check_auth (must win over 401) ---
  if (existsSync(authPath)) {
    try {
      let authSrc = readFileSync(authPath, "utf8");
      authSrc = stripMarkedBlock(authSrc, AUTH_EXEMPT_BEGIN, AUTH_EXEMPT_END);
      const early = [
        `    ${AUTH_EXEMPT_BEGIN}`,
        '    _lp = getattr(parsed, "path", "") or ""',
        '    if ("/api/latent/" in _lp) or ("/__latent__/" in _lp):',
        "        return True",
        `    ${AUTH_EXEMPT_END}`,
      ].join("\n");
      // Prefer injecting immediately inside check_auth, before any other logic.
      let res = insertAfterMatch(
        authSrc,
        /def check_auth\(\s*handler\s*,\s*parsed\s*\)\s*(?:->\s*bool)?:\r?\n(?:[ \t]*"""[\s\S]*?"""\r?\n)?/,
        early,
      );
      if (!res.ok) {
        // Broader: any check_auth def line
        res = insertAfterMatch(
          authSrc,
          /def check_auth\([^)]*\):\r?\n/,
          early,
        );
      }
      if (res.ok) {
        authSrc = res.src;
        // Also widen the public-path if-condition when present (belt + suspenders)
        const publicIf =
          /(parsed\.path\.startswith\(['"]\/session\/static\/['"]\)\s*\n\s*\):)/;
        if (
          publicIf.test(authSrc) &&
          !authSrc.includes('"/api/latent/" in parsed.path)')
        ) {
          authSrc = authSrc.replace(
            publicIf,
            `parsed.path.startswith('/session/static/')\n${authExemptSnippet("        ")}\n    ):`,
          );
        }
        writeFileSync(authPath, authSrc, "utf8");
        notes.push("auth.py: check_auth early-return exempt");
      } else {
        notes.push("auth.py: could not insert exempt");
      }
    } catch (err) {
      notes.push(
        `auth.py patch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    ok: true,
    proxyPath,
    serverPath,
    origin: apiOrigin(opts.server),
    notes,
  };
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
