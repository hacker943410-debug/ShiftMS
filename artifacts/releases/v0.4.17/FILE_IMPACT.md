# v0.4.17 File Impact

## 버전 및 문서
- `package.json`
- `package-lock.json`
- `artifacts/releases/v0.4.17/**`
- `artifacts/releases/README.md`
- `docs/README.md`

## Main 및 저장소 서비스
- `src/main/services/app-update-service.ts`
- `src/main/services/allowance-document-export-service.ts`
- `src/main/services/document-template-style-apply-service.ts`
- `src/main/services/monthly-schedule-storage-service.ts`
- `src/main/services/database-replacement-service.ts`
- `src/main/services/sqlite-storage-service.ts`
- `src/main/services/app-settings-service.ts`
- `src/main/services/app-settings-storage-service.ts`
- `src/main/services/file-watch-service.ts`

## Renderer
- `src/renderer/App.tsx`
- `src/renderer/components/AppUpdateModal.tsx`
- `src/renderer/components/ErrorBoundary.tsx`
- `src/renderer/components/DashboardShell.tsx`
- `src/renderer/screens/ScheduleManagementScreen.tsx`
- `src/renderer/screens/ShiftPatternManagementScreen.tsx`
- `src/renderer/screens/operations-management/OperationsRateSection.tsx`
- `src/renderer/screens/operations-management/OperationsSettingsSection.tsx`
- `src/renderer/screens/site-management/site-management-actions.ts`
- `src/renderer/screens/workforce/workforce-list-selectors.ts`
- `src/renderer/styles.css`

## Shared
- `src/shared/bridge/contracts.ts`
- `src/shared/domain/allowance-service.ts`
- `src/shared/domain/schedule-rule-warning.ts`
- `src/shared/domain/allowance-rate-impact.ts`
- `src/shared/domain/shift-pattern-compression.test.ts`

## 테스트
- 문서 출력 병합 셀, DB 복구, 월 근무표 저장, 운영 설정, 근무표 경고, 요율 영향, 근무지 패턴, 인력관리 집계 회귀 테스트를 추가 또는 보강했다.
- 수당 최종 1회 올림, 승인 재조회 시나리오, 품의 승인 후 Excel 출력, 시작 업데이트 알림 테스트를 추가 또는 보강했다.

## 제외
- Electron navigation/window-open/CSP 제한 관련 main process 보안 변경은 적용하지 않았다.
- 인증 bootstrap 정책 변경은 적용하지 않았다.
