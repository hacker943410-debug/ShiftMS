# 패치노트

## 관리 기준
- 최신 패치를 맨 위에 누적 기록한다.
- 각 패치에는 버전, 날짜, 핵심 변경, 검증 결과를 함께 남긴다.
- 릴리즈 전 최종 판단은 최신 릴리즈 문서와 함께 본다.
- 버전별 상세 작업 문서와 결과 보고는 `artifacts/releases/README.md` 및 각 버전 폴더에서 관리한다.

## V0.4.19
- 기준일: `2026-06-11`
- 성격: 근무지 패턴 시간 저장 안정화, 품의서 Excel 병합 오류 진단 강화
- 현재 상태: 구현 및 자동 검증 완료. 패키징, GitHub Release 공개 게시 진행 중

### 핵심 변경
- 근무지 수정 화면에서 저장된 step 등장 순서가 아니라 canonical 근무 슬롯 기준으로 1근, 2근, 3근 시간을 표시한다.
- 보라매DC처럼 `A,C,B` 순서로 저장된 패턴도 `1근 09:00-15:00`, `2근 15:00-21:00`, `3근 21:00-09:00` 순서로 유지한다.
- 슬롯별 휴게시간을 보존해 야간 휴게시간이 주간/석간 값으로 덮이지 않게 했다.
- 품의서 Excel 고객사 요약 병합 전 기존 병합을 넓은 범위로 정리한다.
- Excel 병합 실패 시 문서, 기능, 처리 구간, 시도 범위, 기존 병합 범위를 포함한 진단 메시지를 제공한다.

### 검증
- `npm run test -- src/shared/domain/shift-pattern-compression.test.ts src/renderer/screens/site-management/site-management-selectors.test.ts src/renderer/screens/site-management/site-management-actions.test.ts src/renderer/screens/site-management/site-pattern-simulation.test.ts`
- `npm run test -- src/main/services/allowance-document-export-service.test.ts`
- `npm run typecheck`
- `npm run test`

## V0.4.18
- 기준일: `2026-06-10`
- 성격: 품의승인 Excel 자동 출력 복구
- 현재 상태: 구현, 자동 검증, 패키징, GitHub Release 공개 게시 완료. 수동 QA sign-off 전

### 핵심 변경
- 최종 품의승인 요청의 출력 형식을 `pdf` 고정에서 `xlsx`로 변경했다.
- 품의승인 완료 안내 문구를 Excel 문서 출력 기준으로 정리했다.
- 품의 승인 미리보기 제목의 PDF 한정 표현을 문서 출력 공통 표현으로 바꿨다.
- 별도 PDF 출력과 Excel 출력 버튼의 기존 문서 출력 경로는 유지했다.

### 검증
- `npx vitest run src/main/services/allowance-document-export-service.test.ts src/main/services/allowance-proposal-approval-service.test.ts src/renderer/screens/allowance-management/allowance-management-review-actions.test.ts src/renderer/screens/allowance-management/allowance-management-modal-actions.test.ts --maxWorkers=1 --minWorkers=1`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `node scripts/validate-structure.mjs`
- `npm run release:check`
- `npm run release:publish`
- `npm run smoke:electron:packaged`
- `npm run smoke:electron:installer`

## V0.4.14
- 기준일: `2026-05-21`
- 성격: 인력관리 목록/연락처/직급/고용형태 정리, 삭제 근무지 인력 제외 안내, 2026-04 품의서/별첨1 양식 반영, 별첨1 시급 표기, 수당 올림, 품의서 체크박스/대상자 카운트/로고/폰트/총합계 테두리 보정
- 현재 상태: 구현, 자동 검증, 패키징, GitHub Release 공개 게시 완료. 수동 QA sign-off 전

### 핵심 변경
- 인력관리 상단 필터를 한 줄 toolbar로 정리하고 이름/연락처 검색을 우측에 배치했다.
- 인력관리 목록에 하단 페이지게이트와 페이지당 `10 / 20 / 50`명 선택을 추가했다.
- 직원 연락처를 신규 등록, 프로필 수정, DB 저장, 검색에 반영했다.
- 직원 직급을 `사원 / 대리 / 과장 / 차장 / 부장` 선택값으로 추가하고 DB, 신규 등록, 프로필 수정, 검색에 반영했다.
- SQLite `employees.rank`, `performance_entries.employee_rank`, `allowance_calculations.employee_rank` 컬럼을 추가해 승인/수당 산출 시점의 직급 스냅샷을 보존한다.
- Access DB 직접 확인 결과 `사업조직별근무자현황`에는 직급 컬럼이 없으므로, `사업조직별근무실적.직급명`을 사원번호 기준으로 현재 직급 선택값에 정규화해 이관한다.
- 고용형태는 `정규 / 계약 / BP`로 통일하고 파견/용역 계열은 계약으로 정규화했다.
- 삭제된 근무지에 배정된 인력은 인력관리 목록과 집계에서 제외하고 내부 모달로 대상 목록을 확인할 수 있게 했다.
- 인력관리 테이블 정렬은 근무지명, 조이름, 사원번호 오름차순으로 고정했다.
- 별첨1 Excel 선택값 없는 수당/시간/요율 칸은 `-`가 아닌 Blank로 출력한다.
- 별첨1 Excel 시급 셀은 숫자값을 유지하고 `#,##0.00원` 표시 형식을 적용한다.
- 별첨1 PDF 시급은 `15,000.00원`처럼 소수점 둘째 자리까지 표시한다.
- 수당 계산은 `시급 * 요율 * 근로시간` 결과에 원 단위 올림을 적용한다.
- 기본 품의서/별첨1 양식을 `품의서_2026-04_수정본.xlsx`, `별첨1_2026-04_수정본.xlsx`로 갱신한다.
- 품의서 Excel 최상단은 `☑ 품의`, `☐ 보고` 체크박스 표기로 출력한다.
- 품의서 Excel의 `당월 지급 대상자` 수는 일반 지급과 퇴사자 조기 지급 대상자를 모두 포함한다.
- 품의서 Excel 최상단 로고를 배경 제거 로고로 교체하고 `A1:C1` 범위에 맞춰 배치한다.
- 품의서 Excel 작성자/전화번호, `총 합계`, 총합계 금액 폰트색을 검정색으로 출력한다.
- 품의서 Excel 총합계 행 `B30:H30` 테두리를 두 번째 굵기인 `medium`으로 출력한다.
- 품의서 Excel 퇴사자 조기 지급 내역 표는 조기 지급 사이트 요약 수에 따라 행을 동적으로 삽입/삭제한다.
- 품의서 Excel은 일반 지급, 퇴사자 조기 지급, 총 합계, 지급 요청일/세부내역 구조를 자동 이동 기준으로 출력한다.
- 별첨1 Excel은 최종 출력에서 `별첨1` 시트만 남기고, 상세 표 D열에 직급을 출력하며 직급이 없으면 `-`로 표시한다.
- 별첨1 Excel은 퇴사자 조기 지급 대상이 없어도 `해당 없음` 행과 새 샘플 기준 정적 계산 안내를 유지한다.
- 별첨1 Excel의 조기 지급 `해당 없음` 행은 근무시간/수당/요율/시급/지급비용 영역 `H:S`를 Blank로 출력한다.
- 별첨1 하단 계산식 영역은 샘플 `별첨1` 시트 `24:45`행의 문구와 서식, 병합, 행높이를 그대로 복제한다.
- 인력관리 테이블의 `프로필 보기` 버튼에서 이름 앞글자 아이콘을 제거했다.
- Access DB 복원 시 별칭 추정 없이 `사업조직별근무실적.직급명` 단일 컬럼을 사용하며, 인력 기본정보 직급은 사원번호별 최신 `근무날짜` 실적의 직급으로 보강한다.

