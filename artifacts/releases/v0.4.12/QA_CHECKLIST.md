# v0.4.12 QA 체크리스트

## 자동 검증
- [x] `npm run typecheck`
- [x] `npx vitest run src/shared/domain/performance-file.test.ts src/main/services/schedule-return-performance-parser.test.ts src/main/services/performance-management-service.test.ts --maxWorkers=1 --minWorkers=1`
- [x] `npm run build`
- [x] `npm run release:check`
- [x] `node scripts/validate-structure.mjs`
- [x] `git diff --check`
- [x] `npm run release:publish`
- [x] GitHub Release `v0.4.12` Published 상태 확인
- [x] GitHub Release 자산 4종 확인: 설치본, blockmap, `latest.yml`, `RELEASE_MANIFEST.json`

## 수동 검증
- [ ] 승인대기 실적 파일에서 `홍길동(P)` 형태의 근무대체자가 실적관리 목록에 표시된다.
- [ ] 해당 행의 상태가 `수당 미지급`으로 표시되고 승인 버튼이 보이지 않는다.
- [ ] 해당 행은 승인 가능 건수에 포함되지 않는다.
- [ ] 행 우측 INFO 버튼을 누르면 인력 기본정보와 시급 이력이 표시된다.
- [ ] 근무예정자/근무대체자 컬럼의 이름과 `-` 표시가 가운데 정렬된다.
