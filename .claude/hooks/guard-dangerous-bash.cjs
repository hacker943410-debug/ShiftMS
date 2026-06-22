#!/usr/bin/env node
/**
 * PreToolUse guard for the Bash & PowerShell tools (ShiftMgmt_V3.4).
 *
 * Purpose: turn the "확인 없이 배포/파괴 금지" promise (previously only a memory
 * note) into a hard, code-enforced gate. Blocks irreversible / outward-facing
 * commands unless an explicit confirmation token (RELEASE_CONFIRM=1) is present
 * in the SAME command line. The token must only be added in the same turn the
 * user has explicitly approved the action — see CLAUDE.md and .claude/HARNESS.md.
 *
 * Hook protocol: PreToolUse JSON arrives on stdin. exit 0 = allow, exit 2 = block
 * (stderr is fed back to Claude as the block reason).
 */
const fs = require("fs");

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

// Wiring self-test: `echo GUARD_SELFTEST` (harmless) is blocked when the guard is
// active, so the hook can be verified without running anything dangerous.
if (/GUARD_SELFTEST/.test(cmd)) {
  process.stderr.write("✅ guard-dangerous-bash 활성화 확인됨 (self-test). 실제 작업에는 영향 없음.\n");
  process.exit(2);
}

// Explicit operator confirmation. Matches bash `RELEASE_CONFIRM=1 cmd` and
// PowerShell `$env:RELEASE_CONFIRM='1'; cmd`.
const CONFIRMED = /RELEASE_CONFIRM\s*=\s*['"]?1\b/.test(cmd);

const RULES = [
  { re: /\brelease:publish\b/, what: "release:publish — GitHub 정식 게시 + 전 사용자 자동업데이트 (되돌릴 수 없음)" },
  { re: /electron-builder[\s\S]*--publish\s+always/, what: "electron-builder --publish always — 정식 배포" },
  { re: /git\s+push[\s\S]*(--force-with-lease|--force\b|\s-f\b)/, what: "git push --force — 원격 히스토리 덮어쓰기" },
  { re: /git\s+push[\s\S]*\b(origin\s+)?(main|master)\b/, what: "git push to main/master — 보호 브랜치 직접 푸시" },
];

const hit = RULES.find((r) => r.re.test(cmd));
if (!hit || CONFIRMED) process.exit(0);

process.stderr.write(
  [
    "⛔ 코드 게이트(guard-dangerous-bash)가 위험 명령을 차단했습니다.",
    "   대상: " + hit.what,
    "",
    "이 작업은 사용자가 '이번 턴에' 명시적으로 승인했을 때만 진행할 수 있습니다.",
    "승인되었다면 같은 명령 앞에 RELEASE_CONFIRM=1 토큰을 붙여 다시 실행하세요:",
    "  bash       →  RELEASE_CONFIRM=1 npm run release:publish",
    "  PowerShell →  $env:RELEASE_CONFIRM='1'; npm run release:publish",
    "",
    "⚠️ 사용자 컨펌 없이 토큰을 임의로 붙이지 마세요. (no-autopublish-until-requested)",
  ].join("\n") + "\n"
);
process.exit(2);