### 검증
- `npm run test -- src/shared/domain/employment-type.test.ts src/renderer/screens/workforce/workforce-employment-type-options.test.ts src/renderer/screens/workforce/workforce-list-selectors.test.ts src/shared/domain/allowance-service.test.ts`
- `npm run test -- src/main/services/employee-storage-service.test.ts src/main/services/allowance-document-pdf-service.test.ts`
- `npm run test -- src/main/services/allowance-document-export-service.test.ts`
- `npx vitest run src/shared/domain/employee-rank.test.ts src/main/services/sqlite-storage-service.test.ts src/main/services/employee-storage-service.test.ts src/main/services/database-migration-service.test.ts src/main/services/schedule-return-performance-parser.test.ts src/main/services/approved-allowance-calculation-service.test.ts src/main/services/allowance-document-export-service.test.ts src/renderer/screens/workforce/workforce-list-selectors.test.ts --maxWorkers=1 --minWorkers=1`
- `npx vitest run src/main/services/database-migration-service.test.ts src/renderer/screens/workforce/workforce-list-selectors.test.ts --maxWorkers=1 --minWorkers=1`
- `npx vitest run src/main/services/allowance-document-export-service.test.ts --maxWorkers=1 --minWorkers=1`
- `npx vitest run src/main/services/operations-storage-service.test.ts src/main/services/document-template-source-path-service.test.ts --maxWorkers=1 --minWorkers=1`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run release:check`
- `npm run release:publish`
- `npm run smoke:electron:packaged`
- `npm run smoke:electron:installer`: 1차 실행은 재설치 로그인 버튼 안정화 타임아웃으로 실패, 동일 산출물 재실행 통과

### 배포
- GitHub Release `v0.4.14`는 Published 상태다.
- 원격 asset 확인 완료: `ShiftMgmt-Setup-0.4.14-x64.exe`, `ShiftMgmt-Setup-0.4.14-x64.exe.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`.

## V0.4.13
- 기준일: `2026-05-08`
- 성격: 품의서/별첨 출력 경로 표준화, 수당 계산 보정, DB복원/인력관리 개선

### 핵심 변경
- 품의서/별첨1/별첨2 Excel/PDF 출력 경로를 `기준폴더\YYYY년\MM월\YYYY_MM_문서명.xlsx/pdf` 구조로 통일했다.
- 문서에 반영되는 최종품의수당은 총수당 합계에 원 단위 올림을 적용한다.
- 별첨1 출력 시 순번, 근무지, 직원명, 근무일, 근무구분, 근무시간, 수당금액이 Blank로 남는 문제를 보정했다.
- 연장근무 실적은 기본근로수당이 아니라 연장근로수당으로 출력되도록 매핑을 수정했다.
- DB복원 시 인력 상태가 공백, 미분류, 알 수 없는 값이면 `재직`으로 저장한다.
- 인력관리 화면에 `전체 / BP / BP 제외` 필터와 인원 수 표시를 추가했다.
- 품의서 Excel/PDF 문서번호를 문서일자에 표시된 월 기준 `YYYY-MM`으로 출력하도록 수정했다.
- 품의서/별첨 내보내기 실패 시 실제 시도 경로와 실패 원인을 내부 모달로 안내한다.

### 검증
- `npx vitest run src/shared/domain/allowance-document.test.ts src/main/services/allowance-document-pdf-service.test.ts src/main/services/allowance-document-export-service.test.ts --maxWorkers=1 --minWorkers=1`
- `npm run typecheck`
- 배포 단계에서 `npm run test`, `npm run build`, `npm run release:check`, `npm run release:publish` 실행

### 배포
- GitHub Release `v0.4.13` Published 상태로 게시한다.
- 게시 자산은 설치본, blockmap, `latest.yml`, `RELEASE_MANIFEST.json` 4종이다.

## V0.4.12
- 기준일: `2026-05-07`
- 성격: Pool 대체근무 이력 유지, 수당 미지급 처리, 실적관리 인력/시급 정보 확인

### 핵심 변경
- 실적 파일의 근무대체자 값이 `이름(P)`로 표기되면 Pool 대체근무로 인식한다.
- 등록 인력의 현재 근무조가 `Pool`인 대체근무도 수당 미지급 대상으로 처리한다.
- Pool 대체근무 행은 실적관리 목록과 파일 분석 이력에 유지한다.
- Pool 대체근무 행은 승인 가능 건수, 수당 산정, 품의 반영 대상에서 제외한다.
- `이름(P)`의 `(P)`는 저장 직원명에서 제거하고 원본 표기는 비고에 남긴다.
- 실적관리 목록 우측에 `INFO` 버튼을 추가해 인력 기본정보와 근무일 기준 시급 이력을 내부 모달로 확인할 수 있게 했다.
- `근무예정자`, `근무대체자` 컬럼의 이름, 근무지, 하이픈 표시를 가운데 정렬로 통일했다.

### 검증
- `npm run typecheck`
- `npx vitest run src/shared/domain/performance-file.test.ts src/main/services/schedule-return-performance-parser.test.ts src/main/services/performance-management-service.test.ts --maxWorkers=1 --minWorkers=1`
- `npm run build`
- `npm run release:check`
- `npm run release:publish`

### 배포
- GitHub Release `v0.4.12` Published 상태로 게시했다.
- 게시 자산은 설치본, blockmap, `latest.yml`, `RELEASE_MANIFEST.json` 4종이다.

## V0.4.11
- 기준일: `2026-05-07`
- 성격: 실적관리 조회 범위 제한, 승인완료 월 필수 조회, 승인대기 stale 행 표시 방지

### 핵심 변경
- 실적관리 `조회구분`에서 `전체` 항목을 제거했다.
- `승인완료 보관본` 조회는 연도와 월이 선택된 경우에만 가능하도록 UI와 백엔드에 이중 방어를 추가했다.
- 연도/월 없는 승인완료 요청은 승인완료 전체 폴더를 스캔하지 않고 안내만 반환한다.
- 승인대기 목록은 실제 승인대기 폴더 안에 존재하는 실적 파일만 표시한다.
- 월별 승인대기 조회 후 해당 월 폴더에 없는 stale DB 행을 정리하도록 보강했다.
- 변경 없는 승인완료 Excel은 기존 분석 결과를 재사용해 재파싱 부담을 줄였다.

### 검증
- `npm run typecheck`
- `npm test`
- `npm run build`

## V0.4.10
- 기준일: `2026-05-07`
- 성격: 승인대기 실적 조회 안정화, 파싱 진행률/오류 안내, 계정복구키 발급 스크립트 보강

### 핵심 변경
- 실적 관리 승인대기 조회 시 선택한 연도/월 기준으로 `YYYY년/M월` 폴더를 우선 스캔하도록 개선했다.
- 변경되지 않은 Excel 파일은 다시 열지 않고 기존 DB 분석 결과를 재사용한다.
- 전체 기간 조회에서 새 파일이 많으면 한 번에 파싱하는 수를 제한하고 사용자에게 안내한다.
- 실적 Excel 파싱 진행률을 내부모달로 표시해 현재 파일, 처리 개수, 확인 필요 건수를 안내한다.
- 파싱 규격과 맞지 않는 Excel 파일은 내부모달로 파일명, 경로, 문제 사유를 표시한다.
- 기존 설치본에서 로그인할 수 없는 상황을 위해 `issue-account-recovery-key.cmd/.mjs` 유지보수 스크립트를 설치 리소스에 포함했다.
- 복구키 발급 스크립트는 `%APPDATA%\shiftmgmt-v3-4\data\shiftmgmt.sqlite` 기본 DB 경로를 우선 탐색한다.

### 검증
- `npm run typecheck`
- `npm run test -- src/main/services/performance-file-intake-service.test.ts src/main/services/performance-management-service.test.ts src/main/services/performance-queue-service.test.ts`

## V0.4.9
- 기준일: `2026-05-07`
- 성격: admin 계정복구, 복구키 발급, 복구 전 DB 백업, 유지보수 복구 스크립트 패치

### 핵심 변경
- 로그인 화면에 `계정복구` 버튼과 내부 모달을 추가했다.
- 운영 관리 `사용자 관리`에서 admin 계정복구키를 발급할 수 있게 했다.
- 복구키 원문은 발급 직후 1회만 표시하고, DB에는 scrypt 해시만 저장한다.
- 복구키 입력도 5회 실패 시 15분 잠금되도록 제한했다.
- 복구 성공 시 기존 DB를 먼저 백업한 뒤 admin 계정 잠금과 로그인 실패 횟수를 초기화한다.
- 복구 후 임시 비밀번호를 발급하고 다음 로그인 시 비밀번호 변경을 강제한다.
- 복구키가 발급되기 전 이미 잠긴 기존 설치본 대응을 위해 `reset-admin-password.mjs` 유지보수 스크립트를 설치 리소스에 포함했다.

### 검증
- `npm run typecheck`
- `npm run test -- src/main/services/account-recovery-service.test.ts src/main/services/sqlite-storage-service.test.ts src/renderer/components/LoginScreen.test.tsx src/renderer/App.test.tsx`

## V0.4.8
- 기준일: `2026-04-30`
- 성격: 패치이력 UX 정리, 업데이트 패치노트 확인 흐름 개선, 앱 실행 창 최대화, 근무표 Calendar 날짜 서식 보정

### 핵심 변경
- `운영 관리 > 패치이력`을 펼쳐진 카드 목록이 아니라 게시판 목록 형태로 바꿨다.
- 패치이력 게시글은 `Patch Note 0.4.8`처럼 버전별 제목으로 표시하고, 클릭하면 해당 버전 상세 페이지로 이동한다.
- 업데이트 후 실행되는 패치노트 모달은 버전별 `이전`, `다음` 확인 흐름을 유지하고, 마지막 버전에서는 `다음` 대신 `마침`을 보여준다.
- 프로그램 실행 시 메인 창이 바로 최대화 상태로 표시되도록 바꿨다.
- 근무표 배포 Excel의 좌측 Calendar에서 이전달 날짜도 현재월 날짜와 동일하게 `DD일` 형식으로 표시되도록 보정했다.

### 검증
- `npm run typecheck`
- `npm run test`
- `npx vitest run src/renderer/App.test.tsx src/renderer/screens/operations-management/OperationsReleaseHistorySection.test.tsx`
- `npx vitest run src/main/services/schedule-plan-export-service.test.ts`
- `npx vitest run src/main/services/schedule-plan-preview-service.test.ts src/main/services/schedule-plan-export-service.test.ts src/main/services/schedule-plan-adapter.test.ts`
- `node scripts/release-check.mjs`

## V0.4.7
- 기준일: `2026-04-24`
- 성격: GitHub Releases 자동업데이트 저장소 이전, 신규 설치본 기준선 전환

### 핵심 변경
- 앱 내부 자동업데이트 확인 경로를 기존 저장소가 아니라 `https://github.com/hacker943410-debug/ShiftMS` 기준으로 전환했다.
- `release:publish`가 게시하는 GitHub Release, `latest.yml`, `RELEASE_MANIFEST.json` 업로드 대상도 새 저장소 `ShiftMS`로 맞췄다.
- `0.4.7`부터 새로 설치하는 PC는 이후 업데이트를 새 저장소 기준으로 확인한다.
- 기존 `0.4.6` 이하 설치본은 이전 저장소를 보고 있으므로 `0.4.7` 설치본을 한 번 수동 설치한 뒤부터 새 저장소 기준 자동업데이트를 받는다.
- 최신 릴리즈 문서와 아카이브 결과 문서를 `0.4.7` 기준으로 넘기고, 배포 URL 표기도 새 저장소 주소로 정리했다.

