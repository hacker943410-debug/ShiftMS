# v0.4.18 Implementation Analysis

## 원인
`최종 품의 승인` 버튼의 renderer 액션이 `approveAllowanceProposal` 호출 시 `outputFormat: "pdf"`를 하드코딩했다. 이 때문에 최종 품의승인 단계에서는 Excel 생성이 시도되지 않고 PDF 문서 출력만 수행됐다.

## 수정
- 최종 품의승인 요청의 `outputFormat`을 `xlsx`로 변경했다.
- 완료 안내 문구를 `Excel 문서 출력` 기준으로 바꿨다.
- 미리보기 제목에서 PDF 한정 표현을 제거했다.

## 검증 방향
- renderer 단위 테스트에서 최종 품의승인 요청이 `xlsx`를 전달하는지 확인한다.
- main service 테스트에서 Excel 문서 생성과 PDF 문서 생성 경로가 모두 유지되는지 확인한다.
- 타입체크와 릴리즈 검증으로 패키징 전 정합성을 확인한다.

## 제외
- 운영 양식 구조 변경은 포함하지 않았다.
- 수당 계산식, 승인 상태 전환, 백업 정책은 변경하지 않았다.
