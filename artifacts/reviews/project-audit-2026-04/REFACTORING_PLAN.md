# Refactoring Plan

## 목적
- 감사 결과를 실제 실행 가능한 배치로 전환한다.
- 각 배치의 선행 조건, 변경 범위, 검증 방법을 명확히 한다.

## 원칙
1. 보안과 재현성에 직접 영향이 있는 항목부터 처리한다.
2. 구조 리팩토링 전에는 보호 테스트를 먼저 확보한다.
3. 승인/수당/복원 흐름은 회귀 비용이 크므로 작은 배치로 나눈다.
4. 문서 갱신은 각 배치 완료 시점에 같이 수행한다.

## Wave 1. Authorization Baseline

### 상태
- `2026-04-16` 1차 구현 완료

### 목표
- UI 가드가 아니라 main handler 기준으로 세션/권한 검증을 강제한다.

### 작업
- `ipc-auth-guard-service.ts` 추가
- `requireAdmin` 공통 함수 도입
- `withSession`, `withAdmin` 조립 패턴 정의
- `operations`, `access-logs`에 관리자 가드 적용
- `dashboard`, `employees`, `sites`, `shift-patterns`, `monthly-schedules`, `performance`, `allowance`에 세션 가드 적용

### 대상 파일
- `src/main/main.ts`
- 신규 공통 helper 파일
- `src/main/services/ipc-auth-guard-service.ts`
- `src/main/services/ipc-auth-guard-service.test.ts`

### 선행 테스트
- 세션 없음 -> 호출 실패
- operator -> admin 기능 호출 실패
- admin -> 기존 기능 유지

### 완료 기준
- `IPC_ACCESS_MATRIX.md`의 `operations` 전 항목이 최소 세션/권한 정책을 반영한다.
- UI와 main의 권한 모델 불일치가 줄어든다.

### 실제 결과
- `npm run test` 통과
- `npm run typecheck` 통과
- 남은 과제:
  - 업무 도메인별 관리자 전용 작업 세분화
  - `main.ts` registrar 분리와 권한 정책 공통화

## Wave 2. Main Process Modularization

### 상태
- `2026-04-16` Wave 2 완료
- `registerCoreHandlers`, `registerWorkforceHandlers`, `registerOperationsHandlers`, `registerPerformanceHandlers`, `registerAllowanceHandlers` 추출 완료

### 목표
- `main.ts`의 과도한 조립 책임을 도메인별 registrar로 분리한다.

### 작업
- `registerCoreHandlers`
- `registerOperationsHandlers`
- `registerPerformanceHandlers`
- `registerAllowanceHandlers`
- `registerWorkforceHandlers`

### 대상 파일
- `src/main/main.ts`
- `src/main/ipc/` 또는 동등 구조 신규 생성

### 선행 테스트
- 현재 smoke 및 핵심 서비스 테스트 유지
- 최소한 주요 handler 등록 후 앱 부팅 smoke 확인

### 완료 기준
- `main.ts`는 window 생성, runtime 시작/종료, registrar 호출 중심으로 축소
- 공통 error/session/logging 패턴이 registrar에서 재사용됨

### 실제 결과
- `src/main/ipc/register-core-handlers.ts` 추가
- `src/main/ipc/register-workforce-handlers.ts` 추가
- `src/main/ipc/register-operations-handlers.ts` 추가
- `src/main/ipc/register-performance-handlers.ts` 추가
- `src/main/ipc/register-allowance-handlers.ts` 추가
- `main.ts`에서 `app/auth/dashboard/access-logs` 직접 등록을 제거하고 registrar 호출만 남김
- `main.ts`에서 `employees/sites/shift-patterns/monthly-schedules` 직접 등록을 제거하고 registrar 호출만 남김
- `main.ts`에서 `operations:*` 직접 등록을 제거하고 registrar 호출만 남김
- `main.ts`에서 `performance:*` 직접 등록을 제거하고 registrar 호출만 남김
- `main.ts`에서 `allowance:*` 직접 등록을 제거하고 registrar 호출만 남김
- `main.ts`는 `192`줄까지 축소됐고 inline `ipcMain.handle(...)`는 `0`건
- `npm run typecheck` 통과
- `npm run test` 통과
- 후속 과제:
  - registrar 공통 wrapper 도입
  - `Wave 3` 복원/백업 하드닝

