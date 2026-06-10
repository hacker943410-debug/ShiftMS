# v0.4.18 Compact Context

## 현재 목적
품의승인 완료 시 운영자가 기대하는 Excel 문서 자동 생성 흐름을 복구한다.

## 핵심 맥락
- 백엔드 `approveAllowanceProposal`은 `outputFormat: "xlsx"`를 처리할 수 있다.
- 실제 문제는 renderer의 최종 품의승인 액션이 `outputFormat: "pdf"`를 고정해 보낸 점이었다.
- 별도 `PDF 출력` 버튼과 `Excel 출력` 버튼은 기존 문서 출력 경로를 계속 사용한다.

## 다음 작업자 참고
- 품의승인 마감 자동 출력은 `src/renderer/screens/allowance-management/allowance-management-modal-actions.ts`를 기준으로 본다.
- 문서 생성 자체는 `src/main/services/allowance-document-export-service.ts`가 담당한다.
- 운영 양식 문제는 앱 오류 메시지의 `원인:`과 `시도한 저장 경로`를 우선 확인한다.
