# v0.4.18 QA Checklist

## 자동 검증
- [x] 최종 품의승인 액션이 `outputFormat: "xlsx"`로 요청한다.
- [x] 품의승인 완료 안내 문구가 Excel 출력 기준이다.
- [x] 품의 승인 미리보기 제목이 PDF 한정 표현을 쓰지 않는다.
- [x] 품의승인 서비스의 Excel 처리 테스트가 통과한다.
- [x] 문서 출력 서비스의 Excel/PDF 관련 테스트가 통과한다.
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run build`
- [x] `node scripts/validate-structure.mjs`
- [x] `npm run release:check`
- [x] `npm run release:publish`
- [x] `npm run smoke:electron:packaged`
- [x] `npm run smoke:electron:installer`

## 수동 QA 권장
- [ ] 설치본에서 최종 품의승인 후 품의서 Excel 파일이 생성된다.
- [ ] 설치본에서 최종 품의승인 후 별첨1 Excel 파일이 생성된다.
- [ ] 설치본에서 최종 품의승인 후 별첨2 Excel 파일이 생성된다.
- [ ] 별도 `PDF 출력` 버튼으로 PDF 3종이 생성된다.
- [ ] 별도 `Excel 출력` 버튼으로 Excel 3종이 생성된다.
- [ ] Excel 파일을 열었을 때 병합 셀 오류가 발생하지 않는다.
