# Handoff Context

## 목적
- 다음 세션에서 별도 재탐색 없이 현재 감사/리팩토링 상태를 바로 이어받을 수 있게 한다.
- 무엇이 끝났고, 무엇이 남았고, 어디서부터 손대면 되는지 빠르게 보여준다.

## 현재 기준
- 날짜: `2026-04-18`
- 브랜치: `release/0.4.0`
- 감사 상태: `phase-5 / wave-4-batch-38`
- 전체 진행률: `약 99%`
- 최근 검증:
  - `npm run typecheck` 통과
  - `npm run test` 통과
  - `npm run build` 통과
  - `npm run smoke:electron:operations-user` 통과
  - `npm run package:dir` 통과
  - `npm run smoke:electron:packaged` 통과
  - `npm run smoke:electron:installer` 통과
  - `npm audit --audit-level=high` 통과
  - 현재 기준 테스트: `107 files / 428 tests`

## 이번 턴까지 완료된 핵심 작업

### 1. Main/Electron 구조 정리
- `src/main/main.ts`의 inline IPC 등록을 제거하고 registrar 구조로 분리했다.
- 현재 registrar:
  - `src/main/ipc/register-core-handlers.ts`
  - `src/main/ipc/register-workforce-handlers.ts`
  - `src/main/ipc/register-operations-handlers.ts`
  - `src/main/ipc/register-performance-handlers.ts`
  - `src/main/ipc/register-allowance-handlers.ts`
- 권한 기준선:
  - `src/main/services/ipc-auth-guard-service.ts`
  - `withSession`, `withAdmin`

### 2. Backup/Migration 하드닝
- 경로 정책:
  - `src/main/services/database-file-policy-service.ts`
- PowerShell 진단 분리:
  - `src/main/services/database-powershell-diagnostic-service.ts`
- DB replace/rollback 분리:
  - `src/main/services/database-replacement-service.ts`
- 핵심 서비스:
  - `src/main/services/database-backup-service.ts`
  - `src/main/services/database-migration-service.ts`

### 3. IPC 응답/예외 패턴 공통화
- 공통 helper:
  - `src/main/ipc/ipc-handler-helpers.ts`
- 적용된 패턴:
  - `runIpcAction`
  - `runIpcResultAction`
  - `runIpcActionWithCleanup`
  - `runIpcSaveDialogAction`
  - `runIpcSaveDialogResultAction`
  - `runIpcOpenPathAction`

### 4. 인증/운영 사용자 하드닝
- `src/main/services/auth-service.ts`는 더 이상 하드코딩 계정을 직접 참조하지 않고 `app_users` 기반으로 로그인한다.
- `src/main/services/auth-password-service.ts`를 추가해 랜덤 salt 기반 `scrypt` 해시와 비밀번호 정책을 분리했다.
- `src/main/services/auth-bootstrap-service.ts`와 `src/main/services/auth-seed-users.ts`를 추가해 seeded 기본 계정 초기 비밀번호를 설치별 bootstrap credential 또는 환경변수 override로 대체했다.
- `src/main/services/sqlite-storage-service.ts`에 `app_users.password_hash` 마이그레이션을 추가했다.
- `app_users.sign_in_failure_count`, `app_users.sign_in_locked_until`로 `5회 실패 시 15분 잠금`을 저장한다.
- `app_users.must_change_password`와 `auth:change-password`를 추가해 초기 비밀번호 로그인 후 운영 IPC를 비밀번호 변경 전까지 차단한다.
- `src/main/services/operations-storage-service.ts`는 신규 사용자 생성 시 초기 비밀번호를 요구하고, 수정 시 비워두면 기존 해시를 유지한다.
- `src/renderer/screens/operations-management/OperationsUserSection.tsx`에서 초기/재설정 비밀번호 입력과 확인 검증을 추가했다.
- `src/main/ipc/register-core-handlers.ts`는 로그인 실패를 `sign-in-failed` 감사 로그로 남긴다.
- `src/renderer/components/LoginScreen.tsx`는 설치별 초기 비밀번호를 확인할 `bootstrap-credentials.json` 경로를 표시한다.
- `src/renderer/components/PasswordChangeScreen.tsx`를 추가해 첫 로그인 비밀번호 변경 UI를 분리했다.
- `src/main/services/auth-bootstrap-service.ts`는 bootstrap file에 retired user state를 저장하고, 첫 비밀번호 변경이 끝난 seeded 계정은 다음 앱 시작 시 다시 발급되지 않도록 정리한다.
- `src/main/services/auth-service.ts`는 세션 만료를 8시간으로 강제하고, `src/main/main.ts`의 인증된 main-process access는 `getSessionWithRenewal()`로 sliding renewal을 적용한다.
- `src/main/services/ipc-auth-guard-service.ts`는 만료된 세션과 `passwordChangeRequired` 상태를 운영 IPC 앞단에서 차단한다.
- `src/main/main.ts`, `src/main/services/allowance-document-pdf-service.ts`, `src/main/services/dashboard-chart-export-service.ts`는 `sandbox: true`로 고정했다.
- 관련 검증:
  - `src/main/services/auth-bootstrap-service.test.ts`
  - `src/main/services/auth-service.test.ts`
  - `src/main/services/operations-storage-service.test.ts`
  - `src/main/services/sqlite-storage-service.test.ts`
  - `src/renderer/components/LoginScreen.test.tsx`
  - `src/renderer/components/PasswordChangeScreen.test.tsx`
  - `artifacts/scripts/electron-operations-user-smoke.cjs`

