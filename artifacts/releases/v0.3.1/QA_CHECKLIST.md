# v0.3.1 QA 체크리스트

## 자동 검증
- npm run typecheck
- npm test -- allowance-document-export-service document-template-preview-service allowance-document-pdf-service
- npm run build:renderer
- npm run build:electron
- npm run smoke:electron:guide-batch5
- npm run smoke:electron:guides

## 수동 확인
- 핵심 업무 흐름이 현재 운영 문서와 같은 순서로 재현되는지 확인한다.
- 내부 모달, 출력 문서, 백업/이력 문구가 실제 동작과 일치하는지 확인한다.
- 필요 시 docs/operations-manual-qa-checklist.md 기준 실데이터 QA를 추가한다.
