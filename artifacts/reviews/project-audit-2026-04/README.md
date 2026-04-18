# Project Audit 2026-04

## 목적
- 현재 코드베이스의 구조, 품질, 보안 상태를 코드 기준으로 다시 정리한다.
- 리팩토링 우선순위를 명확히 하고, 유지보수 가능한 문서 기반을 만든다.
- 운영 기준 문서와 실제 구현 사이의 차이를 식별한다.

## 범위
- 코드 구조: `src/main`, `src/preload`, `src/renderer`, `src/shared`
- 런타임 경계: Electron main/preload/renderer IPC
- 저장소와 파일 흐름: SQLite, Excel, PowerShell, Access 복원
- 인증/권한: 로컬 계정, 세션, 운영자/관리자 경계
- 패키징/배포: `electron-builder`, NSIS 설치본, smoke 검증

## 작업 원칙
1. 분석 결과와 실제 수정 작업을 분리한다.
2. 리팩토링 후보는 근거 파일과 위험도를 같이 기록한다.
3. 보안 이슈는 로컬 앱이라는 특성을 감안하되, 파일 접근과 권한 경계를 엄격히 본다.
4. 문서는 운영 문서와 개발자 문서를 분리한다.
5. `docs/`는 현재 기준 문서만 유지하고, 중간 감사 산출물은 이 폴더에 둔다.

## 산출물
- `SYSTEM_INVENTORY.md`
- `IPC_ACCESS_MATRIX.md`
- `CODE_QUALITY_REPORT.md`
- `SECURITY_REVIEW.md`
- `REFACTORING_BACKLOG.md`
- `REFACTORING_PLAN.md`
- `MAINTAINER_GUIDE_DRAFT.md`
- `HANDOFF_CONTEXT.md`
- `DECISION_LOG.md`

## 현재 상태
- 상태: `phase-5 / wave-4-batch-38`
- 진행률: `약 99%`
- 시작일: `2026-04-16`
- 기준 브랜치: `release/0.4.0`
- 기준 버전: `0.4.0`

