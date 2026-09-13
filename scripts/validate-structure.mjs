import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredPaths = [
  "AGENTS.md",
  "GEMINI.md",
  "PROJECT_INIT.md",
  ".codex/HARNESS.md",
  ".codex/templates/gemini-handoff.md",
  ".codex/config.toml",
  ".codex/agents/explorer.toml",
  ".codex/agents/builder.toml",
  ".codex/agents/reviewer.toml",
  ".codex/agents/debugger.toml",
  ".codex/agents/tester.toml",
  ".gemini/settings.json",
  ".gemini/commands/handoff.toml",
  ".gemini/hooks/guard-handoff-scope.cjs",
  ".gemini/hooks/guard-coder-shell.cjs",
  ".gemini/hooks/handoff-metadata.cjs",
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
  "scripts/validate-ai-harness.mjs",
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

const validationErrors = [];
const read = (target) => readFileSync(path.join(root, target), "utf8");
const requireText = (target, expected) => {
  if (!read(target).includes(expected)) {
    validationErrors.push(`${target} must include: ${expected}`);
  }
};

requireText(".codex/config.toml", 'model = "gpt-5.6-sol"');
requireText(".codex/config.toml", 'model_reasoning_effort = "xhigh"');
requireText(".codex/agents/explorer.toml", 'model = "gpt-5.6-luna"');
requireText(".codex/agents/tester.toml", 'model = "gpt-5.6-luna"');
requireText(".codex/agents/builder.toml", 'model = "gpt-5.6-terra"');
requireText(".codex/agents/debugger.toml", 'model = "gpt-5.6-terra"');
requireText(".codex/agents/reviewer.toml", 'model = "gpt-5.6-terra"');
requireText(".codex/agents/tester.toml", 'sandbox_mode = "read-only"');
requireText(".codex/templates/gemini-handoff.md", "GEMINI_HANDOFF_META");
requireText(".codex/templates/gemini-handoff.md", '"allowedDirtyPaths"');
requireText(".codex/templates/gemini-handoff.md", '"allowedCommands"');
requireText("CLAUDE.md", "폐기된 하네스 안내");

try {
  const geminiSettings = JSON.parse(read(".gemini/settings.json"));
  const contextFiles = geminiSettings.context?.fileName ?? [];
  const hookNames = (geminiSettings.hooks?.BeforeTool ?? []).flatMap((group) =>
    (group.hooks ?? []).map((hook) => hook.name)
  );

  for (const contextFile of ["AGENTS.md", "GEMINI.md"]) {
    if (!contextFiles.includes(contextFile)) {
      validationErrors.push(`.gemini/settings.json must load ${contextFile}`);
    }
  }

  for (const hookName of ["handoff-scope", "coder-shell"]) {
    if (!hookNames.includes(hookName)) {
      validationErrors.push(`.gemini/settings.json must enable ${hookName}`);
    }
  }

  const hookGroups = geminiSettings.hooks?.BeforeTool ?? [];
  const scopeGroup = hookGroups.find((group) => group.matcher === "write_file|replace");
  const shellGroup = hookGroups.find((group) => group.matcher === "run_shell_command");
  if (!scopeGroup) validationErrors.push("Gemini write_file|replace scope hook is missing");
  if (!shellGroup) validationErrors.push("Gemini run_shell_command hook is missing");
} catch (error) {
  validationErrors.push(`.gemini/settings.json is invalid JSON: ${error.message}`);
}

if (validationErrors.length > 0) {
  console.error("Invalid AI harness configuration:");
  for (const error of validationErrors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("All required setup files are present.");
console.log(`.agent/skills state: ${linkState}`);
console.log("AI harness configuration is valid.");