### 5. Renderer 대형 화면 분해

#### SiteManagementScreen
- 현재 파일:
  - `src/renderer/screens/SiteManagementScreen.tsx`
- 현재 길이:
  - `1392` lines
- 주요 분리 파일:
  - `src/renderer/screens/site-management/SiteListView.tsx`
  - `src/renderer/screens/site-management/SiteDetailModal.tsx`
  - `src/renderer/screens/site-management/SitePatternImportModal.tsx`
  - `src/renderer/screens/site-management/SitePatternStepView.tsx`
  - `src/renderer/screens/site-management/SitePatternSetupPanel.tsx`
  - `src/renderer/screens/site-management/SitePatternAdvancedEditorPanel.tsx`
  - `src/renderer/screens/site-management/SitePatternSimulationPanel.tsx`
  - `src/renderer/screens/site-management/SiteAssignmentStepView.tsx`
  - `src/renderer/screens/site-management/SiteTimeRangePicker.tsx`
  - `src/renderer/screens/site-management/site-management-selectors.ts`
  - `src/renderer/screens/site-management/site-pattern-simulation.ts`
  - `src/renderer/screens/site-management/site-management-actions.ts`
  - `src/renderer/screens/site-management/site-management-step-one-actions.ts`
  - `src/renderer/screens/site-management/site-management-step-two-actions.ts`
  - `src/renderer/screens/site-management/site-management-interaction-actions.ts`
  - `src/renderer/screens/site-management/useSiteManagementInteractionState.ts`
  - `src/renderer/screens/site-management/useSiteManagementStepState.ts`

#### AllowanceManagementScreen
- 현재 파일:
  - `src/renderer/screens/AllowanceManagementScreen.tsx`
- 현재 구조:
  - panel/component, selector, state hook, modal action, review action 분리 완료
- 주요 파일:
  - `src/renderer/screens/allowance-management/AllowanceHeroPanel.tsx`
  - `src/renderer/screens/allowance-management/AllowanceOverviewChartsPanel.tsx`
  - `src/renderer/screens/allowance-management/AllowanceOverviewResultsPanel.tsx`
  - `src/renderer/screens/allowance-management/AllowanceHistoryPanel.tsx`
  - `src/renderer/screens/allowance-management/AllowanceEvidencePanel.tsx`
  - `src/renderer/screens/allowance-management/AllowanceProposalPreviewModal.tsx`
  - `src/renderer/screens/allowance-management/AllowanceEarlyPayoutModal.tsx`
  - `src/renderer/screens/allowance-management/allowance-management-selectors.ts`
  - `src/renderer/screens/allowance-management/useAllowanceManagementViewState.ts`
  - `src/renderer/screens/allowance-management/useAllowanceManagementModalState.ts`
  - `src/renderer/screens/allowance-management/allowance-management-modal-actions.ts`
  - `src/renderer/screens/allowance-management/allowance-management-review-actions.ts`

#### DashboardScreen
- 현재 파일:
  - `src/renderer/screens/DashboardScreen.tsx`
- 현재 길이:
  - 이전 hotspot에서 상당 부분 축소 완료
- 주요 파일:
  - `src/renderer/screens/dashboard/DashboardControlPanel.tsx`
  - `src/renderer/screens/dashboard/DashboardRankingTable.tsx`
  - `src/renderer/screens/dashboard/DashboardSummaryPanels.tsx`
  - `src/renderer/screens/dashboard/DashboardEmptyState.tsx`
  - `src/renderer/screens/dashboard/useDashboardFilterState.ts`
  - `src/renderer/screens/dashboard/dashboard-export-actions.ts`
  - `src/renderer/screens/dashboard/dashboard-records.ts`
  - `src/renderer/screens/dashboard/dashboard-selectors.ts`
  - `src/renderer/screens/dashboard/dashboard-export-selectors.ts`