## 최근 업데이트
- `main.ts`의 주요 IPC handler에 `withSession`, `withAdmin` 기준선을 적용했다.
- `src/main/services/ipc-auth-guard-service.ts`를 추가해 세션/관리자 권한 실패 응답을 공통화했다.
- `src/main/services/auth-service.ts`, `src/main/services/operations-storage-service.ts`, `src/main/services/sqlite-storage-service.ts`에 `must_change_password`와 `auth:change-password` 흐름을 추가해 초기 비밀번호 로그인 후 비밀번호 변경을 강제했다.
- `src/renderer/components/PasswordChangeScreen.tsx`를 추가했고, `src/main/main.ts`는 비밀번호 변경 전 운영 IPC를 차단한다.
- `src/main/ipc/register-operations-handlers.ts`로 `operations` registrar를 분리했다.
- `src/main/ipc/register-performance-handlers.ts`로 `performance` registrar를 분리했다.
- `src/main/ipc/register-core-handlers.ts`로 `app/auth/dashboard/access-logs` registrar를 분리했다.
- `src/main/ipc/register-workforce-handlers.ts`로 `employees/sites/shift-patterns/monthly-schedules` registrar를 분리했다.
- `src/main/ipc/register-allowance-handlers.ts`로 `allowance` registrar를 분리했다.
- `src/main/main.ts`는 `192`줄까지 축소됐고, inline IPC 등록은 사라졌다. 분리된 registrar는 `operations 787`, `workforce 332`, `performance 212`, `core 217`, `allowance 184`줄이다.
- `src/main/services/database-file-policy-service.ts`를 추가해 복원 입력과 설정 기반 Access 원본 경로 해석을 공통화했다.
- `database-backup-service.ts`는 설정된 Access 원본이 상대경로, 누락, 디렉터리인 경우를 같은 정책으로 처리한다.
- `database-migration-service.ts`는 복원 입력이 비어 있거나, 존재하지 않거나, 파일이 아닌 경우를 미리 차단한다.
- `src/main/services/database-file-policy-service.test.ts`를 추가했고, backup/migration 테스트에 상대경로와 directory guard 케이스를 보강했다.
- `src/main/services/database-powershell-diagnostic-service.ts`를 추가해 PowerShell 실행 실패의 사용자 메시지와 내부 진단 로그를 분리했다.
- `src/main/services/database-replacement-service.ts`를 추가해 DB 교체와 rollback 규칙을 별도 helper로 고정했다.
- `database-migration-service.ts`는 Access export/prereq check 실패 시 raw stderr를 그대로 노출하지 않고, 내부 로그는 `console.error`로 남기고 사용자 메시지는 요약형으로 반환한다.
- `src/main/services/database-powershell-diagnostic-service.test.ts`, `src/main/services/database-replacement-service.test.ts`를 추가해 PowerShell 진단/rollback 규칙을 고정했다.
- `src/main/ipc/ipc-handler-helpers.ts`를 추가해 `ok/data`, error mapping, activity logging 조립을 공통화했다.
- `src/main/ipc/register-operations-handlers.ts`는 공통 helper와 `runIpcActionWithCleanup()`을 적용해 `1011 -> 787`줄로 줄였고, DB 복원 preview/update의 file-watch restart를 별도 cleanup 패턴으로 고정했다.
- `src/main/ipc/register-workforce-handlers.ts`는 공통 helper를 적용해 조회/저장/export 계열의 success/error/activity 조립을 정리했고 `386 -> 332`줄로 줄였다.
- `src/main/ipc/register-performance-handlers.ts`는 공통 helper를 적용해 조회와 파일 열기 오류 조립을 정리했고, `performance:open-source-file`의 파일 존재 확인 및 `shell.openPath()` 처리도 `runIpcOpenPathAction()`으로 이동했다.
- `src/main/ipc/register-allowance-handlers.ts`는 `BridgeResult` 기반 서비스 호출을 `runIpcResultAction()`으로 정리했고, 조회성 응답은 `createIpcSuccess()`로 통일했다.
- `src/main/ipc/register-core-handlers.ts`는 대시보드 export와 access-log 응답을 helper 기준으로 정리했고, export 저장 다이얼로그 분기도 `runIpcSaveDialogResultAction()`으로 공통화했다.
- `src/main/ipc/register-operations-handlers.ts`는 `operations:preview-document-template`의 저장 다이얼로그 분기를 `runIpcSaveDialogAction()`으로 공통화했다.
- `src/renderer/screens/site-management/SiteAssignmentStepView.tsx`를 추가해 `SiteManagementScreen.tsx`의 `step2` 조직 구성 view를 별도 presentational component로 분리했다.
- `src/renderer/screens/site-management/SiteAssignmentStepView.test.tsx`를 추가해 `step2` view의 최소 렌더와 주요 버튼 wiring을 보호했다.
- `src/renderer/screens/site-management/SitePatternSimulationPanel.tsx`를 추가해 `SiteManagementScreen.tsx`의 `step1` 시뮬레이션 패널을 계산 결과 prop 기반 component로 분리했다.
- `src/renderer/screens/site-management/SitePatternPresetModal.tsx`를 추가해 `step1`의 패턴 preset modal 렌더링을 별도 component로 분리했다.
- `src/renderer/screens/site-management/SitePatternStepPanels.test.tsx`를 추가해 시뮬레이션 패널과 preset modal의 최소 렌더 및 버튼 wiring을 보호했다.
- `src/renderer/screens/site-management/SitePatternSetupPanel.tsx`를 추가해 `SiteManagementScreen.tsx`의 `step1` 상단 편집 영역을 별도 component로 분리했다.
- `SiteManagementScreen.tsx`는 `step1`에서 상단 설정 섹션의 view-model 조립과 callback wiring만 유지하고, `site-form-panel` 상단 렌더링은 `SitePatternSetupPanel.tsx`로 위임한다.
- `src/renderer/screens/site-management/SitePatternSetupPanel.test.tsx`를 추가해 상단 설정 패널의 preset/입력 wiring과 cycle drag/drop forwarding을 보호했다.
- `src/renderer/screens/site-management/SiteTimeRangePicker.tsx`를 추가해 `SiteManagementScreen.tsx` 내부의 local time-range picker를 별도 재사용 component로 분리했다.
- `src/renderer/screens/site-management/SitePatternAdvancedEditorPanel.tsx`를 추가해 `step1`의 Pool 설정과 cycle editor stack 렌더링을 별도 component로 분리했다.
- `SiteManagementScreen.tsx`는 `step1`에서 `advancedEditorCycles` view-model과 callback wiring만 유지하고, Pool/time-range/cycle editor 렌더링은 `SitePatternAdvancedEditorPanel.tsx`로 위임한다.
- `src/renderer/screens/site-management/SiteTimeRangePicker.test.tsx`, `src/renderer/screens/site-management/SitePatternAdvancedEditorPanel.test.tsx`를 추가해 time-range 조립과 advanced editor wiring을 보호했다.
- `src/renderer/screens/site-management/SitePatternImportModal.tsx`를 추가해 list view의 패턴 import modal과 guide overlay를 별도 component로 분리했다.
- `src/renderer/screens/site-management/SiteDetailModal.tsx`를 추가해 list view의 근무지 detail modal 렌더링을 별도 component로 분리했다.
- `SiteManagementScreen.tsx`는 list view에서 import/detail modal 표시 여부와 callback만 유지하고, 대형 modal 렌더링은 `SitePatternImportModal.tsx`, `SiteDetailModal.tsx`로 위임한다.
- `src/renderer/screens/site-management/SitePatternImportModal.test.tsx`, `src/renderer/screens/site-management/SiteDetailModal.test.tsx`를 추가해 list view modal의 버튼 wiring과 핵심 렌더를 보호했다.
- `src/renderer/screens/site-management/SiteListView.tsx`를 추가해 `SiteManagementScreen.tsx`의 목록 화면 summary/table/action 렌더링을 별도 presentational component로 분리했다.
- `SiteManagementScreen.tsx`는 list view에서 `rows`, `siteListSummary`, focus ref, navigation callback만 유지하고, 목록 헤더와 표 렌더링은 `SiteListView.tsx`로 위임한다.
- `src/renderer/screens/site-management/SiteListView.test.tsx`를 추가해 목록 화면의 로딩/빈 상태와 주요 버튼 wiring을 보호했다.
- `src/renderer/screens/allowance-management/AllowanceHeroPanel.tsx`를 추가해 `AllowanceManagementScreen.tsx`의 상단 hero, view tab, overview/history filter toolbar, 상태 메타 패널을 별도 component로 분리했다.
- `AllowanceManagementScreen.tsx`는 hero 영역에서 연도/월/근무지/상태 필터 값과 action callback만 유지하고, 상단 렌더링은 `AllowanceHeroPanel.tsx`로 위임한다.
- `src/renderer/screens/allowance-management/AllowanceHeroPanel.test.tsx`를 추가해 hero 패널의 overview/history 필터와 주요 액션 버튼 wiring을 보호했다.
- `src/renderer/screens/allowance-management/AllowanceOverviewChartsPanel.tsx`를 추가해 `AllowanceManagementScreen.tsx`의 overview 좌측 시각화 카드 두 개를 별도 component로 분리했다.
- `AllowanceManagementScreen.tsx`는 좌측 시각화에서 distribution/donut 계산 결과와 hover 상태만 유지하고, 분포 막대/도넛 차트 렌더링은 `AllowanceOverviewChartsPanel.tsx`로 위임한다.
- `src/renderer/screens/allowance-management/AllowanceOverviewChartsPanel.test.tsx`를 추가해 좌측 시각화 패널의 hover, 도넛 pointer, layout toggle wiring을 보호했다.
- `src/renderer/screens/allowance-management/AllowanceEvidencePanel.tsx`를 추가해 `AllowanceManagementScreen.tsx` 내부의 수당 상세 근거 패널과 상태 요약/ledger 정렬 helper를 별도 component로 분리했다.
- `AllowanceManagementScreen.tsx`는 overview/history detail row에서 산출 결과, 승인 이력, 품의승인 정보만 전달하고, evidence panel 렌더링은 `AllowanceEvidencePanel.tsx`로 위임한다.
- `src/renderer/screens/allowance-management/AllowanceEvidencePanel.test.tsx`를 추가해 reviewed/proposal-approved 상세 표시와 ledger 렌더를 보호했다.
- `src/renderer/screens/allowance-management/AllowanceOverviewResultsPanel.tsx`를 추가해 `AllowanceManagementScreen.tsx`의 overview 결과 카드 heading/search, summary-only table, grouped detail table/action row를 별도 component로 분리했다.
- `AllowanceManagementScreen.tsx`는 overview 결과 카드에서 layout mode, 검색어, expand 상태, approval/proposal lookup map, action callback만 유지하고, 상세 렌더링은 `AllowanceOverviewResultsPanel.tsx`로 위임한다.
- `src/renderer/screens/allowance-management/AllowanceOverviewResultsPanel.test.tsx`를 추가해 overview summary/grouped table의 검색, expand, 승인/반려, 선지급, 상세 패널 wiring을 보호했다.
- `src/renderer/screens/allowance-management/AllowanceHistoryPanel.tsx`를 추가해 `AllowanceManagementScreen.tsx`의 history grouped table과 proposal approval table을 별도 component로 분리했다.
- `AllowanceManagementScreen.tsx`는 history 섹션에서 expand 상태, proposal preview open callback, formatting/helper 함수만 유지하고, 품의 이력/품의 승인 기록 렌더링은 `AllowanceHistoryPanel.tsx`로 위임한다.
- `src/renderer/screens/allowance-management/AllowanceHistoryPanel.test.tsx`를 추가해 history expand/detail, proposal preview, loading state wiring을 보호했다.
- `src/renderer/screens/allowance-management/AllowanceProposalPreviewModal.tsx`를 추가해 `AllowanceManagementScreen.tsx`의 품의 승인 미리보기/상세 modal 렌더링을 별도 component로 분리했다.
- `src/renderer/screens/allowance-management/AllowanceEarlyPayoutModal.tsx`를 추가해 `AllowanceManagementScreen.tsx`의 퇴직자 선지급 설정 modal 렌더링을 별도 component로 분리했다.
- `AllowanceManagementScreen.tsx`는 proposal preview/guide open, 선지급 modal open/close/save/clear callback만 유지하고, 두 modal의 표/입력/버튼 렌더링은 전용 component로 위임한다.
- `src/renderer/screens/allowance-management/AllowanceProposalPreviewModal.test.tsx`, `src/renderer/screens/allowance-management/AllowanceEarlyPayoutModal.test.tsx`를 추가해 guide/comment/approve/close와 선지급 취소/저장/상태 표시 wiring을 보호했다.
- `src/renderer/screens/allowance-management/allowance-management-selectors.ts`를 추가해 `AllowanceManagementScreen.tsx`의 overview/history selector, latest lookup, rate version 계산을 순수 helper로 분리했다.
- `AllowanceManagementScreen.tsx`는 screen-level `useMemo` 본문 대신 selector 호출과 state wiring만 유지하고, `AllowanceOverviewChartsPanel.tsx`, `AllowanceOverviewResultsPanel.tsx`, `AllowanceHistoryPanel.tsx`는 공통 selector 타입을 기준으로 props를 받도록 정리했다.
- `src/renderer/screens/allowance-management/allowance-management-selectors.test.ts`를 추가해 overview 정렬, 집계, history 최신 이력 매핑, proposal approval 필터, rate version 선택을 고정했다.
- `src/renderer/screens/allowance-management/useAllowanceManagementViewState.ts`를 추가해 `AllowanceManagementScreen.tsx`의 view mode, overview/history filter, expand, layout toggle, chart hover state를 전용 hook으로 분리했다.
- `AllowanceManagementScreen.tsx`는 hero/panel에 직접 넘기던 reset/toggle closure를 줄이고 hook이 반환하는 setter/reset helper를 중심으로 wiring만 유지하도록 정리했다.
- `src/renderer/screens/allowance-management/useAllowanceManagementViewState.test.tsx`를 추가해 overview/history reset, expand toggle, layout toggle, view mode 전환을 고정했다.
- `src/renderer/screens/allowance-management/useAllowanceManagementModalState.ts`를 추가해 `AllowanceManagementScreen.tsx`의 proposal preview, guide, early payout modal 상태와 open/close/update helper를 전용 hook으로 분리했다.
- `AllowanceManagementScreen.tsx`는 local modal state와 render-side setter를 제거하고, modal open/close/comment/date 변경을 hook 반환값 기준으로 wiring만 유지하도록 정리했다.
- `src/renderer/screens/allowance-management/useAllowanceManagementModalState.test.tsx`를 추가해 선지급 editor 열기/수정/닫기, draft/history proposal preview, guide open/close 상태를 고정했다.
- `src/renderer/screens/allowance-management/allowance-management-modal-actions.ts`를 추가해 `AllowanceManagementScreen.tsx`의 proposal preview/approve, early payout save/clear async handler를 별도 action module로 분리했다.
- `AllowanceManagementScreen.tsx`는 modal 관련 async 처리에서 bridge 호출, 확인 팝업, processing state 조립을 직접 들고 있지 않고 action module이 반환하는 handler를 연결하는 형태로 정리했다.
- `src/renderer/screens/allowance-management/allowance-management-modal-actions.test.ts`를 추가해 선지급 저장/취소, 품의 preview/approve 흐름과 processing/message 조립을 고정했다.
- `src/renderer/screens/allowance-management/allowance-management-review-actions.ts`를 추가해 `AllowanceManagementScreen.tsx`의 review/export async handler와 승인완료 파일 확인 분기를 별도 action module로 분리했다.
- `AllowanceManagementScreen.tsx`는 review/export 처리에서 승인완료 파일 조회, 반려 사유 입력, 출력 완료 안내, processing/message 조립을 직접 들고 있지 않고 action module의 handler를 연결하는 구조로 정리했다.
- `src/renderer/screens/allowance-management/allowance-management-review-actions.test.ts`를 추가해 빈 승인 요청 차단, 근무지 반려 사유 검증, 승인완료 파일 경고 취소, review success, export success 흐름을 고정했다.
- `src/renderer/screens/dashboard/DashboardControlPanel.tsx`를 추가해 `DashboardScreen.tsx`의 header, 전체 내보내기, 기간/근무지/직원 filter, notice stack 렌더링을 별도 component로 분리했다.
- `DashboardScreen.tsx`는 `controlPanelNotices` 조립과 filter/export handler wiring만 유지하고, 상단 control panel 렌더링은 `DashboardControlPanel.tsx`로 위임한다.
- `src/renderer/screens/dashboard/DashboardControlPanel.test.tsx`를 추가해 단일 기간/범위 기간 filter 조작과 전체 내보내기 버튼 wiring을 고정했다.
- `src/renderer/screens/dashboard/DashboardRankingTable.tsx`와 `DashboardEmptyState.tsx`를 추가해 `DashboardScreen.tsx`의 ranking tab/export panel과 비어 있는 카드 메시지 렌더링을 화면 밖으로 분리했다.
- `DashboardScreen.tsx`는 현재 `2242`줄까지 줄었고, ranking section에서는 active category와 export handler만 유지한다.
- `src/renderer/screens/dashboard/DashboardRankingTable.test.tsx`를 추가해 탭 전환, PDF/Excel 내보내기 버튼, empty message 렌더링을 고정했다.
- `src/renderer/screens/dashboard/DashboardSummaryPanels.tsx`를 추가해 `DashboardScreen.tsx`의 metric card와 trend/site/ratio chart card 렌더링을 화면 밖으로 분리했다.
- `DashboardScreen.tsx`는 chart option과 metric card JSX를 직접 들고 있지 않고, 현재 `1635`줄에서 metric/report grid의 상태 조립과 export handler wiring만 유지한다.
- `src/renderer/screens/dashboard/DashboardSummaryPanels.test.tsx`를 추가해 metric card 표시와 trend/site/ratio chart export button wiring을 고정했다.
- `src/renderer/screens/dashboard/useDashboardFilterState.ts`를 추가해 `DashboardScreen.tsx`의 draft/applied filter state와 `applyDraftValueChange` 규칙을 hook으로 분리했다.
- `src/renderer/screens/dashboard/dashboard-export-actions.ts`를 추가해 `DashboardScreen.tsx`의 chart/report export async handler와 export format 판별을 action module로 분리했다.
- `DashboardScreen.tsx`는 현재 `1424`줄에서 filter/export 상태 wiring과 집계 계산만 유지한다.
- `src/renderer/screens/dashboard/useDashboardFilterState.test.tsx`, `dashboard-export-actions.test.ts`를 추가해 filter 변경 시 workflow 반영과 export success/missing bridge/action key 판별을 고정했다.
- `src/renderer/screens/dashboard/dashboard-records.ts`를 추가해 `DashboardScreen.tsx`의 샘플 데이터 생성, 실데이터/샘플 dataset selection, filter range 매칭, 샘플 fallback 월 보정 규칙을 별도 module로 분리했다.
- `DashboardScreen.tsx`는 현재 `1027`줄에서 dataset wiring, 집계 계산, chart/report section 조립만 유지한다.
- `src/renderer/screens/dashboard/dashboard-records.test.ts`를 추가해 샘플 데이터 전환, 실데이터 우선, 샘플 fallback 월 보정, record filter 매칭 규칙을 고정했다.
- `src/renderer/screens/dashboard/dashboard-selectors.ts`를 추가해 `DashboardScreen.tsx`의 이전 기간 집계, metric/trend/site/ratio/ranking selector, export용 filter summary 계산을 별도 module로 분리했다.
- `DashboardScreen.tsx`는 현재 `636`줄에서 real record 변환, workflow/filter wiring, export input 조립만 유지한다.
- `src/renderer/screens/dashboard/dashboard-selectors.test.ts`를 추가해 aggregate, metric change text, trend range, ranking selector, filter summary 규칙을 고정했다.
- `src/renderer/screens/dashboard/dashboard-export-selectors.ts`를 추가해 `DashboardScreen.tsx`의 chart export input, ranking export section, control-panel notice 조립을 별도 helper로 분리했다.
- `DashboardScreen.tsx`는 현재 `536`줄에서 workflow/filter wiring과 export handler 연결만 유지한다.
- `src/renderer/screens/dashboard/dashboard-export-selectors.test.ts`를 추가해 export model 조립과 notice 순서를 고정했다.
- `src/renderer/screens/site-management/SitePatternStepView.tsx`를 추가해 `SiteManagementScreen.tsx`의 `step1` stage header, summary grid, setup/simulation layout, footer action, preset modal 조립을 별도 상위 view component로 분리했다.
- `SiteManagementScreen.tsx`는 현재 `2417`줄에서 `step1`의 view-model 계산과 action wiring만 유지하고, 실제 화면 조립은 `SitePatternStepView.tsx`로 위임한다.
- `src/renderer/screens/site-management/SitePatternStepView.test.tsx`를 추가해 footer action과 preset modal wiring을 고정했다.
- `src/renderer/screens/site-management/site-management-selectors.ts`를 추가해 `SiteManagementScreen.tsx`의 rows, site-name option, detail summary, list summary, pattern preset 파생 계산을 별도 selector module로 분리했다.
- `SiteManagementScreen.tsx`는 현재 `2218`줄에서 list/detail 파생 계산의 `useMemo` 본문을 제거하고 selector 호출과 화면 action wiring만 유지한다.
- `src/renderer/screens/site-management/site-management-selectors.test.ts`를 추가해 active pattern 선택, list summary, detail summary, custom site-name option 규칙을 고정했다.
- `site-management-selectors.ts`에 `step2`용 assignment selector를 추가해 active team label, pending override 기반 board grouping, pool candidate filter, team column 조립을 별도 helper로 분리했다.
- `SiteManagementScreen.tsx`는 현재 `2182`줄에서 `step2` 보드 계산의 `useMemo` 본문을 줄이고 assignment action/validation wiring만 유지한다.
- `site-management-selectors.test.ts`는 pending assignment override, pool scope/keyword filter, capacity 반영 규칙까지 고정한다.
- `site-management-selectors.ts`는 `step1`용 cycle assignment, setup/editor 모델, simulation card/cell, pattern preset option helper까지 포함하도록 확장했다.
- `SiteManagementScreen.tsx`는 현재 `2119`줄에서 `step1`의 cycle assignment, editor fallback, simulation card/cell, preset option 조립을 selector module로 위임하고 action wiring만 유지한다.
- `site-management-selectors.test.ts`는 `step1` setup/simulation 모델과 preset option 조립 규칙까지 고정한다.
- `site-management-selectors.ts`는 `step1`용 cycle preview normalization과 simulation timeline helper까지 포함하도록 확장했다.
- `SiteManagementScreen.tsx`는 현재 `2040`줄에서 `cyclePreviews`, `simulationAnchorDate`, `simulationMonth` 계산을 selector module로 위임하고, holiday load와 step action wiring만 유지한다.
- `site-management-selectors.test.ts`는 cycle preview fallback과 simulation month timeline 규칙까지 고정한다.
- `src/renderer/screens/site-management/site-pattern-simulation.ts`를 추가해 `SiteManagementScreen.tsx`의 simulation holiday year 수집, holiday calendar merge, time-range working hour 계산, simulation cell/metric 조립을 별도 helper로 분리했다.
- `SiteManagementScreen.tsx`는 현재 `2082`줄에서 simulation holiday load, daily hours 계산, simulation cell/metric 조립을 `site-pattern-simulation.ts`로 위임하고 validation/save wiring만 유지한다.
- `src/renderer/screens/site-management/site-pattern-simulation.test.ts`를 추가해 holiday year dedupe, holiday calendar merge, overnight working hours, simulation cell/metric 규칙을 고정했다.
- `src/renderer/screens/site-management/site-management-actions.ts`를 추가해 `SiteManagementScreen.tsx`의 draft validation, cycle input 조립, saveSite/saveShiftPattern 저장 흐름을 별도 helper로 분리했다.
- `SiteManagementScreen.tsx`는 현재 `1939`줄에서 step1 저장 전 검증과 save payload 조립을 `site-management-actions.ts`로 위임하고, step2 assignment/complete action과 화면 wiring만 유지한다.
- `src/renderer/screens/site-management/site-management-actions.test.ts`를 추가해 validation, cycle input 조립, save payload, bridge failure 전파 규칙을 고정했다.
- `src/renderer/screens/site-management/site-management-step-two-actions.ts`를 추가해 `SiteManagementScreen.tsx`의 step2 assign/unassign/complete async 흐름을 별도 helper로 분리했다.
- `SiteManagementScreen.tsx`는 현재 `1723`줄에서 step2 employee lookup과 callback wiring만 유지하고, assignment confirm/save/close/complete 처리와 refresh/back navigation 흐름은 `site-management-step-two-actions.ts`로 위임한다.
- `src/renderer/screens/site-management/site-management-step-two-actions.test.ts`를 추가해 pending staging, saved-site assignment, assignment close guard, pending assignment completion 규칙을 고정했다.
- `site-management-selectors.ts`의 pending assignment 공유 타입은 `startDate`를 포함하도록 정리해 selector/action/screen 사이 계약을 통일했다.
- `src/renderer/screens/site-management/site-management-interaction-actions.ts`를 추가해 `SiteManagementScreen.tsx`의 pattern import/select/analyze/apply, detail open/close, registration 진입, delete confirm/delete async 흐름을 별도 helper로 분리했다.
- `SiteManagementScreen.tsx`는 현재 `1576`줄에서 pattern import/detail/list action wiring과 step state만 유지하고, 해당 상호작용의 bridge 호출과 상태 전이는 `site-management-interaction-actions.ts`로 위임한다.
- `src/renderer/screens/site-management/site-management-interaction-actions.test.ts`를 추가해 import modal reset, file select/analyze, import apply, detail->registration 진입, delete confirm/delete 규칙을 고정했다.
- `src/renderer/screens/site-management/useSiteManagementInteractionState.ts`를 추가해 detail/import modal state와 관련 reset effect를 별도 hook으로 분리했다.
- `SiteManagementScreen.tsx`는 현재 `1584`줄에서 detail/import state 선언과 `patternImportAnalysis` 변화에 따른 preview tab/copy status reset effect를 `useSiteManagementInteractionState.ts`로 위임한다.
- `src/renderer/screens/site-management/useSiteManagementInteractionState.test.tsx`를 추가해 import preview reset과 detail/delete state 묶음을 고정했다.
- `src/renderer/screens/site-management/useSiteManagementStepState.ts`를 추가해 `SiteManagementScreen.tsx`의 view, pool filter, assignment start date, pattern preset modal, simulation month state를 별도 hook으로 분리했다.
- `SiteManagementScreen.tsx`는 등록 화면 step state를 `useSiteManagementStepState.ts`로 위임하고, registration reset 시 preset/simulation/dragging team 상태만 공통 초기화한다.
- `src/renderer/screens/site-management/useSiteManagementStepState.test.tsx`를 추가해 기본 상태, preset modal open/close, registration view reset 규칙을 고정했다.
- `src/renderer/screens/site-management/site-management-step-one-actions.ts`를 추가해 `SiteManagementScreen.tsx`의 `step1` preset 적용, 입력 검토/적용, 다음 단계 전환 orchestration을 별도 action module로 분리했다.
- `SiteManagementScreen.tsx`는 현재 `1392`줄에서 `step1` 저장 후 단계 전환과 preset 적용을 `site-management-step-one-actions.ts`로 위임하고, 화면에서는 callback wiring만 유지한다.
- `src/renderer/screens/site-management/site-management-step-one-actions.test.ts`를 추가해 preset 적용 시 현재 근무지 식별값 보존, 신규 draft 검토, 기존 draft 저장 후 단계 전환 규칙을 고정했다.
- `src/renderer/components/DashboardShell.test.tsx`를 추가해 `planner`/`reviewer` role에서 숨겨진 route fallback과 메뉴 노출 규칙을 고정했다.
- `artifacts/scripts/electron-operations-user-smoke.cjs`는 관리자 계정으로 `planner`/`reviewer` 사용자를 만든 뒤 각 계정으로 재로그인해 `배포`와 `실적 승인` action 노출까지 검증하도록 확장됐다.
- `npm run typecheck`는 통과했다.
- `npm run build`, `npm run smoke:electron:operations-user`까지 통과했다.
- `npm run test` 전체 재실행까지 통과했고 현재 기준 테스트는 `107` files / `428` tests다.

