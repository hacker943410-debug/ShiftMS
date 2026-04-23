# v0.4.3 작업 폴더

## 목적
- 이 폴더는 `0.4.3` 패치 패키징, 조별 Index UI 정리, Access 실적 복원 보정, 직접 설치 테스트 준비 상태를 함께 관리한다.

## 현재 상태
- 기준일: `2026-04-21`
- 성격: `0.4.2` 기준선 유지 + 근무지 등록 1단계 UI 정리 + Access 실적 복원 규칙 보강 + `0.4.3` 설치본 패키징
- 상태: NSIS 설치본 생성 완료, 직접 설치 테스트 / smoke / 최종 sign-off 대기

## 문서 구성
- `COMPACT_CONTEXT.md`: 이번 버전 목표와 범위를 압축 정리한다.
- `IMPLEMENTATION_ANALYSIS.md`: 변경 구조와 제약을 정리한다.
- `FILE_IMPACT.md`: 영향 파일 범위를 정리한다.
- `FUNCTIONAL_SPEC.md`: 릴리즈 범위와 사용자 흐름을 정리한다.
- `TODO.md`: 남은 blocker와 후속 작업을 정리한다.
- `QA_CHECKLIST.md`: 직접 설치 테스트 기준을 정리한다.
- `RESULT_REPORT.md`: 결과와 잔여 이슈를 기록한다.
- `SIGN_OFF_TEMPLATE.md`: 최종 승인 기록 템플릿이다.
- `logs/`: 패키징 로그를 보관한다.
- `screenshots/`: 직접 테스트 스크린샷을 보관한다.

## 주요 산출물
- 설치 파일: `release/ShiftMgmt-Setup-0.4.3-x64.exe`
- Unpacked 실행 파일: `release/win-unpacked/ShiftMgmt.exe`
- Block map: `release/ShiftMgmt-Setup-0.4.3-x64.exe.blockmap`
- 패키징 로그: `logs/2026-04-21-release-package.log`
