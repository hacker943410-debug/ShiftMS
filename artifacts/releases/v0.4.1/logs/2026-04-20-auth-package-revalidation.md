# 2026-04-20 Auth / Package Revalidation

## 배경
- `0.4.0` 누적 변경을 `release/0.4.1` 브랜치와 `0.4.1` 설치본 기준으로 승격했다.
- 이번 재검증은 인증 bootstrap / 비밀번호 정책 변경과 설치본 패키징 결과가 함께 맞는지 확인하는 목적이다.

## 변경 요약
- 관리자 bootstrap 기본 비밀번호를 `1234`로 고정하고, 추가 계정 bootstrap 비밀번호는 credentials 파일 기반으로 유지하도록 정리했다.
- 공통 비밀번호 정책을 shared 설정으로 분리하고, 첫 로그인 / 내 정보 / 운영 관리 사용자 비밀번호 입력을 같은 기준으로 맞췄다.
- `PasswordChangeForm`을 도입해 첫 로그인 비밀번호 변경과 `내 정보` 비밀번호 변경 흐름을 공통화했다.
- Electron smoke 인증 로직을 `electron-auth-helpers.cjs`로 통합하고 installer 재설치 경로 이슈를 정리했다.

## 검증 기록
- `npm run release:check`
  - 통과
- `node scripts/validate-structure.mjs`
  - 통과
- `npm run smoke:electron:operations-user`
  - 통과
- `npm run release:signoff`
  - 통과
  - 포함 결과:
    - `npm run typecheck`
    - `npm run test` (`108 files / 436 tests`)
    - `npm run package:win`
    - `npm run smoke:electron:packaged`
    - `npm run smoke:electron:installer` (`reinstall=verified`)
    - `npm audit --audit-level=high` (`0 vulnerabilities`)

## 산출물
- 설치 파일: `release/ShiftMgmt-Setup-0.4.1-x64.exe`
- unpacked 실행 파일: `release/win-unpacked/ShiftMgmt.exe`
- sign-off 로그: `artifacts/releases/v0.4.1/logs/release-signoff-2026-04-20T08-00-14-672Z.md`

## 현재 상태
- 코드 / 패키징 기준 blocker는 없다.
- 남은 릴리즈 blocker는 운영 데이터 기준 수동 QA와 복구 절차 확인뿐이다.
