# QA Checklist

## 자동 검증
- [x] `npm run typecheck`
- [x] `npx vitest run src/main/services/app-update-service.test.ts src/main/services/release-publish-helpers.test.ts`
- [x] `node scripts/release-check.mjs`
- [x] `npm run release:publish`

## 수동 확인
- [x] GitHub Release `v0.4.7`에서 `latest.yml`, `RELEASE_MANIFEST.json`, 설치본, `.blockmap`이 공개 게시 상태인지 확인
- [ ] 신규 설치 PC에서 `0.4.7` 설치 후 이후 버전 자동업데이트 감지 기준이 `ShiftMS` 저장소인지 확인
