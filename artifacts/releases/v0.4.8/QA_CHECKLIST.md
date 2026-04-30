# QA Checklist

## 자동 검증
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npx vitest run src/renderer/App.test.tsx src/renderer/screens/operations-management/OperationsReleaseHistorySection.test.tsx`
- [x] `npx vitest run src/main/services/schedule-plan-export-service.test.ts`
- [x] `npx vitest run src/main/services/schedule-plan-preview-service.test.ts src/main/services/schedule-plan-export-service.test.ts src/main/services/schedule-plan-adapter.test.ts`
- [x] `node scripts/release-check.mjs`

## 수동 확인
- [ ] 운영 관리 `패치이력`이 게시판 목록으로 표시되는지 확인
- [ ] `Patch Note 0.4.8` 클릭 시 상세 페이지로 이동하는지 확인
- [ ] 업데이트 후 패치노트 마지막 단계에서 `마침` 버튼이 표시되는지 확인
- [ ] 앱 실행 시 메인 창이 최대화 상태로 열리는지 확인
- [ ] 2024년 10월 근무표 배포 Excel에서 9월 29일, 9월 30일이 `DD일` 형식으로 표시되는지 확인
