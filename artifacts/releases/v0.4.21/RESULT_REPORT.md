# v0.4.21 Result Report

## 결과 요약
- substitute empty-marker 치환 슬롯이 실적에서 누락되던 경로를 수정했다.
- holiday 치환 슬롯은 dutyCode-only fallback이 동작함을 테스트로 고정했다.
- 품의서 정규 요약 행 삽입 후 선지급 헤더 병합이 요약 합계행과 겹치지 않도록 계산식을 명시화했다.

## 검증 결과
- `npx vitest run src/main/services/schedule-return-performance-parser.test.ts -t "duty code slot time|Hong Gil-dong|empty duty slot|missing stored schedule" --maxWorkers=1 --minWorkers=1`: 통과
- `npx vitest run src/main/services/allowance-document-export-service.test.ts -t "spliced regular summary|separate early payout|merged cell" --maxWorkers=1 --minWorkers=1`: 통과
- `npm run typecheck`: 통과
- `node scripts/validate-structure.mjs`: 통과
- `npm run test -- --reporter=dot`: 통과, `128 files / 594 tests`
- `npm run build`: 통과
- `npm run release:check`: 통과, `RELEASE_CHECK_OK`

## 구코드 실패 확인
- `should use the duty code slot time for an empty original substitute slot`: 기존 코드에서 substitute entry가 생성되지 않아 실패.
- `should use the duty code slot time for an unscheduled changed worker on a holiday row`: 현재 브랜치에는 이미 dutyCode-only fallback이 있어 통과. 회귀 방지 테스트로 고정.
- `should place early payout proposal headers below a spliced regular summary total row`: 현재 브랜치에는 이미 합계행 기반 이동이 일부 반영되어 통과. `rowCountDelta` 명시 반영과 언머지 방어를 추가.

## 영향 범위
- 실적관리 Excel 회수 파일 파싱
- 법정휴일/대체근무 시간 산출
- 수당 산출 입력 시간
- 품의서 Excel 정규 지급/선지급 요약 표 병합

## 남은 확인
- 패키징 단계에서 GitHub Release `v0.4.21` Published 상태와 release manifest 자산 포함 여부를 확인한다.
