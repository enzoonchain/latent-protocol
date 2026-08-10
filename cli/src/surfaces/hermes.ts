import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { detectAgents, findHermesWebuiStatic } from "../detect.js";
import { loadConfig, resolveServer, resolveWallet, saveConfig } from "../config.js";
import {
  ensureWebuiCspConnectExtra,
  patchWebuiCspSource,
  patchWebuiIndex,
  unpatchWebuiIndex,
} from "./hermes-webui-patch.js";

const PLUGIN_NAME = "agent-ads";
const GIT_PIP =
  "git+https://github.com/enzoonchain/latent-protocol.git@cursor/npx-latent-init-hermes-1bce";

function templateDir(): string {
  // dist/surfaces/hermes.js → ../../templates/hermes-plugin
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "templates", "hermes-plugin");
}

function run(cmd: string, args: string[], opts: { cwd?: string } = {}): {
  ok: boolean;
  stdout: string;
  stderr: string;
} {
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: opts.cwd,
    env: process.env,
  });
  return {
    ok: res.status === 0,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  };
}

function findPython(): string | null {
  for (const bin of ["python3", "python"]) {
    const res = run(bin, ["--version"]);
    if (res.ok) return bin;
  }
  return null;
}

function pythonBeside(binPath: string): string | null {
  const dirs = new Set<string>();
  dirs.add(dirname(binPath));
  try {
    dirs.add(dirname(realpathSync(binPath)));
  } catch {
    // ignore broken symlinks
  }
  for (const dir of dirs) {
    for (const name of ["python3", "python"]) {
      const candidate = join(dir, name);
      if (existsSync(candidate) && run(candidate, ["--version"]).ok) {
        return candidate;
      }
    }
  }
  return null;
}

function shebangPython(binPath: string): string | null {
  try {
    const first = readFileSync(binPath, "utf8").split("\n")[0] ?? "";
    if (!first.startsWith("#!")) return null;
    const parts = first.slice(2).trim().split(/\s+/);
    // #!/usr/bin/env python3
    if (parts[0]?.endsWith("env") && parts[1]) {
      const resolved = run("bash", ["-lc", `command -v ${parts[1]}`]);
      if (resolved.ok && resolved.stdout.trim()) return resolved.stdout.trim();
    }
    if (parts[0] && existsSync(parts[0]) && run(parts[0], ["--version"]).ok) {
      return parts[0];
    }
  } catch {
    // binary / unreadable
  }
  return null;
}

/** Prefer the interpreter Hermes itself runs under (uv tool / pipx / venv). */
function findHermesPython(): string | null {
  const which = run("bash", ["-lc", "command -v hermes"]);
  const hermesBin = which.ok ? which.stdout.trim() : "";
  if (hermesBin) {
    const beside = pythonBeside(hermesBin);
    if (beside) return beside;
    const fromShebang = shebangPython(hermesBin);
    if (fromShebang) return fromShebang;
  }

  const home = process.env.HOME || homedir();
  const candidates = [
    join(home, ".local/share/uv/tools/hermes-agent/bin/python"),
    join(home, ".local/share/uv/tools/hermes/bin/python"),
    join(home, ".local/share/pipx/venvs/hermes-agent/bin/python"),
    join(home, ".local/share/pipx/venvs/hermes/bin/python"),
    join(home, ".hermes/hermes-agent/venv/bin/python"),
    join(home, ".hermes/hermes-agent/venv/bin/python3"),
    join(home, ".hermes/venv/bin/python"),
    join(home, ".hermes/.venv/bin/python"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && run(candidate, ["--version"]).ok) return candidate;
  }
  return null;
}

function findPip(python: string): string[] {
  const pipModule = run(python, ["-m", "pip", "--version"]);
  if (pipModule.ok) return [python, "-m", "pip"];
  return [];
}

