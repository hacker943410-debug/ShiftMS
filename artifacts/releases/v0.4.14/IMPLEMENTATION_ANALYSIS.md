# v0.4.14 Implementation Analysis

## 인력관리
- `EmployeeRecord`, `EmployeeUpsertInput`에 `contact`를 추가한다.
- SQLite `employees` 테이블에 nullable `contact` 컬럼을 추가하고 기존 DB는 `ensureColumn`으로 보정한다.
- `listStoredEmployees`에서 `sites.deleted_at`을 `currentSiteDeletedAt`으로 내려 UI가 삭제 근무지 배정 상태를 판단할 수 있게 한다.
- 인력관리 목록 필터/정렬/페이지 계산은 selector로 분리해 테스트 가능하게 구성한다.

## 직급
- `employee-rank.ts`에서 `사원 / 대리 / 과장 / 차장 / 부장` 선택값과 정규화 helper를 정의한다.
- SQLite는 `employees.rank`, `performance_entries.employee_rank`, `allowance_calculations.employee_rank` nullable 컬럼을 `ensureColumn`으로 보정한다.
- 신규 인력 등록, 프로필 수정, 인력 목록, 검색 selector는 `rank`를 사용한다.
- Access DB 직접 확인 결과 `사업조직별근무자현황`에는 직급 컬럼이 없고 `사업조직별근무실적`에 `직급명` 컬럼이 있으므로, 별칭 추정 없이 해당 단일 컬럼을 정규화해 인력/실적/수당 스냅샷으로 저장한다.
- 인력 기본정보 직급은 `사업조직별근무실적`을 사원번호로 묶은 뒤 최신 `근무날짜` 행의 `직급명`으로 보강한다.
- 기존 `department` 저장/표시 호환은 변경하지 않고, 새 직급 필드는 별도 컬럼으로 분리한다.
- 실적 승인 파서는 현재 직원 직급을 `employeeRank`로 엔트리에 저장하고, 승인 수당 산출 서비스는 해당 값을 수당 결과에 복사한다.

## 고용형태
- `normalizeEmploymentTypeLabel`은 BP를 우선 감지하고, 계약/파견/용역은 `계약`, 정규는 `정규`로 반환한다.
- UI 선택지는 `정규 / 계약 / BP`만 제공한다.

## 별첨1/수당
- 기존 `toNullableCellValue`는 품의서/별첨2의 `-` 표기 유지 용도로 보존한다.
- 별첨1 전용 `toBlankCellValue`를 추가해 선택값 없는 숫자 칸만 Blank로 출력한다.
- 별첨1 상세 표 D열은 수당 결과의 `employeeRank`를 우선 사용하고, 없는 경우 현재 직원 DB의 `rank`를 fallback으로 조회한다.
- 직급이 없는 기존 데이터는 별첨1 D열에 `-`로 출력한다.
- 별첨1 시급 셀은 숫자값과 `#,##0.00원` 표시 형식을 적용한다.
- 수당 line amount는 `roundMoney` 대신 `roundUpWon`을 사용한다.
- `별첨1_2026-04_수정본.xlsx`는 compact writer로 분기해 최종 workbook에서 `별첨1` 외 시트를 제거한다.
- compact 별첨1은 일반 지급 표와 퇴사자 조기 지급 표를 분리하고, 조기 지급 대상이 없으면 `해당 없음` 행을 쓴다.
- compact 별첨1의 조기 지급 `해당 없음` 행은 숫자 영역 `H:S`를 Blank로 비워 둔다.
- compact 별첨1은 기존 동적 요율 가이드 대신 새 샘플 `24:45`행의 정적 `Sort`와 계산식 영역을 값/서식/병합/행높이 block으로 캡처해 출력 위치에 복제한다.

## 품의서 양식
- `품의서_2026-04_수정본.xlsx`는 updated proposal writer의 compact 변형으로 처리한다.
- proposal writer는 최상단 `A3/C3`에 `☑ 품의`, `☐ 보고`를 써서 인쇄 가능한 체크박스 표기를 생성한다.
- `당월 지급 대상자` 카운트는 `input.rows` 전체의 고유 직원 기준으로 산출해 퇴사자 조기 지급 대상도 포함한다.
- 품의서 workbook의 기존 이미지 media는 `brand-logo-clean.png`로 교체하고, proposal worksheet의 이미지 anchor를 `A1:C1` 경계로 고정한다.
- 작성자/전화번호 rich text와 총합계 label/amount font color는 `FF000000`으로 고정한다.
- compact 총합계 행 border는 `B30:H30` 전체에 `medium` border를 직접 적용해 병합 내부 셀까지 동일한 두께로 저장한다.
- 조기 지급 표는 `buildSiteSummaries(sections.earlyPayoutRows)` 결과를 `syncUpdatedProposalSiteSummaryRows`에 전달하고, `rowCountDelta`로 필요한 행을 삽입/삭제한다.
- 일반 지급 표 capacity는 1행, 퇴사자 조기 지급 표 capacity는 1행 기준으로 행을 이동한다.
- compact 품의서는 퇴사자 조기 지급 합계 아래 `총 합계` 행을 추가해 일반 지급과 조기 지급 합계를 합산한다.
