# v0.4.1 작업 폴더

## 목적
- 이 폴더는 `0.4.1` 패키징, 인증/비밀번호 정책 정리, 자동 검증, sign-off 기록을 한 위치에서 관리한다.

## 현재 상태
- 기준일: `2026-04-20`
- 성격: `0.4.0` 누적 변경 승격 + 인증/비밀번호 정책 정리 + `0.4.1` 설치본 패키징
- 상태: installer 포함 자동 sign-off 완료, 운영 데이터 기준 수동 QA / 최종 승인 대기
- 최신 자동 회귀 기준: `108 files / 436 tests`

## 문서 구성
- `COMPACT_CONTEXT.md`: 이번 버전 목표와 범위를 압축 정리한다.
- `IMPLEMENTATION_ANALYSIS.md`: 현재 구조와 제약을 정리한다.
- `FILE_IMPACT.md`: 영향 파일 범위를 정리한다.
- `FUNCTIONAL_SPEC.md`: 릴리즈 범위와 사용자 흐름을 정리한다.
- `TODO.md`: 남은 blocker와 후속 개선을 정리한다.
- `QA_CHECKLIST.md`: 자동/수동 검증 기준이다.
- `RESULT_REPORT.md`: 결과와 잔여 이슈를 기록한다.
- `SIGN_OFF_TEMPLATE.md`: 실제 수동 QA와 최종 승인 기록이다.
- `logs/`: sign-off 및 재검증 로그를 보관한다.
- `SCENARIO_TEST_PLAN.md`: 빈 DB 기준 운영 시나리오 테스트 계획이다.

## 이번 버전 요약
- 관리자 bootstrap 기본 비밀번호를 `1234`로 고정하고, 추가 계정 bootstrap 비밀번호는 파일 기반으로 유지하도록 정리했다.
- 공통 비밀번호 정책을 shared 설정으로 분리하고, 첫 로그인 / 내 정보 / 운영 관리 사용자 비밀번호 입력을 같은 정책으로 맞췄다.
- `내 정보` 모달에서 비밀번호를 바로 변경할 수 있도록 공통 `PasswordChangeForm`과 피드백 흐름을 추가했다.
- Electron smoke 인증 로직을 `electron-auth-helpers.cjs`로 통합하고 installer smoke의 재설치 경로 이슈를 정리했다.
- `ShiftMgmt-Setup-0.4.1-x64.exe` 설치본과 `release-signoff-2026-04-20T08-00-14-672Z.md` 로그를 생성했다.
- 남은 release blocker는 운영 데이터 수동 QA와 최종 sign-off 기록뿐이다.
