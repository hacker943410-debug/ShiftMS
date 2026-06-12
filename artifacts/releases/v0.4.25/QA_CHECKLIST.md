# QA Checklist

## Automated
- [x] `npm run test`
- [x] `npm run build`
- [x] `git diff --check`
- [x] `npm run smoke:electron:packaged`
- [x] `npm run smoke:electron:installer`

## Manual Smoke Targets
- [ ] 근무지 관리 상세 보기에서 Cycle 근무시간이 1근부터 순서대로 보이는지 확인.
- [ ] 실적관리에서 반환 파일 변경 없이 새로고침 후 최신 근무시간 계산이 반영되는지 확인.
- [ ] 근무표 칸에 `None`을 입력한 반환 파일이 실적관리 목록에 표시되지 않는지 확인.
- [ ] 실적관리 필터 순서가 `연도`, `월`, `근무지명`, `조회구분`, `근로유형`인지 확인.
- [ ] 실적관리 테이블이 데스크톱 폭에서 불필요한 좌우 스크롤 없이 보이는지 확인.
- [ ] 구형 품의서 템플릿 등록 시 저장이 차단되고 안내가 표시되는지 확인.

## Packaging
- [x] `npm run release:check`
- [x] `npm run release:publish`
- [x] GitHub Release `v0.4.25` Published 확인.
- [x] 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json` asset 확인.
