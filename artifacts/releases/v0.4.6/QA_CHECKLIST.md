# QA Checklist

## 자동 검증
- [x] `npm run typecheck`
- [x] `npx vitest run src/main/services/app-update-service.test.ts src/main/services/release-history-service.test.ts src/main/services/release-publish-helpers.test.ts src/renderer/App.test.tsx`
- [x] `node scripts/release-check.mjs`
- [x] `npm run release:publish`

## 수동 확인
- [ ] 업데이트 후 패치노트가 여러 버전을 순서대로 보여주는지 확인
- [ ] 마지막 페이지까지 확인해야 종료되는지 확인
- [ ] 운영 관리 `패치이력` 필터와 검색이 기대대로 동작하는지 확인
