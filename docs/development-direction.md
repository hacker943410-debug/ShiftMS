# 개발 방향

## 기준 문서
- 기능 기준: `../shftMgmgt설계_V3.4.md`
- 화면 기준: `../디자인샘플소스/화면설계.md`
- 시각 기준: `../디자인샘플소스/디자인지시서.md`

## 제품 목표
- 본사 운영자가 사이트별 교대근무 현황을 한 화면에서 확인한다.
- 근무표 배포, 실적 승인, 수당 계산, 품의서 생성까지 한 흐름으로 연결한다.
- Electron 로컬 앱 특성에 맞게 파일 접근과 감시는 main/preload에서만 처리한다.

## 현재 리뉴얼 방향
1. 메뉴 구조는 설계 원문 기준 7개 메뉴로 고정한다.
2. 화면 레이아웃은 `화면설계.md`의 라이트 모드 운영 콘솔을 그대로 따른다.
3. 렌더러는 설계 흐름을 우선 완성하고, 실제 저장/연동은 도메인 서비스와 IPC 계약에 맞춰 단계적으로 연결한다.
4. 계산 규칙은 UI에 하드코딩하지 않고 `src/shared/domain`에서 유지한다.
5. Excel 생성, 파일 감시, 승인 저장, 공휴일 동기화는 Electron main 서비스로 분리한다.

## 우선 구현 범위
- 대시보드: 월간 요약 카드, 차트, 우선 확인 항목
- 인력 관리: 목록, 상세, 변경 이력, 등록/수정 흐름
- 근무지 관리: 패턴 등록, 시뮬레이션, 조직 구성
- 근무표 배포: 달력 뷰, 경로 설정, 배포 액션
- 실적 관리: 승인대기 목록, 계산 규칙 안내, 승인 액션
- 수당 관리: 근무지별 집계, 상세 테이블, 품의 신청
- 운영 관리: 공휴일, 요율, 사용자, 양식 관리

## 다음 단계
1. 운영 관리 공휴일/요율/양식 탭을 실데이터 기준으로 수동 검증하고 `operations-manual-qa-checklist.md` 에 기록한다.
2. 수동 QA 결과를 `release-readiness-summary.md`, 릴리즈 노트, 알려진 이슈에 반영해 최종 문구를 마감한다.
3. 위 조건이 충족되면 `release/0.1.0` 브랜치를 분기하고 배포 직전 검토를 다시 수행한다.

