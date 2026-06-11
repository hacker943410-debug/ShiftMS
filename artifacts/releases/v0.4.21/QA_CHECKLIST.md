# v0.4.21 QA Checklist

## 자동 검증
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run build`
- [x] `node scripts/validate-structure.mjs`
- [x] `npm run release:check`
- [ ] `npm run release:publish`

## 수동 QA 권장
- [ ] 법정공휴일 행에서 `홍길동 -> 실투입자` 입력 시 총 근무시간과 수당이 0이 아닌지 확인한다.
- [ ] 법정공휴일 행에서 `- -> 실투입자` 입력 시 실적이 생성되는지 확인한다.
- [ ] 대체근무 표에서 원근무자 `-`, 대체근무자 실명 입력 시 대체근무 실적 시간이 생성되는지 확인한다.
- [ ] 정규 지급 근무지가 여러 개이고 퇴사자 선지급 행이 있는 품의서 Excel이 오류 없이 생성되는지 확인한다.

## 배포 확인
- [ ] GitHub Release `v0.4.21` Published 상태 확인.
- [ ] 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json` 자산 확인.