### 검증
- `npm run typecheck`
- `npx vitest run src/main/services/app-update-service.test.ts src/main/services/release-publish-helpers.test.ts`
- `node scripts/release-check.mjs`
- `npm run release:publish`

## V0.4.6
- 기준일: `2026-04-24`
- 성격: 패치노트 체계 개편, 운영 관리 `패치이력` 추가, 정규화 검색/표형 표시 지원

### 핵심 변경
- 업데이트 후 패치노트는 이제 마지막 확인 버전 이후부터 현재 버전까지의 모든 릴리즈를 묶어서 순서대로 보여준다.
- 패치노트 하단에 `이전`, `다음`, `모든 패치 확인 완료` 버튼을 추가해 여러 버전을 강제로 확인하도록 정리했다.
- 패치노트 문구를 운영자 중심 표현으로 다시 정리하고, 각 변경사항을 번호 목록으로 보여주도록 바꿨다.
- 비교가 필요한 항목은 패치노트 내부 표로 표시할 수 있도록 `RELEASE_MANIFEST.json` 구조를 확장했다.
- `운영 관리 > 패치이력` 메뉴를 추가하고, `업데이트 구분`, `적용 조건` 필터와 공백/기호 차이를 무시하는 정규화 검색을 연결했다.
- 설치 프로그램은 기존 설치를 감지하면 사용자 데이터 폴더를 백업/복원하는 업데이트 흐름으로 동작하도록 보강했다.
- 설치본에는 `artifacts/releases`의 릴리즈 매니페스트를 리소스로 포함해 패키징 후에도 앱 내부 패치이력 조회와 누적 패치노트 표시가 가능하도록 정리했다.

### 검증
- `npm run typecheck`
- `npx vitest run src/main/services/app-update-service.test.ts src/main/services/release-publish-helpers.test.ts src/renderer/App.test.tsx`
- `node scripts/release-check.mjs`

## V0.4.5
- 기준일: `2026-04-23`
- 성격: 자동업데이트 도입, 인력/근무조 배정 보강, 선택형 목록박스 저장값 보정 패치

