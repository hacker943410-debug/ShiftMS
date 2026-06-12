# Compact Context

## Goal
0.4.25는 실적관리 계산 재반영 누락과 `None` 대상 제외 문제를 수정하고, 근무지 상세의 Cycle 근무시간 표시 순서를 실제 근무 슬롯과 일치시키는 패치다. 브랜치 선행 변경으로 구형 품의서 템플릿 등록 차단도 포함한다.

## Decisions
- Cycle 근무시간 표시는 저장된 step 순서가 아니라 canonical slot 순서로 정렬한다.
- 실적관리 새로고침 버튼은 다음 조회 1회에 한해 반환 파일 강제 재파싱을 요청한다.
- `None`은 빈칸이 아니라 명시적 실적 제외값으로 처리한다.
- 필터의 기존 박스 폭은 유지하고 순서만 변경한다.
- 품의서 템플릿은 등록 시점에 신형/구형 배치를 판정하고, 구형이면 저장을 차단한다.

## Non-Goals
- 반환 Excel 양식 구조 변경 없음.
- 수당 요율과 시급 계산식 변경 없음.
- DB schema 변경 없음.

## Verification Baseline
- 전체 Vitest: 130 files / 630 tests.
- Production build: pass.
