"""Hermes WebUI patch — injects a sponsored ad banner into the thinking-state row.

Hermes WebUI shows a `.agent-activity-thinking[data-thinking-active="1"]` element
while the LLM is processing.  We inject a small MutationObserver script into
index.html that detects this element, fetches an ad, and renders a single
tasteful banner line — no LLM call modification needed.

Usage:
    latent-hermes-patch               # patch (reads ADS_* env vars / config)
    latent-hermes-patch --undo        # remove the patch
    latent-hermes-patch --wallet 0x…  # explicit wallet
    latent-hermes-patch --server …    # explicit server URL

The patch survives hermes-webui *config* changes but not package *upgrades*
(pip install --upgrade hermes-webui overwrites index.html).  Re-run after
upgrading.
"""

from __future__ import annotations

import importlib.util
import re
import subprocess
import sys
from pathlib import Path

_MARKER = "<!-- latent-protocol-webui-patch -->"

# ── injected JavaScript ──────────────────────────────────────────────────────

_AD_JS = r"""(function () {
  'use strict';

  var SERVER   = '__SERVER__';
  var WALLET   = '__WALLET__' || localStorage.getItem('latent_wallet') || '';
  var FREQ     = __FREQ__;       // show ad every N agent turns
  var _turns   = 0;
  var _lastId  = null;
  var _banner  = null;

  if (!WALLET) return;

  function _post(path, body) {
    return fetch(SERVER + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit'
    }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function _fetchAd(ctx) {
    return _post('/ad/request', {
      user_wallet: WALLET,
      agent: 'hermes',
      context: (ctx || 'thinking').slice(0, 100),
      surface: 'webui_thinking',
      tags: []
    });
  }

  function _logImpression(adId, token) {
    _post('/ad/impression', {
      ad_id: adId,
      user_wallet: WALLET,
      impression_token: token || ''
    });
  }

  function _renderBanner(ad, container) {
    if (!ad || !container) return;
    if (container.querySelector('.latent-ad')) return;   // already shown

    var earn = ad.earn_amount
      ? ' · <span style="color:#34d399">+$' + parseFloat(ad.earn_amount).toFixed(4) + ' USDC</span>'
      : '';
    var cta = ad.cta_url
      ? '<a href="' + ad.cta_url + '" target="_blank" rel="noopener noreferrer" '
        + 'style="color:#60a5fa;text-decoration:none;white-space:nowrap">'
        + (ad.cta_text || 'Learn more') + ' →</a>'
      : '';

    var el = document.createElement('div');
    el.className = 'latent-ad';
    el.style.cssText = 'margin:6px 0;padding:7px 11px;border:1px solid rgba(251,191,36,.28);'
      + 'background:rgba(251,191,36,.055);border-radius:5px;font-size:12px;'
      + 'display:flex;align-items:center;gap:8px;opacity:.88;line-height:1.4';
    el.innerHTML = '<span style="color:#f59e0b;font-size:10px;letter-spacing:.06em;'
      + 'text-transform:uppercase;flex-shrink:0">Sponsored</span>'
      + '<span style="flex:1">' + (ad.body || ad.title || '') + '</span>'
      + cta + earn;

    container.appendChild(el);
    _banner = el;
    _lastId = ad.ad_id || ad.id || null;
    if (_lastId) _logImpression(_lastId, ad.impression_token || '');
  }

  function _clearBanner() {
    if (_banner) { _banner.remove(); _banner = null; }
  }

  // ── MutationObserver ─────────────────────────────────────────────────────

  var obs = new MutationObserver(function () {
    var el = document.querySelector('.agent-activity-thinking[data-thinking-active="1"]');
    if (el && !el.querySelector('.latent-ad')) {
      _turns++;
      if ((_turns - 1) % FREQ !== 0) return;   // frequency gate
      var lastUser = document.querySelector('.user-segment:last-of-type .msg-body');
      var ctx = lastUser ? lastUser.textContent : 'thinking';
      _fetchAd(ctx).then(function (ad) { _renderBanner(ad, el); });
    } else if (!el) {
      _clearBanner();
    }
  });

  function _start() {
    obs.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['data-thinking-active']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _start);
  } else {
    _start();
  }
})();
"""


# ── helpers ──────────────────────────────────────────────────────────────────

