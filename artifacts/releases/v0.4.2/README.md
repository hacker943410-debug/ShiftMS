# v0.4.2 작업 폴더

## 목적
- 이 폴더는 `0.4.2` hotfix 패키징, 근무지 패턴 문자열 저장 보강, 자동 검증 결과, 최종 sign-off 준비 상태를 한 위치에서 관리한다.

## 현재 상태
- 기준일: `2026-04-21`
- 성격: `0.4.1` 기준선 유지 + 근무지 패턴 문자열 저장 hotfix + `0.4.2` 설치본 재패키징
- 상태: NSIS 설치본 생성 완료, 운영 데이터 수동 QA / packaged·installer smoke / 최종 sign-off 대기
- 최신 자동 회귀 기준: `108 files / 437 tests`

## 문서 구성
- `COMPACT_CONTEXT.md`: 이번 버전 목표와 범위를 압축 정리한다.
- `IMPLEMENTATION_ANALYSIS.md`: 변경 구조와 제약을 정리한다.
- `FILE_IMPACT.md`: 영향 파일 범위를 정리한다.
- `FUNCTIONAL_SPEC.md`: 릴리즈 범위와 사용자 흐름을 정리한다.
- `TODO.md`: 남은 blocker와 후속 작업을 정리한다.
- `QA_CHECKLIST.md`: 자동/수동 검증 기준이다.
- `RESULT_REPORT.md`: 결과와 잔여 이슈를 기록한다.
- `SIGN_OFF_TEMPLATE.md`: 릴리즈 PC 기준 수동 QA / 최종 승인 기록 템플릿이다.
- `SCENARIO_TEST_PLAN.md`: 빈 DB와 패키징 설치본 기준 확인 시나리오를 정리한다.
- `logs/`: 패키징 및 sign-off 로그를 보관한다.
- `screenshots/`: 설치본 및 수동 QA 스크린샷을 보관한다.

## 이번 버전 요약
- 근무지 관리에서 cycle 패턴 문자열을 수정할 때 입력한 원문 표현이 다시 열기 시 유지되지 않던 문제를 수정했다.
- `shift_pattern_cycles.pattern_string` 컬럼을 추가해 cycle 원문 패턴 문자열을 함께 저장하도록 변경했다.
- renderer 저장 payload, main 저장소 매핑, selector 표시 우선순위를 같은 기준으로 정리했다.
- 관련 저장소 / selector 테스트를 보강한 뒤 `ShiftMgmt-Setup-0.4.2-x64.exe` 설치본을 생성했다.

## 주요 산출물
- 설치 파일: `release/ShiftMgmt-Setup-0.4.2-x64.exe`
- Unpacked 실행 파일: `release/win-unpacked/ShiftMgmt.exe`
- Block map: `release/ShiftMgmt-Setup-0.4.2-x64.exe.blockmap`
- 패키징 로그: `logs/2026-04-21-release-package.log`

## 남은 release blocker
- `npm run smoke:electron:packaged`
- `npm run smoke:electron:installer`
- 운영 데이터 기준 수동 QA
- 최종 sign-off 기록
