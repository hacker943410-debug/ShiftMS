# File Impact

## 수정 파일
- `src/main/services/performance-file-intake-service.ts`: 수당 반려 이력이 있는 승인완료 파일의 승인대기 재진입을 재승인 사이클로 저장.
- `src/main/services/allowance-approval-service.test.ts`: 수동 재진입과 반복 반려/재승인 회귀 테스트 추가.
- `src/main/main.ts`: 시작 백그라운드 작업 지연.
- `src/main/services/app-update-service.ts`: 시작 업데이트 확인 지연 옵션 추가.
- `src/main/services/app-update-service.test.ts`: 지연 업데이트 확인 테스트 추가.
- `src/renderer/App.tsx`: 초기 update state 동기화 지연.
- `src/renderer/screens/PerformanceManagementScreen.tsx`: 조별 소계 라벨 보정.
- `src/renderer/styles.css`: 데스크톱 메뉴 breakpoint와 로고 크기 보정.
- `package.json`, `package-lock.json`: 버전 `0.4.29`.

## 문서 파일
- `docs/release-0.4.29.md`
- `docs/README.md`
- `docs/patch-notes.md`
- `artifacts/releases/README.md`
- `artifacts/releases/v0.4.29/*`

## 비수정
- DB 스키마는 변경하지 않는다.
- 수당 계산식과 요율표는 변경하지 않는다.
