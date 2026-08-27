/**
 * Minimal `process.env` typing so the plugin typechecks without pulling in the
 * full `@types/node` package. The OpenClaw runtime (Node) provides the real
 * `process` global; we only read env vars for local-dev fallbacks.
 */
declare const process: { env: Record<string, string | undefined> };
