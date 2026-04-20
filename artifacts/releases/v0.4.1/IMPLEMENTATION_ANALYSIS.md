# v0.4.1 구현 분석

## 현재 문제 정의

현재 양식 관리는 `파일 Import -> 1차 검증 -> 좌표 보정 -> 파일 미리보기` 흐름이다.
내부 구현에는 맞지만 운영자 관점에서는 아래 문제가 크다.

1. `주차 블록`, `변경 사유 열`, `표 시작 행` 같은 내부 용어가 어렵다.
2. 수정 대상이 문서 의미 단위가 아니라 셀/행 좌표 중심이다.
3. 미리보기가 실제 파일 생성 기반이라 반복이 느리다.
4. 너비/높이/폰트/배경색 같은 스타일 규격을 체계적으로 다루기 어렵다.

## 코드 근거

### renderer
- [OperationsTemplateSection.tsx](C:/Projects/Active/ShiftMgmt_V3.4/src/renderer/screens/operations-management/OperationsTemplateSection.tsx)
  - `1차 검증`, `필요한 셀 위치`, `수정`, `파일명 변경`, `승인`, `기본 사용` 중심 설명
- [TemplateWizardModal.tsx](C:/Projects/Active/ShiftMgmt_V3.4/src/renderer/screens/operations-management/TemplateWizardModal.tsx)
  - `양식에서 읽은 후보`
  - `주차 블록`
  - `근무조 편성 요약 시작 위치`
  - `변경 사유 열`
  - `최근 미리보기` 가 실제 output path 중심

### main/shared
- [document-template.ts](C:/Projects/Active/ShiftMgmt_V3.4/src/shared/domain/document-template.ts)
  - `schedule`, `generic` 두 종류만 지원
- [document-template-profile-service.ts](C:/Projects/Active/ShiftMgmt_V3.4/src/main/services/document-template-profile-service.ts)
  - 기본 필드가 `sheetName`, `titleCell`, `dataStartRow` 수준
- [document-template-management-service.ts](C:/Projects/Active/ShiftMgmt_V3.4/src/main/services/document-template-management-service.ts)
  - 검증 결과가 `sheetNames`, `titleCandidates`, `canProceed` 중심
- [document-template-preview-service.ts](C:/Projects/Active/ShiftMgmt_V3.4/src/main/services/document-template-preview-service.ts)
  - `.xlsx` 파일을 직접 생성하고 `outputPath` 를 반환
- [schedule-plan-adapter.ts](C:/Projects/Active/ShiftMgmt_V3.4/src/main/services/schedule-plan-adapter.ts)
  - `BF9`, `AX9`, `monthAnchorCells`, `regularPlanColumns`, `changedPlanColumns`, `changeReasonColumn` 등 좌표 기반

## 저장 구조 분석

- [operations-storage-service.ts](C:/Projects/Active/ShiftMgmt_V3.4/src/main/services/operations-storage-service.ts)
- [sqlite-storage-service.ts](C:/Projects/Active/ShiftMgmt_V3.4/src/main/services/sqlite-storage-service.ts)

현재 `document_template_versions` 는 `profile_json`, `validation_json` 을 이미 저장한다.
따라서 1차 개편은 테이블 추가 없이 JSON 스키마 확장으로 처리 가능하다.

## 기술 선택 분석

### ExcelJS 유지

현재 프로젝트는 [package.json](C:/Projects/Active/ShiftMgmt_V3.4/package.json) 기준 `exceljs` 를 사용 중이다.
ExcelJS 공식 README 기준으로 열 너비, 행 높이, 폰트, fill, 정렬, 병합, 이미지 삽입까지 지원한다.

공식 참고:
- https://github.com/exceljs/exceljs

### 새 그리드 라이브러리 도입 검토

#### Handsontable
- 장점: 스프레드시트 UX 풍부
- 단점: 상용 사용 시 라이선스 이슈, 문서형 양식에는 과한 편
- 공식 참고:
  - https://handsontable.com/docs/10.0/license-key/
  - https://handsontable.com/docs/15.2/javascript-data-grid/software-license/

#### Glide Data Grid
- 장점: 성능, custom cell, editor 확장
- 단점: 문서형 레이아웃 편집보다는 데이터 그리드 성격
- 공식 참고:
  - https://docs.grid.glideapps.com/
  - https://docs.grid.glideapps.com/api/dataeditor
  - https://docs.grid.glideapps.com/api/dataeditor/custom-cells

#### ReactGrid
- 장점: React 친화적, cell template/style 커스터마이징 가능
- 단점: 여전히 셀 중심 모델
- 공식 참고:
  - https://silevis.github.io/reactgrid/docs
  - https://silevis.github.io/reactgrid/docs/4.0/4-cell-templates/4-cell-templates
  - https://silevis.github.io/reactgrid/docs/5.0/3-cell-templates/1-text-cell

## 결론

이번 버전은 `새 그리드 도입` 보다 `시맨틱 도식 편집기` 가 맞다.

권장 구조:
1. main 에서 workbook 을 읽어 `canvas snapshot + semantic zone + style spec` 으로 변환
2. renderer 에서 영역 단위 도식형 편집기 제공
3. 고급 모드에서만 셀 오버레이/정밀 보정 허용
4. 최종 저장 시 ExcelJS 로 실제 workbook 에 스타일 반영

## 구현 기준

1. 기본 모드: 비전문가 운영자도 이해 가능한 용어와 직접 조작
2. 고급 모드: 셀/행/열 보정까지 허용
3. 기존 preview/export 알고리즘과 양식 버전 호환성 유지
4. `profileSchemaVersion` 기반 migration 준비


