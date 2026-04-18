# 0.4.0 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-04-18`
- 현재 작업 브랜치: `release/0.4.0`
- 대상 버전: `0.4.0`
- 현재 단계: installer 포함 자동 sign-off 완료, 운영 데이터 기준 수동 QA / 최종 승인 대기
- 연계 문서:
  - `docs/operations-manual-qa-checklist.md`
  - `artifacts/releases/v0.4.0/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.0/SIGN_OFF_TEMPLATE.md`
  - `artifacts/releases/v0.4.0/logs/release-signoff-*.md`

## 제품 개요
교대근무관리시스템 V0.4.0은 양식 관리 도식형 편집 전환을 중심으로 시작했지만, 현재 기준 릴리즈 범위는 설치본 패키징, DB 복구 Access 지원, 인증/세션/권한 하드닝, 역할 분리, 운영 문서 정리까지 포함한다. 현재 코드는 installer 포함 자동 sign-off가 끝난 release candidate 수준까지 올라와 있고, 남은 일은 운영 데이터 기준 수동 QA와 최종 sign-off 기록이다. 최신 자동 검증 결과는 `SIGN_OFF_TEMPLATE.md`와 `logs/release-signoff-2026-04-18T02-42-38-397Z.md`에 반영돼 있다.

## 이번 릴리즈 핵심 변경

### 1. 양식 관리와 출력 경로 정리
- 양식 관리를 `셀 좌표 보정` 중심에서 `문서 영역 도식 미리보기 + 속성 패널` 중심으로 전환했다.
- 근무표, 품의서, 별첨1, 별첨2에 semantic zone, style spec, canvas snapshot 구조를 적용했다.
- 선택 영역 속성 편집, 고급 모드 셀 선택, 병합 범위 편집, 행/열 빠른 직접 조절을 workbook 출력 경로까지 연결했다.
- DB 복구는 JSON 백업(`.json`)과 Access DB(`.accdb`)를 함께 지원하도록 확장했다.

### 2. 인증 / 보안 / 세션 하드닝
- 하드코딩 비밀번호를 제거하고 `password_hash` 기반 인증으로 전환했다.
- seeded 기본 계정은 첫 로그인 시 비밀번호를 바꾸기 전까지 운영 IPC가 차단된다.
- 첫 비밀번호 변경이 끝난 bootstrap entry는 retire되어 재발급되지 않는다.
- 로그인 실패는 `5회 실패 시 15분 잠금` 정책으로 제한된다.
- 세션은 `8시간` runtime-only로 유지되고, 앱 재시작 후 자동 복원되지 않는다.
- Electron `BrowserWindow`는 `sandbox: true` 기준으로 정리했다.
- `npm audit --audit-level=high` 기준 취약점 `0건` 상태를 맞췄다.

### 3. 역할 분리와 권한 가드
- 역할 체계는 `admin / planner / reviewer / operator` 4단계로 정리했다.
- route-level 권한과 action-level 권한을 shared authorization source로 통합했다.
- `planner`는 기준정보 쓰기와 배포, `reviewer`는 승인, `admin`은 운영 관리와 접근 이력까지 담당한다.
- planner / reviewer UI fallback, 관리자 전용 메뉴 숨김, 실제 Electron role smoke까지 반영했다.

### 4. 설치본 / 운영 문서 / 회귀 검증
- `0.4.0` 설치본과 unpacked 앱을 다시 생성했다.
- packaged 실행은 재검증했다.
- installer smoke는 `npm run release:signoff` 실행에서 fresh install과 same-path reinstall까지 통과했다.
- operations-user smoke는 admin / planner / reviewer 계정 생성과 권한별 행동 노출까지 확인한다.
- 운영자 / 사용자 / 기능 / 유지보수 문서를 현재 역할 정책과 세션 정책 기준으로 정리했다.

