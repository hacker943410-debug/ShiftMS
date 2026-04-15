# v0.3.2 결과 보고

## 상태
- 진행 중

## 구현 결과
- Patch Set A: 양식 프로필을 문서 종류별로 분리하고 semantic zone/style spec 기반 구조를 추가했다.
- Patch Set B: workbook 기반 canvas snapshot과 도식형 미리보기 편집기를 연결했다.
- Patch Set C 1차: 선택 영역 속성 패널, 기준 복원, 최근 변경 되돌리기를 추가했다.
- Patch Set C 2차: 고급 모드에서 선택 영역 셀을 직접 눌러 대표 위치를 바꿀 수 있는 셀 그리드 오버레이를 추가했다.
- Patch Set C 3차: 선택 영역별 병합 범위를 직접 입력하고 도식/출력에 동시에 반영하는 UI를 추가했다.
- Patch Set C 4차: 고급 모드 안에서 열 너비/행 높이를 즉시 증감·복원하는 빠른 직접 조절 UI를 추가했다.
- Patch Set D 1차: style spec을 근무표/품의서/별첨1/별첨2 실제 workbook 출력에 반영했다.
- Patch Set D 2차: 운영 관리 가이드의 양식 관리 시뮬레이션과 운영 참고 문서를 새 편집기 흐름 기준으로 갱신했다.
- 2026-04-14 후속 보강: 대시보드 `기간 직접 지정`의 `시작 월`, `종료 월`을 앱 공통 팝오버 톤의 월 선택 컨트롤로 교체했다.
- 2026-04-14 후속 보강: 운영 관리 가이드에 `사이트 명 관리` 페이지와 시뮬레이션 장면을 추가했다.
- 2026-04-14 문서 정리: v0.3.2 릴리즈 아카이브 인덱스, 패치노트, TODO, QA, 작업 로그를 현재 진행 상태 기준으로 갱신했다.
- 2026-04-14 패키징: package 버전을 `0.3.2`로 맞추고 `release/ShiftMgmt-Setup-0.3.2-x64.exe` NSIS 설치 파일을 생성했다.
- 2026-04-14 패키징: 설치본은 Electron/Node 런타임을 포함하므로 운영 PC에서 Node.js 또는 npm을 별도로 설치하지 않아도 된다.
- 2026-04-16 DB 복구 패치: DB 복구 파일 선택과 preview/update 흐름에서 JSON 백업(`.json`)뿐 아니라 Access DB(`.accdb`)도 허용하도록 main/renderer 검증을 확장했다.
- 2026-04-16 DB 복구 패치: 공용 복구 소스 타입 헬퍼와 테스트를 추가하고, 운영 문서/가이드/QA 체크리스트를 Access 복구 기준으로 갱신했다.
- 2026-04-16 패키징 보강: NSIS 설치본 smoke를 같은 설치 경로 재설치까지 검증하도록 확장해 기존 설치 덮어쓰기 시나리오를 자동 확인할 수 있게 했다.
- 통합 smoke: 양식 import -> save -> approve -> preview -> export 흐름을 서비스 테스트로 고정했다.

## 검증 결과
- `npm run typecheck`
- `npm test -- template-management-workflow template-editor document-template-preview-service schedule-plan-export-service allowance-document-export-service document-template-canvas-service document-template-management-service operations-storage-service allowance-proposal-approval-service`
- `npm run build:renderer`
- `npm run typecheck` (2026-04-14 후속 보강)
- `node scripts/validate-structure.mjs` (2026-04-14 후속 보강)
- `npm run build:renderer` (2026-04-14 후속 보강)
- `npm run test -- database-migration-service database-migration` (2026-04-16 DB 복구 Access 지원 패치)
- `npm run build:electron` (2026-04-16 DB 복구 Access 지원 패치)
- Access preview smoke (`양식샘플/DT사업1팀_교대근무관리DB.accdb`, 2026-04-16)
- `npm run smoke:electron:installer` same-path reinstall overwrite 검증 (2026-04-16 패키징 보강)
- `npm run test` (2026-04-14 패키징 전 전체 회귀)
- `npm run build` (2026-04-14 패키징 전 빌드)
- `npm run release:check` (2026-04-14 패키징 전 release check)
- `node scripts/validate-structure.mjs` (2026-04-14 패키징 전 구조 검증)
- `npm run smoke:electron:packaged` (2026-04-14 packaged 실행 검증)
- `npm run smoke:electron:installer` (2026-04-14 silent 설치 후 실행 검증)

## 배포 산출물
- 설치 파일: `release/ShiftMgmt-Setup-0.3.2-x64.exe`
- Block map: `release/ShiftMgmt-Setup-0.3.2-x64.exe.blockmap`
- Unpacked 실행 파일: `release/win-unpacked/ShiftMgmt.exe`
- 설치 파일 크기: `108,893,852 bytes`
- SHA256: `D0655598B6464AA61EFD7440DB08BBF97CAD2B87C9C603B2D43A1FA7317A88C3`

## 남은 이슈
- 저장된 profile/validation JSON migration 마감과 승인/기본 사용 전환 회귀 확인이 남아 있다.
- 수동 QA 절차를 실제 운영 데이터 기준으로 한 번 더 돌려야 한다.
- DB 복구 수동 QA에서 JSON 백업과 Access DB를 각각 한 번씩 실제 운영 절차로 검증해야 한다.
