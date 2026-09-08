/**
 * The Claude Code surface must never put an `npx` invocation in settings.json.
 *
 * The status line re-runs its command every few seconds and the turn hooks run
 * on every prompt. When that command was `npx … latent-protocol …`, each
 * invocation re-resolved (and on a cold/corrupt cache, re-cloned and rebuilt)
 * the package — the concurrent runs thrashed the npm cache, hit the 10s hook
 * timeout, and left half-installed trees ("sh: latent: command not found").
 *
 * `init` now stages self-contained bundles into ~/.latent-protocol/bin/ and
 * points settings.json at `node "<bundle>"`. This test pins that down:
 *   - no `npx` anywhere in the written settings
 *   - the bundles are staged and are what the commands point at
 *   - install is idempotent and migrates the old `npx` commands
 *   - the staged bundles actually fetch an ad and render/bill one impression
 *
 * Run after `npm --prefix cli run build`:
 *   node --test cli/tests/claude-code-surface.test.mjs
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BUNDLE_STATUSLINE = new URL("../dist/claude/statusline.mjs", import.meta.url);
const BUNDLE_HOOK = new URL("../dist/claude/hook.mjs", import.meta.url);

if (!existsSync(BUNDLE_STATUSLINE) || !existsSync(BUNDLE_HOOK)) {
  console.error("dist/claude/*.mjs missing — run `npm --prefix cli run build` first");
  process.exit(1);
}

/** Spawn a node script, feed it `input` on stdin, collect stdio. Async so the
 *  in-process ad server keeps accepting connections while it runs. */
function runNode(script, args, input) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [script, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out, err }));
    p.stdin.end(input);
  });
}

function startAdServer() {
  const impressions = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.url === "/ad/request") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ad_id: "ad-1",
            title: "T",
            body: "sponsored body",
            cta_text: "Go",
            cta_url: "https://example.com/x",
            earn_amount: 0.005,
            impression_token: "tok-1",
          }),
        );
        return;
      }
      if (req.url === "/ad/impression") impressions.push(raw ? JSON.parse(raw) : {});
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, impressions, port: server.address().port }),
    );
  });
}

/** Fresh $HOME with a config pointing at `port`; returns the surface module. */
async function freshHome(port) {
  const home = mkdtempSync(join(tmpdir(), "latent-cc-"));
  process.env.HOME = home;
  delete process.env.ADS_SERVER;
  delete process.env.ADS_WALLET;
  delete process.env.ADS_ENABLED;
  mkdirSync(join(home, ".latent-protocol"), { recursive: true });
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(
    join(home, ".latent-protocol", "config.json"),
    JSON.stringify({
      wallet: "0x1111111111111111111111111111111111111111",
      enabled: true,
      server: `http://127.0.0.1:${port}`,
      frequency: 1,
    }),
  );
  // Bust the ESM cache so each test gets the module fresh (paths resolve lazily
  // via homedir(), so this is mostly belt-and-braces).
  const mod = await import(`../dist/surfaces/claude-code.js?${Date.now()}`);
  return { home, mod };
}

const settingsOf = (home) =>
  JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
const settingsRaw = (home) =>
  readFileSync(join(home, ".claude", "settings.json"), "utf8");

test("install writes node invocations, never npx", async () => {
  const { server, port } = await startAdServer();
  try {
    const { home, mod } = await freshHome(port);
    mod.installClaudeCode();

    const raw = settingsRaw(home);
    assert.ok(!/\bnpx\b/.test(raw), `settings.json contains npx:\n${raw}`);

    const s = settingsOf(home);
    const binSL = join(home, ".latent-protocol", "bin", "statusline.mjs");
    const binHook = join(home, ".latent-protocol", "bin", "hook.mjs");
    assert.ok(existsSync(binSL), "statusline.mjs not staged");
    assert.ok(existsSync(binHook), "hook.mjs not staged");
    assert.equal(s.statusLine.command, `node "${binSL}"`);
    assert.equal(s.statusLine.refreshInterval, 10);

    for (const [event, name] of [
      ["SessionStart", "session-start"],
      ["UserPromptSubmit", "turn-start"],
      ["Stop", "turn-end"],
      ["SessionEnd", "session-end"],
    ]) {
      assert.equal(
        s.hooks[event][0].hooks[0].command,
        `node "${binHook}" ${name} --agent claude-code`,
        `${event} hook command`,
      );
    }
  } finally {
    server.close();
  }
});

test("install is idempotent and migrates legacy npx commands", async () => {
  const { server, port } = await startAdServer();
  try {
    const { home, mod } = await freshHome(port);
    // Seed the state a broken older install would leave behind.
    writeFileSync(
      join(home, ".claude", "settings.json"),
      JSON.stringify(
        {
          statusLine: {
            type: "command",
            command: "npx --yes github:enzoonchain/latent-protocol statusline",
            refreshInterval: 10,
          },
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    type: "command",
                    command:
                      "npx --yes github:enzoonchain/latent-protocol hook turn-end --agent claude-code",
                    timeout: 10,
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    mod.installClaudeCode();
    mod.installClaudeCode(); // twice — must not duplicate

    const raw = settingsRaw(home);
    assert.ok(!/\bnpx\b/.test(raw), "legacy npx not migrated");
    const s = settingsOf(home);
    assert.equal(s.hooks.Stop.length, 1, "hook entry duplicated");
    assert.equal(s.hooks.UserPromptSubmit.length, 1);
    assert.match(s.hooks.Stop[0].hooks[0].command, /hook\.mjs" turn-end --agent claude-code$/);
  } finally {
    server.close();
  }
});

test("uninstall removes our statusLine + hooks (old and new forms)", async () => {
  const { server, port } = await startAdServer();
  try {
    const { home, mod } = await freshHome(port);
    mod.installClaudeCode();
    mod.uninstallClaudeCode();
    const s = settingsOf(home);
    assert.ok(!s.statusLine, "statusLine survived uninstall");
    assert.ok(!s.hooks || Object.keys(s.hooks).length === 0, "hooks survived uninstall");
  } finally {
    server.close();
  }
});

test("staged bundles fetch an ad and bill exactly one impression", async () => {
  const { server, impressions, port } = await startAdServer();
  try {
    const { home, mod } = await freshHome(port);
    mod.installClaudeCode();
    const binHook = join(home, ".latent-protocol", "bin", "hook.mjs");
    const binSL = join(home, ".latent-protocol", "bin", "statusline.mjs");
    const session = JSON.stringify({ session_id: "sess-A" });

    const hook = await runNode(
      binHook,
      ["turn-start", "--agent", "claude-code"],
      JSON.stringify({ session_id: "sess-A", prompt: "fix a failing rust build" }),
    );
    assert.equal(hook.code, 0, `hook exited ${hook.code}: ${hook.err}`);
    assert.ok(
      existsSync(join(home, ".latent-protocol", "statusline_cache.json")),
      "hook did not prefetch into the status line cache",
    );

    const a = await runNode(binSL, [], session);
    const b = await runNode(binSL, [], session);
    assert.ok(a.out.includes("sponsored body"), `status line did not render: ${JSON.stringify(a.out)}`);
    assert.equal(a.out, b.out, "status line changed ad mid-rotation");
    assert.equal(
      impressions.length,
      1,
      `one displayed ad must bill once, got ${impressions.length}`,
    );
  } finally {
    server.close();
  }
});
