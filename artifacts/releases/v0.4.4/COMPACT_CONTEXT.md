# v0.4.4 Compact Context

## 목표
- Access 복원 실패 원인을 더 구체적으로 안내한다.
- 설치본에서 기본 Excel 양식을 안정적으로 찾는다.
- 품의서 출력에서 등록된 사이트 명이 빠지지 않게 한다.

## 핵심 판단
- 수정분 품의서 판별은 파일명만으로 결정하지 않는다.
- 근무지명 lookup은 공백/구분자 차이를 허용하되, 모호한 경우에만 exact 우선으로 둔다.
- 사용자 추가 양식은 계속 사용자 파일을 우선하고, 기본 양식은 fallback 용도로만 사용한다.

## 검증 기준
- `npm run typecheck`
- `npm test -- src/main/services/allowance-document-export-service.test.ts`
- `npm run release:package`
