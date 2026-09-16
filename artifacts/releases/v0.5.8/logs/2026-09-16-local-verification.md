# v0.5.8 로컬 검증 기록

- `npm run test`: 178개 파일, 1,267개 테스트 통과
- `npm run typecheck`: 통과
- `npm run lint`: 오류 0개, 기존 경고 25개
- `npm run build`: 통과(Vite 청크 크기 경고만 존재)
- `npm run validate:map`: 161개 경로 통과
- `npm run validate:harness`: 통과
- `node scripts/validate-structure.mjs`: 통과
- `npm run release:check`: 통과
- `git diff --check`: 오류 없음(줄바꿈 변환 경고만 존재)
- `node artifacts/scripts/capture-wage-bulk-modal.cjs`: 11/11 통과
- `npm run release:verify-package`: 통과
- packaged smoke: 통과
- installer smoke: 설치·재설치·기존 데이터 보존 통과

GitHub Release 게시 결과와 공개 자산 확인은 `RESULT_REPORT.md`에 별도로 기록한다.
