# v0.4.14 Implementation Analysis

## 인력관리
- `EmployeeRecord`, `EmployeeUpsertInput`에 `contact`를 추가한다.
- SQLite `employees` 테이블에 nullable `contact` 컬럼을 추가하고 기존 DB는 `ensureColumn`으로 보정한다.
- `listStoredEmployees`에서 `sites.deleted_at`을 `currentSiteDeletedAt`으로 내려 UI가 삭제 근무지 배정 상태를 판단할 수 있게 한다.
- 인력관리 목록 필터/정렬/페이지 계산은 selector로 분리해 테스트 가능하게 구성한다.

## 고용형태
- `normalizeEmploymentTypeLabel`은 BP를 우선 감지하고, 계약/파견/용역은 `계약`, 정규는 `정규`로 반환한다.
- UI 선택지는 `정규 / 계약 / BP`만 제공한다.

## 별첨1/수당
- 기존 `toNullableCellValue`는 품의서/별첨2의 `-` 표기 유지 용도로 보존한다.
- 별첨1 전용 `toBlankCellValue`를 추가해 선택값 없는 숫자 칸만 Blank로 출력한다.
- 별첨1 시급 셀은 숫자값과 `#,##0.00원` 표시 형식을 적용한다.
- 수당 line amount는 `roundMoney` 대신 `roundUpWon`을 사용한다.
