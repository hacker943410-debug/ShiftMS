# v0.4.19 QA Checklist

## 자동 검증
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run build`
- [x] `node scripts/validate-structure.mjs`
- [x] `npm run release:check`
- [x] `npm run release:publish`
- [x] `npm run smoke:electron:packaged`
- [x] `npm run smoke:electron:installer`

## 수동 QA 권장
- [ ] 보라매DC 근무지 수정 1단계에서 1근, 2근, 3근 시간이 정상 순서로 표시되는지 확인한다.
- [ ] 수정 저장 후 동일 근무지를 다시 열어 시간이 뒤바뀌지 않는지 확인한다.
- [ ] 품의승인 Excel 출력 실패 시 오류 메시지에 문서 기능과 병합 범위가 표시되는지 확인한다.
- [ ] 품의서, 별첨1, 별첨2 Excel 파일이 정상 생성되는지 확인한다.

## 배포 확인
- [x] GitHub Release `v0.4.19` Published 상태 확인.
- [x] 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json` 자산 확인.