### 핵심 변경
- GitHub Releases 기반 자동업데이트 서비스를 추가하고, 앱 내부 업데이트 안내/다운로드/재시작 적용/패치노트 1회 표시 흐름을 연결했다.
- 패키징 요청 시 `release:publish`로 GitHub Release를 Published 상태까지 공개 게시하는 운영 규칙을 프로젝트 문서에 고정했다.
- 신규 인력에서 BP 고용형태를 지원하고, BP 인력은 사원번호/시급 없이 등록 가능하며 근무조/근무표/실적 파일에는 `BP(이름)` 형식으로 표시한다.
- 인력 배정에서 조별 위/아래 이동 순서를 저장하고, 근무표 배포 시뮬레이션과 배포 현황 순서에 반영한다.
- 모든 메뉴 진입 시 주요 필터 기본값을 전체 기준으로 맞추고 데이터가 해당 기준으로 반영되도록 정리했다.
- 선택형 목록박스가 첫 번째 옵션을 선택된 것처럼 보여 실제 저장값과 달라지는 문제를 공통 컴포넌트와 인력 고용형태 초기값에서 보정했다.
- Access 복원, 근무실적 반영, 양식 fallback, 문서 사이트명 표기, 주요 액션 결과 모달/활동 이력 반영을 함께 보강했다.
- `docs/`는 최신 운영 기준 문서만 남기고 과거 릴리즈 상세 문서와 중복 수당 기준 문서를 아카이브 기준으로 정리했다.

### 검증
- `npm run typecheck`
- `npm test -- src/renderer/components/FormSelect.test.tsx src/renderer/screens/workforce/workforce-employment-type-options.test.ts`
- `node scripts/release-check.mjs`

## V0.4.4
- 기준일: `2026-04-23`
- 성격: Access 복원/기본 양식/품의서 출력 안정화 패치, GitHub Releases 자동업데이트와 `0.4.4` NSIS 패키징

### 핵심 변경
- GitHub Releases 기반 자동업데이트 흐름을 추가하고, 앱 시작 후 업데이트 확인/다운로드/재시작 적용/패치노트 1회 표시 기준을 정리했다.
- `release:publish`는 릴리즈 본문과 `RELEASE_MANIFEST.json`을 동기화한 뒤 GitHub Release를 Published 상태로 공개 게시하도록 정리했다.
- 사용자가 별도 제한 없이 패키징을 요청하면 로컬 설치본 생성이 아니라 GitHub Release 공개 게시까지 완료하는 운영 규칙을 문서화했다.
- `docs/`에는 최신 운영 기준 문서만 남기고, 과거 릴리즈 상세 문서와 중복 수당 기준 문서는 아카이브/운영 문서 기준으로 정리했다.
- Access DB 복원 실패 시 PowerShell/스크립트 실패 원인을 더 구체적으로 보여주도록 진단 메시지를 보강했다.
- 설치본에 기본 Excel 양식을 포함하고, 등록된 양식이 없거나 기본 시드 양식을 참조할 때 내부 리소스를 fallback 하도록 정리했다.
- 근무지 등록 1단계와 인력 관리, 수당/실적/운영 관리의 주요 저장 액션에 결과 내부 모달과 활동 이력 반영을 보강했다.
- 신규 인력 등록 시 의도치 않은 자동 근무지 배정을 막고, 수동 사원번호 입력/배정 해제 흐름을 정리했다.
- 품의서 출력에서 근무지명 좌측의 등록된 사이트 명이 누락되던 문제를 수정했다.
  - 수정분 품의서 판별을 파일명 외에 프로필 기반 레이아웃으로도 인식하도록 보강했다.
  - 사이트명 매핑은 공백/구분자 차이를 허용하는 정규화 lookup을 추가했다.
  - legacy 경로에서도 좌측 사이트 명을 유지하도록 보정했다.

### 검증
- `npm run typecheck`
- `npm test -- src/main/services/allowance-document-export-service.test.ts`
- `npm run release:package`
- 로그: `artifacts/releases/v0.4.4/logs/2026-04-23-release-package.log`

## V0.4.2
- 기준일: `2026-04-21`
- 성격: 근무지 패턴 문자열 저장 hotfix, `0.4.2` NSIS 패키징

### 핵심 변경
- 근무지 관리에서 cycle 패턴 문자열을 수정할 때 입력한 원문 표현식이 저장 후 다시 열기 시 유지되지 않던 문제를 수정했다.
- `shift_pattern_cycles`에 `pattern_string` 컬럼을 추가하고, renderer 저장 payload와 main 저장소 매핑에 cycle 원문 문자열을 함께 전달하도록 정리했다.
- 패턴 상세/수정 진입 시 저장된 cycle 원문 패턴 문자열을 우선 사용하도록 selector를 보강했다.
- 관련 저장소/selector 테스트를 추가해 cycle 원문 문자열 회귀를 방지했다.
- 패키지 버전을 `0.4.2`로 올리고 `ShiftMgmt-Setup-0.4.2-x64.exe` 설치본을 생성했다.

### 검증
- `npm run typecheck`
- `npm run test`
- `node scripts/validate-structure.mjs`
- `npm run release:package`
- 로그: `artifacts/releases/v0.4.2/logs/2026-04-21-release-package.log`

## V0.4.0
- 기준일: `2026-04-18`
- 성격: 리팩토링, 인증/권한/세션 하드닝, 설치본/role smoke, 릴리즈 문서 정리 패치

### 핵심 변경
- `DB업데이트` 복원 입력을 JSON `.json` 전용에서 JSON `.json` 또는 Access DB `.accdb` 허용으로 확장했다.
- 복원 파일 선택, 미리보기, 실행 전 검증, 운영 관리 안내/가이드를 Access/JSON 공통 흐름 기준으로 정리했다.
- 양식 관리를 셀 좌표 보정 중심에서 문서 영역 도식 미리보기와 속성 패널 중심으로 전환했다.
- 근무표, 품의서, 별첨1, 별첨2 양식에 semantic zone, style spec, canvas snapshot 구조를 적용했다.
- 양식 편집기에 선택 영역 속성 패널, 고급 모드 셀 선택, 병합 범위 편집, 행/열 빠른 직접 조절을 추가했다.
- style spec 변경값을 근무표/품의서/별첨1/별첨2 실제 workbook 출력 경로에 반영했다.
- 운영 관리 가이드의 양식 관리 시뮬레이션과 운영 참고 문서를 새 편집기 흐름 기준으로 갱신했다.
- 대시보드 `기간 직접 지정`의 `시작 월`, `종료 월` 선택을 브라우저 기본 월 달력에서 앱 공통 팝오버 톤의 월 선택 컨트롤로 교체했다.
- 운영 관리 가이드에 `사이트 명 관리` 페이지를 추가해 사이트 명 추가, 사용 근무지 확인, 수정/삭제 제한 흐름을 안내한다.
- 하드코딩 비밀번호를 제거하고 `password_hash` 기반 인증으로 전환했다.
- seeded 기본 계정은 첫 로그인 시 비밀번호 변경을 강제하고, 변경이 끝난 bootstrap entry는 retire되도록 정리했다.
- 로그인 실패는 `5회 실패 시 15분 잠금` 정책으로 제한하고, 활동 이력에 실패 기록을 남기도록 보강했다.
- 세션 정책은 `8시간 runtime-only`로 고정하고 앱 재시작 후 재로그인 흐름을 UI와 문서에 명시했다.
- 역할 체계는 `admin / planner / reviewer / operator` 4단계로 정리하고 route/action 권한을 shared authorization source로 통합했다.
- planner / reviewer 메뉴 노출과 action-level 권한을 renderer 테스트와 Electron smoke로 고정했다.
- Electron `BrowserWindow`는 `sandbox: true` 기준으로 정리했고, `npm audit --audit-level=high` 결과를 `0 vulnerabilities`로 맞췄다.
- `docs/release-0.4.0.md`를 active release 문서로 승격하고, `v0.4.0` sign-off 템플릿을 추가했다.