## 자동 검증 현황
- 마지막 자동 검증 재확인일: `2026-04-18`
- 현재 기준 자동 회귀: `107 files / 428 tests`
- 통과한 명령:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm run smoke:electron:operations-user`
  - `npm run smoke:electron:packaged`
  - `npm run smoke:electron:installer`
  - `npm audit --audit-level=high`
  - 릴리즈 PC 권장 실행기: `npm run release:signoff`
- 참고:
  - `npm test`는 `107 files / 428 tests` 기준 통과했다.
  - `npm audit --audit-level=high` 결과는 `0 vulnerabilities`다.
  - `npm run smoke:electron:installer` 는 `2026-04-18` `release:signoff` 실행에서 `reinstall=verified`로 통과했다.
  - sign-off 로그는 `artifacts/releases/v0.4.0/logs/release-signoff-2026-04-18T02-42-38-397Z.md` 에 남겼다.
  - packaged smoke는 bootstrap 관리자 첫 로그인과 비밀번호 변경 흐름까지 확인한다.
  - operations-user smoke는 planner / reviewer 권한 분리까지 실제 Electron에서 확인한다.

## 현재 릴리즈 판단
- 코드 상태: 릴리즈 후보 수준
- 자동 회귀: installer 포함 sign-off 완료
- 남은 blocker: 운영 데이터 기준 수동 QA, sign-off 최종 승인 기록
- 최종 판단 기준:
  - `docs/operations-manual-qa-checklist.md`
  - `artifacts/releases/v0.4.0/SIGN_OFF_TEMPLATE.md`

## 알려진 운영 제한
1. 세션은 `8시간` runtime-only이며 앱 재시작 후 자동 복원되지 않는다.
2. seeded 기본 계정은 첫 로그인 직후 비밀번호를 바꾸기 전까지 운영 화면으로 진입할 수 없다.
3. DB 복구 수동 QA에서 JSON 백업과 Access `.accdb`를 각각 실제 운영 절차로 한 번씩 확인해야 한다.
4. 저장된 profile / validation JSON migration 정리는 후속 개선 항목으로 남아 있다.

## 배포 산출물 기준
- 설치 파일: `release/ShiftMgmt-Setup-0.4.0-x64.exe`
- unpacked 실행 파일: `release/win-unpacked/ShiftMgmt.exe`
- 설치본 전제: Electron / Node 런타임 포함, 운영 PC에 별도 Node.js 설치 불필요

## 최종 sign-off

### 실행 정보
| 항목 | 값 |
|---|---|
| 실행 상태 | installer 포함 자동 sign-off 완료, 수동 QA 대기 |
| 확인 일시 | `2026-04-18` |
| 확인자 | Codex |
| 대상 설치본 | `ShiftMgmt-Setup-0.4.0-x64.exe` / `ShiftMgmt.exe` |
| 결론 | 운영 데이터 수동 QA 후 sign-off 가능 |

### 필수 명령
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run smoke:electron:operations-user`
- [x] `npm run smoke:electron:packaged`
- [x] `npm run smoke:electron:installer`
- [x] `npm run release:signoff`
- [x] `npm audit --audit-level=high`
- [ ] `docs/operations-manual-qa-checklist.md` 기준 수동 QA
- [x] `artifacts/releases/v0.4.0/SIGN_OFF_TEMPLATE.md` 로컬 자동 검증 / blocker 초안 기록
- [x] `artifacts/releases/v0.4.0/logs/release-signoff-2026-04-18T02-42-38-397Z.md` 최신 실행 로그 확보
- [ ] `artifacts/releases/v0.4.0/SIGN_OFF_TEMPLATE.md` 릴리즈 PC 수동 QA / 최종 승인 기록

## 최종 판정
- 릴리즈 가능 여부: 조건부 가능
- 현재 blocker: 운영 데이터 수동 QA 미실행
- 후속 확인 필요 항목:
  - JSON / Access 복구 실데이터 검증
  - planner / reviewer / operator 실제 계정 권한 수동 검증
  - sign-off 기록 저장

