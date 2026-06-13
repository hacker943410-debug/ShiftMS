# v0.4.27

## Summary
실적관리 검수 화면을 조별로 묶고, 반려 상태 승인대기 파일을 현재 Excel 기준으로 재파싱하도록 보정한 패치다. 변경표 `None` 입력이 법정휴일 실적 취소로 연결되며, 로그인 5회 실패 계정 잠금도 제거했다.

## Scope
- 실적 엔트리에 조 정보를 저장하고 실적관리 테이블을 조별로 묶어 표시.
- 반려 상태의 승인대기 파일은 저장된 분석 결과를 재사용하지 않고 재파싱.
- 변경/대체 표의 `원근무자 -> None` 입력을 같은 일자의 법정휴일 실적 취소로 해석.
- 로그인 실패 5회 계정 잠금 제거, 실패 기록은 유지.

## Verification
- `npm run typecheck` 통과.
- `npx vitest run --maxWorkers=1 --minWorkers=1 schedule-return-performance-parser.test.ts` 통과: 26 tests.
- `npx vitest run --maxWorkers=1 --minWorkers=1 performance-management-service.test.ts` 통과: 18 tests.
- `npm run test` 통과: 130 files / 635 tests.
- `npm run build` 통과.
- `git diff --check` 통과.
- `npm run release:check` 통과.
- `npm run release:publish` 통과.
- `npm run smoke:electron:packaged` 통과.
- `npm run smoke:electron:installer` 통과: 재설치 데이터 보존 확인.

## Release
- Package version: 0.4.27.
- Packaging target: GitHub Release `v0.4.27` Published.
- Required assets verified: installer, blockmap, `latest.yml`, `RELEASE_MANIFEST.json`.
