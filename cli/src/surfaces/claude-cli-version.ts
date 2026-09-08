/**
 * Detect the terminal `claude` CLI version.
 *
 * The `spinnerVerbs` settings.json key — which lets us put the ad text in
 * Claude Code's thinking-shimmer verb slot — is only read by Claude Code
 * 2.1.143 and newer. Older builds ignore the key: harmless, but it leaves a
 * dead entry in the user's settings.json, so we gate on the version.
 *
 * Policy is fail-OPEN: if we cannot determine a version (claude not on PATH,
 * spawn error, unparseable output) we assume support — writing the key on a
 * build that ignores it costs nothing, and we would rather show the ad on a
 * supported build whose detection flaked than silently suppress it. Only a
 * positively-detected pre-2.1.143 version turns the surface off.
 */
import { execFile } from "node:child_process";

export type SemVer = [number, number, number];

/** spinnerVerbs support floor: Claude Code 2.1.143. */
export const SPINNER_VERBS_FLOOR: SemVer = [2, 1, 143];

/** Parse a `claude --version` line ("2.1.158 (Claude Code)") into a tuple. */
export function parseClaudeCliVersion(stdout: string): SemVer | null {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(stdout);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True iff `a` >= `b` under semver ordering. */
export function gte(a: SemVer, b: SemVer): boolean {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return true;
}

/** A null version (unparseable) is treated as unsupported *here*; the
 *  fail-open policy for a failed spawn lives in `detectSpinnerVerbsSupport`. */
export function supportsSpinnerVerbs(v: SemVer | null): boolean {
  return v ? gte(v, SPINNER_VERBS_FLOOR) : false;
}

/** Spawn `claude --version`; resolve its parsed semver or null. Never throws. */
export function detectClaudeCliVersion(): Promise<SemVer | null> {
  return new Promise((res) => {
    try {
      execFile(
        "claude",
        ["--version"],
        { timeout: 3000, windowsHide: true },
        (err, stdout) => res(err ? null : parseClaudeCliVersion(String(stdout ?? ""))),
      );
    } catch {
      res(null);
    }
  });
}

/** Resolve whether to write the spinnerVerbs key for the local CLI. Fail-open:
 *  only a positively-detected pre-2.1.143 version returns false. */
export async function detectSpinnerVerbsSupport(): Promise<boolean> {
  const v = await detectClaudeCliVersion();
  return v === null ? true : supportsSpinnerVerbs(v);
}
