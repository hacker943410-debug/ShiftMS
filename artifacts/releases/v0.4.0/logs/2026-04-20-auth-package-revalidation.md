# 2026-04-20 Auth / Package Revalidation

## 배경
- 인증 bootstrap 기본값을 `admin / 1234` 기준으로 정리하고, 비밀번호 변경/내 정보 흐름을 renderer와 Electron smoke에 맞춰 재검증했다.
- 공통 로그인 helper를 `artifacts/scripts/electron-auth-helpers.cjs`로 통합한 뒤 남아 있던 `operations-user`, `installer` smoke도 동일 경로로 맞췄다.

## 코드 정리
- `electron-operations-user-smoke.cjs`
  - 중복 로그인/비밀번호 변경 로직을 제거하고 공통 helper를 사용하도록 정리했다.
- `electron-installer-smoke.cjs`
  - 공통 helper를 사용하도록 정리했다.
  - NSIS silent installer가 첫 설치 전에 대상 폴더가 미리 존재하면 non-zero로 종료되는 환경이 있어, `install-root` 선생성을 제거했다.

## 검증 기록
- `npm run typecheck`
  - 통과
- `npm run test -- src/main/services/auth-password-service.test.ts src/renderer/components/PasswordChangeScreen.test.tsx src/renderer/components/DashboardShell.test.tsx src/renderer/components/LoginScreen.test.tsx src/main/services/auth-bootstrap-service.test.ts src/main/services/auth-service.test.ts src/main/services/operations-storage-service.test.ts`
  - 통과 (`7 files / 42 tests`)
- `npm run smoke:electron`
  - 통과
- `npm run smoke:electron:packaged`
  - 초기 실행은 stale `release/win-unpacked` 산출물 기준이라 로그인 stage timeout 발생
  - `npm run package:dir` 후 재실행하여 통과
- `npm run package:win`
  - 통과 (`release/ShiftMgmt-Setup-0.4.0-x64.exe` 재생성)
- `npm run smoke:electron:installer`
  - 수정 후 통과 (`reinstall=verified`)

## 현재 상태
- 자동 검증 기준으로 auth/bootstrap, unpacked, installer 경로 모두 최신 코드 기준 재검증 완료
- 남은 릴리즈 blocker는 운영 데이터 수동 QA와 복구 절차 확인뿐이다.
