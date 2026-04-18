# v0.4.0 파일 영향 범위

## 핵심 수정 대상

### renderer
- `src/renderer/screens/operations-management/OperationsTemplateSection.tsx`
  - 양식 관리 소개/목록/액션 UX 재정의
- `src/renderer/screens/operations-management/TemplateWizardModal.tsx`
  - 단계 구조를 도식형 편집 중심으로 전환
- `src/renderer/components/QuestionDialog.tsx`
  - 저장/적용/리셋/검증 질문 흐름 재사용 여부 점검

### renderer 신규 후보
- `src/renderer/screens/operations-management/TemplateCanvasEditor.tsx`
- `src/renderer/screens/operations-management/TemplateSemanticPropertiesPanel.tsx`
- `src/renderer/screens/operations-management/TemplateStylePanel.tsx`
- `src/renderer/screens/operations-management/TemplateZoneLegend.tsx`
- `src/renderer/screens/operations-management/TemplatePreviewToolbar.tsx`
- `src/renderer/components/MonthField.tsx`
  - 대시보드 기간 직접 지정의 월 선택 팝오버로 추가

### renderer 후속 보강
- `src/renderer/screens/DashboardScreen.tsx`
  - `기간 직접 지정`의 `시작 월`, `종료 월` 네이티브 month input을 `MonthField`로 교체
- `src/renderer/guides/OperationsGuideScene.tsx`
  - `site-name` variant와 사이트 명 관리 시뮬레이션 추가
- `src/renderer/guides/route-guides.tsx`
  - 운영 관리 가이드에 `사이트 명 관리` 페이지 추가
- `src/renderer/styles.css`
  - MonthField 팝오버/월 그리드 스타일과 운영 관리 사이트 명 가이드 스타일 추가

### main
- `src/main/services/document-template-management-service.ts`
  - 시맨틱 영역 감지/검증 확장
- `src/main/services/document-template-profile-service.ts`
  - profile 구조 확장
- `src/main/services/document-template-preview-service.ts`
  - 파일 preview 외 앱 내부 diagram preview 지원
- `src/main/services/schedule-plan-adapter.ts`
  - 내부 좌표 구조를 사용자 언어와 분리
- `src/main/services/operations-storage-service.ts`
  - profile/validation 저장 확장

### main 신규 후보
- `src/main/services/document-template-canvas-service.ts`
- `src/main/services/document-template-semantic-zone-service.ts`
- `src/main/services/document-template-style-compiler.ts`

### preload / shared
- `src/shared/domain/document-template.ts`
  - semantic zone / style spec / canvas snapshot 타입 추가
- `src/shared/domain/model.ts`
  - template version 메타데이터 확장
- `src/shared/bridge/contracts.ts`
  - 새 preview/save/inspect 브리지 타입 추가
- `src/preload/index.ts`
  - 양식 편집 전용 브리지 추가

### 문서 / 테스트
- `docs/operations-reference.md`
- `docs/operator-quick-start.md`
- `docs/operations-manual-qa-checklist.md`
- `docs/patch-notes.md`
- `docs/README.md`
- `docs/functional-spec.md`
- `docs/project-handbook.md`
- `artifacts/releases/README.md`
- `artifacts/releases/v0.4.0/*`
- 관련 unit/integration/smoke 테스트 파일

## 비수정 예상
- 실적 승인/수당 계산/대시보드 집계 핵심 로직
- PDF/Excel 출력 규칙 자체의 업무 계산식
- 활동 이력의 기존 감사 흐름

