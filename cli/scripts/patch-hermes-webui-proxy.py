#!/usr/bin/env python3
"""One-shot: install Latent same-origin ad proxy into a Hermes WebUI checkout.

Fixes the 401 Authentication required on /api/latent/ad/* by:
  1) same-origin proxy module
  2) do_POST / _handle_write hooks that never fall through to auth on match
  3) shadowing server.py's imported check_auth
  4) pre-auth bypass immediately before check_auth(...) call sites
  5) auth.py early-return + routes CSRF exempt

Usage:
  python3 patch-hermes-webui-proxy.py /root/hermes-webui https://api.latentprotocol.xyz
  cd /root/hermes-webui && ./ctl.sh restart
  curl -sS -w '\\nHTTP %{http_code}\\n' -X POST http://127.0.0.1:8787/api/latent/ad/request \\
    -H 'Content-Type: application/json' \\
    -d '{"user_wallet":"0x0","agent":"hermes","context":"test"}'
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

PROXY_BEGIN = "# latent-protocol-proxy-begin"
PROXY_END = "# latent-protocol-proxy-end"
AUTH_BEGIN = "# latent-protocol-auth-exempt-begin"
AUTH_END = "# latent-protocol-auth-exempt-end"
SHADOW_BEGIN = "# latent-protocol-auth-shadow-begin"
SHADOW_END = "# latent-protocol-auth-shadow-end"
PRE_AUTH_BEGIN = "# latent-protocol-pre-auth-begin"
PRE_AUTH_END = "# latent-protocol-pre-auth-end"
CSRF_BEGIN = "# latent-protocol-csrf-exempt-begin"
CSRF_END = "# latent-protocol-csrf-exempt-end"


def strip_block(src: str, begin: str, end: str) -> str:
    return re.sub(
        rf"\n?[ \t]*{re.escape(begin)}[\s\S]*?{re.escape(end)}\n?",
        "\n",
        src,
    )


def write_proxy_module(api_dir: Path, server: str) -> Path:
    origin = server.rstrip("/")
    path = api_dir / "latent_ads_proxy.py"
    path.write_text(
        f'''"""Latent Protocol same-origin ad proxy."""
# latent-protocol-proxy
from __future__ import annotations

import json
import urllib.error
import urllib.request

LATENT_SERVER = {origin!r}
PREFIXES = ("/api/latent", "/__latent__")
ALLOWED = {{"/ad/request", "/ad/impression"}}
MAX_BODY = 1_000_000


def _suffix_for(path):
    for prefix in PREFIXES:
        needle = prefix + "/"
        idx = path.find(needle)
        if idx >= 0:
            return path[idx + len(prefix) :] or ""
        if path.endswith(prefix):
            return ""
    return None


def handle_latent_proxy(handler, parsed):
    suffix = _suffix_for(parsed.path or "")
    if suffix is None or suffix not in ALLOWED:
        body = json.dumps({{"error": "not found", "path": parsed.path}}).encode()
        handler.send_response(404)
        handler.send_header("Content-Type", "application/json")
        handler.send_header("Content-Length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)
        return True

    try:
        length = int(handler.headers.get("Content-Length", "0") or "0")
    except ValueError:
        length = 0
    if length < 0 or length > MAX_BODY:
        body = b'{{"error":"body too large"}}'
        handler.send_response(413)
        handler.send_header("Content-Type", "application/json")
        handler.send_header("Content-Length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)
        return True

    raw = handler.rfile.read(length) if length else b"{{}}"
    url = LATENT_SERVER.rstrip("/") + suffix
    req = urllib.request.Request(
        url,
        data=raw,
        headers={{
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "latent-protocol-webui-proxy/1",
        }},
        method="POST",
    )
    status = 502
    ctype = "application/json"
    data = b'{{"error":"proxy_failed"}}'
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
            status = getattr(resp, "status", 200) or 200
            ctype = resp.headers.get("Content-Type", "application/json")
    except urllib.error.HTTPError as err:
        data = err.read() or data
        status = err.code
        ctype = err.headers.get("Content-Type", "application/json") if err.headers else ctype
    except Exception as exc:
        data = json.dumps({{"error": "proxy_failed", "detail": str(exc)}}).encode()
        status = 502

    handler.send_response(status)
    handler.send_header("Content-Type", ctype)
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    try:
        handler.wfile.write(data)
    except Exception:
        pass
    return True
'''
    )
    return path


def insert_after(src: str, pattern: str, block: str) -> tuple[str, bool]:
    m = re.search(pattern, src, flags=re.M)
    if not m:
        return src, False
    at = m.end()
    return src[:at] + block + "\n" + src[at:], True


def insert_before_all(src: str, pattern: str, block: str) -> tuple[str, int]:
    count = 0

    def repl(m: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return block + "\n" + m.group(0)

    return re.sub(pattern, repl, src, flags=re.M), count


def patch_auth(auth_path: Path) -> bool:
    src = auth_path.read_text()
    src = strip_block(src, AUTH_BEGIN, AUTH_END)
    early = f"""    {AUTH_BEGIN}
    _lp = getattr(parsed, "path", "") or ""
    if ("/api/latent/" in _lp) or ("/__latent__/" in _lp):
        return True
    {AUTH_END}