### 검증
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run smoke:electron:operations-user`
- `npm run smoke:electron:packaged`
- `npm run smoke:electron:installer` 통과, fresh install과 same-path reinstall 자동 검증 완료
- `npm run release:signoff` 통과 및 실행 로그 기록
- `npm audit --audit-level=high`
- `docs/release-0.4.0.md`

## V0.3.2
- 기준일: `2026-04-16`
- 성격: 양식 관리 도식형 편집 전환, 대시보드 기간 선택 UI/운영 관리 가이드 보강 진행 패치

### 핵심 변경
- `DB업데이트` 복원 입력을 JSON `.json` 전용에서 JSON `.json` 또는 Access DB `.accdb` 허용으로 확장했다.
- 복원 파일 선택, 미리보기, 실행 전 검증, 운영 관리 안내/가이드를 Access/JSON 공통 흐름 기준으로 정리했다.
- 양식 관리를 셀 좌표 보정 중심에서 문서 영역 도식 미리보기와 속성 패널 중심으로 전환했다.
- 근무표, 품의서, 별첨1, 별첨2 양식에 semantic zone, style spec, canvas snapshot 구조를 적용했다.
- 양식 편집기에 선택 영역 속성 패널, 고급 모드 셀 선택, 병합 범위 편집, 행/열 빠른 직접 조절을 추가했다.
- style spec 변경값을 근무표/품의서/별첨1/별첨2 실제 workbook 출력 경로에 반영했다.
- 운영 관리 가이드의 양식 관리 시뮬레이션과 운영 참고 문서를 새 편집기 흐름 기준으로 갱신했다.
- 대시보드 `기간 직접 지정`의 `시작 월`, `종료 월` 선택을 브라우저 기본 월 달력에서 앱 공통 팝오버 톤의 월 선택 컨트롤로 교체했다.
- 운영 관리 가이드에 `사이트 명 관리` 페이지를 추가해 사이트 명 추가, 사용 근무지 확인, 수정/삭제 제한 흐름을 안내한다.
- v0.3.2 릴리즈 아카이브 인덱스, 결과 보고, 파일 영향 범위, TODO, QA, 작업 로그를 현재 패치 상태 기준으로 정리했다.
- 설치본 버전을 `0.3.2`로 맞추고 `ShiftMgmt-Setup-0.3.2-x64.exe` NSIS 설치 파일을 생성했다.
- NSIS 설치 smoke를 같은 설치 경로 재설치까지 확인하도록 보강해 기존 설치 덮어쓰기 시나리오를 검증할 수 있게 했다.
- 설치본은 Electron/Node 런타임을 포함하므로 운영 PC에 Node.js 또는 npm을 별도로 설치하지 않아도 된다.

### 검증
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `node scripts/validate-structure.mjs`
- `npm run release:check`
- `npm run smoke:electron:packaged`
- `npm run smoke:electron:installer`
- `npm run build:renderer`

## V0.3.1
- 기준일: `2026-04-09`
- 성격: 업무 흐름 하드닝 마감, 가이드/출력 양식 보강, 릴리즈 정리 패치

### 핵심 변경
- 실적 재승인 확정 기준과 `승인완료 보관본` 조회 기준을 정리하고, 수당 흐름과 충돌하지 않도록 재승인 연계를 보강했다.
- 수당 관리 `근무지 반려`는 반려 사유를 필수 입력으로 바꾸고, 승인/반려/품의 승인 흐름의 감사 이력을 강화했다.
- 품의 승인 DB 반영은 트랜잭션으로 묶고, 문서 출력/백업/실패 안내를 내부 모달 흐름으로 정리했다.
- 수동/자동 DB 백업은 JSON과 Excel `.xlsx`를 함께 생성하도록 확장했다.
- 운영 관리 `요율 관리`는 수정 시 `적용 시작일` 제한과 `변경 사유` 기록을 추가하고, 신규 등록과 수정 흐름을 분리했다.
- 로그인 화면은 로고 중심 단순 레이아웃으로 재정리했고, 테스트 계정 바로입력은 유지했다.
- 대시보드 카드 배치, 차트 높이, Top 10 랭킹, 근무 유형별 탭, 개별/전체 내보내기를 실제 운영 흐름에 맞게 재구성했다.
- 전체 가이드 모달은 `사용 흐름 / 기능 설명` 의미를 분리하고, 번호 기반 하이라이트 박스를 다시 설계했다.
- 가이드 하이라이트가 실데이터를 가리는 현상은 씬별 좌표와 레이어 구조를 다시 정리해 보정했다.
- 품의서/별첨1/별첨2 PDF/Excel은 최신 회사 로고와 제목 규칙을 통일하고, Excel 템플릿 임베드 로고도 함께 교체한다.
- 별첨1·별첨2 Excel의 빈 병합/테두리 잔재, 배경색 불일치, 소계/합계 표현을 양식 기준으로 정리했다.

### 검증
- `npm run typecheck`
- `npm test -- allowance-document-export-service document-template-preview-service allowance-document-pdf-service`
- `npm run build:renderer`
- `npm run build:electron`
- `npm run smoke:electron:guide-batch5`
- `npm run smoke:electron:guides`
- `docs/release-0.3.1.md`

## V0.3.0
- 기준일: `2026-04-06`
- 성격: 수당 승인/품의 승인 업무 흐름 재구성 및 실적 재승인 연계 보강 패치

### 핵심 변경
- 실적 관리 `승인완료` 조회는 실제 승인 완료 폴더의 보관본만 보여 주도록 정리하고, 재승인 진행 중 최신 pending 파일은 `재승인 파일` 요약에서만 추적하도록 바꿨다.
- 재승인 확정은 현재 파일의 `변경 가능` 행이 모두 현재 사이클 기준으로 다시 승인된 경우에만 허용하도록 강화했다.
- 수당 관리 `근무지 반려`는 사유 입력을 필수로 바꾸고, 입력한 사유를 승인 이력에 그대로 저장하도록 보강했다.
- 수당 계산 결과는 이제 기본 상태를 `검토대기`로 생성하고, 행별 또는 근무지 단위로 `승인 / 반려`를 처리할 수 있게 했다.
- 승인/반려는 append-only `수당 승인 이력`으로 남기고, 최신 상태는 계산 결과에 `검토대기 / 승인 / 반려 / 품의승인`으로 반영되도록 정리했다.
- PDF/Excel 문서 출력은 `승인` 또는 `품의승인` 상태 수당만 대상으로 제한했다.
- 수당 관리 상단 액션에 `품의 승인` 버튼을 추가하고, 승인 대상 목록과 근무지별 지급 합계를 확인하는 `PDF 출력 미리보기` 모달을 새로 제공한다.
- `품의 승인` 확정 시 문서 출력, 품의 승인 이력 저장, 즉시 DB 자동 백업을 한 흐름으로 묶어 마감 처리하도록 바꿨다.
- 품의 승인 시 `품의 승인 기록 저장 + 수당 상태 proposal-approved 전환`은 SQLite 트랜잭션으로 묶어 부분 반영을 막고, DB 반영 실패 시 출력물/백업 확인 후 재시도할 수 있는 안내 문구를 추가했다.
- 품의 승인 이력에는 승인 시점의 미리보기 스냅샷과 백업 결과를 함께 저장해 이후에도 승인 내용을 다시 확인할 수 있게 했다.
- 품의 승인 실패는 renderer 내부 모달로 안내하고, DB 반영 실패와 자동 백업 실패를 운영자가 구분해 판단할 수 있게 했다.
- `수당 이력` 탭은 `품의 이력`으로 바꾸고, 기존 수당 이력과 최종 품의 승인 기록을 한 화면에서 함께 조회하도록 재구성했다.
- 품의 이력 필터에 `상태`를 추가해 `검토대기 / 승인 / 반려 / 품의승인` 기준 조회를 지원한다.
- 활동 이력 액션 카테고리에 `수당 승인`, `수당 반려`, `품의 미리보기`, `품의 승인`을 추가했다.
- 활동 이력 상세 문구는 `재승인 파일 확정 · 현재 파일 기준 반영`, `근무지 반려 n건 · 재승인 복귀`, `품의 승인 n건 · PDF/Excel`처럼 감사 해석이 쉬운 형태로 보강했다.
- 수당 관리의 반려 흐름은 행 단위가 아니라 근무지 단위 `근무지 반려`로 정리하고, 행 단위 반려 버튼은 제거했다.
- `근무지 반려`는 `검토대기`와 일반 `승인` 상태 수당을 모두 `반려`로 전환하되, `품의승인` 상태 수당은 최종 마감 건으로 유지한다.
- `품의승인` 상태 수당은 실적 재승인 화면과 승인완료 목록에서 `변경불가`로 표시하고, 서버 레벨에서도 재승인으로 새 수당 결과가 생성되지 않게 차단했다.
- 승인완료 폴더에 해당 실적 파일이 없어도 확인 메시지 후 `근무지 반려` 프로세스를 계속 진행할 수 있게 했다.
- 재승인 비교의 `임의 시급 적용`에서 현재 직원 시급정보를 클릭 시점 기준일로 갱신할지 선택할 수 있게 했다.
- 근무지 등록에 `사이트 명`을 추가하고, 수정 품의서 Excel 양식에서 사이트/근무지 동적 병합 출력 규칙을 반영했다.
- 수정 품의서 Excel은 고객사명이 있으면 `B:C` 고객사명, `D` 근무지명으로 표시하고, 같은 고객사가 연속되면 `B:C`를 세로 병합한다.
- 고객사명이 없는 근무지는 해당 행의 `B:D`를 병합해 근무지명을 표시하며, 근무지 수에 따라 지급 내역/퇴사자 지급/푸터 행 위치를 동적으로 이동한다.

### 검증
- `npm run typecheck`
- `npm run test -- approved-allowance-calculation-service allowance-document-export-service allowance-proposal-approval-service database-backup-service`
- `npm test -- allowance-proposal-approval-service allowance-approval-service performance-approval-flow-service performance-management-service`
- `npm run build`
- `npm run smoke:electron`
- `npx vitest run src/main/services/site-storage-service.test.ts src/main/services/allowance-document-export-service.test.ts src/main/services/allowance-approval-service.test.ts`
- `npx vitest run src/main/services/allowance-proposal-approval-service.test.ts src/main/services/performance-management-service.test.ts src/main/services/performance-approval-flow-service.test.ts`

## V0.2.3
- 기준일: `2026-04-02`
- 성격: 별첨1 PDF 레이아웃/활동 이력 체계 보강 패치

### 핵심 변경
- 별첨1 PDF 표 폭을 다시 조정해 A4 가로 출력 시 열이 무너지지 않도록 `고정 컬럼 폭 + 축약 라벨` 기준으로 재구성했다.
- 별첨1 PDF `유형` 값은 `대체근무 / 연장근무 / 휴일근무`로 통일하고, `No` 번호는 유형별 재시작 없이 전체 연속 번호로 바꿨다.
- 별첨1 PDF의 유형별 소계 행은 `No ~ 유형구분`을 병합해 `소계`만 표시하도록 단순화했다.
- 별첨1 PDF의 마지막 합계 행은 `총 소계` 단일 라벨과 더 진한 배경/폰트로 구분되도록 조정했다.
- 별첨1 PDF `이름` 열은 최대 4글자까지 줄바꿈 없이 보이도록 폭과 줄바꿈 규칙을 보정했다.
- 별첨1 PDF `유형구분`이 `대체공휴일(삼일절)`처럼 괄호 정보를 포함할 때는 본문과 보조 문구를 줄바꿈하고, 괄호 부분은 더 작은 폰트로 표시하도록 바꿨다.
- 운영 관리 메뉴 `접속 이력`은 `활동 이력`으로 명칭을 변경했다.
- 활동 이력 상단 필터에서 `사용자`, `액션` 선택 박스 폭을 넓혀 긴 항목명을 더 안정적으로 표시하도록 조정했다.
- 활동 이력 액션 카테고리는 로그인/화면 이동 중심에서 `실적 승인`, `실적 반려`, `근무표 생성`, `품의 출력` 등 주요 사용자 행동별 분류로 확장했다.
- 주요 저장/승인/출력 성공 시점은 renderer 개별 호출이 아니라 Electron `main` IPC 성공 지점 기준으로 활동 이력에 남기도록 정리했다.

### 검증
- `npm run typecheck`
- `npm run test -- allowance-document-pdf-service access-log-service`

## V0.2.2
- 기준일: `2026-03-31`
- 성격: 공통 셸/인력 관리/PDF/실적 관리 사용성 보강 패치

### 핵심 변경
- 우측 상단 프로필 요약을 클릭하면 `내 정보` 모달에서 계정 정보와 세션 정보를 함께 확인할 수 있게 했다.
- 좌측 사이드바의 별도 `세션 정보` 패널은 제거하고, 로그아웃 동선을 `내 정보` 모달로 이동했다.
- 인력 관리 `시급 일괄 업데이트`의 `근무지명 열 / 이름 열 / 시급 열` 입력은 영문 대문자만 유지되도록 고정했다.
- 인력 관리 `근무 인력 관리` 테이블의 `고용형태`는 공통 정규화 기준으로 표기하고, Access 이관 시 고용형태 원천 필드를 우선 사용하도록 보강했다.
- 인력 관리 `근무 인력 관리` 테이블의 `배정상태`는 `배정중`과 함께 `(근무지명, 조명)` 보조 문구를 줄바꿈으로 표시하도록 바꿨다.
- 윈도우 창 아이콘은 브랜드 심볼 기반 투명 배경 아이콘으로 다시 생성해 어두운 배경을 제거했다.
- 품의서/별첨1/별첨2 PDF 금액 표기는 모두 `원` 형식으로 통일했다.
- 별첨1 PDF는 `기본 / 연장 / 야간` 병합 헤더 아래에 각각 `시간 / 요율 / 수당` 하위 컬럼을 두도록 재구성했다.
- 별첨1 PDF의 요율 표기는 `0배` 대신 `x0`, `x0.5`, `x1.5` 형식으로 통일했다.
- 별첨1 PDF의 `수당` 값은 `시간 x 요율 x 시급` 기준 산출 결과를 표시하고, 등록된 공휴일의 `근무일` 셀은 연한 붉은색으로 하이라이트하도록 바꿨다.
- 별첨1 PDF에 `유형구분` 컬럼을 추가해 일반 근무일은 `평일`, 등록 공휴일은 해당 `공휴일명`으로 직접 표기하도록 했다.
- 별첨1 PDF의 `적용 요율 설명`은 항목 수와 줄 수에 따라 `1~3열`로 자동 압축되도록 바꿔 과도한 페이지 증가를 줄였다.
- 별첨1 PDF에는 각 `대체근무 / 연장근무 / 법정휴일근무` 소계 아래 전체 시간/수당 합산 기준의 `총소계`를 추가했다.
- 별첨2 PDF는 `근무일`, `이름` 값을 가운데 정렬하고 `근무일` 열을 함께 표시하도록 정리했다.
- 별첨2 PDF 하단 합계는 `총소계` 기준으로 정리해 대체/연장/법정휴일 수당 전체 합산값을 한 줄에서 확인할 수 있게 했다.
- 운영 관리에 `접속 이력 관리` 메뉴를 추가해 로그인, 로그아웃, 화면 이동 기록을 날짜/사용자/액션 기준으로 조회할 수 있게 했다.
- 운영 관리 `DB 자동백업 설정`의 백업 시간 입력 UI는 근무지 등록 페이지 시간 선택 스타일과 동일한 선택형 컨트롤로 교체했다.
- 수당 관리 `수당 산출 현황`의 전체 조회는 최신 근무일이 먼저 보이도록 정렬 기준을 보강했다.
- 수당 관리 `수당 이력` 상단 필터에 `현재상태`를 추가해 `전체 / 재직중 / 휴직 / 퇴사` 기준 조회를 지원한다.
- 실적 관리 `실적 현황`의 이전 `미승인 파일 삭제` 방식은 제거했다.
- 대신 승인완료 목록에서만 `목록삭제`를 지원하도록 바꾸고, 실제 파일/승인 이력/수당 이력은 건드리지 않은 채 화면 목록만 숨기도록 설계했다.
- 승인완료 목록 숨김은 `최신 승인 이력`, `승인완료 보관본`, `수당 이력 미연결` 조건을 모두 만족할 때만 허용한다.
- 승인완료 목록 `목록삭제` 버튼은 기본 숨김으로 바꾸고, 실제로 숨김 가능한 행에서만 `수당 이력 미반영 행` 안내와 함께 노출되도록 조정했다.
- 독립 `연장근무` 행의 시간 분해 규칙을 수정해 비야간 구간이 `기본`이 아니라 `연장`으로 계산되도록 바로잡았다.
- 저장된 승인/수당 이력도 함께 보정하는 복구 경로를 추가해 판교DC `2026-03` 실데이터의 누락 수당을 정정했다.
- 기존 Electron QA 스크립트의 로그인 완료 기준도 새 `내 정보` 버튼 구조에 맞게 갱신했다.

### 검증
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run smoke:electron:v0.2.0-ui`
- `npm run smoke:electron:v0.2.1-datepicker`

