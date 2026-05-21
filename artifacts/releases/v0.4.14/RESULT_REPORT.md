# v0.4.14 Result Report

## 작업 결과
- 인력관리 목록을 한 줄 필터, 우측 검색, 하단 페이지게이트 구조로 변경했다.
- 직원 연락처 저장/수정/검색을 추가했다.
- 고용형태를 정규/계약/BP로 통일하고 파견/용역 계열은 계약으로 정규화했다.
- 삭제된 근무지 배정 인력은 목록/집계에서 제외하고 내부 모달로 대상 목록을 안내한다.
- 별첨1 Excel 선택값 없는 시간/요율/수당 칸은 Blank로 출력한다.
- 별첨1 Excel 시급 셀은 숫자값과 `#,##0.00원` 표시 형식을 적용한다.
- 별첨1 PDF 시급은 소수점 둘째 자리까지 표시한다.
- 수당 line amount는 원 단위 올림으로 계산한다.
- 기본 품의서/별첨1 양식을 2026-04 수정본으로 갱신했다.
- 품의서 Excel 최상단은 `☑ 품의`, `☐ 보고` 체크박스 표기로 출력한다.
- 품의서 Excel의 `당월 지급 대상자` 수는 일반 지급과 퇴사자 조기 지급 대상자를 모두 포함한다.
- 품의서 Excel 최상단 로고를 배경 제거 로고로 교체하고 `A1:C1` 범위에 맞춰 배치한다.
- 품의서 Excel 작성자/전화번호, `총 합계`, 총합계 금액 폰트색을 검정색으로 출력한다.
- 품의서 Excel 총합계 행 `B30:H30` 테두리를 두 번째 굵기인 `medium`으로 출력한다.
- 품의서 Excel 퇴사자 조기 지급 내역 표를 조기 지급 사이트 요약 수에 따라 동적으로 삽입/삭제한다.
- 품의서 Excel은 일반 지급, 퇴사자 조기 지급, 총 합계, 지급 요청일/세부내역 구조를 출력한다.
- 별첨1 Excel은 최종 출력에서 `별첨1` 시트만 남기고, 퇴사자 조기 지급 대상이 없어도 `해당 없음` 행과 새 샘플 기준 정적 계산 안내를 출력한다.
- 별첨1 조기 지급 `해당 없음` 행의 근무시간/수당/요율/시급/지급비용 영역 `H:S`는 Blank로 출력한다.
- 별첨1 하단 계산식 영역은 샘플 `별첨1` 시트 `24:45`행의 문구, 병합, 테두리, 배경색, 폰트색, 굵기, 크기, 행높이를 그대로 복제한다.

## 검증 결과
- `npm run test -- src/shared/domain/employment-type.test.ts src/renderer/screens/workforce/workforce-employment-type-options.test.ts src/renderer/screens/workforce/workforce-list-selectors.test.ts src/shared/domain/allowance-service.test.ts`: 통과
- `npm run test -- src/main/services/employee-storage-service.test.ts src/main/services/allowance-document-pdf-service.test.ts`: 통과
- `npm run test -- src/main/services/allowance-document-export-service.test.ts`: 통과
- `npx vitest run src/main/services/allowance-document-export-service.test.ts --maxWorkers=1 --minWorkers=1`: 통과
- 실제 별첨1 Excel 생성 검증: 통과, 용량 절감을 위해 검증 산출물은 삭제
- 실제 별첨1 하단 계산식 샘플 복제 검증: 통과, 용량 절감을 위해 검증 산출물은 삭제
- `npx vitest run src/main/services/operations-storage-service.test.ts src/main/services/document-template-source-path-service.test.ts --maxWorkers=1 --minWorkers=1`: 통과
- `npm run typecheck`: 통과
- `npm run test`: 통과, 123 files / 537 tests
- `npm run build`: 통과
- `npm run release:check`: 통과

## 잔여 확인
- `QA_CHECKLIST.md` 기준 수동 QA 실행 필요.
- 패키징/릴리즈 게시 요청 시 표준 배포 흐름으로 `npm run release:publish` 실행 필요.
- GitHub Release `v0.4.14` Published 상태와 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json` asset 확인 필요.
