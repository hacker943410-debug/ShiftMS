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
  current_branch: "master"
  commit_convention: "conventional-commits"

infrastructure:
  database: "SQLite (planned)"
  auth: "Local ID/PW"
  deployment: "Electron installer"
  ci_cd: "none"

codex:
  model: "gpt-5.4"
  spark_model: "gpt-5.3-codex-spark"
  default_reasoning_effort: "medium"
  approval_policy: "on-request"
  sandbox_mode: "workspace-write"
  web_search: "cached"
```

## Setup Goals

1. Create the Codex and Antigravity project scaffolding.
2. Prepare a runnable Electron + React + TypeScript shell.
3. Capture architecture, conventions, and stack decisions from the design spec.
4. Keep the current Git branch as `master` to match the existing repository state.

## Current Scope

- Dashboard-first renderer shell
- Electron main and preload process baseline
- Shared formatting utilities and initial tests
- Project folders for future Excel parsing, file watching, and allowance calculation logic

## Living Documents

- Development direction: `docs/development-direction.md`
- Work plan: `docs/work-plan.md`
- Project rules: `docs/project-rules.md`
- UI design brief: `docs/ui-design-brief.md`
- UI style guide: `docs/ui-style-guide.md`

## Next Implementation Areas

1. SQLite schema and repository layer
2. Authentication flow for local operator/admin accounts
3. Excel import/export templates and file watcher services
4. Shift simulation and allowance calculation domain services
