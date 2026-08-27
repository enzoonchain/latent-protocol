/**
 * Run after build: node cli/tests/webui-patch.test.mjs
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import {
  assertAsciiInjectSource,
  ensureWebuiCspConnectExtra,
  LATENT_PROXY_MARKER,
  LATENT_PROXY_PREFIX,
  patchWebuiCspSource,
  patchWebuiCtlShCsp,
  patchWebuiIndex,
  patchWebuiLatentProxy,
  unpatchWebuiIndex,
  upsertCspConnectExtra,
  WEBUI_MARKER,
} from "../dist/surfaces/hermes-webui-patch.js";

const root = mkdtempSync(join(tmpdir(), "latent-webui-patch-"));
try {
  const staticDir = join(root, "static");
  mkdirSync(staticDir);
  writeFileSync(
    join(staticDir, "index.html"),
    "<html><body><!-- hermes-webui --><div id='app'></div></body></html>",
  );

  const res = patchWebuiIndex({
    staticDir,
    server: "https://api.latentprotocol.xyz",
    wallet: "0x" + "ab".repeat(20),
    frequency: 1,
  });
  assert.equal(res.ok, true);
  const html = readFileSync(join(staticDir, "index.html"), "utf8");
  assert.ok(html.includes(WEBUI_MARKER));
  assert.ok(html.includes("api.latentprotocol.xyz"));
  assert.ok(html.includes("latent-ad-footer"));
  assert.ok(html.includes("__LATENT_WEBUI__"));
  assert.ok(html.includes("webui_footer"));
  assert.ok(html.includes("version: 7"));
  assert.ok(html.includes("/api/latent"));
  assert.ok(html.includes("/__latent__"));
  assert.ok(html.includes("_postOnce"));
  assert.ok(html.includes("credentials: 'include'"));
  assert.ok(html.includes("_lastKey = key"));
  assert.ok(html.includes("</body>"));

  // String.replace must not corrupt "$'" sequences in the inject JS
  assert.ok(html.includes("+$' + parseFloat"), "earn amount concat must keep $'");
  assert.ok(!html.includes("+</html>"), "replace must not expand $' into trailing HTML");

  const script = html.split(WEBUI_MARKER)[1].split("</script>")[0];
  assertAsciiInjectSource(script.replace(/^[\s\S]*?<script>\n?/, ""));
  // node --check equivalent: no SyntaxError when evaluating as script body
  const body = script.replace(/^[\s\S]*?<script>\n?/, "");
  // eslint-disable-next-line no-new-func
  new Function(body);

  // Re-patch should not duplicate marker
  const res2 = patchWebuiIndex({
    staticDir,
    server: "https://api.example.test",
    wallet: "0x" + "cd".repeat(20),
    frequency: 1,
  });
  assert.equal(res2.ok, true);
  const html2 = readFileSync(join(staticDir, "index.html"), "utf8");
  assert.equal(html2.split(WEBUI_MARKER).length - 1, 1);
  assert.ok(html2.includes("api.example.test"));

  // CSP .env upsert: create + merge
  const envPath = join(root, ".env");
  const c1 = upsertCspConnectExtra(envPath, "https://api.latentprotocol.xyz");
  assert.equal(c1.ok, true);
  assert.ok(
    readFileSync(envPath, "utf8").includes(
      "HERMES_WEBUI_CSP_CONNECT_EXTRA=https://api.latentprotocol.xyz",
    ),
  );
  writeFileSync(
    envPath,
    "FOO=bar\nHERMES_WEBUI_CSP_CONNECT_EXTRA=https://other.example\n",
  );
  const c2 = upsertCspConnectExtra(envPath, "https://api.latentprotocol.xyz");
  assert.equal(c2.ok, true);
  const env2 = readFileSync(envPath, "utf8");
  assert.ok(env2.includes("https://other.example"));
  assert.ok(env2.includes("https://api.latentprotocol.xyz"));
  assert.ok(env2.includes("FOO=bar"));

  const hermesHome = join(root, "hermes-home");
  mkdirSync(hermesHome);
  const ensured = ensureWebuiCspConnectExtra({
    staticDir,
    server: "https://api.latentprotocol.xyz/v1/",
    hermesHome,
  });
  assert.equal(ensured.origin, "https://api.latentprotocol.xyz");
  assert.ok(ensured.updated.includes(join(root, ".env")));
  assert.ok(ensured.updated.includes(join(hermesHome, ".env")));

  // CSP source patch (helpers.py) — rewrite _csp_connect_src return f-string
  const apiDir = join(root, "api");
  mkdirSync(apiDir);
  writeFileSync(
    join(apiDir, "helpers.py"),
    [
      "_CSP_CONNECT_BASE = (",
      "    \"'self' http://127.0.0.1:* http://localhost:* http://ipc.localhost \"",
      '    "https://127.0.0.1:* https://localhost:* "',
      '    "ws://127.0.0.1:* ws://localhost:*"',
      ")",
      "",
      'def _csp_connect_src(extra_connect_src: str = "") -> str:',
      '    return f"{_CSP_CONNECT_BASE} https://cdn.jsdelivr.net{extra_connect_src}"',
      "",
    ].join("\n"),
  );
  const src1 = patchWebuiCspSource({
    staticDir,
    server: "https://api.latentprotocol.xyz",
  });
  assert.equal(src1.ok, true);
  if (src1.ok) assert.equal(src1.path, join(apiDir, "helpers.py"));
  let helpers = readFileSync(join(apiDir, "helpers.py"), "utf8");
  assert.ok(
    helpers.includes(
      "https://cdn.jsdelivr.net https://api.latentprotocol.xyz{extra_connect_src}",
    ),
  );
  // idempotent re-patch should not duplicate origin
  const src2 = patchWebuiCspSource({
    staticDir,
    server: "https://api.latentprotocol.xyz",
  });
  assert.equal(src2.ok, true);
  helpers = readFileSync(join(apiDir, "helpers.py"), "utf8");
  assert.equal(
    helpers.split("https://api.latentprotocol.xyz").length - 1,
    1,
    "origin should appear once after re-patch",
  );

  // ctl.sh export patch
  writeFileSync(join(root, "ctl.sh"), "#!/usr/bin/env bash\necho hi\n", {
    mode: 0o755,
  });
  const ctl = patchWebuiCtlShCsp({
    staticDir,
    server: "https://api.latentprotocol.xyz",
  });
  assert.equal(ctl.ok, true);
  const ctlSrc = readFileSync(join(root, "ctl.sh"), "utf8");
  assert.ok(ctlSrc.includes("HERMES_WEBUI_CSP_CONNECT_EXTRA"));
  assert.ok(ctlSrc.includes("https://api.latentprotocol.xyz"));

  // Same-origin proxy: module + server/routes/auth hooks
  writeFileSync(
    join(root, "server.py"),
    [
      "from urllib.parse import urlparse",
      "import time",
      "from api.auth import check_auth, reset_trusted_auth_request_state",
      "",
      "class Handler:",
      "    def do_POST(self) -> None:",
      "        self._handle_write(handle_post)",
      "",
      "    def _handle_write(self, route_func) -> None:",
      "        self._req_t0 = time.time(); reset_trusted_auth_request_state(self)",
      "        parsed = urlparse(self.path)",
      "        _is_csp_report_post = (",
      '            parsed.path == "/api/csp-report" and self.command == "POST"',
      "        )",
      "        if not _is_csp_report_post and not check_auth(self, parsed): return",
      "        return route_func(self, parsed)",
      "",
      "    def do_GET(self) -> None:",
      "        parsed = urlparse(self.path)",
      "        if not check_auth(self, parsed): return",
      "        return handle_get(self, parsed)",
      "",
      "def main() -> None:",
      "    pass",
      "",
      'if __name__ == "__main__":',
      "    main()",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(apiDir, "routes.py"),
    [
      "def _csrf_exempt_path(path: str) -> bool:",
      '    """Paths that cannot or must not carry a session CSRF token."""',
      "    return path in {",
      '        "/api/auth/login",',
      '        "/api/csp-report",',
      "    }",
      "",
      "def handle_post(handler, parsed) -> bool:",
      '    """Handle all POST routes."""',
      "    if parsed.path == '/api/csp-report':",
      "        return True",
      "    if not _csrf_exempt_path(parsed.path):",
      "        return False",
      "    return False",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(apiDir, "auth.py"),
    [
      "def check_auth(handler, parsed) -> bool:",
      '    """Check if request is authorized."""',
      "    if (",
      "        parsed.path in PUBLIC_PATHS",
      "        or parsed.path.startswith('/share/')",
      "        or parsed.path.startswith('/static/')",
      "        or parsed.path.startswith('/session/static/')",
      "    ):",
      "        return True",
      "    return False",
      "",
    ].join("\n"),
  );
  const prox = patchWebuiLatentProxy({
    staticDir,
    server: "https://api.latentprotocol.xyz",
  });
  assert.equal(prox.ok, true);
  if (prox.ok) {
    assert.ok(existsSync(prox.proxyPath));
    const py = readFileSync(prox.proxyPath, "utf8");
    assert.ok(py.includes(LATENT_PROXY_MARKER));
    assert.ok(py.includes("https://api.latentprotocol.xyz"));
    assert.ok(py.includes("/ad/request"));
    assert.ok(py.includes("/api/latent"));
    const srv = readFileSync(prox.serverPath, "utf8");
    assert.ok(srv.includes("latent-protocol-proxy-begin"));
    assert.ok(srv.includes(LATENT_PROXY_PREFIX));
    assert.ok(srv.includes("/api/latent"));
    assert.ok(srv.includes("handle_latent_proxy"));
    assert.ok(srv.includes("latent-protocol-auth-shadow-begin"));
    assert.ok(srv.includes("_latent_check_auth_bound"));
    assert.ok(srv.includes("latent-protocol-pre-auth-begin"));
    assert.ok(srv.includes("latent-protocol-nuclear-begin"));
    assert.ok(srv.includes("_latent_nuclear_do_POST"));
    // do_POST + _handle_write both hooked
    assert.equal(
      srv.split("latent-protocol-proxy-begin").length - 1,
      2,
      "server.py should have 2 hooks",
    );
    // GET + write check_auth sites both get pre-auth bypass
    assert.equal(
      srv.split("latent-protocol-pre-auth-begin").length - 1,
      2,
      "server.py should have 2 pre-auth bypasses",
    );
    assert.equal(
      srv.split("latent-protocol-nuclear-begin").length - 1,
      1,
      "server.py should have 1 nuclear wrap",
    );
    const routes = readFileSync(join(apiDir, "routes.py"), "utf8");
    assert.ok(routes.includes("handle_latent_proxy"));
    assert.ok(routes.includes("latent-protocol-csrf-exempt-begin"));
    const auth = readFileSync(join(apiDir, "auth.py"), "utf8");
    assert.ok(auth.includes("/api/latent/") || auth.includes("latent-protocol-auth"));
    // idempotent
    const prox2 = patchWebuiLatentProxy({
      staticDir,
      server: "https://api.latentprotocol.xyz",
    });
    assert.equal(prox2.ok, true);
    const srv2 = readFileSync(prox.serverPath, "utf8");
    assert.equal(
      srv2.split("latent-protocol-proxy-begin").length - 1,
      2,
      "proxy hooks should stay at 2 after re-patch",
    );
    assert.equal(
      srv2.split("latent-protocol-auth-shadow-begin").length - 1,
      1,
      "auth shadow should stay at 1 after re-patch",
    );
    assert.equal(
      srv2.split("latent-protocol-pre-auth-begin").length - 1,
      2,
      "pre-auth bypasses should stay at 2 after re-patch",
    );
    assert.equal(
      srv2.split("latent-protocol-nuclear-begin").length - 1,
      1,
      "nuclear wrap should stay at 1 after re-patch",
    );
    assert.ok(
      srv2.indexOf("latent-protocol-nuclear-begin") <
        srv2.indexOf('if __name__ == "__main__":'),
      "nuclear wrap must run before main guard",
    );
  }

  const u = unpatchWebuiIndex(staticDir);
  assert.equal(u.ok, true);
  assert.ok(!readFileSync(join(staticDir, "index.html"), "utf8").includes(WEBUI_MARKER));

  console.log("ok - node webui patch");
} finally {
  rmSync(root, { recursive: true, force: true });
}
