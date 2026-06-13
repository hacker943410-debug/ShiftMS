# v0.4.26

## Summary
퇴사, 직무 이동, 삭제대기 처리된 인력의 과거월 실적 산정 누락을 방지하는 패치다. 정상 화면에서는 숨기되 DB에는 과거 지급에 필요한 인력, 시급, 배치 이력을 보존하도록 변경한다.

## Scope
- 인력 삭제를 물리 삭제에서 보존형 숨김 처리로 전환.
- 실적 계산 경로에서 보존된 퇴사/삭제 인력의 과거 시급과 배치 이력을 조회.
- 월 근무표 복원 시 현재 배치가 아닌 과거 근무지 배치 이력 기준으로 대상 인력을 찾도록 보정.
- 이미 과거에 물리 삭제된 인력의 복구 한계와 운영 대응 기준 문서화.

## Verification
- RED 확인: 기존 물리 삭제 동작에서 삭제 후 과거 실적이 0분/시급 없음으로 실패하고, 복원도 0건으로 실패함을 재현.
- `npx vitest run --maxWorkers=1 --minWorkers=1 src/main/services/employee-storage-service.test.ts src/main/services/schedule-return-performance-parser.test.ts src/main/services/performance-file-intake-service.test.ts` 통과: 3 files / 58 tests.
- `npm run typecheck` 통과.
- `npm run test` 통과: 130 files / 633 tests.
- `npm run build` 통과.
- `npm run release:check` 통과.
- `npm run release:publish` 통과.
- `npm run smoke:electron:packaged` 통과.
- `npm run smoke:electron:installer` 통과: 재설치 데이터 보존 확인.

## Release
- Package version: 0.4.26.
- Packaging target: GitHub Release `v0.4.26` Published.
- Required assets verified: installer, blockmap, `latest.yml`, `RELEASE_MANIFEST.json`.