## V0.2.1
- 기준일: `2026-03-31`
- 성격: 운영 UI/문서 출력 사용성 보강 패치

### 핵심 변경
- 운영 관리 `요율 관리`에 `요율 적용` 흐름을 추가했다.
  - 적용 중인 요율을 좌측에서 별도 확인
  - 조회 연도별 요율 목록 선택
  - 선택한 요율 상세를 우측에서 확인
  - 적용 버튼으로 실제 승인 계산 기준 전환
- 승인 수당 계산은 이제 `적용 중인 요율`을 우선 기준으로 사용한다.
- 수당 관리 `사업장별 수당 분포`, `상세 수당 내역`에 각각 펼치기 기능을 추가했다.
  - 좌측 확대 시 차트 영역 확장, 우측은 근무지 합계 요약만 표시
  - 우측 확대 시 차트 숨김, 상세 테이블 전체 폭 표시와 상세보기 유지
- 앱 좌측 상단 로고 카드 배경을 주변 바탕색과 맞춰 로고 가독성을 높였다.
- 별첨2 PDF 우측 상단에 회사 로고를 추가했다.
- 공통 `DateField` 동작을 보정했다.
  - `확인` 클릭 시 항상 DatePicker 닫힘
  - `취소` 클릭 시 초안 값 복원 후 닫힘
  - 적용 위치 10곳을 전수 추적하고 동일 동작 기준으로 검증 완료