## Wave 3. Backup/Migration Hardening

### 상태
- `2026-04-16` batch 1 완료
- `2026-04-16` batch 2 완료
- `2026-04-16` batch 3 완료
- `2026-04-16` batch 4 완료
- `2026-04-16` batch 5 완료
- 경로 해석/파일 검증 helper 추출 완료
- PowerShell 오류 레이어와 DB replace/rollback helper 분리 완료
- `operations` registrar 공통 wrapper 1차 적용 완료
- `workforce`, `performance` registrar 공통 wrapper 확장 완료
- `allowance`, `core` registrar 공통 wrapper 확장 완료

### 목표
- 백업/복원/파일 경로 처리 규칙을 공통화해 실수 가능성을 줄인다.

### 작업
- 경로 검증 helper 공통화
- overwrite/backup/rollback 규칙 정리
- PowerShell 실행 관련 오류 메시지 레이어 분리
- Access/JSON 복원 흐름 테스트 강화

### 대상 파일
- `src/main/services/database-migration-service.ts`
- `src/main/services/database-backup-service.ts`
- 관련 테스트

### 선행 테스트
- JSON 복원 preview/update
- Access prereq check
- 백업 생성 실패/복구 실패/롤백 케이스

### 완료 기준
- 복원 관련 위험 분기가 테스트로 보호됨
- 사용자 메시지와 내부 실패 원인이 분리됨

### 실제 결과
- `src/main/services/database-file-policy-service.ts` 추가
- 설정 기반 `migrationFilePath`의 상대경로 해석을 `dataDir` 기준으로 공통화
- 복원 실행 입력은 `blank / missing / not-file / unsupported-extension` 순서로 검증
- Access 백업은 `missing-config / not-access / missing-file / not-file / ready` 상태로 분기
- `src/main/services/database-file-policy-service.test.ts` 추가
- `database-backup-service.test.ts`에 상대경로 Access 원본 복사와 directory guard 케이스 추가
- `database-migration-service.test.ts`에 directory input rejection 케이스 추가
- `src/main/services/database-powershell-diagnostic-service.ts` 추가
- `src/main/services/database-replacement-service.ts` 추가
- `src/main/ipc/ipc-handler-helpers.ts` 추가
- Access prereq check와 Access export 실패는 내부 진단 로그와 사용자 메시지를 분리
- DB 교체는 `replaceDatabaseFileAtomically()`로 이동하고 rollback 규칙을 helper 테스트로 고정
- `src/main/services/database-powershell-diagnostic-service.test.ts` 추가
- `src/main/services/database-replacement-service.test.ts` 추가
- `src/main/ipc/ipc-handler-helpers.test.ts` 추가
- `src/main/ipc/register-operations-handlers.ts`에서 공통 `createIpcSuccess()`, `createIpcFailureFromError()`, `runIpcAction()`을 1차 적용
- `operations` registrar의 남은 수동 예외 케이스는 file-watch restart가 필요한 DB 복원 preview/update와 저장 다이얼로그가 섞인 양식 미리보기로 축소
- `src/main/ipc/register-workforce-handlers.ts`에 공통 helper를 확장 적용
- `src/main/ipc/register-performance-handlers.ts`에 공통 helper를 확장 적용
- `src/main/ipc/register-allowance-handlers.ts`에 `runIpcResultAction()` 기반 공통 helper를 확장 적용
- `src/main/ipc/register-core-handlers.ts`에 export/access-log 응답 공통 helper를 확장 적용
- `src/main/ipc/register-operations-handlers.ts`에 `runIpcActionWithCleanup()`를 추가 적용해 DB 복원 preview/update의 file-watch restart를 공통화
- `src/main/ipc/register-core-handlers.ts`, `src/main/ipc/register-operations-handlers.ts`에 `runIpcSaveDialogResultAction()` / `runIpcSaveDialogAction()`를 추가 적용해 대시보드 export와 양식 미리보기 저장 다이얼로그 분기를 공통화
- `src/main/ipc/register-performance-handlers.ts`에 `runIpcOpenPathAction()`를 추가 적용해 local file open 분기를 공통화
- `npm run typecheck` 통과
- `npm run test` 통과
- 후속 과제:
  - maintainer 문서에 PowerShell/rollback 운영 절차를 더 구체화
  - 필요 시 backup/migration golden path smoke 보강
  - registrar 공통 wrapper와 연결할 cross-cutting logging 기준 정리

