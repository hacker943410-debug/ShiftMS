import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const packageJsonPath = path.resolve(projectRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const args = new Set(process.argv.slice(2));

const dryRun = args.has("--dry-run");
const skipPackage = args.has("--skip-package");
const skipInstaller = args.has("--skip-installer");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const logDir = path.resolve(projectRoot, "artifacts", "releases", `v${version}`, "logs");
const logPath = path.join(logDir, `release-signoff-${timestamp}.md`);
const gitShaResult = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd: projectRoot,
  encoding: "utf8",
  shell: false,
});
const commitSha =
  gitShaResult.status === 0 ? gitShaResult.stdout.trim() : process.env.GIT_COMMIT_SHA ?? "unknown";

const commandToString = (command, commandArgs) => [command, ...commandArgs].join(" ");

const steps = [
  {
    id: "typecheck",
    title: "Typecheck",
    command: npmCommand,
    args: ["run", "typecheck"],
  },
  {
    id: "test",
    title: "Unit Tests",
    command: npmCommand,
    args: ["run", "test"],
  },
  {
    id: "package",
    title: "Windows Package",
    command: npmCommand,
    args: ["run", "package:win"],
    skip: skipPackage,
    skipReason: "--skip-package",
  },
  {
    id: "packaged-smoke",
    title: "Packaged Smoke",
    command: npmCommand,
    args: ["run", "smoke:electron:packaged"],
  },
  {
    id: "installer-smoke",
    title: "Installer Smoke",
    command: npmCommand,
    args: ["run", "smoke:electron:installer"],
    skip: skipInstaller,
    skipReason: "--skip-installer",
  },
  {
    id: "audit",
    title: "Audit",
    command: npmCommand,
    args: ["audit", "--audit-level=high"],
  },
];

const runStep = (step) => {
  if (step.skip) {
    return {
      ...step,
      status: "skipped",
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      commandLine: commandToString(step.command, step.args),
      skipReason: step.skipReason,
    };
  }

  if (dryRun) {
    return {
      ...step,
      status: "dry-run",
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      commandLine: commandToString(step.command, step.args),
      skipReason: null,
    };
  }

  const start = Date.now();
  const result = spawnSync(step.command, step.args, {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false,
  });
  const durationMs = Date.now() - start;

  return {
    ...step,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    durationMs,
    commandLine: commandToString(step.command, step.args),
    skipReason: null,
  };
};

const formatDuration = (durationMs) => `${(durationMs / 1000).toFixed(1)}s`;

const results = steps.map(runStep);
const hasFailures = results.some((result) => result.status === "failed");

mkdirSync(logDir, { recursive: true });

const summaryRows = results.map((result) => {
  const statusLabel =
    result.status === "passed"
      ? "PASS"
      : result.status === "failed"
        ? "FAIL"
        : result.status === "skipped"
          ? `SKIP (${result.skipReason})`
          : "DRY RUN";

  return `| ${result.title} | ${statusLabel} | ${result.commandLine} | ${
    result.status === "passed" || result.status === "failed"
      ? formatDuration(result.durationMs)
      : "-"
  } |`;
});

const detailSections = results
  .map((result) => {
    const parts = [
      `## ${result.title}`,
      `- status: ${result.status}`,
      `- command: \`${result.commandLine}\``,
    ];

    if (result.skipReason) {
      parts.push(`- reason: ${result.skipReason}`);
    }

    if (result.exitCode !== null) {
      parts.push(`- exitCode: ${result.exitCode}`);
      parts.push(`- duration: ${formatDuration(result.durationMs)}`);
    }

    if (result.stdout.trim()) {
      parts.push("### stdout", "```text", result.stdout.trimEnd(), "```");
    }

    if (result.stderr.trim()) {
      parts.push("### stderr", "```text", result.stderr.trimEnd(), "```");
    }

    return parts.join("\n");
  })
  .join("\n\n");

const logText = [
  `# Release Sign-off Log`,
  ``,
  `- version: \`${version}\``,
  `- commit: \`${commitSha}\``,
  `- generatedAt: \`${new Date().toISOString()}\``,
  `- hostPlatform: \`${process.platform}\``,
  `- dryRun: \`${dryRun}\``,
  ``,
  `## Summary`,
  `| Step | Status | Command | Duration |`,
  `|---|---|---|---|`,
  ...summaryRows,
  ``,
  `## Next Action`,
  hasFailures
    ? `- At least one automated step failed. Review the failing section below and update \`artifacts/releases/v${version}/SIGN_OFF_TEMPLATE.md\` after rerun on the release PC.`
    : `- All automated steps passed. Proceed with manual QA and write the result into \`artifacts/releases/v${version}/SIGN_OFF_TEMPLATE.md\`.`,
  ``,
  detailSections,
  ``,
].join("\n");

writeFileSync(logPath, logText, "utf8");

for (const result of results) {
  const label =
    result.status === "passed"
      ? "PASS"
      : result.status === "failed"
        ? "FAIL"
        : result.status === "skipped"
          ? "SKIP"
          : "DRY";
  console.log(`${label} ${result.title}: ${result.commandLine}`);

  if (result.stdout.trim()) {
    console.log(result.stdout.trimEnd());
  }

  if (result.stderr.trim()) {
    console.error(result.stderr.trimEnd());
  }
}

console.log(`SIGNOFF_LOG ${logPath}`);

if (hasFailures) {
  process.exit(1);
}
