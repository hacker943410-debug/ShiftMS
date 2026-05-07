# v0.4.10 QA 체크리스트

## 자동 검증
- [x] `npm run typecheck`
- [x] `npm run test -- src/main/services/performance-file-intake-service.test.ts src/main/services/performance-management-service.test.ts src/main/services/performance-queue-service.test.ts`

## 수동 확인 권장
- [ ] 승인대기 폴더를 `C:\연장근무관리\승인대기`로 설정한다.
- [ ] 실적 관리에서 연도/월을 선택한 뒤 승인대기 조회 시 진행률 모달이 표시되는지 확인한다.
- [ ] 다른 월 폴더에 잘못된 Excel을 넣어도 선택 월 조회가 느려지지 않는지 확인한다.
- [ ] 선택 월 폴더에 잘못된 Excel을 넣으면 내부모달에 파일명, 경로, 사유가 표시되는지 확인한다.
- [ ] `resources\scripts\issue-account-recovery-key.cmd`로 기존 DB 복구키 발급이 가능한지 확인한다.
