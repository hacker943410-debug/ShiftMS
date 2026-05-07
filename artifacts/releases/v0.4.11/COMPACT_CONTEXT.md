# v0.4.11 Compact Context

## 목적
실적관리에서 대량 실적 파일을 조회할 때 승인완료 전체 보관본 또는 stale 승인대기 DB 행 때문에 응답성이 떨어지는 문제를 줄인다.

## 변경 요약
- `PerformanceApprovalScope`에서 `all` 제거.
- 실적관리 `조회구분` UI에서 `전체` 제거.
- 승인완료 조회는 `scheduleMonth` 필수로 제한.
- 승인완료 월 조회 중 재승인 후보 확인은 선택 월의 승인대기만 함께 확인.
- 승인대기 목록은 실제 `pendingDir` 내부에 존재하는 파일만 표시.
- pending/approved 변경 없는 파일 재사용 경로를 경량 조회로 보강.

## 검증
- 전체 테스트 `120 files / 518 tests` 통과.
- production build 통과.