## Wave 4. Renderer Screen Decomposition

### 상태
- `2026-04-16` batch 1 완료
- `SiteManagementScreen.tsx`의 `step2` 조직 구성 view를 `SiteAssignmentStepView.tsx`로 분리
- `2026-04-17` batch 2 완료
- `SiteManagementScreen.tsx`의 `step1` 시뮬레이션 패널과 pattern preset modal을 별도 component로 분리
- `2026-04-17` batch 3 완료
- `SiteManagementScreen.tsx`의 `step1` 상단 설정 패널을 `SitePatternSetupPanel.tsx`로 분리
- `2026-04-17` batch 4 완료
- `SiteManagementScreen.tsx`의 `step1` Pool 설정과 cycle editor stack을 `SitePatternAdvancedEditorPanel.tsx`로 분리하고, `SiteTimeRangePicker.tsx`를 별도 재사용 component로 분리
- `2026-04-17` batch 5 완료
- `SiteManagementScreen.tsx`의 list view 패턴 import/guide modal과 근무지 detail modal을 별도 component로 분리
- `2026-04-17` batch 6 완료
- `SiteManagementScreen.tsx`의 list view summary/table/action 영역을 `SiteListView.tsx`로 분리
- `2026-04-17` batch 7 완료
- `AllowanceManagementScreen.tsx`의 상단 hero, view tab, overview/history filter toolbar를 `AllowanceHeroPanel.tsx`로 분리
- `2026-04-17` batch 8 완료
- `AllowanceManagementScreen.tsx`의 overview 좌측 시각화 카드 두 개를 `AllowanceOverviewChartsPanel.tsx`로 분리
- `2026-04-17` batch 9 완료
- `AllowanceManagementScreen.tsx`의 overview/history detail evidence panel을 `AllowanceEvidencePanel.tsx`로 분리
- `2026-04-17` batch 10 완료
- `AllowanceManagementScreen.tsx`의 overview 결과 카드 heading/search, summary/grouped table을 `AllowanceOverviewResultsPanel.tsx`로 분리
- `2026-04-17` batch 11 완료
- `AllowanceManagementScreen.tsx`의 history grouped table과 proposal approval table을 `AllowanceHistoryPanel.tsx`로 분리
- `2026-04-17` batch 12 완료
- `AllowanceManagementScreen.tsx`의 proposal preview modal과 early payout modal을 전용 component로 분리

### 목표
- 장대 화면을 section component + hook 구조로 나눈다.

### 우선순위
1. `SiteManagementScreen.tsx`
2. `AllowanceManagementScreen.tsx`
3. `DashboardScreen.tsx`

### 작업
- 조회 상태 훅 분리
- 편집 섹션 분리
- 모달/가이드 렌더링 분리
- 공통 테이블/폼 영역 추출

### 선행 테스트
- 화면별 최소 smoke 시나리오
- 계산/승인 흐름과 연결된 버튼 동작 검증

### 완료 기준
- 화면 파일 길이와 책임이 눈에 띄게 감소
- 화면별 섹션이 독립적으로 읽히고 수정 가능

