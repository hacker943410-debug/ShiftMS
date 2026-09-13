import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { evaluateShellRequest } = require("../.gemini/hooks/guard-coder-shell.cjs");
const { evaluateWriteRequest } = require("../.gemini/hooks/guard-handoff-scope.cjs");

const fixture = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-ai-harness-"));
const metadata = {
  schemaVersion: 1,
  status: "READY",
  round: "R99",
  sender: "Codex",
  recipient: "Gemini",
  branch: "test-branch",
  baseCommit: "abcdef1",
  allowedPaths: ["HANDOFF.md", "src/allowed.ts"],
  allowedDirtyPaths: ["existing/"],
  allowedCommands: ["git status --short", "npm run typecheck"]
};
const renderHandoff = (value, body = "# fixture") =>
  `${body}\n<!-- GEMINI_HANDOFF_META\n${JSON.stringify(value)}\nGEMINI_HANDOFF_META -->\n`;
const repoState = {
  branch: "test-branch",
  head: "abcdef1234567890",
  dirtyPaths: ["HANDOFF.md", "existing/user-change.txt"]
};

try {
  writeFileSync(path.join(fixture, "HANDOFF.md"), renderHandoff(metadata), "utf8");

  assert.deepEqual(
    evaluateWriteRequest(
      { tool_name: "write_file", tool_input: { file_path: "src/allowed.ts", content: "ok" } },
      fixture,
      repoState
    ),
    {}
  );

  assert.equal(
    evaluateWriteRequest(
      { tool_name: "replace", tool_input: { file_path: "src/other.ts" } },
      fixture,
      repoState
    ).decision,
    "deny"
  );

  assert.equal(
    evaluateWriteRequest(
      { tool_name: "replace", tool_input: { file_path: "HANDOFF.md" } },
      fixture,
      repoState
    ).decision,
    "deny"
  );

  const expandedResponse = {
    ...metadata,
    status: "COMPLETE",
    sender: "Gemini",
    recipient: "Codex",
    allowedPaths: ["src/other.ts"],
    allowedDirtyPaths: [],
    allowedCommands: []
  };
  assert.equal(
    evaluateWriteRequest(
      {
        tool_name: "write_file",
        tool_input: { file_path: "HANDOFF.md", content: renderHandoff(expandedResponse) }
      },
      fixture,
      repoState
    ).decision,
    "deny"
  );

  const terminalResponse = {
    ...metadata,
    status: "COMPLETE",
    sender: "Gemini",
    recipient: "Codex",
    allowedPaths: [],
    allowedDirtyPaths: [],
    allowedCommands: []
  };
  assert.deepEqual(
    evaluateWriteRequest(
      {
        tool_name: "write_file",
        tool_input: { file_path: "HANDOFF.md", content: renderHandoff(terminalResponse) }
      },
      fixture,
      repoState
    ),
    {}
  );

  assert.deepEqual(
    evaluateShellRequest(
      { tool_name: "run_shell_command", tool_input: { command: "git status --short" } },
      fixture
    ),
    {}
  );
  assert.equal(
    evaluateShellRequest(
      { tool_name: "run_shell_command", tool_input: { command: "node -e \"require('fs').writeFileSync('x','y')\"" } },
      fixture
    ).decision,
    "deny"
  );
  assert.equal(
    evaluateShellRequest(
      { tool_name: "run_shell_command", tool_input: { command: "npm run test" } },
      fixture
    ).decision,
    "deny"
  );

  const wrongBranch = { ...repoState, branch: "other" };
  assert.equal(
    evaluateWriteRequest(
      { tool_name: "write_file", tool_input: { file_path: "src/allowed.ts", content: "no" } },
      fixture,
      wrongBranch
    ).decision,
    "deny"
  );

  console.log("AI_HARNESS_OK — scope, terminal response, shell allowlist, and repo-state gates passed.");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
