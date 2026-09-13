# PROJECT_INIT.md

## Project Metadata

```yaml
project:
  name: "ShiftMgmt_V3.4"
  description: "교대근무 현황, 근무표 배포, 실적 승인, 수당 계산을 통합 관리하는 로컬 데스크톱 웹 앱"
  type: "web"
  language: "TypeScript"
  framework: "React + Electron + Vite"
  package_manager: "npm"
  node_version: "24"

repo:
  git_initialized: true
  current_branch: "git branch --show-current"
  commit_convention: "conventional-commits"

infrastructure:
  database: "SQLite (planned)"
  auth: "Local ID/PW"
  deployment: "Electron installer"
  ci_cd: "none"

codex:
  cli_version: "0.154.0"
  model: "gpt-5.6-sol"
  default_reasoning_effort: "xhigh"
  approval_policy: "on-request"
  sandbox_mode: "workspace-write"
  notes:
    - "Codex primary는 요구사항·설계·지시·검증·최종 판정을 담당"
    - "Luna/Terra subagent는 read-only 탐색·진단·리뷰·검증에 사용"
    - "세션 시작 시 전역 ~/.codex/AGENTS.md 에서 MCP 기본 사용 지침을 불러온다"

gemini:
  cli_version: "0.57.0"
  role: "implementation-only coder"
  context: "AGENTS.md + GEMINI.md"
  command: "/handoff"
  notes:
    - "사용자가 Codex HANDOFF를 Gemini에 중계"
    - "HANDOFF allowedPaths 밖 파일 쓰기는 hook으로 차단"
    - "commit, push, dependency, package, publish, shell 기반 파일 수정은 차단"

handoff:
  active_file: "HANDOFF.md"
  template: ".codex/templates/gemini-handoff.md"
  archive: "handoff-log/"
  authority: ".codex/HARNESS.md"
```

## Setup Goals

1. Keep Codex as the sole orchestrator and final verifier.
2. Route implementation through the user-relayed Gemini HANDOFF lane.
3. Use low-cost Codex subagents for bounded read-only work.
4. Prepare a runnable Electron + React + TypeScript shell.
5. Capture architecture, conventions, and stack decisions from the design spec.
6. Keep the working branch aligned with `git branch --show-current` instead of a hard-coded branch name.

## Current Scope

- Dashboard-first renderer shell
- Electron main and preload process baseline
- Shared formatting utilities and initial tests
- Project folders for future Excel parsing, file watching, and allowance calculation logic

## Living Documents

- Document index: `docs/README.md`
- Project handbook: `docs/project-handbook.md`
- Release document: `docs/release-0.3.1.md`
- Release archive: `artifacts/releases/README.md`
- Operations reference: `docs/operations-reference.md`
- Manual QA checklist: `docs/operations-manual-qa-checklist.md`
- Operator guide: `docs/operator-quick-start.md`

## Next Implementation Areas

1. SQLite schema and repository layer
2. Authentication flow for local operator/admin accounts
3. Excel import/export templates and file watcher services
4. Shift simulation and allowance calculation domain services