- 인력 관리 우측 상단의 `선택 근무지 보기`, `선택 근무표 보기` 버튼을 제거했다.

### 검증
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run smoke:electron:v0.2.1-datepicker`

## V0.2.0
- 기준일: `2026-03-30`
- 성격: 인력/근무지 관리 기능 확장 패치

### 핵심 변경
- 인력 관리에 `시급 일괄 업데이트` 기능을 추가했다.
  - Excel 파일 Import
  - 근무지명/이름/시급 컬럼 매핑
  - 적용일 선택
  - 적용 전/후 시급 및 제외 사유 미리보기
  - 기존 활성 시급 종료일 자동 정리 및 새 이력 저장
- 근무지 관리에 `패턴 적용된 근무지 추가` 기능을 추가했다.
  - 표준 템플릿 근무표 Excel 파싱
  - Cycle 탐지, rotation 그룹 분류, offset 산출
  - `group + offset -> team` 기반 조/정원 제안
  - 근무지 등록 1단계 draft 자동 반영
- 패턴 산출 결과 미리보기 기능을 보강했다.
  - `분석 결과` 텍스트
  - `그룹별 상세`
  - `불일치 내역`
  - `원본 데이터`
  - `텍스트 복사`
- 두 기능 모두 `가이드 보기` 모달과 Excel 도식 안내를 추가했다.

### 검증
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run release:check`
- `npm run package:win`
- `npm run smoke:electron:packaged`
- `npm run smoke:electron:installer`
- `node scripts/validate-structure.mjs`

## V0.1.1
- 기준일: `2026-03-30`
- 성격: 운영/배포 편의성 개선 패치

### 핵심 변경
- 수당 관리 상세 패널의 `총 수당` 카드 잘림을 수정했다.
- 품의서 PDF 레이아웃을 제목부, 요약 카드, 표 간격 중심으로 재정비해 가독성을 높였다.
- 품의서 PDF가 여러 페이지로 넘어갈 때 퇴사자 선지급 표와 `4/5번` 안내가 겹치지 않도록 페이지 분할 구조를 다시 정리했다.
- 품의서 PDF 마지막 장에 `근무지별 지급액 분포`와 `근로유형별 비중` 차트를 추가했다.
- 품의서 번호 체계를 `1번`부터 다시 맞추고, `3번 퇴사자 지급 내역`이 다음 장으로 넘어갈 때 제목도 표와 함께 이동하도록 조정했다.
- 품의서 마지막 장 차트 섹션에 번호 체계를 연결해 `6. 수당 분포 요약 차트 / 6-1 / 6-2` 기준으로 정리했다.
- 별첨1 PDF/Excel 하단에 `법정공휴일 / 평_대체근로수당 / 휴_대체근로수당 / 평_연장근로수당 / 휴_연장근로수당` 설명 문구를 추가했다.
- 별첨1 하단 적용 요율 설명에 각 요율별 계산식을 함께 표기하고, 표 하단 간격과 항목 간 간격, 넘버링을 보정했다.
- 별첨1 적용 요율 설명은 표 아래 두 줄을 비운 뒤 시작하고, 각 항목을 `설명 / 계산식 / 빈 줄` 구조로 다시 정리했다.
- 별첨1 적용 요율 설명은 적용 배수 숫자와 `기본/연장/야간` 계산식을 각각 분리해 Excel/PDF 모두에서 줄 단위로 읽히도록 다시 정리했다.
- 별첨1 적용 요율 설명은 운영 관리 `요율 관리`에 저장된 실제 버전명과 적용 배수를 그대로 표기하도록 보정했다.
- 운영 관리에 `DB 자동 백업` 설정을 추가했다.
  - 백업 저장 경로 지정
  - 월간/주간/일간 주기 설정
  - 백업 시간 설정
  - 현재 DB의 JSON 스냅샷, Excel `.xlsx`, Access 원본 `.accdb` 조건부 병렬 백업
  - 백업 주기 선택 박스를 다른 메뉴의 공통 선택 박스 디자인과 통일