## 지금 남아 있는 작업

### 우선순위 1. 보안 백로그
- 큰 미해결 항목:
  - `src/main/services/auth-service.ts`의 세션은 shared `auth-session-policy.ts` 기준으로 `8시간 만료 + renewal + runtime-only`로 고정됐고, 재시작 시 다시 로그인 정책이 `AppHealth`, `LoginScreen`, `PasswordChangeScreen`, `DashboardShell`에 노출된다.
  - role 정책은 `src/shared/domain/authorization.ts` 기준 `admin / planner / reviewer / operator` 4단계로 정리됐다. `employees/sites/shift-patterns/monthly-schedules` 쓰기와 배포는 `planner`, `performance/allowance` 승인 계열은 `reviewer`, `operations/access-history`는 `admin`으로 분리됐고, `DashboardShell.test.tsx`와 `electron-operations-user-smoke.cjs`에서 planner/reviewer route fallback과 action-level 노출까지 회귀를 잡고 있다.

### 우선순위 2. v0.4.0 남은 마감 작업
- 관련 문서:
  - `artifacts/releases/v0.4.0/TODO.md`
- 남은 주제:
  - 저장된 profile/validation JSON migration 처리
  - 수동 QA 절차와 화면 확인 항목 마감
  - `Patch Set D` 문서/QA 마감

### 우선순위 3. 선택적 renderer 후속 정리
- 대상:
  - `src/renderer/screens/SiteManagementScreen.tsx`
- 남은 주제:
  - data loading / draft persistence / step2 wiring을 추가 hook으로 더 낮출지 검토
  - `ShiftPatternManagementScreen.tsx`, `ScheduleManagementScreen.tsx`, `PerformanceManagementScreen.tsx` 순으로 hotspot 재평가

## 다음 세션 시작 순서
1. `artifacts/reviews/project-audit-2026-04/README.md`
2. `artifacts/reviews/project-audit-2026-04/REFACTORING_PLAN.md`
3. 이 문서
4. `docs/maintainer-guide.md`
5. `artifacts/releases/v0.4.0/TODO.md`

## 다음 세션 첫 작업 추천
- `docs/operations-manual-qa-checklist.md`를 기준으로 실제 운영 환경 수동 QA를 실행하고 결과를 채운다.
- 다음 배치는 문서 정리보다 `artifacts/releases/v0.4.0/TODO.md`의 수동 QA 결과 반영과 `Patch Set D` 마감에 집중하는 것이다.

## 바로 쓸 수 있는 명령
- 현재 상태 검증:
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`
- 인증/운영 사용자 검증:
  - `npx vitest run src/main/services/auth-bootstrap-service.test.ts src/main/services/auth-service.test.ts src/renderer/components/LoginScreen.test.tsx`
  - `npm run smoke:electron:operations-user`
- SiteManagement 관련 집중 검증:
  - `npm run test -- site-management-step-one-actions site-management-step-two-actions site-management-interaction-actions useSiteManagementStepState useSiteManagementInteractionState useSiteManagementAssignmentDragState useSiteManagementRegistrationFlow site-pattern-simulation site-management-selectors`
- 패키징 전 검증:
  - `npm run package:win`

## 문서 위치 요약
- 감사 인덱스:
  - `artifacts/reviews/project-audit-2026-04/README.md`
- 실행 계획:
  - `artifacts/reviews/project-audit-2026-04/REFACTORING_PLAN.md`
- 유지보수 가이드:
  - `docs/maintainer-guide.md`
- 유지보수 초안 아카이브:
  - `artifacts/reviews/project-audit-2026-04/MAINTAINER_GUIDE_DRAFT.md`
- 보안 리뷰:
  - `artifacts/reviews/project-audit-2026-04/SECURITY_REVIEW.md`
- 결정 로그:
  - `artifacts/reviews/project-audit-2026-04/DECISION_LOG.md`

## 메모
- 현재 worktree에는 이번 감사/리팩토링 누적 변경이 함께 들어 있다.
- 이번 커밋은 그 누적 변경을 한 번에 정리하는 성격이다.
- SQLite experimental warning은 테스트에서 계속 출력되지만 현재 실패 원인은 아니다.

