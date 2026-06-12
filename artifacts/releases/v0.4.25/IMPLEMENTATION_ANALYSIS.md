# Implementation Analysis

## Root Causes
- 근무지 상세 Cycle 근무시간은 canonical label을 붙이면서도 원본 step 등장 순서로 렌더링되어 `A, C, B` 같은 저장 순서가 그대로 노출됐다.
- 실적관리 새로고침은 화면 조회만 다시 실행했고, 파일 크기와 수정 시간이 같으면 저장된 분석 결과를 재사용했다. 이 때문에 저장된 월근무표 시간이 바뀌어도 계산 시간이 갱신되지 않았다.
- 반환 근무표의 `None`은 기존 empty marker로 처리되어 일부 경로에서 실적 제외가 아니라 빈칸 또는 치환 슬롯으로 해석됐다.
- 실적관리 테이블은 컬럼 여백과 고정 최소 폭이 커서 데스크톱에서 좌우 스크롤이 쉽게 발생했다.
- 구형 품의서 템플릿은 주요 anchor row가 신형보다 한 줄 아래에 있어 문서 생성 단계에서 병합/배치 오류를 일으킬 수 있었다.

## Implementation Direction
- `buildShiftPatternDutySlotMap` 결과로 근무 정의를 정렬해 상세 표시 순서만 보정한다.
- `PerformanceOverviewQuery.forceReparse`를 추가하고 수동 새로고침에서만 true를 전달한다.
- pending/approved 파일 동기화는 force reparse 요청 시 기존 detail 재사용을 건너뛰고 반환 파일을 다시 파싱한다.
- parser는 `None`을 explicit exclusion marker로 분리해 법정휴일, 대체, 연장 실적 생성에서 제외한다.
- 실적관리 필터 순서는 JSX에서 변경하고, 기존 필터 폭은 CSS grid column 값으로 보존한다.
- 문서 템플릿 inspect 단계에서 품의서 신형/구형 배치를 판정하고 구형 템플릿 저장을 차단한다.

## Constraints
- renderer에서 파일 시스템이나 Node API를 직접 사용하지 않는다.
- 계산 로직은 renderer가 아니라 main/shared domain 경로에 둔다.
- 기존 승인/수당 이력은 조용히 덮어쓰지 않는다.
