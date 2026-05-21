# v0.4.14 File Impact

## Main/Shared
- `src/shared/domain/model.ts`: 직원 연락처와 삭제 근무지 배정 플래그 타입 추가.
- `src/shared/bridge/contracts.ts`: 직원 저장 입력에 연락처 추가.
- `src/shared/domain/employment-type.ts`: 고용형태 정규화 기준을 정규/계약/BP로 통일.
- `src/main/services/sqlite-storage-service.ts`: `employees.contact` 스키마와 마이그레이션 추가.
- `src/main/services/employee-storage-service.ts`: 연락처 저장/조회/검색, 삭제 근무지 플래그 조회 추가.
- `src/shared/domain/allowance-service.ts`: 수당 line amount 원 단위 올림 적용.

## Renderer
- `src/renderer/screens/WorkforceManagementScreen.tsx`: 한 줄 필터, 우측 검색, 페이지게이트, 연락처 입력, 삭제 근무지 배정 인력 안내 추가.
- `src/renderer/screens/workforce/workforce-list-selectors.ts`: 인력관리 필터/정렬/페이지/제외 selector 추가.
- `src/renderer/screens/workforce/workforce-employment-type-options.ts`: 고용형태 옵션을 정규/계약/BP로 축소.
- `src/renderer/styles.css`: 인력관리 toolbar, table fit, 페이지게이트, 안내 배너 스타일 추가.

## 문서 출력
- `src/main/services/allowance-document-export-service.ts`: 별첨1 Blank 출력, 시급 Excel 표시 형식, 2026-04 품의서 compact 구조, 품의서 체크박스/조기 지급 포함 대상자 카운트, 별첨1 단일 시트/조기 지급 블록/정적 계산 안내 출력 추가.
- `src/main/services/operations-storage-service.ts`: 기본 품의서/별첨1 양식을 2026-04 수정본으로 업그레이드.
- `src/main/services/document-template-source-path-service.ts`: 기본 양식 fallback 파일명을 2026-04 수정본으로 변경.
- `src/main/services/allowance-document-pdf-service.ts`: 별첨1 PDF 시급 소수점 둘째 자리 표기 추가.

## Tests
- 인력 저장/검색/삭제 근무지 플래그 테스트 추가.
- 인력관리 selector 테스트 추가.
- 고용형태 정규화 테스트 수정.
- 별첨1 Excel/PDF 시급 표기와 Blank 출력 테스트 수정.
- 2026-04 품의서/별첨1 compact 양식, 품의서 체크박스, 조기 지급 포함 대상자 카운트 출력 테스트 추가.
- 수당 올림 계산 테스트 추가.
