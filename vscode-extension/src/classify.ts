/**
 * Webview/host-side categorizer (mirror of the CLI classifier). Runs locally on
 * the workspace so only a category slug is sent to the ad server.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Category =
  | "frontend-ui"
  | "backend"
  | "databases"
  | "devops-infra"
  | "ai-ml"
  | "web3-crypto"
  | "mobile"
  | "data-eng"
  | "general";

const KEYWORDS: Record<Exclude<Category, "general">, string[]> = {
  "frontend-ui": ["react", "vue", "svelte", "angular", "next", "nuxt", "tailwind", "css", "frontend", "vite"],
  backend: ["express", "fastapi", "flask", "django", "rails", "spring", "rest", "graphql", "grpc", "middleware"],
  databases: ["postgres", "postgresql", "mysql", "sqlite", "mongodb", "redis", "prisma", "schema", "orm"],
  "devops-infra": ["docker", "kubernetes", "terraform", "ansible", "nginx", "aws", "gcp", "azure", "helm"],
  "ai-ml": ["llm", "openai", "anthropic", "pytorch", "tensorflow", "embedding", "vector", "inference"],
  "web3-crypto": ["solidity", "ethereum", "evm", "web3", "erc20", "erc721", "usdc", "x402", "defi", "blockchain"],
  mobile: ["swift", "swiftui", "kotlin", "android", "flutter", "dart", "expo", "xcode"],
  "data-eng": ["pandas", "spark", "airflow", "dbt", "kafka", "snowflake", "bigquery", "parquet"],
};

const MANIFESTS = ["package.json", "requirements.txt", "pyproject.toml", "Cargo.toml", "go.mod", "Gemfile"];

export function classifyWorkspace(root: string | undefined): Category {
  if (!root) return "general";
  let text = "";
  for (const name of MANIFESTS) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    try {
      text += "\n" + readFileSync(p, "utf8");
    } catch {
      /* ignore */
    }
  }
  const lower = text.toLowerCase();
  let best: Category = "general";
  let bestScore = 0;
  for (const [cat, words] of Object.entries(KEYWORDS) as [Exclude<Category, "general">, string[]][]) {
    let hits = 0;
    for (const w of words) {
      const re = new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`, "g");
      const m = lower.match(re);
      if (m) hits += m.length;
    }
    if (hits > bestScore) {
      best = cat;
      bestScore = hits;
    }
  }
  return best;
}
