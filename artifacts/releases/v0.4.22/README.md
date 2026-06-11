# v0.4.22

## 요약
별첨1 정규 요약이 템플릿 용량(10행)을 초과해 `spliceRows`로 행이 삽입될 때, 옮겨지지 않은 선지급 헤더 병합(`A19:A21`)이 새 헤더(`A21:A23`)와 충돌해 대량 항목 품의서 출력이 실패하던 문제를 수정했다. 더불어 폴더 감시에 `awaitWriteFinish`를 적용해 복사 중인 부분 저장본을 파싱하지 않도록 했다.

## 변경 범위
- `src/main/services/allowance-document-export-service.ts` — `writeCompactAttachmentOneWorkbook`에 splice 前 선지급 헤더(19-21행) 언머지 + `writeAttachmentOneHeaderRows` 병합 前 방어 언머지.
- `src/main/services/file-watch-service.ts` — `createFileWatchOptions()` / `fileWatchAwaitWriteFinish`(2000ms/100ms) 도입, `createFileWatchers` 적용.
- 테스트 — 별첨1 대량(12 정규 + 3 선지급) 삽입 경로 회귀 잠금 + 폴더 감시 옵션 배선 가드.

## 핵심 커밋
- `db65334` fix(export): unmerge stale 별첨1 header before splice to prevent merge collision on large proposals
- `f4629bc` fix(watch): await write finish to avoid parsing partially-copied files

## 검증
- `npm run typecheck` 통과(0 오류)
- `npm run test` 통과 — `128 files / 596 tests`
- fail-on-old 실증 — 별첨1 splice 前 언머지를 끄면 대량 출력이 `A21:A23 ↔ A19:A21` 병합 충돌로 실패, 수정 시 통과
- `npm run build` / `npm run release:check` 통과

## 비고
- 별첨2(`writeAttachmentTwoWorkbook`)는 `spliceRows`를 쓰지 않아 동일 충돌 구조가 아니며 영향 없음.
- 폴더 감시 `awaitWriteFinish`는 라이브 드롭만 안정화하고, 기존 파일은 종전대로 startup 동기화가 처리.
