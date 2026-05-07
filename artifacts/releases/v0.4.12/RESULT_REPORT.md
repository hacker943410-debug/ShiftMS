# v0.4.12 결과 보고

## 결과
Pool 대체근무 실적을 운영 이력으로 유지하면서 수당 지급 대상에서 제외하는 패치를 완료했다.

## 반영 내용
- `이름(P)` 근무대체자 표기를 Pool 대체근무로 파싱.
- Pool 근무조 대체근무를 수당 미지급 대상으로 판정.
- Pool 대체근무 행을 실적관리 목록에 유지.
- Pool 대체근무 행을 승인 가능 건수와 수당 산정 대상에서 제외.
- 실적관리 행 우측 인력/시급 정보 모달 추가.
- 근무예정자/근무대체자 컬럼 중앙 정렬 보정.

## 검증 결과
- `npm run typecheck`: 통과
- `npx vitest run src/shared/domain/performance-file.test.ts src/main/services/schedule-return-performance-parser.test.ts src/main/services/performance-management-service.test.ts --maxWorkers=1 --minWorkers=1`: 통과, `3 files / 25 tests`
- `npm run build`: 통과
- `npm run release:check`: 통과
- `node scripts/validate-structure.mjs`: 통과
- `git diff --check`: 통과
- `npm run release:publish`: 통과

## 배포 상태
- 0.4.12 설치본 패키징 완료.
- GitHub Release `v0.4.12` 공개 게시 완료.
- 게시 URL: `https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.4.12`
- 포함 자산: `ShiftMgmt-Setup-0.4.12-x64.exe`, `ShiftMgmt-Setup-0.4.12-x64.exe.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`.
