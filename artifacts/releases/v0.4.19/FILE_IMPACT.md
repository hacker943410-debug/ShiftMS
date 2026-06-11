# v0.4.19 File Impact

## 변경 파일
- `package.json`, `package-lock.json`: 버전 `0.4.19` 반영.
- `src/renderer/screens/SiteManagementScreen.tsx`: 수정 draft의 시간/휴게시간 보존 로직 변경.
- `src/renderer/screens/site-management/site-management-selectors.ts`: canonical draft 변환 helper 추가.
- `src/renderer/screens/site-management/site-management-actions.ts`: 슬롯별 휴게시간 저장 payload 반영.
- `src/renderer/screens/site-management/site-pattern-simulation.ts`: 슬롯별 휴게시간으로 시뮬레이션 지표 계산.
- `src/shared/domain/shift-pattern-compression.ts`: step 생성과 display string mapping 보강.
- `src/main/services/allowance-document-export-service.ts`: Excel 병합 진단과 고객사 병합 정리 강화.

## 테스트 파일
- `src/renderer/screens/site-management/site-management-selectors.test.ts`
- `src/renderer/screens/site-management/site-management-actions.test.ts`
- `src/shared/domain/shift-pattern-compression.test.ts`
- `src/main/services/allowance-document-export-service.test.ts`

## 문서 파일
- `docs/release-0.4.19.md`
- `docs/project-handbook.md`
- `docs/README.md`
- `docs/patch-notes.md`
- `artifacts/releases/README.md`
- `artifacts/releases/v0.4.19/*`
