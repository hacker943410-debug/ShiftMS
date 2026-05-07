# v0.4.11 구현 분석

## 원인
실적관리의 기존 조회구분에는 `전체`가 남아 있었고, 승인완료 보관본 조회에서 연도/월이 없으면 승인완료 루트 폴더 전체를 재귀 스캔할 수 있었다. 또한 DB에 남은 승인대기 파일 상세는 실제 파일 존재 여부와 무관하게 overview 행으로 변환되어, 승인대기 폴더에 없는 실적표가 목록에 보일 수 있었다.

## 구현
- renderer에서 승인완료 선택 시 현재 연도/월을 자동 지정하고, 승인완료 상태에서는 연도/월 `전체` 옵션을 숨긴다.
- main service에서 승인완료 요청에 `scheduleMonth`가 없으면 전체 스캔을 수행하지 않고 안내 sync issue만 반환한다.
- pending overview 변환 전 `existsSync(filePath)`와 `pendingDir` 내부 경로 여부를 확인한다.
- 월별 pending sync는 대상 폴더가 없어도 해당 월 DB stale 행을 정리할 수 있게 `canPruneMissingFiles`를 유지한다.
- performance file storage에 필터링/경량 상세 조회 API를 추가해 대량 조회 중 approval history 반복 조회를 줄인다.

## 보존한 동작
- 승인완료 월 조회에서도 해당 월 재승인 후보는 계속 표시한다.
- 승인대기 재승인 파일은 기존 승인 이력을 기준으로 비교/재승인 상태를 유지한다.
