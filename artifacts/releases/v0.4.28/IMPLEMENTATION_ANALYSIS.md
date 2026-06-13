# Implementation Analysis

## 실적 정렬
`performance-management-service`의 row comparator를 날짜 우선으로 변경했다. 같은 날짜 안에서만 조 라벨을 비교하고 이후 근로유형, 직원명, 수신시각 순으로 안정 정렬한다.

## 기존 DB 보정
`performance_entries.team_label`이 NULL인 기존 저장 행은 조회 시 표시용으로 조를 복원한다. 우선 월근무표 항목을 조회하고, 대체근무는 메모의 원근무자를 기준으로 기존 슬롯 조를 찾는다. 월근무표에서 못 찾으면 인력 배정 이력과 현재 조 정보를 fallback으로 사용한다.

## 화면 묶음
기존 화면 그룹 함수는 같은 조를 전체 기간에서 하나로 합쳤다. 날짜 우선 정렬에서는 이 방식이 날짜 순서를 깨뜨릴 수 있으므로, 정렬된 row 흐름을 유지하면서 `workDate + teamLabel` 단위로 연속 그룹만 만든다.

## 메뉴 안정화
패치 중 구버전 renderer가 새 `dist/assets`를 참조하면 lazy chunk hash가 사라져 메뉴가 열리지 않을 수 있다. 주요 메뉴 화면을 정적 import로 바꿔 route 클릭 시 별도 화면 chunk를 요청하지 않게 했다.
