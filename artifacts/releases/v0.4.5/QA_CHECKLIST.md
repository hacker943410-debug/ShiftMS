# v0.4.5 QA 체크리스트

## 자동 검증
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `node scripts/release-check.mjs`
- [ ] `npm run release:publish`

## 수동 확인
- [ ] GitHub Release `v0.4.5`가 Published 상태인지 확인
- [ ] Release assets에 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`이 있는지 확인
- [ ] 기존 설치본에서 업데이트 안내 모달이 표시되는지 확인
- [ ] 인력 상세 고용형태 `정규` 저장이 실제 DB에 반영되는지 확인
- [ ] BP 인력이 근무표에는 표시되고 수당/실적 파싱에서는 제외되는지 확인
- [ ] 근무조 순서 변경이 근무표 배포 현황에 반영되는지 확인
