#!/usr/bin/env bash
# One paste block for the VPS. Do not edit lines. Run as root.
set -euo pipefail

ROOT="${1:-/root/hermes-webui}"
PORT="${2:-8787}"
API="${3:-https://api.latentprotocol.xyz}"
APPLY="/tmp/apply-hermes-latent-nuclear.py"

echo "=== 1) fetch apply script via gh api (private repo) ==="
if ! command -v gh >/dev/null 2>&1; then
  echo "FAIL: gh CLI missing. Install/auth gh, or scp apply-hermes-latent-nuclear.py to $APPLY"
  exit 1
fi
gh api "repos/enzoonchain/latent-protocol/contents/cli/scripts/apply-hermes-latent-nuclear.py?ref=cursor/webui-auth-nuclear-bypass-1bce" \
  --jq .content | base64 -d > "$APPLY"
test -s "$APPLY"
python3 -m py_compile "$APPLY"
echo "OK wrote $APPLY ($(wc -c < "$APPLY") bytes)"

echo "=== 2) patch hermes-webui ==="
python3 "$APPLY" "$ROOT" "$API"

echo "=== 3) syntax check server.py ==="
python3 -m py_compile "$ROOT/server.py"
grep -n "latent-protocol-nuclear-begin" "$ROOT/server.py" | head -3
grep -n 'if __name__' "$ROOT/server.py" | head -3
test -f "$ROOT/api/latent_ads_proxy.py"
echo "OK server.py syntax + nuclear marker + proxy module"

echo "=== 4) hard restart (kill ANYTHING on :$PORT) ==="
cd "$ROOT"
./ctl.sh stop || true
sleep 1
# kill listeners on port (stale PID was the earlier failure mode)
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
fi
# belt: kill by ss pid
PIDS="$(ss -ltnp 2>/dev/null | awk -v p=":$PORT" '$4 ~ p {print}' | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u || true)"
if [[ -n "${PIDS:-}" ]]; then
  echo "killing leftover pids: $PIDS"
  # shellcheck disable=SC2086
  kill $PIDS 2>/dev/null || true
  sleep 1
  # shellcheck disable=SC2086
  kill -9 $PIDS 2>/dev/null || true
fi
sleep 1
if ss -ltnp 2>/dev/null | grep -q ":${PORT} "; then
  echo "FAIL: port $PORT still busy:"
  ss -ltnp | grep ":${PORT} " || true
  exit 1
fi
echo "OK port $PORT free"

./ctl.sh start
sleep 3

echo "=== 5) verify process + nuclear log ==="
ss -ltnp | grep ":${PORT} " || {
  echo "FAIL: nothing listening on $PORT after start"
  echo "--- webui.log ---"
  tail -80 "${HOME}/.hermes/webui.log" || true
  exit 1
}
if ! grep -F 'nuclear do_POST wrap installed' "${HOME}/.hermes/webui.log" | tail -5; then
  echo "WARN: nuclear log line missing — showing log tail"
  tail -80 "${HOME}/.hermes/webui.log" || true
fi

echo "=== 6) curl ad proxy ==="
set +e
RESP="$(curl -sS -w '\nHTTP_CODE:%{http_code}\n' -X POST "http://127.0.0.1:${PORT}/api/latent/ad/request" \
  -H 'Content-Type: application/json' \
  -d '{"user_wallet":"0x54829098D8107259a790f31679229Df447c75f06","agent":"hermes","context":"szia"}' 2>&1)"
RC=$?
set -e
echo "$RESP"
echo "curl_exit=$RC"

if echo "$RESP" | grep -q 'HTTP_CODE:200'; then
  echo "SUCCESS: proxy returns 200"
  exit 0
fi

echo "=== FAILURE DUMP ==="
echo "--- ss ---"
ss -ltnp | grep ":${PORT} " || true
echo "--- log ---"
tail -100 "${HOME}/.hermes/webui.log" || true
echo "--- nuclear in server.py? ---"
grep -c "latent-protocol-nuclear-begin" "$ROOT/server.py" || true
exit 1
