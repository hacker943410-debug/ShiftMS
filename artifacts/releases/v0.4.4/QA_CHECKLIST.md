# v0.4.4 QA 체크리스트

## 자동 검증
- [x] `npm run typecheck`
- [x] `npm test -- src/main/services/allowance-document-export-service.test.ts`
- [x] `npm run release:package`

## 수동 검증
- [ ] Access 복원 실패 시 원인 문구 확인
- [ ] 기본 양식 fallback 으로 품의서 출력 확인
- [ ] 커스텀 품의서 파일명 변경본에서 사이트 명 표기 확인
- [ ] 근무지명 공백 차이 케이스에서 사이트 명 표기 확인
- [ ] `smoke:electron:packaged`
- [ ] `smoke:electron:installer`
