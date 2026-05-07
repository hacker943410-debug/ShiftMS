# v0.4.10 파일 영향 범위

## Main
- `src/main/services/performance-file-intake-service.ts`: 월별 스캔, 변경 없는 파일 재사용, 진행 상태, 파싱 오류 이슈 반환
- `src/main/services/performance-management-service.ts`: overview 조회 시 진행률 표시 옵션과 sync issue 전달
- `src/main/ipc/register-performance-handlers.ts`: 실적 동기화 상태 조회 IPC 추가
- `src/main/services/file-watch-runtime-service.ts`: 변경된 동기화 API 호출 형태 반영

## Preload / Shared
- `src/preload/index.ts`: `getPerformanceSyncState` bridge 추가
- `src/shared/bridge/contracts.ts`: bridge 계약 추가
- `src/shared/domain/performance-file.ts`: sync issue 및 sync state 타입 추가

## Renderer
- `src/renderer/screens/PerformanceManagementScreen.tsx`: 파싱 진행률 모달과 규격 오류 모달 표시
- `src/renderer/styles.css`: 진행률 모달 스타일 추가

## Scripts / Packaging
- `scripts/issue-account-recovery-key.mjs`: 기존 설치본 복구키 발급 스크립트
- `scripts/issue-account-recovery-key.cmd`: Windows 실행용 배치 파일
- `package.json`: 0.4.10 버전 및 설치 리소스 포함

## Tests
- `src/main/services/performance-file-intake-service.test.ts`
- `src/main/services/performance-queue-service.test.ts`
- `src/main/services/account-recovery-maintenance-script.test.ts`
