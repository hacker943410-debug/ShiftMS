# v0.4.21 File Impact

## 런타임 코드
- `src/main/services/schedule-return-performance-parser.ts`
  - substitute 치환 슬롯 dutyCode 역추적 및 슬롯 시간 fallback 추가.
- `src/main/services/allowance-document-export-service.ts`
  - 품의서 요약 렌더링 결과에 `rowCountDelta` 반환 추가.
  - 선지급 헤더 병합 전 언머지 범위 확대.

## 테스트
- `src/main/services/schedule-return-performance-parser.test.ts`
  - holiday dutyCode-only 슬롯 시간 테스트 추가.
  - empty-marker substitute 슬롯 시간 테스트 추가.
- `src/main/services/allowance-document-export-service.test.ts`
  - 정규 요약 `spliceRows` + 선지급 1건 병합 충돌 회귀 테스트 추가.

## 릴리즈/문서
- `package.json`, `package-lock.json`: 버전 `0.4.21` 반영.
- `docs/release-0.4.21.md`
- `docs/README.md`
- `docs/project-handbook.md`
- `docs/patch-notes.md`
- `artifacts/releases/README.md`
- `artifacts/releases/v0.4.21/*`