## 2026-03-23 기준 메모
- 실적 관리의 재승인 흐름, 재승인 확정, Pool 대체근무 제외 규칙이 현재 운영 기준선으로 정리됐다.
- 수당 관리는 선지급, 품의/별첨 Excel·PDF 출력, 상세 근거 UI까지 현재 요구 범위를 반영했다.
- `npm run test`, `npm run typecheck`, `npm run build`, `node scripts/validate-structure.mjs` 가 현재 기준으로 모두 통과한다.
- 우선순위 1~3 범위는 오늘 기준으로 마감했고, 다음 작업은 운영 관리 CRUD/동기화, 대시보드 polish, Electron smoke 실행 환경 정리 순으로 이어간다.
- 운영 관리 사용자 탭은 2026-03-24 기준으로 신규 등록까지 포함한 CRUD 흐름을 갖췄고, 다음 남은 일은 메뉴별 수동 검증과 polish 정리다.
- `playwright` 기반 Electron smoke와 `release-check` 스크립트를 추가했고, `npm run smoke:electron` 과 `npm run release:check` 가 현재 기준으로 통과한다.
- 대시보드는 production 빌드에서 실데이터가 없을 때 empty state를 우선하고, dev 빌드에서만 샘플 fallback을 유지한다.
- 배포 도구는 `electron-builder` 로 확정했고, 공식 릴리즈 산출물은 NSIS 설치본, 내부 검수용 산출물은 unpacked 앱 폴더로 정리했다.
- `npm run package:dir`, `npm run package:win` 을 실행해 `release/win-unpacked`, `release/ShiftMgmt-Setup-0.1.0-x64.exe` 생성까지 확인했다.
- `npm run release:verify-package` 를 추가했고, NSIS 설치본 설치/실행과 unpacked 앱 실행 smoke까지 현재 기준으로 통과했다.
- 운영자용 빠른 시작 문서와 Phase 6 릴리즈 sign-off 체크리스트 문서를 추가했다.
- 운영 관리의 공휴일/요율/양식 탭은 2026-03-24 기준으로 요약 카드, 상태 카드, 양식 종류별 묶음 UI까지 정리해 운영자 관점의 읽기 흐름을 개선했다.
- `artifacts/scripts/electron-operations-config-smoke.cjs` 를 추가해 공휴일/요율/양식 탭을 Electron 기준으로 다시 확인할 수 있게 했다.
- `scripts/generate-windows-icon.ps1` 로 임시 릴리즈 아이콘을 생성하고 `build/icon.ico` 를 패키징 기준 리소스로 연결했다.
- `docs/known-issues.md`, `docs/release-notes-draft-0.1.0.md` 를 추가해 릴리즈 직전 참고 문서를 정리했다.
- `docs/operations-manual-qa-checklist.md` 를 추가해 운영 관리 실데이터 수동 검증 기준을 따로 정리했다.
- `npm run test`, `npm run release:verify-package` 를 2026-03-24 기준으로 다시 통과시켰고, 현재 릴리즈 준비 현황은 `docs/release-readiness-summary.md` 에 따로 정리한다.
- Access 원본 `DT사업1팀_교대근무관리DB.accdb` 는 현재 PC에서 직접 조회 가능하며, `docs/access-accdb-mapping.md` 에 앱 도메인 매핑과 import 우선순위를 정리했다.
- `scripts/export-access-db.ps1` 는 원본 잠금 영향을 줄이기 위해 임시 복사본을 만들어 읽도록 보강했다.
- `artifacts/scripts/electron-access-import-poc.cjs` 와 `npm run import:access:poc` 를 추가해 `공휴일 + 연장근로요율 + 사업조직현황` 기준정보를 임시 SQLite 저장소로 가져오는 Electron bridge PoC 경로를 마련했다.
- `artifacts/scripts/electron-access-workforce-import-poc.cjs` 와 `npm run import:access:workforce:poc` 를 추가해 `사업조직별근무자현황 + 근무자별시급관리` 를 임시 SQLite 저장소로 가져오는 PoC 를 마련했다.
- 인력 PoC 는 `None_*`, `공석`, `TBD`, 무사번 행을 제외하고, 중복 배정은 `기본` 그룹 우선 규칙으로 85명 / 활성 시급 83건을 반영하는 기준으로 정리했다.
- `src/shared/domain/shift-pattern-compression.ts` 를 추가해 Access `사업조직별패턴` 의 압축 문자열 문법(`주*2`, `(야휴)*7`, `주/석/야/휴`, `1/2/3/휴`)을 현재 앱과 import 준비 코드에서 공용으로 해석할 수 있게 했다.
- 근무지 관리 화면은 이제 압축 문자열을 그대로 입력해도 preview, validation, step 생성, 저장이 같은 파서 기준으로 동작한다.
- `artifacts/scripts/electron-access-pattern-import-poc.cjs` 와 `npm run import:access:pattern:poc` 를 추가해 `사업조직현황 + 사업조직별패턴` 을 임시 SQLite 저장소의 `shift_patterns` 구조로 가져오는 3차 PoC 를 마련했다.
- 3차 PoC 는 14개 패턴 대상 중 11개를 저장/재조회까지 검증했고, `보라매NOC` 는 2-cycle 패턴으로 반영됐다. `SKB동작국사` 는 `사업조직별패턴` 의 5조3교대 정의를 우선 적용하도록 보정했고, 남은 skip 은 `대전DC`, `대전NOC`, `울산CLX` 3건뿐이다.
- `artifacts/scripts/access-duty-release-analysis.cjs` 와 `npm run analyze:access:duty-release` 를 추가해 `직무해제자현황` 의 자동 매칭 가능성을 분석했다.
- `직무해제일자` 는 `retireDate` 가 아니라 `employee_site_assignments.end_date` 로만 반영하기로 기준을 확정했다.
- `artifacts/scripts/electron-access-duty-release-import-poc.cjs` 와 `npm run import:access:duty-release:poc` 를 추가해 `직무해제자현황` 을 임시 SQLite 저장소의 배정 종료 이력으로 반영하고 Electron bridge 로 재검증하는 4차 PoC 를 마련했다.
- 4차 PoC 실행 결과는 성공했고, 자동 종료 6건 / skip 6건 / unmatched 7건으로 정리됐다. `SKB동작국사` 와 `판교DC` 일부 건은 반영됐고, 중복 해제 행과 배정 시작일 이전 해제 행은 skip 리포트로 남겼다.
- 남은 패턴 skip 3건(`대전DC`, `대전NOC`, `울산CLX`)은 `사업조직현황` 원본 부재로 시간 슬롯 정의가 없고, `사업조직별근로시간관리` 는 월평균 시간만 있어 자동 복원 근거로는 부족하다.
- 운영 관리 `경로 설정` 에 `마이그레이션 파일 경로` 와 우측 상단 `DB업데이트` 액션을 추가해 Access `.accdb` 또는 백업 JSON `.json` 기준으로 현재 SQLite DB를 temp DB swap 방식으로 교체할 수 있게 했다.
- `DB업데이트` 는 현재 경로 설정을 유지한 채 DB를 교체하고, Access 기준 복원은 `공휴일/요율/근무지/인력/시급/패턴/배정 종료일` 과 `사업조직별근무실적` 기반 승인/수당 기본 이력까지 반영한다. 양식 이력은 포함하지 않는다.
- `artifacts/scripts/electron-operations-migration-smoke.cjs` 를 추가해 JSON 백업 기준 `DB업데이트` UI 흐름을 Electron smoke 로 검증할 수 있게 했고, `smoke:electron` 과 `release:check` 범위에 포함했다.
- `npm run test`, `npm run typecheck`, `npm run smoke:electron`, `npm run release:verify-package`, `node scripts/validate-structure.mjs` 를 2026-03-24 기준으로 다시 통과시켰고, 현재 남은 릴리즈 blocker 는 운영 관리 실데이터 수동 QA 기록뿐이다.
- Access 실적 이관은 현재 앱 구조에 맞춰 synthetic file 기반으로 변환하며, 2026-03-24 임시 DB 검증 기준으로 실적 258건, 승인 257건, 수당 257건까지 반영된다.
- 실제 검수 DB에도 `DT사업1팀_교대근무관리DB.accdb` 기준 `DB업데이트` 를 한 번 실행했고, 실행 전 원본 SQLite 백업을 남긴 뒤 근무지 14건, 인력 85명, 패턴 11건, 실적 엔트리 317건, 승인 257건, 수당 257건 반영까지 sanity check 를 마쳤다.
- 운영 관리 `DB업데이트` 는 이제 바로 실행하지 않고, 현재 DB 현황과 업데이트 후 예상 현황을 먼저 비교하는 미리보기 모달을 띄운 뒤 `승인` 시 실제 교체를 수행한다.
- `DB업데이트` 모달은 실행 결과와 최종 DB 상태를 같은 화면에서 다시 보여주고, Playwright 확인 기준으로 내부 본문 스크롤과 비교 테이블 열 정렬을 보정했다.
- 근무지 관리 테이블의 패턴 문자열은 15자를 넘으면 `...` 으로 축약하고 전체 값은 툴팁으로 확인하도록 정리했다.
