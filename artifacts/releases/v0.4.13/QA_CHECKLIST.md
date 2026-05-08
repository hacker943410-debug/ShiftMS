# v0.4.13 QA 체크리스트

## 자동 검증
- [x] 문서번호 helper 테스트
- [x] 품의서 PDF 메타 테스트
- [x] 품의서/별첨 Excel 출력 테스트
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run build`
- [ ] `npm run release:check`
- [ ] `npm run release:publish`

## 수동 QA
- [ ] 품의서 Excel 문서번호가 문서일자 월과 일치하는지 확인
- [ ] 품의서 PDF 문서번호가 문서일자 월과 일치하는지 확인
- [ ] 품의서/별첨1/별첨2 Excel이 `YYYY년\MM월` 폴더에 생성되는지 확인
- [ ] 품의서/별첨1/별첨2 PDF가 `YYYY년\MM월` 폴더에 생성되는지 확인
- [ ] 별첨1 필수 셀에 빈칸이 없는지 확인
- [ ] 연장근무 수당이 연장근로수당으로 계산되는지 확인
- [ ] DB복원 후 공백/미분류 상태 인력이 재직으로 표시되는지 확인
- [ ] 인력관리 BP 필터와 인원 수 표시가 맞는지 확인
