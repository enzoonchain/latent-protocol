/**
 * Bundle the extension to a single dist/extension.js (CommonJS — VS Code loads
 * extensions as CJS). `vscode` is provided by the host and must stay external;
 * everything else is inlined so the packaged .vsix carries no node_modules.
 */
import { build } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  sourcemap: false,
  logLevel: "info",
};

if (watch) {
  const ctx = await (await import("esbuild")).context(options);
  await ctx.watch();
  console.log("watching…");
} else {
  await build(options);
  console.log("bundled → dist/extension.js");
}
