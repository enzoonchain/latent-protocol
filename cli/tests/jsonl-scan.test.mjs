/**
 * Run after `npm --prefix cli run build`:
 *   node cli/tests/jsonl-scan.test.mjs
 */
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { scanJsonlProjects } from "../dist/scanners/jsonl.js";

const root = mkdtempSync(join(tmpdir(), "latent-jsonl-"));
try {
  const projects = join(root, "projects", "proj-a");
  mkdirSync(projects, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    join(projects, "sess-1.jsonl"),
    [
      JSON.stringify({ type: "user", timestamp: now, message: { content: "hi" } }),
      JSON.stringify({
        type: "assistant",
        timestamp: now,
        message: { content: [{ type: "tool_use", id: "t1" }] },
      }),
    ].join("\n") + "\n",
  );

  const counts = scanJsonlProjects(join(root, "projects"), 30);
  assert.equal(counts.sessions, 1);
  assert.equal(counts.userTurns, 1);
  assert.equal(counts.thinkingStates, 1);

  console.log("ok - jsonl scan");
} finally {
  rmSync(root, { recursive: true, force: true });
}
