# v0.3.2 결과 보고

## 상태
- 진행 중

## 구현 결과
- Patch Set A: 양식 프로필을 문서 종류별로 분리하고 semantic zone/style spec 기반 구조를 추가했다.
- Patch Set B: workbook 기반 canvas snapshot과 도식형 미리보기 편집기를 연결했다.
- Patch Set C 1차: 선택 영역 속성 패널, 기준 복원, 최근 변경 되돌리기를 추가했다.
- Patch Set C 2차: 고급 모드에서 선택 영역 셀을 직접 눌러 대표 위치를 바꿀 수 있는 셀 그리드 오버레이를 추가했다.
- Patch Set C 3차: 선택 영역별 병합 범위를 직접 입력하고 도식/출력에 동시에 반영하는 UI를 추가했다.
- Patch Set C 4차: 고급 모드 안에서 열 너비/행 높이를 즉시 증감·복원하는 빠른 직접 조절 UI를 추가했다.
- Patch Set D 1차: style spec을 근무표/품의서/별첨1/별첨2 실제 workbook 출력에 반영했다.
- Patch Set D 2차: 운영 관리 가이드의 양식 관리 시뮬레이션과 운영 참고 문서를 새 편집기 흐름 기준으로 갱신했다.
- 2026-04-14 후속 보강: 대시보드 `기간 직접 지정`의 `시작 월`, `종료 월`을 앱 공통 팝오버 톤의 월 선택 컨트롤로 교체했다.
- 2026-04-14 후속 보강: 운영 관리 가이드에 `사이트 명 관리` 페이지와 시뮬레이션 장면을 추가했다.
- 2026-04-14 문서 정리: v0.3.2 릴리즈 아카이브 인덱스, 패치노트, TODO, QA, 작업 로그를 현재 진행 상태 기준으로 갱신했다.
- 통합 smoke: 양식 import -> save -> approve -> preview -> export 흐름을 서비스 테스트로 고정했다.

## 검증 결과
- `npm run typecheck`
- `npm test -- template-management-workflow template-editor document-template-preview-service schedule-plan-export-service allowance-document-export-service document-template-canvas-service document-template-management-service operations-storage-service allowance-proposal-approval-service`
- `npm run build:renderer`
- `npm run typecheck` (2026-04-14 후속 보강)
- `node scripts/validate-structure.mjs` (2026-04-14 후속 보강)
- `npm run build:renderer` (2026-04-14 후속 보강)

## 남은 이슈
- 저장된 profile/validation JSON migration 마감과 승인/기본 사용 전환 회귀 확인이 남아 있다.
- 수동 QA 절차를 실제 운영 데이터 기준으로 한 번 더 돌려야 한다.
