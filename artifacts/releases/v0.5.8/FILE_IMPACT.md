# v0.5.8 파일 영향

## 인력·시급

- `src/main/services/employee-history-service.ts`
- `src/main/services/employee-storage-service.ts`
- `src/renderer/screens/WorkforceManagementScreen.tsx`
- `src/renderer/screens/workforce/`
- `src/shared/domain/employee-dates.ts`

## 실적 승인·저장

- `src/main/services/app-settings-storage-service.ts`
- `src/main/services/performance-file-intake-service.ts`
- `src/main/services/performance-file-storage-service.ts`
- `src/main/services/performance-management-service.ts`
- `src/main/services/performance-approval-flow-service.ts`

## DB·브리지·근무표

- `src/main/services/sqlite-storage-service.ts`
- `src/main/services/database-migration-service.ts`
- `src/main/ipc/register-workforce-handlers.ts`
- `src/preload/index.ts`
- `src/shared/bridge/contracts.ts`
- `src/shared/domain/model.ts`
- `src/shared/domain/monthly-schedule-draft.ts`
- `src/renderer/screens/ScheduleManagementScreen.tsx`

## 설치·문서·검증

- `build/installer-update-data.ps1`
- `artifacts/scripts/capture-wage-bulk-modal.cjs`
- `docs/`
- 관련 `*.test.ts`, `*.test.tsx`
