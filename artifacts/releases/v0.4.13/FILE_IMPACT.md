# v0.4.13 파일 영향 범위

## Main Process
- `src/main/services/allowance-document-export-service.ts`
  - 문서 출력 경로 표준화
  - 문서 금액 원 단위 올림
  - 별첨1 필수 행 검증
  - 품의서 Excel 문서번호 기준 보정
- `src/main/services/allowance-document-pdf-service.ts`
  - 품의서 PDF 문서번호 기준 보정
  - PDF 출력 금액 합계 기준 보정
- `src/main/services/database-migration-service.ts`
  - DB복원 인력 상태 기본값 보정
  - Access 복원 수당 금액 원 단위 올림

## Renderer
- `src/renderer/screens/WorkforceManagementScreen.tsx`
  - 인력관리 BP 필터와 인원 수 표시 추가
- `src/renderer/screens/allowance-management/allowance-management-review-actions.ts`
  - 문서 출력 실패 내부 모달 안내 보강

## Shared
- `src/shared/domain/rounding.ts`
  - 원 단위 올림 helper 추가
- `src/shared/domain/allowance-document.ts`
  - 품의서 문서번호 산출 helper 추가

## Tests
- 문서 출력, PDF 메타, DB복원 상태, 인력관리/출력 모달 관련 회귀 테스트 갱신
