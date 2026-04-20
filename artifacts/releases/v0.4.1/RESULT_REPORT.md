# v0.4.1 결과 보고

## 상태
- 핵심 자동 검증 완료
- `npm run release:check`, `node scripts/validate-structure.mjs`, `npm run smoke:electron:operations-user` 통과
- `npm run release:signoff` 통과 (`release-signoff-2026-04-20T08-00-14-672Z.md`)
- `ShiftMgmt-Setup-0.4.1-x64.exe` 설치본 생성 완료
- 운영 데이터 기준 수동 QA / sign-off 대기

## 구현 결과
- 인증 / 보안 / 세션:
  - 관리자 bootstrap 기본 비밀번호를 `1234`로 고정하고, 추가 계정 bootstrap 비밀번호는 파일 기반으로 유지하도록 정리했다.
  - 공통 비밀번호 정책을 `src/shared/config/auth-password-policy.ts`로 분리해 첫 로그인, 내 정보, 운영 관리 사용자 비밀번호 입력을 같은 기준으로 맞췄다.
  - `PasswordChangeForm`을 도입해 첫 로그인 비밀번호 변경과 `내 정보 > 비밀번호 변경` 흐름을 공통화했다.
  - 로그인 실패 잠금, `8시간 runtime-only` 세션, `password_hash` 기반 인증은 그대로 유지된다.
- 운영 관리 / 사용자 관리:
  - 운영 관리 사용자 비밀번호는 강한 비밀번호 정책을 만족해야만 저장되도록 강화했다.
  - 로그인 화면은 관리자 기본 비밀번호와 추가 계정 bootstrap credentials 파일 안내 문구를 현재 기준으로 정리했다.
- 패키징 / 문서:
  - Electron smoke 인증 로직을 `electron-auth-helpers.cjs`로 통합했다.
  - installer smoke에서 사전 설치 폴더가 있을 때 non-zero 종료되던 경로를 정리했다.
  - 운영/기술/릴리즈 문서와 `v0.4.1` 아카이브를 현재 패키징 결과 기준으로 갱신했다.
  - `0.4.0` 누적 기능과 `근무지 등록` hotfix는 그대로 포함한 채 `0.4.1` 설치본으로 승격했다.

## 최종 자동 검증
- `npm run release:check`
- `node scripts/validate-structure.mjs`
- `npm run typecheck`
- `npm run test` (`108 files / 436 tests`)
- `npm run smoke:electron:operations-user`
- `npm run release:signoff` (`artifacts/releases/v0.4.1/logs/release-signoff-2026-04-20T08-00-14-672Z.md`)
- `npm audit --audit-level=high` (`0 vulnerabilities`)
- 인증 관련 targeted test 7종 (`42 tests`)
- `artifacts/releases/v0.4.1/logs/2026-04-20-auth-package-revalidation.md`

## 배포 산출물
- 설치 파일: `release/ShiftMgmt-Setup-0.4.1-x64.exe`
- Unpacked 실행 파일: `release/win-unpacked/ShiftMgmt.exe`
- Block map: `release/ShiftMgmt-Setup-0.4.1-x64.exe.blockmap`
- 최신 sign-off 로그: `artifacts/releases/v0.4.1/logs/release-signoff-2026-04-20T08-00-14-672Z.md`

## 남은 release blocker
- `docs/operations-manual-qa-checklist.md` 기준 운영 데이터 수동 QA가 아직 실행되지 않았다.
- JSON 백업과 Access DB 복구를 각각 실제 운영 절차로 한 번씩 검증해야 한다.
- planner / reviewer / operator 실제 계정 기준 수동 sign-off 기록이 남아 있지 않다.

## 후속 개선 백로그
- 저장된 profile / validation JSON migration 정리
- 양식 관리 glossary / help 추가 여부 결정
