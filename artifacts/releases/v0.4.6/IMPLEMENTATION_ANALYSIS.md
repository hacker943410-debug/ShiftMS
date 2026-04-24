# Implementation Analysis

## 핵심 구조
- `src/main/services/release-history-service.ts`
  - 릴리즈 매니페스트 파싱
  - 번들/개발 환경 릴리즈 매니페스트 탐색
  - 정규화 검색, 버전 범위 조회
- `src/main/services/app-update-service.ts`
  - 현재 버전 패치노트 1건 표시에서 누적 버전 번들 표시로 변경
- `src/renderer/components/AppUpdateModal.tsx`
  - 단일 패치노트 모달에서 다중 버전 네비게이션 모달로 변경
- `src/renderer/screens/operations-management/OperationsReleaseHistorySection.tsx`
  - 운영 관리 `패치이력` 메뉴 추가

## 호환성
- 기존 `notes[]`만 있는 구버전 매니페스트도 자동으로 번호 목록 섹션으로 변환해 표시한다.
- 새 매니페스트는 `summary`, `sections`, `tables`를 추가로 지원한다.
