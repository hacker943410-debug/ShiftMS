# v0.4.11 파일 영향 범위

## Runtime
- `src/renderer/screens/PerformanceManagementScreen.tsx`
  - 실적관리 조회구분 `전체` 제거.
  - 승인완료 선택 시 연도/월 필수 흐름 적용.
  - 승인 이력 지연 조회 유지.
- `src/main/services/performance-management-service.ts`
  - 승인완료 월 필수 방어.
  - 승인대기 실제 파일 존재 여부 기반 표시 필터.
  - 경량 조회 API 사용.
- `src/main/services/performance-file-intake-service.ts`
  - 월별 승인대기 stale 행 정리 강화.
  - 승인완료 변경 없는 파일 재사용.
- `src/main/services/performance-file-storage-service.ts`
  - 필터링된 상세 조회와 reference 조회 추가.

## Shared Type
- `src/shared/domain/performance-file.ts`
  - `PerformanceApprovalScope`에서 `all` 제거.

## Tests
- `src/main/services/performance-management-service.test.ts`
  - 승인완료 월 필수 조회 테스트 추가.
  - 승인대기 실제 파일 없음 표시 방지 테스트 추가.
- `src/main/services/performance-file-storage-service.test.ts`
  - 경량 조회와 reference 조회 테스트 추가.