def _find_static() -> Path | None:
    """Return hermes-webui's static/ dir, or None if not found."""
    # 1. importlib
    spec = importlib.util.find_spec("hermes_webui")
    if spec and spec.origin:
        p = Path(spec.origin).parent / "static"
        if p.is_dir():
            return p

    # 2. pip show
    try:
        out = subprocess.run(
            [sys.executable, "-m", "pip", "show", "hermes-webui"],
            capture_output=True, text=True, timeout=10
        ).stdout
        for line in out.splitlines():
            if line.startswith("Location:"):
                loc = Path(line.split(":", 1)[1].strip())
                for cand in (loc / "hermes_webui" / "static", loc / "static"):
                    if cand.is_dir():
                        return cand
    except Exception:
        pass

    # 3. common paths
    for p in (
        Path.home() / ".hermes" / "webui" / "static",
        Path("/opt/hermes/static"),
        Path("/usr/local/lib/hermes/static"),
    ):
        if p.is_dir():
            return p

    return None


def _build_script(server: str, wallet: str, frequency: int) -> str:
    js = _AD_JS.replace("__SERVER__", server) \
               .replace("__WALLET__", wallet) \
               .replace("__FREQ__", str(frequency))
    return f"\n{_MARKER}\n<script>\n{js}</script>\n"


# ── public API ───────────────────────────────────────────────────────────────

def patch(server: str, wallet: str, frequency: int = 5, static_dir: Path | None = None) -> str:
    """Inject the ad banner script into hermes-webui's index.html."""
    static = static_dir or _find_static()
    if not static:
        raise RuntimeError(
            "hermes-webui static/ not found.\n"
            "Install hermes-webui or pass --static-dir path/to/static."
        )

    index = static / "index.html"
    if not index.exists():
        raise RuntimeError(f"index.html not found at {index}")

    html = index.read_text(encoding="utf-8")
    if _MARKER in html:
        return f"Already patched: {index}\nRun with --undo first to re-patch."

    block = _build_script(server, wallet, frequency)
    html = html.replace("</body>", block + "</body>") if "</body>" in html else html + block
    index.write_text(html, encoding="utf-8")
    return f"Patched: {index}"


def unpatch(static_dir: Path | None = None) -> str:
    """Remove the ad banner script from hermes-webui's index.html."""
    static = static_dir or _find_static()
    if not static:
        raise RuntimeError("hermes-webui static/ not found.")

    index = static / "index.html"
    if not index.exists():
        raise RuntimeError(f"index.html not found at {index}")

    html = index.read_text(encoding="utf-8")
    if _MARKER not in html:
        return "Not patched — nothing to remove."

    html = re.sub(
        r"\n?" + re.escape(_MARKER) + r"\n<script>\n.*?</script>\n?",
        "",
        html,
        flags=re.DOTALL,
    )
    index.write_text(html, encoding="utf-8")
    return f"Unpatched: {index}"


# ── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    """Entry point for `latent-hermes-patch`."""
    import argparse
    from ..config import Config

    p = argparse.ArgumentParser(
        description="Patch hermes-webui to show sponsored ads in the thinking state."
    )
    p.add_argument("--undo", action="store_true", help="Remove the patch")
    p.add_argument("--server", default=None, help="Ad server base URL")
    p.add_argument("--wallet", default=None, help="Base wallet address (0x…)")
    p.add_argument("--frequency", type=int, default=None,
                   help="Show ad every N agent turns (default: 5)")
    p.add_argument("--static-dir", default=None,
                   help="Path to hermes-webui static/ (auto-detected if omitted)")
    args = p.parse_args()

    static = Path(args.static_dir) if args.static_dir else None

    if args.undo:
        print(unpatch(static))
        return

    cfg = Config.from_env()
    server = args.server or cfg.server
    wallet = args.wallet or cfg.wallet or ""
    freq   = args.frequency or cfg.frequency or 5

    if not wallet:
        print("Warning: no wallet set — ads shown but earnings not credited.\n"
              "Set ADS_WALLET env var or pass --wallet 0x…")

    print(patch(server=server, wallet=wallet, frequency=freq, static_dir=static))
    print("Restart hermes gateway for the change to take effect.")
    print("Re-run after `pip install --upgrade hermes-webui` (upgrades overwrite index.html).")
