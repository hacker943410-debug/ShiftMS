# File Impact

## 수정 파일
- `src/main/services/performance-management-service.ts`: 날짜 우선 정렬, 기존 조 라벨 NULL 행 복원 resolver 추가.
- `src/main/services/performance-management-service.test.ts`: 날짜 우선 정렬과 기존 DB 조 복원 회귀 테스트 추가.
- `src/renderer/screens/PerformanceManagementScreen.tsx`: 조 요약 행을 날짜별 조 그룹으로 변경.
- `src/renderer/components/DashboardShell.tsx`: route screen lazy import 제거.
- `package.json`: 버전 `0.4.28`.
- `package-lock.json`: 버전 `0.4.28`.

## 문서 파일
- `docs/release-0.4.28.md`: 최신 릴리즈 설명.
- `docs/README.md`: 현재 기준 버전 갱신.
- `docs/patch-notes.md`: 0.4.28 변경 이력 추가.
- `artifacts/releases/README.md`: v0.4.28 인덱스 추가.
- `artifacts/releases/v0.4.28/*`: 릴리즈 표준 문서.

## 비수정
- 전역 메뉴/로고 CSS는 변경하지 않았다.
- DB 스키마는 추가 변경하지 않았다.
