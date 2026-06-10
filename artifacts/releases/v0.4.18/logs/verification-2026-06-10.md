# v0.4.18 Verification Log

## 자동 검증
- `npx vitest run src/main/services/allowance-document-export-service.test.ts src/main/services/allowance-proposal-approval-service.test.ts src/renderer/screens/allowance-management/allowance-management-review-actions.test.ts src/renderer/screens/allowance-management/allowance-management-modal-actions.test.ts --maxWorkers=1 --minWorkers=1`: `4 files / 21 tests` 통과
- `npm run typecheck`: 통과
- `npm run test`: `127 files / 554 tests` 통과
- `npm run build`: 통과
- `node scripts/validate-structure.mjs`: 통과
- `git diff --check`: 통과
- `npm run release:check`: 통과
- `node scripts/publish-release-assets.mjs --dry-run`: 통과
- `npm run release:publish`: 통과
- GitHub Release `v0.4.18`: Published 상태 및 필수 asset 4개 확인
- `npm run smoke:electron:packaged`: 통과
- `npm run smoke:electron:installer`: 통과

## 확인 내용
- 최종 품의승인 요청이 `outputFormat: "xlsx"`를 전달한다.
- 품의승인 Excel 처리 경로가 main service 테스트를 통과한다.
- 별도 PDF 출력과 Excel 출력 경로가 renderer/main 타깃 테스트를 통과한다.
- 로컬 설치본 `ShiftMgmt-Setup-0.4.18-x64.exe`가 생성됐다.
- installer smoke에서 재설치 후 데이터 보존을 확인했다.
