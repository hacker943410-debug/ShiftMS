# v0.3.0 QA 체크리스트

## 자동 검증
- npm run typecheck
- npm run test -- approved-allowance-calculation-service allowance-document-export-service allowance-proposal-approval-service database-backup-service
- npm test -- allowance-proposal-approval-service allowance-approval-service performance-approval-flow-service performance-management-service
- npm run build
- npm run smoke:electron

## 수동 확인
- 핵심 업무 흐름이 현재 운영 문서와 같은 순서로 재현되는지 확인한다.
- 내부 모달, 출력 문서, 백업/이력 문구가 실제 동작과 일치하는지 확인한다.
- 필요 시 docs/operations-manual-qa-checklist.md 기준 실데이터 QA를 추가한다.
