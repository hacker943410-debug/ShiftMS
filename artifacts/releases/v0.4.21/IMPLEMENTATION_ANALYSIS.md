# v0.4.21 Implementation Analysis

## 0.4.21-1 치환 슬롯 0분/0원
- `schedule-return-performance-parser.ts`에 `resolveScheduleItemFromReturnedDutySlot`을 추가했다.
- substitute 행의 원근무자가 `-` 또는 `홍길동`이면 같은 `workDate`의 변경표에서 regular/changed 슬롯을 찾고, 해당 슬롯의 `dutyCode`로 월근무표 시간을 조회한다.
- 조회된 슬롯 시간은 `createWorkTimeFromScheduleItem`으로 기존 계산식을 그대로 통과하므로 06:00-18:00, 휴게 60분 기준 총 660분으로 계산된다.
- holiday 경로는 기존 `resolveScheduleItemByDutyCode`의 dutyCode-only fallback을 신규 테스트로 고정했다.

## 0.4.21-2 품의서 병합 충돌
- `syncUpdatedProposalSiteSummaryRows`가 `totalRowNumber`, `rowCountDelta`, `detailRowCount`를 반환하도록 변경했다.
- `writeUpdatedProposalWorkbook`에서 정규 요약 템플릿 용량과 `rowCountDelta`를 이용해 합계행/선지급 시작행을 계산한다.
- 선지급 헤더 병합 전 `unmergeCellsInRange` 범위를 `headerTop - 1`부터 정리하도록 확장했다.

## 테스트 전략
- 구코드 실패 확인: empty-marker 대체근무 슬롯은 기존 코드에서 substitute entry가 생성되지 않았다.
- 회귀 고정: holiday dutyCode-only fallback, 홍길동/None 대체근무, 빈 슬롯 holiday, 품의서 스플라이스 선지급 병합 케이스를 함께 검증한다.
