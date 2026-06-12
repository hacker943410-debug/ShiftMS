# File Impact

## Runtime Code
- `src/renderer/screens/site-management/site-management-selectors.ts`: Cycle 근무시간 정의를 slot 순서로 정렬.
- `src/renderer/screens/PerformanceManagementScreen.tsx`: 수동 새로고침 force reparse 요청, 필터 순서 변경, 실적 테이블 wrapper class 추가.
- `src/renderer/styles.css`: 실적관리 테이블 density 조정, 필터 grid 순서별 기존 폭 유지, 작은 화면 table scroll fallback.
- `src/shared/bridge/contracts.ts`: `PerformanceOverviewQuery.forceReparse` 추가.
- `src/main/services/performance-management-service.ts`: overview 조회에서 force reparse를 파일 동기화 계층으로 전달.
- `src/main/services/performance-file-intake-service.ts`: force reparse 시 기존 분석 결과 재사용을 건너뛰고 재파싱.
- `src/main/services/schedule-return-performance-parser.ts`: `None` explicit exclusion 처리.
- `src/main/services/document-template-management-service.ts`: 구형 품의서 템플릿 등록 차단.
- `src/renderer/screens/ShiftPatternManagementScreen.tsx`: 템플릿 등록 차단/경고 메시지 표시.

## Tests
- `src/renderer/screens/site-management/site-management-selectors.test.ts`: 혼합 duty code 표시 순서 회귀 테스트.
- `src/main/services/performance-management-service.test.ts`: 수동 새로고침 재파싱/근무시간 재계산 회귀 테스트.
- `src/main/services/schedule-return-performance-parser.test.ts`: `None` 법정휴일/대체 실적 제외 회귀 테스트.
- `src/main/services/document-template-management-service.test.ts`: 신형/구형 품의서 템플릿 판정 테스트.

## Release Metadata
- `package.json`, `package-lock.json`: 0.4.25.
- `docs/release-0.4.25.md`, `docs/patch-notes.md`, `docs/README.md`: 최신 릴리즈 기준 갱신.
- `artifacts/releases/v0.4.25/*`: 표준 릴리즈 문서와 매니페스트.
