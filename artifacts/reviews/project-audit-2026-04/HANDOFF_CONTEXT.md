# Handoff Context

## 목적
- 다음 세션에서 별도 재탐색 없이 현재 감사/리팩토링 상태를 바로 이어받을 수 있게 한다.
- 무엇이 끝났고, 무엇이 남았고, 어디서부터 손대면 되는지 빠르게 보여준다.

## 현재 기준
- 날짜: `2026-04-17`
- 브랜치: `feature/v0.3.2-patch-finalize`
- 감사 상태: `phase-5 / wave-4-batch-36`
- 전체 진행률: `약 87%`
- 최근 검증:
  - `npm run typecheck` 통과
  - `npm run test` 통과
  - 현재 기준 테스트: `100 files / 382 tests`

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

### 4. Renderer 대형 화면 분해

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

### 우선순위 1. SiteManagementScreen 마감
- 남은 주제:
  - drag auto-scroll helper 분리
  - back/reset navigation helper 분리
  - step 전환과 list 복귀 시점의 남은 local orchestration 정리
- 목표:
  - `SiteManagementScreen.tsx`를 renderer shell 수준으로 더 낮추기

### 우선순위 2. Wave 5 문서 정식화
- 대상:
  - `artifacts/reviews/project-audit-2026-04/MAINTAINER_GUIDE_DRAFT.md`
- 해야 할 일:
  - 운영 가능한 maintainer 문서로 승격
  - IPC 추가 절차, 패키징/설치, Access 복원, 장애 진단, 권한 모델을 정식 문서화

### 우선순위 3. 보안 백로그
- 큰 미해결 항목:
  - `src/main/services/auth-service.ts`의 하드코딩 계정 + in-memory session
  - Electron `sandbox: false` 재검토
  - role 세분화와 dependency vulnerability follow-up

## 다음 세션 시작 순서
1. `artifacts/reviews/project-audit-2026-04/README.md`
2. `artifacts/reviews/project-audit-2026-04/REFACTORING_PLAN.md`
3. 이 문서
4. `src/renderer/screens/SiteManagementScreen.tsx`
5. `src/renderer/screens/site-management/` 하위 helper/action/hook 파일

## 다음 세션 첫 작업 추천
- `SiteManagementScreen.tsx`에서 아래 블록을 먼저 줄인다:
  - drag auto-scroll 관련 local function
  - `handleBackToList`, `resetRegistrationState`, `clearDraggingEmployee` 주변 navigation/reset 묶음
- 그 다음 `Wave 5` 문서 정식화로 전환한다.

## 바로 쓸 수 있는 명령
- 현재 상태 검증:
  - `npm run typecheck`
  - `npm run test`
- SiteManagement 관련 집중 검증:
  - `npm run test -- site-management-step-one-actions site-management-step-two-actions site-management-interaction-actions useSiteManagementStepState useSiteManagementInteractionState site-pattern-simulation site-management-selectors`
- 패키징 전 검증:
  - `npm run build`
  - `npm run package:win`

## 문서 위치 요약
- 감사 인덱스:
  - `artifacts/reviews/project-audit-2026-04/README.md`
- 실행 계획:
  - `artifacts/reviews/project-audit-2026-04/REFACTORING_PLAN.md`
- 유지보수 초안:
  - `artifacts/reviews/project-audit-2026-04/MAINTAINER_GUIDE_DRAFT.md`
- 보안 리뷰:
  - `artifacts/reviews/project-audit-2026-04/SECURITY_REVIEW.md`
- 결정 로그:
  - `artifacts/reviews/project-audit-2026-04/DECISION_LOG.md`

## 메모
- 현재 worktree에는 이번 감사/리팩토링 누적 변경이 함께 들어 있다.
- 이번 커밋은 그 누적 변경을 한 번에 정리하는 성격이다.
- SQLite experimental warning은 테스트에서 계속 출력되지만 현재 실패 원인은 아니다.
