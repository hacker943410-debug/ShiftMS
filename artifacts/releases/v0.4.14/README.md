# v0.4.14 릴리즈 아카이브

## 요약
- 버전: `0.4.14`
- 기준일: `2026-05-21`
- 브랜치: `release/0.4.14`
- 성격: 인력관리 목록/연락처/직급/고용형태 정리, 삭제 근무지 인력 제외 안내, 2026-04 품의서/별첨1 양식 반영, 별첨1 시급 표기, 수당 올림, 품의서 체크박스/대상자 카운트/로고/폰트/총합계 테두리 보정
- 배포 상태: 구현, 자동 검증, 패키징, GitHub Release 공개 게시 완료. 수동 QA sign-off 전

## 핵심 변경
- 인력관리 상단 필터를 한 줄 toolbar로 정리하고 검색 입력을 우측으로 이동했다.
- 인력관리 목록에 하단 페이지게이트와 페이지당 `10 / 20 / 50`명 선택을 추가했다.
- 직원 연락처를 DB, 신규 등록, 프로필 수정, 검색 조건에 추가했다.
- 직원 직급을 `사원 / 대리 / 과장 / 차장 / 부장` 선택값으로 추가하고 DB, 신규 등록, 프로필 수정, 검색 조건에 추가했다.
- SQLite `employees.rank`, `performance_entries.employee_rank`, `allowance_calculations.employee_rank` 컬럼으로 직급과 승인/수당 시점 스냅샷을 보존한다.
- Access DB 직접 확인 결과 `사업조직별근무자현황`에는 직급 컬럼이 없으므로, `사업조직별근무실적.직급명`만 정규화해 이관한다.
- 고용형태는 `정규 / 계약 / BP` 3개로 통일하고 파견/용역 계열은 계약으로 정규화한다.
- 삭제된 근무지에 배정된 인력은 목록과 집계에서 제외하고 내부 모달로 대상 목록을 확인한다.
- 별첨1 Excel 선택값 없는 칸은 Blank로 되돌리고 시급 셀은 숫자값과 `#,##0.00원` 표시 형식을 유지한다.
- 별첨1 PDF 시급은 소수점 둘째 자리까지 표시한다.
- 수당 산출은 `시급 * 요율 * 근로시간` 결과에 원 단위 올림을 적용한다.
- 기본 품의서/별첨1 양식을 2026-04 수정본으로 갱신한다.
- 품의서 Excel 최상단은 `☑ 품의`, `☐ 보고` 체크박스 표기로 출력하고 `당월 지급 대상자` 수는 퇴사자 조기 지급 대상자를 포함한다.
- 품의서 Excel 최상단 로고는 배경 제거 로고로 교체해 `A1:C1`에 배치하고, 작성자/전화번호/총합계 폰트와 `B30:H30` medium 테두리를 보정한다.
- 별첨1 Excel 출력은 `별첨1` 시트만 남기고, 상세 표 D열에 직급을 출력하며 직급이 없으면 `-`로 표시한다.
- 별첨1 Excel 출력은 퇴사자 조기 지급 대상이 없어도 `해당 없음` 행과 새 샘플 기준 정적 계산 안내를 포함한다.
- 별첨1 조기 지급 `해당 없음` 행의 근무시간/수당/요율/시급/지급비용 영역 `H:S`는 Blank로 출력한다.
- 별첨1 하단 계산식 영역은 샘플 `별첨1` 시트 `24:45`행의 문구/서식/병합/행높이를 그대로 복제한다.
- 인력관리 테이블의 `프로필 보기` 버튼에서 이름 앞글자 아이콘을 제거한다.
- Access DB 복원 시 별칭 추정 없이 `사업조직별근무실적.직급명` 단일 컬럼을 사용하며, 인력 기본정보 직급은 사원번호별 최신 `근무날짜` 실적의 직급으로 보강한다.

## 검증 결과
- `npm run typecheck`: 통과
- `npx vitest run src/shared/domain/employee-rank.test.ts src/main/services/sqlite-storage-service.test.ts src/main/services/employee-storage-service.test.ts src/main/services/database-migration-service.test.ts src/main/services/schedule-return-performance-parser.test.ts src/main/services/approved-allowance-calculation-service.test.ts src/main/services/allowance-document-export-service.test.ts src/renderer/screens/workforce/workforce-list-selectors.test.ts --maxWorkers=1 --minWorkers=1`: 통과, 8 files / 56 tests
- `npx vitest run src/main/services/database-migration-service.test.ts src/renderer/screens/workforce/workforce-list-selectors.test.ts --maxWorkers=1 --minWorkers=1`: 통과, 2 files / 20 tests
- `npx vitest run src/main/services/allowance-document-export-service.test.ts --maxWorkers=1 --minWorkers=1`: 통과
- `npx vitest run src/main/services/operations-storage-service.test.ts src/main/services/document-template-source-path-service.test.ts --maxWorkers=1 --minWorkers=1`: 통과
- `npm run test`: 통과, 124 files / 539 tests
- `npm run build`: 통과
- `npm run release:check`: 통과
- `npm run release:publish`: 통과, GitHub Release `v0.4.14` Published
- `npm run smoke:electron:packaged`: 통과
- `npm run smoke:electron:installer`: 1차 실행은 재설치 로그인 버튼 안정화 타임아웃으로 실패, 동일 산출물 재실행 통과

## 남은 작업
- `QA_CHECKLIST.md` 기준 수동 QA 실행
- GitHub Release `v0.4.14` Published 상태와 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json` asset 확인 완료
- 릴리즈 PC sign-off 또는 수동 QA 결과를 `logs/` 하위에 기록

## 산출물
- `RELEASE_MANIFEST.json`
- `RESULT_REPORT.md`
- `QA_CHECKLIST.md`
- `FILE_IMPACT.md`
- `FUNCTIONAL_SPEC.md`
- `IMPLEMENTATION_ANALYSIS.md`
- `COMPACT_CONTEXT.md`
- `TODO.md`
