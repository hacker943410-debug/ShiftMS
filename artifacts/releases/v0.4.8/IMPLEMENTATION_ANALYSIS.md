# Implementation Analysis

## 핵심 구조
- `src/renderer/screens/operations-management/OperationsReleaseHistorySection.tsx`
  - 조회 결과를 게시판 표로 표시한다.
  - `Patch Note X.Y.Z` 제목 클릭 시 선택된 manifest 상세 화면으로 전환한다.
- `src/renderer/components/AppUpdateModal.tsx`
  - 업데이트 후 패치노트 모달의 마지막 버튼을 `마침`으로 변경한다.
  - 안내 문구를 버전별 확인 흐름에 맞게 정리한다.
- `src/main/main.ts`
  - BrowserWindow를 숨김 상태로 만든 뒤 로드 완료 후 최대화하고 표시한다.
- `src/main/services/schedule-plan-preview-service.ts`
  - 좌측 Calendar 날짜 업데이트에 `dd"일"` 표시형식을 함께 전달한다.
- `src/main/services/schedule-plan-adapter.ts`
  - 셀 값을 쓸 때 update의 `numberFormat`이 있으면 ExcelJS `numFmt`로 반영한다.
- `src/main/services/document-template-preview-service.ts`
  - 양식 미리보기 Calendar 날짜에도 동일한 날짜 표시형식을 적용한다.

## 호환성
- 릴리즈 매니페스트 형식은 변경하지 않는다.
- 기존 `listReleaseHistory` bridge와 검색/필터 기능은 그대로 사용한다.
- 실제 OS 전체화면 모드가 아니라 창 최대화 방식으로 열어 업무 앱의 일반 창 조작성을 유지한다.
- 근무표 날짜 값 생성 로직은 유지하고, 표시형식만 명시 적용해 기존 배포 데이터 계산에는 영향이 없도록 한다.
