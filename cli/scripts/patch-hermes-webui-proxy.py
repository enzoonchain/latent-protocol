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
NUCLEAR_BEGIN = "# latent-protocol-nuclear-begin"
NUCLEAR_END = "# latent-protocol-nuclear-end"

NUCLEAR_WRAP = f"""
{NUCLEAR_BEGIN}
# Last-resort wrap: replaces Handler.do_POST after class definition so auth
# inside _handle_write can never 401 /api/latent/* requests.
try:
    import http.server as _latent_http_server
    _latent_handler_cls = None
    for _latent_name, _latent_obj in list(globals().items()):
        if (
            isinstance(_latent_obj, type)
            and issubclass(_latent_obj, _latent_http_server.BaseHTTPRequestHandler)
            and _latent_obj is not _latent_http_server.BaseHTTPRequestHandler
            and hasattr(_latent_obj, "do_POST")
        ):
            _latent_handler_cls = _latent_obj
            break
    if _latent_handler_cls is not None:
        _latent_orig_do_POST = _latent_handler_cls.do_POST

        def _latent_nuclear_do_POST(self, *args, **kwargs):
            try:
                from urllib.parse import urlparse as _latent_urlparse
                _latent_parsed = _latent_urlparse(getattr(self, "path", "") or "")
                _latent_path = _latent_parsed.path or ""
                if ("/api/latent/" in _latent_path) or ("/__latent__/" in _latent_path):
                    from api.latent_ads_proxy import handle_latent_proxy
                    return handle_latent_proxy(self, _latent_parsed)
            except Exception as _latent_exc:
                try:
                    print("[latent-protocol] nuclear do_POST error: %r" % (_latent_exc,), flush=True)
                except Exception:
                    pass
                try:
                    _latent_body = b'{{"error":"proxy_failed","where":"nuclear"}}'
                    self.send_response(502)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(_latent_body)))
                    self.end_headers()
                    self.wfile.write(_latent_body)
                    return
                except Exception:
                    pass
            return _latent_orig_do_POST(self, *args, **kwargs)

        _latent_handler_cls.do_POST = _latent_nuclear_do_POST
        print(
            "[latent-protocol] nuclear do_POST wrap installed on %s"
            % (_latent_handler_cls.__name__,),
            flush=True,
        )
    else:
        print("[latent-protocol] nuclear wrap: no Handler class found", flush=True)
except Exception as _latent_nuclear_exc:
    print("[latent-protocol] nuclear wrap failed: %r" % (_latent_nuclear_exc,), flush=True)
{NUCLEAR_END}
"""


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
    src = strip_block(src, NUCLEAR_BEGIN, NUCLEAR_END)

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

    # Install nuclear wrap BEFORE `if __name__ == "__main__"` so it runs at
    # import time. Appending after the main guard never executes while
    # serve_forever() is blocking.
    nuclear_ok = False
    if NUCLEAR_BEGIN not in src:
        block = NUCLEAR_WRAP.rstrip() + "\n"
        src2, count = insert_before_all(
            src,
            r'^if __name__\s*==\s*[\'"]__main__[\'"]\s*:\s*$',
            block,
        )
        if count == 1:
            src = src2
            nuclear_ok = True
        else:
            src2, count = insert_before_all(
                src,
                r'^def main\(\s*\)\s*(?:->\s*None)?:\s*$',
                block,
            )
            if count >= 1:
                src = src2
                nuclear_ok = True
            else:
                print("WARN: could not find main guard; nuclear wrap not installed")
                nuclear_ok = False
    else:
        nuclear_ok = True

    server_path.write_text(src)
    return {
        "hooks": n,
        "shadow": shadow_ok,
        "pre_auth": pre_n,
        "nuclear": nuclear_ok,
    }


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


