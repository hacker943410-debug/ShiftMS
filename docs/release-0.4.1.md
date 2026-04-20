# 0.4.1 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-04-20`
- 현재 작업 브랜치: `release/0.4.1`
- 대상 버전: `0.4.1`
- 현재 단계: installer 포함 자동 sign-off 및 설치본 생성 완료, 운영 데이터 기준 수동 QA / 최종 승인 대기
- 연계 문서:
  - `docs/operations-manual-qa-checklist.md`
  - `artifacts/releases/v0.4.1/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.1/SIGN_OFF_TEMPLATE.md`
  - `artifacts/releases/v0.4.1/logs/release-signoff-2026-04-20T08-00-14-672Z.md`
  - `artifacts/releases/v0.4.1/logs/2026-04-20-auth-package-revalidation.md`

## 제품 개요
교대근무관리시스템 V0.4.1은 `0.4.0` 누적 기능을 유지한 채 인증 bootstrap / 비밀번호 정책과 설치본 패키징 기준을 마감한 릴리즈다. 현재 코드는 관리자 bootstrap 기본 비밀번호 `1234`, 공통 비밀번호 정책, `내 정보` 비밀번호 변경, 역할별 auth smoke 공통화까지 반영한 상태이며, 코드/패키징 수준 blocker 없이 운영 데이터 기준 수동 QA와 최종 sign-off만 남아 있다.

## 이번 릴리즈 핵심 변경

### 1. 인증 / 비밀번호 정책 정리
- 관리자 bootstrap 기본 비밀번호를 `1234`로 고정하고, 추가 계정 bootstrap 비밀번호는 credentials 파일 기반으로 유지한다.
- 강한 비밀번호 정책을 shared 설정으로 분리해 첫 로그인 비밀번호 변경과 운영 관리 사용자 비밀번호 입력을 같은 기준으로 통일했다.
- `PasswordChangeForm`을 도입해 첫 로그인과 `내 정보 > 비밀번호 변경` 흐름을 공통화했다.
- 로그인 실패 잠금, `8시간 runtime-only` 세션, `password_hash` 기반 인증 구조는 그대로 유지된다.

### 2. 운영 관리 / 역할 흐름 보강
- 운영 관리 사용자 비밀번호는 정책을 만족해야만 저장되도록 강화했다.
- 로그인 화면은 관리자 기본 비밀번호와 추가 계정 bootstrap credentials 파일 안내를 현재 기준으로 노출한다.
- `admin / planner / reviewer / operator` 4단계 권한 구조와 `근무지 등록` hotfix가 `0.4.1` 설치본에 포함된다.

### 3. 설치본 / smoke / 문서 정리
- Electron smoke 인증 로직을 `electron-auth-helpers.cjs`로 통합했다.
- installer smoke에서 사전 설치 폴더가 있을 때 발생하던 non-zero 종료 이슈를 제거했다.
- `ShiftMgmt-Setup-0.4.1-x64.exe` 설치본과 block map, 최신 sign-off 로그를 다시 생성했다.
- 활성 릴리즈 문서와 `artifacts/releases/v0.4.1/` 아카이브를 현재 검증 결과 기준으로 갱신했다.

## 자동 검증 현황
- 마지막 자동 검증 재확인일: `2026-04-20`
- 현재 기준 자동 회귀: `108 files / 436 tests`
- 통과한 명령:
  - `npm run release:check`
  - `node scripts/validate-structure.mjs`
  - `npm run typecheck`
  - `npm run test`
  - `npm run smoke:electron:operations-user`
  - `npm run release:signoff`
  - `npm audit --audit-level=high`
- 추가 재검증:
  - 인증 관련 targeted test 7종 (`42 tests`)
  - `artifacts/releases/v0.4.1/logs/2026-04-20-auth-package-revalidation.md`
- 참고:
  - `npm run release:signoff` 는 `package:win`, packaged smoke, installer smoke, audit까지 포함한다.
  - installer smoke는 fresh install과 same-path reinstall을 모두 통과했다.
  - packaged / installer / operations-user smoke는 bootstrap 로그인과 권한 분리 흐름까지 포함한다.

## 현재 릴리즈 판단
- 코드 상태: 릴리즈 가능 수준
- 패키징 상태: `0.4.1` 설치본 생성 완료
- 남은 blocker:
  - 운영 데이터 기준 수동 QA
  - JSON / Access 복구 절차 실검증
  - planner / reviewer / operator 실제 계정 권한 확인
- 최종 판단 기준:
  - `docs/operations-manual-qa-checklist.md`
  - `artifacts/releases/v0.4.1/SIGN_OFF_TEMPLATE.md`

## 알려진 운영 제한
1. 세션은 `8시간` runtime-only이며 앱 재시작 후 자동 복원되지 않는다.
2. bootstrap 기본 계정은 첫 로그인 직후 비밀번호를 바꾸기 전까지 운영 화면으로 진입할 수 없다.
3. JSON 백업과 Access `.accdb` 복구는 실제 운영 절차 기준 수동 QA가 남아 있다.
4. 저장된 profile / validation JSON migration 정리는 후속 개선 항목으로 남아 있다.

## 배포 산출물 기준
- 설치 파일: `release/ShiftMgmt-Setup-0.4.1-x64.exe`
- unpacked 실행 파일: `release/win-unpacked/ShiftMgmt.exe`
- block map: `release/ShiftMgmt-Setup-0.4.1-x64.exe.blockmap`
- 설치본 전제: Electron / Node 런타임 포함, 운영 PC에 별도 Node.js 설치 불필요

## 최종 sign-off

### 실행 정보
| 항목 | 값 |
|---|---|
| 실행 상태 | installer 포함 자동 sign-off 완료, 수동 QA 대기 |
| 확인 일시 | `2026-04-20` |
| 확인자 | Codex |
| 대상 설치본 | `ShiftMgmt-Setup-0.4.1-x64.exe` / `ShiftMgmt.exe` |
| 결론 | 운영 데이터 수동 QA 후 sign-off 가능 |

### 필수 명령
- [x] `npm run release:check`
- [x] `node scripts/validate-structure.mjs`
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run smoke:electron:operations-user`
- [x] `npm run release:signoff`
- [x] `npm audit --audit-level=high`
- [x] `artifacts/releases/v0.4.1/logs/release-signoff-2026-04-20T08-00-14-672Z.md`
- [x] `artifacts/releases/v0.4.1/logs/2026-04-20-auth-package-revalidation.md`
- [ ] `docs/operations-manual-qa-checklist.md` 기준 수동 QA
- [ ] `artifacts/releases/v0.4.1/SIGN_OFF_TEMPLATE.md` 릴리즈 PC 수동 QA / 최종 승인 기록

## 최종 판정
- 릴리즈 가능 여부: 조건부 가능
- 현재 blocker: 운영 데이터 수동 QA 미실행
- 후속 확인 필요 항목:
  - JSON / Access 복구 실데이터 검증
  - planner / reviewer / operator 실제 계정 권한 수동 검증
  - sign-off 기록 저장
