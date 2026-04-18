# v0.4.0 결과 보고

## 상태
- 핵심 자동 검증 완료
- installer 재검증은 로컬 Windows Application Control 정책으로 차단
- 운영 데이터 기준 수동 QA / sign-off 대기

## 구현 결과
- 양식 관리:
  - 문서 종류별 semantic zone / style spec / canvas snapshot 구조를 도입했다.
  - 선택 영역 속성 패널, 고급 모드 셀 선택, 병합 범위 편집, 행/열 빠른 직접 조절을 workbook 출력까지 연결했다.
  - 근무표, 품의서, 별첨1, 별첨2 실제 출력 경로가 새 편집기 구조를 사용하도록 정리했다.
- 운영 화면 / 복구:
  - 대시보드 `기간 직접 지정`을 앱 공통 월 선택 팝오버로 교체했다.
  - 운영 관리 가이드에 `사이트 명 관리` 흐름을 추가했다.
  - DB 복구는 JSON 백업(`.json`)과 Access DB(`.accdb`)를 함께 지원하도록 확장했다.
- 인증 / 보안 / 세션:
  - 하드코딩 비밀번호를 제거하고 `password_hash` 기반 인증으로 전환했다.
  - seeded 기본 계정은 첫 로그인 시 비밀번호 변경을 강제하고, 완료된 bootstrap entry는 retire되도록 정리했다.
  - 로그인 실패는 `5회 실패 시 15분 잠금` 정책으로 제한했다.
  - 세션은 `8시간 runtime-only`로 유지하고 앱 재시작 후 자동 복원을 허용하지 않는다.
  - Electron `BrowserWindow`를 `sandbox: true` 기준으로 정리했다.
  - `npm audit --audit-level=high` 기준 취약점 `0건` 상태를 맞췄다.
- 권한 / 역할:
  - 역할 체계를 `admin / planner / reviewer / operator` 4단계로 정리했다.
  - route-level / action-level 권한을 shared authorization source로 통합했다.
  - planner / reviewer 메뉴 및 버튼 노출 회귀를 renderer 테스트와 Electron smoke로 고정했다.
- 패키징 / 운영 문서:
  - `ShiftMgmt-Setup-0.4.0-x64.exe` 설치본을 생성하고 packaged smoke를 재검증했다.
  - installer smoke는 실행을 시도했지만, 이 개발 PC에서는 Windows Application Control 정책 때문에 silent installer 실행이 차단됐다.
  - operations-user smoke는 bootstrap 관리자 로그인, 첫 비밀번호 변경, planner / reviewer 권한 확인까지 포함하도록 확장했다.
  - 운영자 / 사용자 / 기능 / 유지보수 / 릴리즈 문서를 현재 정책 기준으로 갱신했다.

## 최종 자동 검증
- `npm run typecheck`
- `npm test` (`107 files / 428 tests`)
- `npm run build`
- `npm run smoke:electron:operations-user`
- `npm run smoke:electron:packaged`
- `npm audit --audit-level=high` (`0 vulnerabilities`)
- `npm run smoke:electron:installer` - 로컬 Windows Application Control 정책 때문에 silent installer 실행 차단

## 배포 산출물
- 설치 파일: `release/ShiftMgmt-Setup-0.4.0-x64.exe`
- Unpacked 실행 파일: `release/win-unpacked/ShiftMgmt.exe`
- Block map: `release/ShiftMgmt-Setup-0.4.0-x64.exe.blockmap`

## 남은 release blocker
- `docs/operations-manual-qa-checklist.md` 기준 운영 데이터 수동 QA가 아직 실행되지 않았다.
- `npm run smoke:electron:installer` 를 릴리즈 대상 PC에서 다시 확인해야 한다.
- JSON 백업과 Access DB 복구를 각각 실제 운영 절차로 한 번씩 검증해야 한다.
- planner / reviewer / operator 실제 계정 기준 수동 sign-off 기록이 남아 있지 않다.

## 후속 개선 백로그
- 저장된 profile / validation JSON migration 정리
- 양식 관리 glossary / help 추가 여부 결정