def diagnose(root: Path, port: int = 8787) -> int:
    import json
    import subprocess
    import urllib.error
    import urllib.request

    print("=== DIAGNOSE ===")
    print("root:", root)
    srv = root / "server.py"
    auth = root / "api" / "auth.py"
    proxy = root / "api" / "latent_ads_proxy.py"
    for p in (srv, auth, proxy):
        print(f"exists {p}: {p.exists()}")
    if srv.exists():
        txt = srv.read_text()
        for marker in (
            NUCLEAR_BEGIN,
            SHADOW_BEGIN,
            PRE_AUTH_BEGIN,
            PROXY_BEGIN,
        ):
            print(f"marker {marker}: {marker in txt}")
        try:
            compile(txt, str(srv), "exec")
            print("server.py: syntax OK")
        except SyntaxError as exc:
            print("server.py: SYNTAX ERROR:", exc)
            return 1

    # Who owns the port?
    try:
        out = subprocess.check_output(
            ["ss", "-ltnp"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        try:
            out = subprocess.check_output(
                ["lsof", f"-i:{port}", "-n", "-P"],
                text=True,
                stderr=subprocess.DEVNULL,
            )
        except Exception as exc:
            out = f"(could not inspect port: {exc})"
    print("--- listeners ---")
    for line in out.splitlines():
        if str(port) in line:
            print(line)

    pid_file = Path.home() / ".hermes" / "webui.pid"
    log_file = Path.home() / ".hermes" / "webui.log"
    print("pid_file:", pid_file, "exists=", pid_file.exists())
    if pid_file.exists():
        print("pid:", pid_file.read_text().strip())
    if log_file.exists():
        tail = log_file.read_text(errors="replace").splitlines()[-40:]
        print("--- webui.log (tail) ---")
        for line in tail:
            print(line)
        nuclear_hit = any("nuclear do_POST wrap installed" in ln for ln in tail)
        print("log has nuclear wrap:", nuclear_hit)

    url = f"http://127.0.0.1:{port}/api/latent/ad/request"
    body = json.dumps(
        {
            "user_wallet": "0x54829098D8107259a790f31679229Df447c75f06",
            "agent": "hermes",
            "context": "diagnose",
        }
    ).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()[:300]
            print(f"curl-equivalent: HTTP {resp.status} body={data!r}")
    except urllib.error.HTTPError as err:
        data = err.read()[:300]
        print(f"curl-equivalent: HTTP {err.code} body={data!r}")
    except Exception as exc:
        print(f"curl-equivalent: ERROR {exc!r}")

    print("=== END DIAGNOSE ===")
    return 0


def main() -> int:
    args = [a for a in sys.argv[1:] if a]
    if args and args[0] in {"--diagnose", "diagnose"}:
        root = Path(args[1] if len(args) > 1 else "/root/hermes-webui")
        port = int(args[2]) if len(args) > 2 else 8787
        return diagnose(root, port)

    root = Path(args[0] if args else "/root/hermes-webui")
    server = args[1] if len(args) > 1 else "https://api.latentprotocol.xyz"
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
        f"pre_auth={stats['pre_auth']} nuclear={stats['nuclear']}"
    )
    if not stats.get("nuclear"):
        print("FAIL: nuclear wrap missing")
        return 1

    routes = api / "routes.py"
    rstats = patch_routes(routes)
    print(f"OK routes.py handle_post={rstats['handle_post']} csrf={rstats['csrf']}")

    auth_txt = auth.read_text() if auth.exists() else ""
    srv_txt = srv.read_text()
    assert NUCLEAR_BEGIN in srv_txt
    assert "/api/latent/" in srv_txt
    if auth.exists():
        assert AUTH_BEGIN in auth_txt
    try:
        compile(srv_txt, str(srv), "exec")
        print("VERIFY server.py syntax OK")
    except SyntaxError as exc:
        print("FAIL server.py syntax:", exc)
        return 1
    print("VERIFY nuclear marker present")

    cleared = clear_pyc(root)
    print(f"cleared {cleared} .pyc files")

    print("NEXT:")
    print(f"  cd {root}")
    print("  ./ctl.sh stop || true")
    print("  # if old process still holds 8787:")
    print("  #   ss -ltnp | grep 8787")
    print("  #   kill <pid>")
    print("  ./ctl.sh start")
    print("  grep -F 'nuclear do_POST wrap installed' ~/.hermes/webui.log | tail -3")
    print(
        "  curl -sS -w '\\nHTTP %{http_code}\\n' -X POST "
        "http://127.0.0.1:8787/api/latent/ad/request "
        "-H 'Content-Type: application/json' "
        '-d \'{"user_wallet":"0x54829098D8107259a790f31679229Df447c75f06","agent":"hermes","context":"szia"}\''
    )
    print("Expect: log line + HTTP 200 (NOT 401)")
    print("If still 401: python3 /tmp/patch-hermes-webui-proxy.py --diagnose", root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