## 초기 관찰
- 문서 기준은 이미 정리되어 있지만, 구현 중심 유지보수 문서는 아직 부족하다.
- `src/main/services` 비중이 높고, renderer 다음 초점은 `SiteManagementScreen.tsx`의 drag auto-scroll/navigation helper 정리와 유지보수 문서 정식화다.
- 인증은 운영 사용자 저장소 + 설치별 bootstrap credential 구조로 이관됐고, 첫 로그인 비밀번호 변경 강제, bootstrap file per-user retire, `8시간 만료 + 인증 access renewal`까지 들어갔다. dependency audit은 `0 vulnerabilities`까지 정리됐고, 역할 정책은 `src/shared/domain/authorization.ts` 기준 `admin / planner / reviewer / operator` 4단계로 고정됐다. 세션 정책은 runtime-only로 확정됐으며 `AppHealth`, 로그인 화면, 내 정보 모달에 `재시작 시 다시 로그인` 기준이 노출된다. `employees/sites/shift-patterns/monthly-schedules` 쓰기와 배포는 `planner`, `performance/allowance` 승인 계열은 `reviewer`, `operations/access-history`는 `admin`으로 분리됐고, `SiteManagement` step1/step2 footer action도 기준정보 수정 권한 기준으로 맞췄다. packaged/installer smoke뿐 아니라 `operations-user` smoke도 planner/reviewer 메뉴와 action-level 권한까지 검증한다. 운영 문서와 수동 QA 템플릿도 현재 role 정책으로 정리됐으므로, 다음 보안 검토는 실제 운영 환경 sign-off 기록과 `Patch Set D` 마감 중심이다.
- Access/PowerShell 기반 복원 흐름은 패키징과 런타임 의존성이 크다.