### 실제 결과
- `src/renderer/screens/site-management/SiteAssignmentStepView.tsx` 추가
- `SiteManagementScreen.tsx`는 `step2` 조직 구성 영역을 별도 presentational component로 위임
- `step2` drag/drop, 저장, 이동, 완료 버튼 wiring은 parent에서 유지하고, view 렌더링만 component로 분리
- `src/renderer/screens/site-management/SiteAssignmentStepView.test.tsx` 추가
- `src/renderer/screens/site-management/SitePatternSimulationPanel.tsx` 추가
- `src/renderer/screens/site-management/SitePatternPresetModal.tsx` 추가
- `SiteManagementScreen.tsx`는 `step1` 시뮬레이션 패널과 pattern preset modal 렌더링을 별도 component로 위임
- `src/renderer/screens/site-management/SitePatternStepPanels.test.tsx` 추가
- `src/renderer/screens/site-management/SitePatternSetupPanel.tsx` 추가
- `SiteManagementScreen.tsx`는 `step1`에서 상단 설정 패널의 view-model 조립과 callback wiring만 유지하고, 나머지 렌더링은 `SitePatternSetupPanel.tsx`로 위임
- `src/renderer/screens/site-management/SitePatternSetupPanel.test.tsx` 추가
- `src/renderer/screens/site-management/SiteTimeRangePicker.tsx` 추가
- `src/renderer/screens/site-management/SitePatternAdvancedEditorPanel.tsx` 추가
- `SiteManagementScreen.tsx`는 `step1`에서 `advancedEditorCycles`와 callback wiring만 유지하고, Pool 설정과 cycle editor stack 렌더링은 `SitePatternAdvancedEditorPanel.tsx`로 위임
- `src/renderer/screens/site-management/SiteTimeRangePicker.test.tsx` 추가
- `src/renderer/screens/site-management/SitePatternAdvancedEditorPanel.test.tsx` 추가
- `src/renderer/screens/site-management/SitePatternImportModal.tsx` 추가
- `src/renderer/screens/site-management/SiteDetailModal.tsx` 추가
- `SiteManagementScreen.tsx`는 list view에서 import/detail modal 표시 상태와 callback만 유지하고, 대형 modal 렌더링은 별도 component로 위임
- `src/renderer/screens/site-management/SitePatternImportModal.test.tsx` 추가
- `src/renderer/screens/site-management/SiteDetailModal.test.tsx` 추가
- `src/renderer/screens/site-management/SitePatternStepView.tsx` 추가
- `SiteManagementScreen.tsx`는 `step1`에서 view-model 계산과 action wiring만 유지하고, stage header/summary/layout/footer/preset modal 조립은 `SitePatternStepView.tsx`로 위임한다. 현재 `2417`줄이다.
- `src/renderer/screens/site-management/SitePatternStepView.test.tsx` 추가
- `src/renderer/screens/site-management/site-management-selectors.ts` 추가
- `SiteManagementScreen.tsx`는 rows, site-name option, detail summary, list summary, pattern preset 파생 계산을 selector module로 위임했고 현재 `2218`줄이다.
- `src/renderer/screens/site-management/site-management-selectors.test.ts` 추가
- `site-management-selectors.ts`는 `step2`용 active team label, pending override 기반 board grouping, pool candidate filter, team column 조립 helper까지 포함하도록 확장했다.
- `SiteManagementScreen.tsx`는 assignment board 파생 계산을 selector module로 위임했고 현재 `2182`줄이다.
- `site-management-selectors.test.ts`는 pending override, pool scope/keyword filter, capacity 반영 규칙까지 고정한다.
- `site-management-selectors.ts`는 `step1`용 cycle assignment, setup/editor 모델, simulation card/cell, pattern preset option helper까지 포함하도록 확장했다.
- `SiteManagementScreen.tsx`는 `step1`의 cycle assignment, editor fallback, simulation card/cell, preset option 조립을 selector module로 위임했고 현재 `2119`줄이다.
- `site-management-selectors.test.ts`는 `step1` setup/simulation 모델과 preset option 조립 규칙까지 고정한다.
- `site-management-selectors.ts`는 `step1`용 cycle preview normalization과 simulation timeline helper까지 포함하도록 확장했다.
- `SiteManagementScreen.tsx`는 `cyclePreviews`, `simulationAnchorDate`, `simulationMonth` 계산을 selector module로 위임했고 현재 `2040`줄이다.
- `site-management-selectors.test.ts`는 cycle preview fallback과 simulation month timeline 규칙까지 고정한다.
- `src/renderer/screens/site-management/site-pattern-simulation.ts` 추가
- `SiteManagementScreen.tsx`는 simulation holiday year 수집, holiday calendar merge, pool daily hours 계산, simulation cell/metric 조립을 `site-pattern-simulation.ts`로 위임했고 현재 `2082`줄이다.
- `src/renderer/screens/site-management/site-pattern-simulation.test.ts` 추가
- `src/renderer/screens/site-management/SiteListView.tsx` 추가
- `SiteManagementScreen.tsx`는 list view에서 `rows`, `siteListSummary`, focus ref, navigation callback만 유지하고, 목록 헤더와 표 렌더링은 `SiteListView.tsx`로 위임한다.
- `src/renderer/screens/site-management/SiteListView.test.tsx` 추가
- `src/renderer/screens/allowance-management/AllowanceHeroPanel.tsx` 추가
- `AllowanceManagementScreen.tsx`는 hero 영역에서 연도/월/근무지/상태 필터 값과 action callback만 유지하고, 상단 렌더링은 `AllowanceHeroPanel.tsx`로 위임한다.
- `src/renderer/screens/allowance-management/AllowanceHeroPanel.test.tsx` 추가
- `src/renderer/screens/allowance-management/AllowanceOverviewChartsPanel.tsx` 추가
- `AllowanceManagementScreen.tsx`는 좌측 시각화에서 distribution/donut 계산 결과와 hover 상태만 유지하고, 분포 막대/도넛 차트 렌더링은 `AllowanceOverviewChartsPanel.tsx`로 위임한다.
- `src/renderer/screens/allowance-management/AllowanceOverviewChartsPanel.test.tsx` 추가
- `src/renderer/screens/allowance-management/AllowanceEvidencePanel.tsx` 추가
- `AllowanceManagementScreen.tsx`는 overview/history detail row에서 산출 결과, 승인 이력, 품의승인 정보만 전달하고, evidence panel 렌더링은 `AllowanceEvidencePanel.tsx`로 위임한다.
- `src/renderer/screens/allowance-management/AllowanceEvidencePanel.test.tsx` 추가
- `src/renderer/screens/allowance-management/AllowanceOverviewResultsPanel.tsx` 추가
- `AllowanceManagementScreen.tsx`는 overview 결과 카드에서 layout mode, 검색어, expand 상태, approval/proposal lookup map, action callback만 유지하고, heading/search/summary/grouped table 렌더링은 `AllowanceOverviewResultsPanel.tsx`로 위임한다.
- `src/renderer/screens/allowance-management/AllowanceOverviewResultsPanel.test.tsx` 추가
- `src/renderer/screens/allowance-management/AllowanceHistoryPanel.tsx` 추가
- `AllowanceManagementScreen.tsx`는 history 섹션에서 expand 상태, proposal preview open callback, formatting/helper 함수만 유지하고, 품의 이력/품의 승인 기록 렌더링은 `AllowanceHistoryPanel.tsx`로 위임한다.
- `src/renderer/screens/allowance-management/AllowanceHistoryPanel.test.tsx` 추가
- `src/renderer/screens/allowance-management/AllowanceProposalPreviewModal.tsx` 추가
- `src/renderer/screens/allowance-management/AllowanceEarlyPayoutModal.tsx` 추가
- `AllowanceManagementScreen.tsx`는 proposal preview/guide open, 선지급 modal open/close/save/clear callback만 유지하고, 두 modal의 표/입력/버튼 렌더링은 전용 component로 위임한다.
- `src/renderer/screens/allowance-management/AllowanceProposalPreviewModal.test.tsx` 추가
- `src/renderer/screens/allowance-management/AllowanceEarlyPayoutModal.test.tsx` 추가
- `src/renderer/screens/allowance-management/allowance-management-selectors.ts` 추가
- `AllowanceManagementScreen.tsx`는 overview/history selector, latest lookup, rate version 계산을 순수 helper 호출 기준으로 정리했고 screen-level `useMemo` 본문을 축소했다.
- `AllowanceOverviewChartsPanel.tsx`, `AllowanceOverviewResultsPanel.tsx`, `AllowanceHistoryPanel.tsx`는 selector 파일의 공통 타입을 기준으로 props를 받도록 정리했다.
- `src/renderer/screens/allowance-management/allowance-management-selectors.test.ts` 추가
- `src/renderer/screens/allowance-management/useAllowanceManagementViewState.ts` 추가
- `AllowanceManagementScreen.tsx`는 view mode, overview/history filter, expand, layout toggle, chart hover state를 hook으로 위임했고 reset/toggle closure를 축소했다.
- `src/renderer/screens/allowance-management/useAllowanceManagementViewState.test.tsx` 추가
- `src/renderer/screens/allowance-management/useAllowanceManagementModalState.ts` 추가
- `AllowanceManagementScreen.tsx`는 proposal preview, guide, early payout modal local state와 render-side setter를 제거하고 modal state hook의 open/close/update helper 기준으로 wiring을 정리했다.
- `src/renderer/screens/allowance-management/useAllowanceManagementModalState.test.tsx` 추가
- `src/renderer/screens/allowance-management/allowance-management-modal-actions.ts` 추가
- `AllowanceManagementScreen.tsx`는 proposal preview/approve, early payout save/clear async handler를 직접 들고 있지 않고 action module이 반환하는 handler를 연결하는 구조로 정리했다.
- `src/renderer/screens/allowance-management/allowance-management-modal-actions.test.ts` 추가
- `src/renderer/screens/allowance-management/allowance-management-review-actions.ts` 추가
- `AllowanceManagementScreen.tsx`는 review/export async handler와 승인완료 파일 확인 분기까지 action module로 분리했고, screen은 결과 panel과 hero action에서 handler를 연결하는 역할만 유지한다.
- `src/renderer/screens/allowance-management/allowance-management-review-actions.test.ts` 추가
- `src/renderer/screens/dashboard/DashboardControlPanel.tsx` 추가
- `DashboardScreen.tsx`는 header, 전체 내보내기, 기간/근무지/직원 filter, notice stack 렌더링을 `DashboardControlPanel.tsx`로 위임하고 filter/export handler wiring만 유지한다.
- `src/renderer/screens/dashboard/DashboardControlPanel.test.tsx` 추가
- `src/renderer/screens/dashboard/DashboardRankingTable.tsx`와 `DashboardEmptyState.tsx` 추가
- `DashboardScreen.tsx`는 ranking tab/export panel과 empty-state message를 전용 component로 위임했고 현재 `2242`줄이다.
- `src/renderer/screens/dashboard/DashboardRankingTable.test.tsx` 추가
- `src/renderer/screens/dashboard/DashboardSummaryPanels.tsx` 추가
- `DashboardScreen.tsx`는 metric card와 trend/site/ratio chart card JSX 및 chart option 생성을 전용 panel file로 위임했고 현재 `1635`줄이다.
- `src/renderer/screens/dashboard/DashboardSummaryPanels.test.tsx` 추가
- `src/renderer/screens/dashboard/useDashboardFilterState.ts` 추가
- `DashboardScreen.tsx`는 draft/applied filter state와 `applyDraftValueChange` 규칙을 hook으로 위임했고 현재 `1424`줄이다.
- `src/renderer/screens/dashboard/useDashboardFilterState.test.tsx` 추가
- `src/renderer/screens/dashboard/dashboard-export-actions.ts` 추가
- `DashboardScreen.tsx`는 chart/report export async handler와 export format 판별을 action module로 위임했다.
- `src/renderer/screens/dashboard/dashboard-export-actions.test.ts` 추가
- `src/renderer/screens/dashboard/dashboard-records.ts` 추가
- `DashboardScreen.tsx`는 샘플 데이터 생성, 실데이터/샘플 dataset selection, record filter range 매칭, 샘플 fallback 월 보정 규칙을 `dashboard-records.ts`로 위임했고 현재 `1027`줄이다.
- `src/renderer/screens/dashboard/dashboard-records.test.ts` 추가
- `src/renderer/screens/dashboard/dashboard-selectors.ts` 추가
- `DashboardScreen.tsx`는 이전 기간 집계, metric/trend/site/ratio/ranking selector, export용 filter summary 계산을 `dashboard-selectors.ts`로 위임했고 현재 `636`줄이다.
- `src/renderer/screens/dashboard/dashboard-selectors.test.ts` 추가
- `src/renderer/screens/dashboard/dashboard-export-selectors.ts` 추가
- `DashboardScreen.tsx`는 chart export input, ranking export section, control-panel notice 조립을 `dashboard-export-selectors.ts`로 위임했고 현재 `536`줄이다.
- `src/renderer/screens/dashboard/dashboard-export-selectors.test.ts` 추가
- `src/renderer/screens/site-management/site-management-actions.ts` 추가
- `SiteManagementScreen.tsx`는 draft validation, cycle input 조립, saveSite/saveShiftPattern 저장 흐름을 `site-management-actions.ts`로 위임했고 현재 `1939`줄이다.
- `src/renderer/screens/site-management/site-management-actions.test.ts` 추가
- `src/renderer/screens/site-management/site-management-step-two-actions.ts` 추가
- `SiteManagementScreen.tsx`는 step2 assignment/unassign/complete async 흐름을 `site-management-step-two-actions.ts`로 위임했고 현재 `1723`줄이다.
- `src/renderer/screens/site-management/site-management-step-two-actions.test.ts` 추가
- `site-management-selectors.ts`의 pending assignment 공유 타입은 `startDate`를 포함하도록 정리해 selector/action/screen 계약을 통일했다.
- `src/renderer/screens/site-management/site-management-interaction-actions.ts` 추가
- `SiteManagementScreen.tsx`는 pattern import/select/analyze/apply, detail open/close, registration 진입, delete confirm/delete async 흐름을 `site-management-interaction-actions.ts`로 위임했고 현재 `1576`줄이다.
- `src/renderer/screens/site-management/site-management-interaction-actions.test.ts` 추가
- `src/renderer/screens/site-management/useSiteManagementInteractionState.ts` 추가
- `SiteManagementScreen.tsx`는 detail/import modal state와 patternImportAnalysis 연계 reset effect를 `useSiteManagementInteractionState.ts`로 위임했고 현재 `1584`줄이다.
- `src/renderer/screens/site-management/useSiteManagementInteractionState.test.tsx` 추가
- `src/renderer/screens/site-management/useSiteManagementStepState.ts` 추가
- `SiteManagementScreen.tsx`는 view, pool filter, assignment start date, preset modal, simulation month state를 `useSiteManagementStepState.ts`로 위임했고 registration reset 시 preset/simulation/dragging team 상태를 공통 초기화한다.
- `src/renderer/screens/site-management/useSiteManagementStepState.test.tsx` 추가
- `src/renderer/screens/site-management/site-management-step-one-actions.ts` 추가
- `SiteManagementScreen.tsx`는 `step1` preset 적용, 입력 검토/적용, 다음 단계 전환 orchestration을 `site-management-step-one-actions.ts`로 위임했고 현재 `1392`줄이다.
- `src/renderer/screens/site-management/site-management-step-one-actions.test.ts` 추가
- `npm run typecheck` 통과
- `npm run test` 전체 재실행까지 통과했고 현재 기준은 `100` files / `382` tests다.
- 후속 과제:
- `SiteManagementScreen.tsx`의 drag auto-scroll, back/reset navigation helper 정리
- `DashboardScreen.tsx`는 현재 hotspot 우선순위에서 내려가므로 유지보수 문서화 이후 필요 시 추가 정리
- `Wave 5` 유지보수 문서 정식화 시작
- `useSiteManagementAssignmentDragState.ts`, `useSiteManagementRegistrationFlow.ts`를 추가해 `SiteManagementScreen.tsx`의 drag state, registration reset, list focus 복귀 orchestration을 화면 밖으로 이동했고 현재 `1264`줄이다.

