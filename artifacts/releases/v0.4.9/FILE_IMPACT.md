# v0.4.9 파일 영향 범위

## Main / Preload / Shared
- `src/main/services/account-recovery-service.ts`: 계정복구 핵심 서비스 추가
- `src/main/services/sqlite-storage-service.ts`: `app_users` 복구키 컬럼 추가
- `src/main/services/auth-password-service.ts`: 비밀번호 외 secret 해시 유틸 추가
- `src/main/ipc/register-core-handlers.ts`: 로그인 전 복구 IPC 추가
- `src/main/ipc/register-operations-handlers.ts`: 복구키 발급 IPC 추가
- `src/preload/index.ts`: renderer bridge 노출
- `src/shared/bridge/contracts.ts`: 계정복구 타입/브리지 계약 추가
- `src/shared/domain/access-log.ts`: 계정복구 활동 이력 액션 추가

## Renderer
- `src/renderer/App.tsx`: 복구 가능 여부 조회와 복구 실행 연결
- `src/renderer/components/LoginScreen.tsx`: 계정복구 버튼/모달 추가
- `src/renderer/screens/operations-management/OperationsUserSection.tsx`: 복구키 발급 UI 추가
- `src/renderer/screens/ShiftPatternManagementScreen.tsx`: 운영 관리 복구키 발급 핸들러 연결
- `src/renderer/styles.css`: 복구 모달 최소 스타일 추가

## Scripts / Tests
- `scripts/reset-admin-password.mjs`: 유지보수용 admin 재설정 스크립트 추가
- 관련 서비스/UI 테스트 추가 및 보강

