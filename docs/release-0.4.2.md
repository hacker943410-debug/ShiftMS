# 0.4.2 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-04-21`
- 현재 작업 브랜치: `release/0.4.2`
- 대상 버전: `0.4.2`
- 현재 단계: NSIS 설치본 생성 완료, 운영 데이터 수동 QA / packaged·installer smoke / 최종 sign-off 대기
- 연계 문서:
  - `docs/operations-manual-qa-checklist.md`
  - `docs/patch-notes.md`
  - `artifacts/releases/v0.4.2/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.2/SIGN_OFF_TEMPLATE.md`
  - `artifacts/releases/v0.4.2/logs/2026-04-21-release-package.log`

## 제품 개요
교대근무관리시스템 V0.4.2는 `0.4.1` 설치본 기준선을 유지하면서, 근무지 관리에서 cycle 패턴 문자열을 수정했을 때 입력한 원문 표현이 다시 열기 시 보존되지 않던 문제를 정리한 hotfix 릴리즈다. 이번 버전은 cycle별 원문 패턴 문자열을 SQLite에 함께 저장하도록 변경했고, 그 변경을 포함한 `0.4.2` Windows NSIS 설치본을 다시 생성했다.

## 이번 릴리즈 핵심 변경

### 1. 근무지 패턴 문자열 저장 보강
- cycle 패턴 저장 시 `steps`와 `pattern_code` 외에 사용자가 입력한 원문 `patternString`을 함께 저장하도록 변경했다.
- 수정 화면 재진입 시 DB에 저장된 cycle 원문 패턴 문자열을 우선 사용하도록 조정했다.
- 기존처럼 저장 후 다시 열었을 때 재조합 문자열만 보여서 신규 문자열이 저장되지 않은 것처럼 보이던 현상을 제거했다.

### 2. 저장소 스키마와 표시 경로 정리
- `shift_pattern_cycles`에 `pattern_string` 컬럼을 추가했다.
- renderer 저장 payload, main 저장소 매핑, selector 표시 우선순위를 같은 기준으로 맞췄다.
- 관련 회귀 테스트를 추가해 cycle별 원문 문자열이 저장/재조회되는 흐름을 고정했다.

### 3. 0.4.2 설치본 재패키징
- `package.json` 버전을 `0.4.2`로 올렸다.
- `npm run release:package`를 통해 build와 NSIS 패키징을 다시 실행했다.
- `ShiftMgmt-Setup-0.4.2-x64.exe`와 block map, `win-unpacked` 산출물을 `release/` 아래 생성했다.

## 자동 검증 현황
- 마지막 자동 검증 재확인일: `2026-04-21`
- 현재 기준 자동 회귀: `108 files / 437 tests`
- 통과한 명령:
  - `npm run typecheck`
  - `npm run test`
  - `node scripts/validate-structure.mjs`
  - `npm run release:package`
- 참고:
  - `npm run release:package`는 `release:check`와 `package:win`을 포함한다.
  - 이번 턴에서는 `smoke:electron:packaged`, `smoke:electron:installer`, `release:signoff`는 재실행하지 않았다.

## 현재 릴리즈 판단
- 코드 상태: 패키징 가능
- 패키징 상태: `0.4.2` 설치본 생성 완료
- 남은 blocker:
  - 운영 데이터 기준 수동 QA
  - packaged / installer smoke 재실행
  - 최종 sign-off 기록

## 배포 산출물 기준
- 설치 파일: `release/ShiftMgmt-Setup-0.4.2-x64.exe`
- unpacked 실행 파일: `release/win-unpacked/ShiftMgmt.exe`
- block map: `release/ShiftMgmt-Setup-0.4.2-x64.exe.blockmap`
- 패키징 로그: `artifacts/releases/v0.4.2/logs/2026-04-21-release-package.log`

## 최종 sign-off

### 실행 정보
| 항목 | 값 |
|---|---|
| 실행 상태 | 패키징 완료, 수동 QA / smoke / sign-off 대기 |
| 확인 일시 | `2026-04-21` |
| 확인자 | Codex |
| 대상 설치본 | `ShiftMgmt-Setup-0.4.2-x64.exe` / `ShiftMgmt.exe` |
| 결론 | 수동 QA와 smoke 재확인 후 sign-off 가능 |

### 필수 명령
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `node scripts/validate-structure.mjs`
- [x] `npm run release:package`
- [x] `artifacts/releases/v0.4.2/logs/2026-04-21-release-package.log`
- [ ] `npm run smoke:electron:packaged`
- [ ] `npm run smoke:electron:installer`
- [ ] `artifacts/releases/v0.4.2/SIGN_OFF_TEMPLATE.md` 릴리즈 PC 수동 QA / 최종 승인 기록
