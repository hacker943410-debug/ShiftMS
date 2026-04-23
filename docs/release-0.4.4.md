# 0.4.4 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-04-23`
- 현재 작업 브랜치: `release/0.4.4`
- 대상 버전: `0.4.4`
- 현재 단계: NSIS 설치본 생성 완료, 직접 설치 테스트 / smoke / 최종 sign-off 대기
- 연계 문서:
  - `docs/operations-manual-qa-checklist.md`
  - `docs/patch-notes.md`
  - `artifacts/releases/v0.4.4/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.4/SIGN_OFF_TEMPLATE.md`
  - `artifacts/releases/v0.4.4/logs/2026-04-23-release-package.log`

## 제품 개요
교대근무관리시스템 `0.4.4`는 `0.4.3` 기준선 위에서 Access 복원 진단, 기본 Excel 양식 fallback, 품의서 출력의 등록 사이트 명 표기를 보강한 안정화 릴리즈다. 이번 버전은 설치본 환경과 커스텀 양식 환경에서 복원/출력 실패 원인을 더 잘 드러내고, 실제 운영자가 가장 자주 보는 품의서 사이트 표기를 일관되게 맞추는 데 초점을 맞췄다.

## 이번 릴리즈 핵심 변경

### 1. Access 복원 진단/복원 흐름 보강
- PowerShell export 실패 시 원인 문구를 세분화해 PowerShell 실행, 테이블 불일치, DB open 실패, 경로 문제를 구분해 안내한다.
- Access 복원 미리보기/실행 경로에서 사용자가 복원할 테이블을 선택/해제할 수 있게 유지한다.

### 2. 기본 Excel 양식 fallback 정리
- 설치본 `extraResources`에 기본 양식 Excel 파일을 포함한다.
- 품의서/별첨/근무표 출력은 등록 양식이 없거나 기본 시드 양식을 참조할 때 내부 기본 양식을 안전하게 찾는다.

### 3. 품의서 사이트명 표기 수정
- 품의서 수당 입력부에서 근무지명 좌측에 등록된 사이트 명이 비는 문제를 수정했다.
- 수정분 품의서는 파일명뿐 아니라 프로필 필드 배치도 함께 보고 판별한다.
- 등록된 근무지명과 수당 결과의 근무지명이 공백/구분자 차이만 있는 경우에도 사이트 명을 찾아 출력한다.
- legacy 출력 경로도 좌측 사이트 명을 유지하도록 보정했다.

## 자동 검증 현황
- 실행한 명령:
  - `npm run typecheck`
  - `npm test -- src/main/services/allowance-document-export-service.test.ts`
  - `npm run release:package`
- 이번 턴에서는 사용자 요청 기준으로 packaged / installer smoke는 생략했다.

## 배포 산출물 기준
- 설치 파일: `release/ShiftMgmt-Setup-0.4.4-x64.exe`
- unpacked 실행 파일: `release/win-unpacked/ShiftMgmt.exe`
- block map: `release/ShiftMgmt-Setup-0.4.4-x64.exe.blockmap`
- 패키징 로그: `artifacts/releases/v0.4.4/logs/2026-04-23-release-package.log`

## 최종 sign-off

### 실행 정보
| 항목 | 값 |
|---|---|
| 실행 상태 | 패키징 완료, 직접 설치 테스트 / smoke / sign-off 대기 |
| 확인 일시 | `2026-04-23` |
| 확인자 | Codex |
| 대상 설치본 | `ShiftMgmt-Setup-0.4.4-x64.exe` / `ShiftMgmt.exe` |
| 결론 | 직접 설치 테스트 후 sign-off 가능 |

### 필수 명령
- [x] `npm run typecheck`
- [x] `npm test -- src/main/services/allowance-document-export-service.test.ts`
- [x] `npm run release:package`
- [ ] 직접 설치 테스트
- [ ] `npm run smoke:electron:packaged`
- [ ] `npm run smoke:electron:installer`
- [ ] `artifacts/releases/v0.4.4/SIGN_OFF_TEMPLATE.md` 기록
