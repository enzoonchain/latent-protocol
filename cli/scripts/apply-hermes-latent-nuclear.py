#!/usr/bin/env python3
"""Self-contained VPS apply (no GitHub raw needed). Private-repo safe.

Usage:
  python3 apply-hermes-latent-nuclear.py /root/hermes-webui https://api.latentprotocol.xyz
  cd /root/hermes-webui && ./ctl.sh stop || true
  fuser -k 8787/tcp 2>/dev/null || true
  ./ctl.sh start
  grep -F 'nuclear do_POST wrap installed' ~/.hermes/webui.log | tail -3
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

NUCLEAR_BEGIN = "# latent-protocol-nuclear-begin"
NUCLEAR_END = "# latent-protocol-nuclear-end"
AUTH_BEGIN = "# latent-protocol-auth-exempt-begin"
AUTH_END = "# latent-protocol-auth-exempt-end"

NUCLEAR = f"""
{NUCLEAR_BEGIN}
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


def write_proxy(api: Path, server: str) -> None:
    origin = server.rstrip("/")
    (api / "latent_ads_proxy.py").write_text(
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


def patch_auth(auth: Path) -> bool:
    if not auth.exists():
        print("auth.py missing — skip (nuclear wrap still covers POST)")
        return False
    src = strip_block(auth.read_text(), AUTH_BEGIN, AUTH_END)
    early = f"""    {AUTH_BEGIN}
    _lp = getattr(parsed, "path", "") or ""
    if ("/api/latent/" in _lp) or ("/__latent__/" in _lp):
        return True
    {AUTH_END}
"""
    m = re.search(
        r"def check_auth\(\s*handler\s*,\s*parsed\s*\)\s*(?:->\s*bool)?:\r?\n(?:[ \t]*\"\"\"[\s\S]*?\"\"\"\r?\n)?",
        src,
    )
    if not m:
        m = re.search(r"def check_auth\([^)]*\):\r?\n", src)
    if not m:
        # Dirty-fork fallback: wrap whatever check_auth exists.
        if "def check_auth(" not in src:
            print("auth.py: no check_auth() found")
            return False
        src2 = re.sub(r"def check_auth\(", "def _latent_check_auth_orig(", src, count=1)
        wrapper = f"""
{AUTH_BEGIN}
def check_auth(handler, parsed):
    _lp = getattr(parsed, "path", "") or ""
    if ("/api/latent/" in _lp) or ("/__latent__/" in _lp):
        return True
    return _latent_check_auth_orig(handler, parsed)
{AUTH_END}
"""
        auth.write_text(src2.rstrip() + "\n" + wrapper + "\n")
        return True
    at = m.end()
    auth.write_text(src[:at] + early + "\n" + src[at:])
    return True


def patch_server(server: Path) -> bool:
    src = strip_block(server.read_text(), NUCLEAR_BEGIN, NUCLEAR_END)
    block = NUCLEAR.rstrip() + "\n"
    m = re.search(r'^if __name__\s*==\s*[\'"]__main__[\'"]\s*:\s*$', src, flags=re.M)
    if not m:
        m = re.search(r'^def main\(\s*\)\s*(?:->\s*None)?:\s*$', src, flags=re.M)
    if not m:
        return False
    src = src[: m.start()] + block + "\n" + src[m.start() :]
    compile(src, str(server), "exec")
    server.write_text(src)
    return True


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
    server_url = sys.argv[2] if len(sys.argv) > 2 else "https://api.latentprotocol.xyz"
    api = root / "api"
    srv = root / "server.py"
    if not api.is_dir() or not srv.exists():
        print("FAIL: need", root, "with server.py + api/")
        return 1

    write_proxy(api, server_url)
    print("OK proxy module")

    print("OK auth.py" if patch_auth(api / "auth.py") else "WARN auth.py")

    if not patch_server(srv):
        print("FAIL: could not insert nuclear wrap before main")
        return 1
    print("OK nuclear wrap before main")

    print("cleared", clear_pyc(root), ".pyc")
    print("NEXT:")
    print(f"  cd {root}")
    print("  ./ctl.sh stop || true")
    print("  fuser -k 8787/tcp 2>/dev/null || true")
    print("  ./ctl.sh start")
    print("  grep -F 'nuclear do_POST wrap installed' ~/.hermes/webui.log | tail -3")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
