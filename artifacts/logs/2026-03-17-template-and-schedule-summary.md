# 2026-03-17 Template And Schedule Summary

## Scope
- 운영 관리의 양식 탭을 실제 승인형 양식 관리 흐름으로 확장했다.
- 근무표 배포 양식을 샘플 2종 선택형으로 정리하고, 템플릿 프로필 기반 export 규칙을 연결했다.
- 근무표 배포 화면의 우측 정보 카드들을 압축형 레이아웃으로 재구성했다.

## Today
- 양식 등록 1단계/2단계, 1차 검증, 프로필 편집, 미리보기 저장, 미승인 저장, 승인, 기본 사용 전환, 삭제, 이력 표시를 운영 관리 화면에 연결했다.
- 근무표/품의서/별첨1/별첨2를 같은 document template 관리 모델과 SQLite 저장 구조로 통합했다.
- 근무표 배포는 `근무표 양식 1`과 `근무표 양식 2`를 선택할 수 있게 했고, 저장된 `templateVersionId`와 profile layout을 실제 preview/export에 반영하도록 바꿨다.
- 근무표 export는 월 기준 날짜 보정, 공휴일 배경색, 좌측 달력/가운데 스케줄 색상 규칙, 월별 저장 경로 규칙을 반영했다.
- 근무표 배포 화면은 `근무조 편성 정보`, `주차별 요약`, `월간 합계`, `배포 이력` 카드를 기본 압축형으로 바꾸고, 필요할 때만 펼쳐 보도록 정리했다.

## Verification
- `npm run typecheck`
- `npx vitest run src/main/services/schedule-plan-adapter.test.ts src/main/services/schedule-plan-preview-service.test.ts src/main/services/schedule-plan-export-service.test.ts`
- `npx vitest run src/main/services/document-template-management-service.test.ts src/main/services/document-template-preview-service.test.ts src/main/services/allowance-document-export-service.test.ts`
- `npx vitest run src/main/services/operations-storage-service.test.ts`
- `node scripts/validate-structure.mjs`

## Next Patch Order
1. 운영 관리 페이지 메뉴를 역할별로 분할한다.
2. 공휴일, 요율, 사용자, 양식 메뉴를 각각 독립적으로 패치한다.
3. 운영 관리가 안정되면 실적 관리 페이지 패치를 진행한다.
4. 이후 수당 관리 페이지 패치를 진행한다.

## Notes
- 생성 결과물인 preview xlsx, 테스트 산출물, 디버그 export 파일은 커밋 범위에서 제외한다.
- 근무표 배포 쪽 main/preload 로직 변경이 있었으므로 실제 앱 확인 시에는 재시작 기준으로 보는 것이 안전하다.