function pipInstall(
  pip: string[],
  args: string[],
): { ok: boolean; label: string; stderr: string } {
  // Plain install first (works inside venvs).
  const strategies: { label: string; extra: string[] }[] = [
    { label: args.join(" "), extra: [] },
    { label: `${args.join(" ")} --user`, extra: ["--user"] },
    {
      label: `${args.join(" ")} --break-system-packages`,
      extra: ["--break-system-packages"],
    },
  ];
  let lastStderr = "";
  for (const strategy of strategies) {
    const res = run(pip[0]!, [...pip.slice(1), "install", ...strategy.extra, ...args]);
    if (res.ok) return { ok: true, label: strategy.label, stderr: "" };
    lastStderr = res.stderr || res.stdout || lastStderr;
    // If it wasn't an externally-managed failure, don't keep forcing flags.
    if (
      !/externally-managed-environment|PEP\s*668/i.test(lastStderr) &&
      strategy.extra.length === 0
    ) {
      // still try remaining strategies; PEP 668 is the common case
    }
  }
  return { ok: false, label: args.join(" "), stderr: lastStderr };
}

function installWithUv(spec: string): { ok: boolean; label: string; stderr: string } {
  if (!run("uv", ["--version"]).ok) {
    return { ok: false, label: "uv", stderr: "uv not found" };
  }
  const hermesPy = findHermesPython();
  if (hermesPy) {
    const into = run("uv", ["pip", "install", "--python", hermesPy, spec]);
    if (into.ok) {
      return { ok: true, label: `uv pip install --python ${hermesPy} ${spec}`, stderr: "" };
    }
  }
  const system = run("uv", ["pip", "install", "--system", spec]);
  if (system.ok) {
    return { ok: true, label: `uv pip install --system ${spec}`, stderr: "" };
  }
  return {
    ok: false,
    label: `uv pip install ${spec}`,
    stderr: system.stderr || system.stdout || "",
  };
}

function installPythonPackage(): string {
  const pythons = [...new Set([findHermesPython(), findPython()].filter(Boolean))] as string[];
  if (pythons.length === 0) {
    return "⚠️  Python not found — Hermes plugin needs Python 3.10+. Skipped pip install.";
  }

  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const localPyproject = join(repoRoot, "pyproject.toml");
  const specs: { label: string; args: string[] }[] = [];
  if (existsSync(localPyproject)) {
    specs.push({ label: `-e ${repoRoot}`, args: ["-e", repoRoot] });
  }
  // Prefer branch git over PyPI so WebUI/Hermes fixes ship with npx github installs.
  specs.push({ label: GIT_PIP, args: [GIT_PIP] });
  specs.push({ label: "latent-protocol", args: ["latent-protocol"] });

  let lastErr = "";
  for (const python of pythons) {
    const pip = findPip(python);
    if (pip.length === 0) continue;
    for (const spec of specs) {
      const res = pipInstall(pip, spec.args);
      if (res.ok) return `✅ pip (${python}): ${res.label}`;
      lastErr = res.stderr.trim().slice(0, 240) || lastErr;
    }
  }

  for (const spec of ["latent-protocol", GIT_PIP]) {
    const uv = installWithUv(spec);
    if (uv.ok) return `✅ ${uv.label}`;
    lastErr = uv.stderr.trim().slice(0, 240) || lastErr;
  }

  return (
    "⚠️  Could not pip install latent-protocol into Hermes/system Python. " +
    `stderr: ${lastErr || "unknown"}`
  );
}

function writeFlatPlugin(pluginsDir: string): string {
  const dest = join(pluginsDir, PLUGIN_NAME);
  mkdirSync(dest, { recursive: true });
  const src = templateDir();
  copyFileSync(join(src, "plugin.yaml"), join(dest, "plugin.yaml"));
  copyFileSync(join(src, "__init__.py"), join(dest, "__init__.py"));
  return `✅ Hermes plugin written → ${dest}`;
}

