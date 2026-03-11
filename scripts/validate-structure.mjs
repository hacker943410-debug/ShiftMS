import { existsSync, lstatSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredPaths = [
  "AGENTS.md",
  "PROJECT_INIT.md",
  ".codex/config.toml",
  ".codex/agents/explorer.toml",
  ".codex/agents/builder.toml",
  ".codex/agents/reviewer.toml",
  ".codex/agents/debugger.toml",
  ".codex/agents/tester.toml",
  ".antigravity/rules.md",
  ".context/architecture.md",
  ".context/conventions.md",
  ".context/stack.md",
  ".agents/skills/project-setup/SKILL.md",
  ".agents/skills/code-review/SKILL.md",
  ".agents/skills/test-writer/SKILL.md",
  ".agents/skills/commit-formatter/SKILL.md",
  ".agents/skills/deploy-checker/SKILL.md",
  "package.json",
  "tsconfig.json",
  "tsconfig.electron.json",
  "vite.config.ts",
  "src/main/main.ts",
  "src/preload/index.ts",
  "src/renderer/App.tsx",
  "src/shared/lib/formatCurrency.ts"
];

const missing = requiredPaths.filter((target) => !existsSync(path.join(root, target)));

const linkPath = path.join(root, ".agent", "skills");
const linkExists = existsSync(linkPath);
let linkState = "missing";

if (linkExists) {
  const stats = lstatSync(linkPath);
  linkState = stats.isSymbolicLink() ? "symbolic-link" : "present";
}

if (missing.length > 0) {
  console.error("Missing required paths:");
  for (const target of missing) {
    console.error(`- ${target}`);
  }

  process.exit(1);
}

console.log("All required setup files are present.");
console.log(`.agent/skills state: ${linkState}`);
