#!/usr/bin/env node
/**
 * PreToolUse guard: keep docs/codebase-map.md honest (ShiftMgmt_V3.4).
 *
 * The map only pays for itself if it is current. A map that points at a moved or
 * deleted file is worse than no map, because it sends the next session to the
 * wrong place with confidence. So this gate runs on `git commit` and blocks two
 * failure modes:
 *
 *   1. The map cites a path that no longer exists (scripts/validate-codebase-map.mjs).
 *   2. The commit adds / deletes / renames a file in a layer the map routes to,
 *      but does not touch the map itself.
 *
 * Escape hatch: put MAP_OK=1 in the same command line when the structural change
 * genuinely needs no map edit (e.g. a file split that keeps the same routing
 * entry). Do not add it reflexively — see CLAUDE.md 절대 규칙.
 *
 * Hook protocol: PreToolUse JSON on stdin. exit 0 = allow, exit 2 = block
 * (stderr is fed back to Claude as the reason).
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

let data = {};
try {
  data = JSON.parse(readStdin() || "{}");
} catch {
  process.exit(0); // never block on parse failure
}

const tool = data.tool_name || "";
const cmd = String((data.tool_input && data.tool_input.command) || "");

if (!/^(Bash|PowerShell)$/.test(tool) || !cmd.trim()) process.exit(0);

// Wiring self-test: harmless, proves the hook is live without touching git.
if (/MAP_GUARD_SELFTEST/.test(cmd)) {
  process.stderr.write("✅ guard-codebase-map 활성화 확인됨 (self-test). 실제 작업에는 영향 없음.\n");
  process.exit(2);
}

if (!/\bgit\s+commit\b/.test(cmd)) process.exit(0);
if (/MAP_OK\s*=\s*['"]?1\b/.test(cmd)) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const MAP_FILE = "docs/codebase-map.md";

if (!fs.existsSync(path.join(projectDir, MAP_FILE))) process.exit(0);

const git = (args) =>
  execFileSync("git", args, { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// ── 1. Does the map still point at real files? ──────────────────────────────
try {
  execFileSync(process.execPath, ["scripts/validate-codebase-map.mjs"], {
    cwd: projectDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
} catch (error) {
  const detail = String((error && (error.stdout || "") + (error.stderr || "")) || "").trim();

  process.stderr.write(
    [
      "⛔ 코드 길잡이(docs/codebase-map.md)가 없는 파일을 가리키고 있습니다.",
      "",
      detail,
      "",
      "지도를 먼저 고친 뒤 커밋하세요. 확인: npm run validate:map",
    ].join("\n") + "\n"
  );
  process.exit(2);
}

// ── 2. Structural change without a map edit? ────────────────────────────────
// Layers the map routes to. A file appearing/disappearing here changes the map's answers.
const MAP_ROUTED = [
  /^src\/main\/services\/[^/]+\.ts$/,
  /^src\/main\/ipc\/[^/]+\.ts$/,
  /^src\/shared\/domain\/[^/]+\.ts$/,
  /^src\/shared\/lib\/[^/]+\.ts$/,
  /^src\/renderer\/route-config\.ts$/,
  /^src\/renderer\/screens\/[^/]+\.tsx$/,
  /^src\/renderer\/components\/[^/]+\.tsx$/,
  /^scripts\/[^/]+\.(mjs|cjs)$/,
  /^artifacts\/scripts\/[^/]+\.cjs$/,
  /^docs\/[^/]+\.md$/
];

// Tests and per-version release notes are not routed individually.
const isExempt = (file) => /\.test\./.test(file) || /^docs\/release-\d+\.\d+\.\d+\.md$/.test(file);

const isRouted = (file) => MAP_ROUTED.some((re) => re.test(file)) && !isExempt(file);

let statusLines = [];
try {
  statusLines = git(["status", "--porcelain=v1"]).split("\n").filter(Boolean);
} catch {
  process.exit(0); // not a git repo / git unavailable — never block
}

const mapTouched = statusLines.some((line) => line.slice(3).includes(MAP_FILE));
const structural = [];

for (const line of statusLines) {
  const code = line.slice(0, 2);
  const rest = line.slice(3).trim();

  // Added, deleted, renamed or untracked — not plain edits.
  if (!/[ADR?]/.test(code)) continue;
  if (/^ M$|^M $|^MM$/.test(code)) continue;

  // Renames arrive as "old -> new"; check both sides.
  const files = rest.split(" -> ").map((part) => part.replace(/^"|"$/g, "").trim());

  for (const file of files) {
    if (isRouted(file)) {
      structural.push(`${code.trim() || "??"}  ${file}`);
    }
  }
}

if (structural.length === 0 || mapTouched) process.exit(0);

process.stderr.write(
  [
    "⛔ 코드 길잡이(docs/codebase-map.md) 갱신이 빠졌습니다.",
    "",
    "이번 커밋은 지도가 안내하는 계층의 파일을 새로 만들거나 지우거나 옮깁니다:",
    ...structural.map((item) => "   " + item),
    "",
    "지도를 고치지 않으면 다음 세션이 없는 파일로 찾아가거나, 새 파일을 못 찾습니다.",
    "docs/codebase-map.md 의 해당 줄(2~7장)을 함께 고친 뒤 같이 커밋하세요.",
    "",
    "정말 지도를 고칠 필요가 없다면(예: 라우팅이 그대로인 파일 분리) 같은 명령에 MAP_OK=1 을 붙이세요:",
    "  bash       →  MAP_OK=1 git commit -m ...",
    "  PowerShell →  $env:MAP_OK='1'; git commit -m ...",
    "⚠️ 습관적으로 붙이지 마세요. 지도는 낡는 순간 해로워집니다.",
  ].join("\n") + "\n"
);
process.exit(2);