"""
    src2, ok = insert_after(
        src,
        r"def check_auth\(\s*handler\s*,\s*parsed\s*\)\s*(?:->\s*bool)?:\r?\n(?:[ \t]*\"\"\"[\s\S]*?\"\"\"\r?\n)?",
        early,
    )
    if not ok:
        src2, ok = insert_after(src, r"def check_auth\([^)]*\):\r?\n", early)
    if not ok:
        return False
    auth_path.write_text(src2)
    return True


def patch_server(server_path: Path) -> dict[str, int | bool]:
    src = server_path.read_text()
    src = strip_block(src, PROXY_BEGIN, PROXY_END)
    src = strip_block(src, SHADOW_BEGIN, SHADOW_END)
    src = strip_block(src, PRE_AUTH_BEGIN, PRE_AUTH_END)

    hook = f"""        {PROXY_BEGIN}
        try:
            from urllib.parse import urlparse as _latent_urlparse
            _latent_parsed = _latent_urlparse(self.path)
            _latent_path = _latent_parsed.path or ""
            if ("/api/latent/" in _latent_path) or ("/__latent__/" in _latent_path):
                try:
                    from api.latent_ads_proxy import handle_latent_proxy
                    return handle_latent_proxy(self, _latent_parsed)
                except Exception as _latent_exc:
                    _latent_log = getattr(self, "_safe_webui_print", print)
                    try:
                        _latent_log("[latent-protocol] proxy error: %r" % (_latent_exc,))
                    except Exception:
                        pass
                    _latent_body = b'{{"error":"proxy_failed"}}'
                    try:
                        self.send_response(502)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Content-Length", str(len(_latent_body)))
                        self.end_headers()
                        self.wfile.write(_latent_body)
                    except Exception:
                        pass
                    return
        except Exception:
            pass
        {PROXY_END}
"""
    n = 0
    for pat in (
        r"def do_POST\(self\)\s*(?:->\s*None)?:\r?\n",
        r"def _handle_write\(self,\s*route_func\)\s*(?:->\s*None)?:\r?\n",
    ):
        src, ok = insert_after(src, pat, hook)
        if ok:
            n += 1

    shadow = f"""{SHADOW_BEGIN}
_latent_check_auth_bound = check_auth
def check_auth(handler, parsed):
    _lp = getattr(parsed, "path", "") or ""
    if ("/api/latent/" in _lp) or ("/__latent__/" in _lp):
        return True
    return _latent_check_auth_bound(handler, parsed)
{SHADOW_END}
"""
    src, shadow_ok = insert_after(
        src,
        r"^from api\.auth import[^\n]*\bcheck_auth\b[^\n]*\r?\n",
        shadow,
    )

    pre = f"""            {PRE_AUTH_BEGIN}
            _latent_path = getattr(parsed, "path", "") or ""
            if ("/api/latent/" in _latent_path) or ("/__latent__/" in _latent_path):
                from api.latent_ads_proxy import handle_latent_proxy
                return handle_latent_proxy(self, parsed)
            {PRE_AUTH_END}