- 공통 `FormSelect` 포커스를 보정해 필터 선택 후 최상단으로 포커스가 튀는 현상을 완화했다.
- 상단 필터 선택 시 포커스가 최상단으로 튀는 현상과 근무표 배포 `월` 선택 시 `연도` 선택 박스가 먼저 활성화되는 현상을 함께 보정했다.
- 수당 관리 `퇴직자 선지급 설정`에서 날짜 확인 후 달력이 다시 활성화되는 현상을 수정했다.
- 수당 관리 `퇴직자 선지급 설정` 모달에서 `DateField` 래퍼 구조를 조정해 날짜 선택 후 `확인` 클릭 시 달력이 다시 펼쳐지지 않도록 보완했다.
- 대시보드 PDF/Excel 내보내기에 섹션별 `총액(원)` 정보를 추가했다.
- 근무지 관리 1단계 시뮬레이션 업무시간을 `총합`이 아니라 `1인 기준`으로 산출하도록 변경했다.
- 근무지 관리 1단계 시뮬레이션 하단 `1인 기준` 근무시간에 휴게 차감 산식을 함께 표기하도록 보완했다.
- 근무표 배포 주간/월간 요약표에 `총근로시간` 열을 추가했다.
- 근무표 배포 상단 필터에서 `교대 패턴`, `생성자`를 제거하고 `배포 양식`, `근무 날짜` 폭을 넓혔다.
- 실적 관리 `관리` 컬럼에 원본 Excel 파일 열기 아이콘을 추가했다.
  - 승인 대기 / 승인 완료 공통 노출
  - 파일이 없는 승인 완료 행은 아이콘 숨김
  - 테이블 헤더 가운데 정렬
- 별첨1 `적용 요율 설명` 생성 로직을 계산 결과 이력 기준으로 다시 작성해 Access 이관 버전과 운영 관리 요율 버전 모두 실제 배수를 복원해 출력하도록 수정했다.
- 별첨1 `적용 요율 설명`에서 Access 이관 버전명 문구를 숨기고, 표와 설명 사이 및 항목 간 여백을 늘려 가독성을 보완했다.
- 품의서 PDF 모든 페이지 우측 상단에 회사 로고를 추가하고, 우측 상단 출력일과 마지막 장 `마지막 장 요약` 문구를 제거했다.
- 별첨1 PDF 첫 페이지 우측 상단에 회사 로고를 추가했다.
- PDF 우측 상단 회사 로고는 문서 출력 시 배경색이 어둡게 보이지 않도록 배경 영역을 문서 배경색에 맞게 정규화했다.
- 품의서 PDF 첫 페이지 `총 지급 요청 금액` 카드에 `정규 지급`, `퇴사자 선지급`을 줄바꿈해 한 줄에 한 항목씩 보이도록 조정했다.
- 품의서 PDF 첫 페이지 상단 결재란에 `작성자 / (인) / 내선번호` 항목을 추가하고, `팀장 / 본부장 / 대표 / 부회장` 서명란은 `/` 없이 더 크게 서명할 수 있도록 높이를 확장했다.
- 별첨1 PDF 상단 설명 문구 `상단 컬럼은 페이지마다 반복됩니다.` 를 제거했다.
- 별첨1 PDF 표의 `이름 / 근무지 / 총 근무 / 기본 / 연장 / 야간` 컬럼 값을 가운데 정렬했다.
- 품의서 PDF 상단 작성란은 `작성자  이름 (인)  /  내선번호  번호`가 한 줄에 표시되도록 다시 정리하고, 결재 서명란 높이를 이에 맞춰 자연스럽게 축소했다.
- 운영 관리 `사용자 관리`에 `내선번호` 입력/조회 항목을 추가했다.
- 품의서 PDF 상단 `작성자 / 내선번호`는 현재 로그인 계정의 `사용자 관리` 정보와 연결해 출력하도록 보정했다.
- 품의서 PDF 본문 페이지 분할 로직을 다시 조정해 `2번 지급 요청 내역`의 `헤더 + 합계만 다음 페이지로 넘어가는 현상`을 없앴다.
- 품의서 PDF `3번 퇴사자 지급 내역`, `4번 지급 요청일`, `5번 세부내역`은 공간이 남으면 같은 페이지에 이어서 배치되도록 강제 페이지 넘김 규칙을 제거하고 본문 압축 레이아웃을 추가했다.
- 근무지 관리 1단계 기본 정보, 운영 구조, Cycle 설정, 월간 달력 시뮬레이션 비율을 재조정했다.

### 검증
- `npm run smoke:electron:v0.1.1`
- `npm run verify:dashboard-exports`
- `npm run test`
- `npm run build`
- `node scripts/validate-structure.mjs`
- 검증 로그: `artifacts/logs/2026-03-27-v0.1.1-patch-verification.md`
- 사용자 검증 완료: `2026-03-30` 품의서/별첨1 PDF 로고 위치, 우측 상단 출력일 제거, 마지막 장 `마지막 장 요약` 제거 확인
- 사용자 검증 완료: `2026-03-30` 품의서/별첨1 PDF 우측 상단 로고 배경이 문서 배경과 자연스럽게 연결되도록 보정된 출력 확인
- 사용자 검증 완료: `2026-03-30` 품의서 PDF `2024-10` 본문 페이지 분할 로직 수정 후 `2페이지 헤더+합계만 출력되던 현상` 해소 확인
- 개발 검증: `2026-03-30` 운영 관리 `사용자 관리` 모달에서 `내선번호` 입력 필드 노출 확인, `operator -> 7399` 저장 후 운영담당 로그인 상태의 품의서 PDF 상단 `작성자 / 내선번호` 반영 확인
- 개발 검증: `2026-03-30` 실제 사용자 데이터 `2024-10` PDF를 직접 비교해 기존 `품의서_2024-10_dup21.pdf`는 `2페이지=헤더+합계만`, 수정 후 `품의서_2024-10_dup23.pdf`는 `1페이지=2/3/4/5번`, `2페이지=차트`로 정리된 출력 확인

## V0.1.0
- 기준일: `2026-03-27`
- 첫 설치형 릴리즈 기준선
- 설치 파일 실행, 설치 후 `ShiftMgmt.exe` 실행, 수동 QA 및 Playwright 교차 검증 완료