function patchConfigEnabled(): string {
  const { paths } = detectAgents();
  const configPath = join(paths.hermesHome, "config.yaml");
  try {
    let raw = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
    if (raw.includes(`- ${PLUGIN_NAME}`) || raw.includes(`- "${PLUGIN_NAME}"`)) {
      return "ℹ️  agent-ads already listed in plugins.enabled";
    }
    if (/plugins:\s*\n(?:[ \t]+.+\n)*?[ \t]+enabled:\s*\n/.test(raw)) {
      raw = raw.replace(
        /(plugins:\s*\n(?:[ \t]+.+\n)*?[ \t]+enabled:\s*\n)/,
        `$1    - ${PLUGIN_NAME}\n`,
      );
      writeFileSync(configPath, raw);
      return `✅ Added agent-ads to ${configPath} plugins.enabled`;
    }
    const block =
      (raw.endsWith("\n") || raw.length === 0 ? "" : "\n") +
      "plugins:\n  enabled:\n" +
      `    - ${PLUGIN_NAME}\n`;
    writeFileSync(configPath, raw + block);
    return `✅ Wrote plugins.enabled to ${configPath}`;
  } catch (err) {
    return `⚠️  Could not enable plugin automatically: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function enableHermesPlugin(): string {
  const which = run("hermes", ["--help"]);
  if (which.ok) {
    const enable = run("hermes", ["plugins", "enable", PLUGIN_NAME]);
    if (enable.ok) return "✅ hermes plugins enable agent-ads";
  }
  // Fallback when hermes CLI missing or enable failed
  return patchConfigEnabled();
}

/** Patch nesquena/hermes-webui index.html (separate from CLI plugin — WebUI
 * runs its own agent loop and does not load hermes_agent.plugins).
 * Primary path is Node-native write — does not depend on Hermes venv pip. */
function patchHermesWebui(): string {
  const detected = detectAgents();
  const cfg = loadConfig();
  const wallet = resolveWallet(cfg);
  const server = resolveServer(cfg);
  const frequency = cfg.frequency ?? 1;

  const staticDirs = [
    detected.hermesWebuiStatic,
    findHermesWebuiStatic(),
    cfg.hermes_webui_static,
    process.env.HERMES_WEBUI_STATIC,
    process.env.HERMES_WEBUI_ROOT
      ? join(process.env.HERMES_WEBUI_ROOT, "static")
      : "",
  ].filter((p, i, arr): p is string => Boolean(p) && arr.indexOf(p) === i);

  const errors: string[] = [];

  for (const dir of staticDirs) {
    if (!existsSync(join(dir, "index.html"))) {
      errors.push(`${dir}: no index.html`);
      continue;
    }
    const res = patchWebuiIndex({
      staticDir: dir,
      server,
      wallet,
      frequency,
    });
    if (res.ok) {
      try {
        saveConfig({ hermes_webui_static: dir });
      } catch {
        // ignore
      }
      const cspEnv = ensureWebuiCspConnectExtra({
        staticDir: dir,
        server,
        hermesHome: detectAgents().paths.hermesHome,
      });
      const cspSrc = patchWebuiCspSource({ staticDir: dir, server });
      const cspEnvLines =
        cspEnv.updated.length > 0
          ? cspEnv.updated.map((p) => `   CSP .env updated: ${p}`).join("\n")
          : `   ⚠️  Could not write HERMES_WEBUI_CSP_CONNECT_EXTRA=${cspEnv.origin}`;
      const cspSrcLine = cspSrc.ok
        ? `   CSP source patched: ${cspSrc.path} (+ ${cspSrc.origin})`
        : `   ⚠️  CSP source patch failed: ${cspSrc.error}`;
      return (
        `✅ Hermes WebUI patched (node → ${dir})\n` +
        `   Patched: ${res.indexPath}\n` +
        `${cspSrcLine}\n` +
        `${cspEnvLines}\n` +
        "   REQUIRED next steps:\n" +
        "   1) Restart WebUI:  cd ~/hermes-webui && ./ctl.sh restart\n" +
        "      (CSP headers are built at process start from api/helpers.py)\n" +
        "   2) Hard-refresh Tailscale tab: Ctrl+Shift+R\n" +
        "   3) DevTools console should show: [latent-protocol] WebUI ads active\n" +
        `   4) Confirm CSP includes ${cspEnv.origin} (Response headers → content-security-policy)`
      );
    }
    errors.push(`${dir}: ${res.error}`);
  }

  if (staticDirs.length === 0) {
    return (
      "ℹ️  Hermes WebUI not patched (static/ not found after deep scan).\n" +
      "   Set once and re-init:\n" +
      "   HERMES_WEBUI_ROOT=/path/to/hermes-webui npx latent-protocol init --yes"
    );
  }

  return (
    `⚠️  Hermes WebUI found but patch failed.\n` +
    errors.map((e) => `   • ${e}`).join("\n") +
    "\n   Check file permissions on index.html, then retry init."
  );
}

export function installHermes(): string {
  const detected = detectAgents();
  if (!detected.hermes && !detected.hermesWebui) {
    return "ℹ️  Hermes / Hermes WebUI not detected — skipped.";
  }

  const lines: string[] = [];
  if (detected.hermes) {
    lines.push(installPythonPackage());
    mkdirSync(detected.paths.hermesPlugins, { recursive: true });
    lines.push(writeFlatPlugin(detected.paths.hermesPlugins));
    lines.push(enableHermesPlugin());
    lines.push("   Restart Hermes / `hermes gateway restart` to load the plugin.");
  } else {
    lines.push(
      "ℹ️  Hermes home not found — installing WebUI DOM patch only (CLI plugin skipped).",
    );
    // Still need the Python package for latent-hermes-patch
    lines.push(installPythonPackage());
  }
  lines.push(patchHermesWebui());
  return lines.join("\n");
}

function removeFromConfigEnabled(): string {
  const { paths } = detectAgents();
  const configPath = join(paths.hermesHome, "config.yaml");
  if (!existsSync(configPath)) return "ℹ️  No Hermes config.yaml to edit.";
  try {
    const raw = readFileSync(configPath, "utf8");
    const next = raw
      .split("\n")
      .filter((line) => !line.match(new RegExp(`^\\s*-\\s*["']?${PLUGIN_NAME}["']?\\s*$`)))
      .join("\n");
    if (next === raw) return "ℹ️  agent-ads not present in config.yaml";
    writeFileSync(configPath, next);
    return `✅ Removed agent-ads from ${configPath}`;
  } catch (err) {
    return `⚠️  Could not edit config.yaml: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function unpatchHermesWebui(): string {
  const staticDir =
    detectAgents().hermesWebuiStatic ||
    findHermesWebuiStatic() ||
    loadConfig().hermes_webui_static;
  if (!staticDir) {
    return "ℹ️  Hermes WebUI patch not removed (static/ not found).";
  }
  const res = unpatchWebuiIndex(staticDir);
  if (res.ok) return `✅ Hermes WebUI: ${res.message}`;
  return `⚠️  Hermes WebUI unpatch failed: ${res.error}`;
}

export function uninstallHermes(): string {
  const { paths, hermes } = detectAgents();
  if (!hermes) return "ℹ️  Hermes not detected; nothing to remove.";

  const dest = join(paths.hermesPlugins, PLUGIN_NAME);
  const lines: string[] = [];
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
    lines.push(`✅ Removed ${dest}`);
  } else {
    lines.push("ℹ️  No flat agent-ads plugin dir found.");
  }

  const disable = run("hermes", ["plugins", "disable", PLUGIN_NAME]);
  if (disable.ok) {
    lines.push("✅ hermes plugins disable agent-ads");
  } else {
    lines.push(removeFromConfigEnabled());
  }
  lines.push(unpatchHermesWebui());
  return lines.join("\n");
}

function webuiPatchStatus(): string {
  const staticDir = findHermesWebuiStatic();
  if (!staticDir) {
    return "Hermes WebUI: not found (set HERMES_WEBUI_ROOT to enable patch)";
  }
  const index = join(staticDir, "index.html");
  try {
    const html = readFileSync(index, "utf8");
    if (html.includes("latent-protocol-webui-patch")) {
      return `Hermes WebUI: patched (${index})`;
    }
    return `Hermes WebUI: found, not patched (${staticDir})`;
  } catch {
    return `Hermes WebUI: found, unreadable (${staticDir})`;
  }
}

export function hermesStatus(): string {
  const { hermes, paths } = detectAgents();
  if (!hermes) return "Hermes: not detected";
  const dest = join(paths.hermesPlugins, PLUGIN_NAME);
  const flat = existsSync(join(dest, "plugin.yaml"));
  const configPath = join(paths.hermesHome, "config.yaml");
  let enabled = false;
  try {
    const raw = readFileSync(configPath, "utf8");
    enabled = raw.includes(PLUGIN_NAME);
  } catch {
    enabled = false;
  }
  let cli: string;
  if (flat && enabled) cli = `Hermes: patched (plugin dir + enabled as ${PLUGIN_NAME})`;
  else if (flat) cli = "Hermes: plugin dir present, not confirmed enabled";
  else if (enabled) cli = "Hermes: enabled in config (entry-point / external install)";
  else cli = "Hermes: detected, not patched";
  return `${cli}\n  ${webuiPatchStatus()}`;
}