## Wave 5. Maintainer Documentation Finalization

### 상태
- `2026-04-18` Wave 5 완료

### 목표
- 신규 유지보수자가 문서만 보고 기본 변경과 배포를 따라갈 수 있게 한다.

### 작업
- `MAINTAINER_GUIDE_DRAFT.md` 정식 문서화
- 변경 절차, 장애 진단, 패키징 절차, 권한 모델 문서 반영
- 필요한 경우 `docs/technical-overview.md`와 `docs/functional-spec.md` 동기화

### 완료 기준
- 코드 진입점, IPC 추가 방법, 설정/경로 해석, 패키징, 장애 진단이 문서에 정리됨
- 감사 중간 문서와 운영 기준 문서의 역할이 분리됨

### 실제 결과
- `docs/maintainer-guide.md`를 추가해 현재 기준 유지보수 문서를 정식화했다.
- `docs/README.md`에 유지보수자 가이드를 현재 유지 문서로 편입하고 읽는 순서를 갱신했다.
- `docs/technical-overview.md`에 유지보수 절차 문서 참조를 추가했다.
- `MAINTAINER_GUIDE_DRAFT.md`는 아카이브 성격으로 남기고 현재 기준 문서 위치를 명시했다.

## 권장 순서
1. Wave 2
2. Wave 3
3. Wave 4
4. Wave 5

## 검증 공통 기준
- `npm run typecheck`
- `npm run test`
- `npm run build`
- 변경 배치에 따라:
  - `npm run smoke:electron:packaged`
  - `npm run smoke:electron:installer`
  - 운영/승인/수당 관련 smoke