"""
    src, pre_n = insert_before_all(
        src,
        r"^[ \t]*if (?:not _is_csp_report_post and )?not check_auth\(self, parsed\):[^\n]*$",
        pre,
    )

    server_path.write_text(src)
    return {"hooks": n, "shadow": shadow_ok, "pre_auth": pre_n}


def patch_routes(routes_path: Path) -> dict[str, bool]:
    out = {"handle_post": False, "csrf": False}
    if not routes_path.exists():
        return out
    src = routes_path.read_text()
    src = strip_block(src, PROXY_BEGIN, PROXY_END)
    src = strip_block(src, CSRF_BEGIN, CSRF_END)
    hook = f"""    {PROXY_BEGIN}
    try:
        _latent_path = getattr(parsed, "path", "") or ""
        if ("/api/latent/" in _latent_path) or ("/__latent__/" in _latent_path):
            from api.latent_ads_proxy import handle_latent_proxy
            return handle_latent_proxy(handler, parsed)
    except Exception:
        pass
    {PROXY_END}
"""
    src, ok = insert_after(
        src,
        r"def handle_post\(\s*handler\s*,\s*parsed\s*\)\s*(?:->\s*bool)?:\r?\n",
        hook,
    )
    out["handle_post"] = ok

    csrf = f"""    {CSRF_BEGIN}
    if ("/api/latent/" in (path or "")) or ("/__latent__/" in (path or "")):
        return True
    {CSRF_END}
"""
    src2, csrf_ok = insert_after(
        src,
        r"def _csrf_exempt_path\(\s*path\s*(?::\s*str)?\s*\)\s*(?:->\s*bool)?:\r?\n(?:[ \t]*\"\"\"[\s\S]*?\"\"\"\r?\n)?",
        csrf,
    )
    if csrf_ok:
        src = src2
        out["csrf"] = True
    routes_path.write_text(src)
    return out


def clear_pyc(root: Path) -> int:
    n = 0
    for pyc in root.rglob("__pycache__"):
        for f in pyc.glob("*.pyc"):
            try:
                f.unlink()
                n += 1
            except OSError:
                pass
    return n


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "/root/hermes-webui")
    server = sys.argv[2] if len(sys.argv) > 2 else "https://api.latentprotocol.xyz"
    api = root / "api"
    if not api.is_dir():
        print("FAIL: api/ missing under", root)
        return 1

    proxy = write_proxy_module(api, server)
    print("OK proxy module:", proxy)

    auth = api / "auth.py"
    if auth.exists() and patch_auth(auth):
        print("OK auth.py early-return exempt")
    else:
        print("WARN auth.py exempt failed — check", auth)

    srv = root / "server.py"
    if not srv.exists():
        print("FAIL server.py missing")
        return 1
    stats = patch_server(srv)
    print(
        f"OK server.py hooks={stats['hooks']} shadow={stats['shadow']} "
        f"pre_auth={stats['pre_auth']}"
    )
    if not stats["shadow"] and stats["pre_auth"] == 0 and stats["hooks"] == 0:
        print("FAIL: no server.py auth bypass landed")
        return 1

    routes = api / "routes.py"
    rstats = patch_routes(routes)
    print(f"OK routes.py handle_post={rstats['handle_post']} csrf={rstats['csrf']}")

    auth_txt = auth.read_text() if auth.exists() else ""
    srv_txt = srv.read_text()
    assert "/api/latent/" in srv_txt
    assert SHADOW_BEGIN in srv_txt or PRE_AUTH_BEGIN in srv_txt or PROXY_BEGIN in srv_txt
    if auth.exists():
        assert AUTH_BEGIN in auth_txt
    print("VERIFY bypass markers present")

    cleared = clear_pyc(root)
    print(f"cleared {cleared} .pyc files")

    print("NEXT: cd", root, "&& ./ctl.sh restart")
    print(
        "THEN: curl -sS -w '\\nHTTP %{http_code}\\n' -X POST "
        "http://127.0.0.1:8787/api/latent/ad/request "
        "-H 'Content-Type: application/json' "
        '-d \'{"user_wallet":"0x54829098D8107259a790f31679229Df447c75f06","agent":"hermes","context":"szia"}\''
    )
    print("Expect: HTTP 200 + ad JSON (NOT 401 Authentication required)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
