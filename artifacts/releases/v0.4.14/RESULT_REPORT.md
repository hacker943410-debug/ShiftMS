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

## 검증 결과
- `npm run test -- src/shared/domain/employment-type.test.ts src/renderer/screens/workforce/workforce-employment-type-options.test.ts src/renderer/screens/workforce/workforce-list-selectors.test.ts src/shared/domain/allowance-service.test.ts`: 통과
- `npm run test -- src/main/services/employee-storage-service.test.ts src/main/services/allowance-document-pdf-service.test.ts`: 통과
- `npm run test -- src/main/services/allowance-document-export-service.test.ts`: 통과
- `npm run typecheck`: 통과
- `npm run test`: 통과, 123 files / 536 tests
- `npm run build`: 통과
- `npm run release:check`: 통과

## 잔여 확인
- 패키징/릴리즈 게시 요청 시 표준 배포 흐름으로 `npm run release:publish` 실행 필요.
