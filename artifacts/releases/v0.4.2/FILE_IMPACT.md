# v0.4.2 영향 파일

## 코드 영향

### Shared 계약 / 모델
- `src/shared/domain/model.ts`
  - cycle 패턴에 원문 문자열 필드를 추가했다.
- `src/shared/bridge/contracts.ts`
  - renderer-main 저장 계약에 cycle 원문 문자열 필드를 반영했다.

### Main process 저장소
- `src/main/services/sqlite-storage-service.ts`
  - `shift_pattern_cycles.pattern_string` 컬럼과 관련 초기화 경로를 반영했다.
- `src/main/services/shift-pattern-storage-service.ts`
  - cycle 저장 / 조회 시 원문 문자열을 함께 다루도록 수정했다.
- `src/main/services/shift-pattern-storage-service.test.ts`
  - cycle 원문 문자열 저장/조회 회귀 테스트를 추가했다.

### Renderer
- `src/renderer/screens/site-management/site-management-actions.ts`
  - 저장 payload에 cycle 원문 문자열을 포함하도록 수정했다.
- `src/renderer/screens/site-management/site-management-selectors.ts`
  - 표시 시 저장된 `patternString` 우선 사용 로직을 추가했다.
- `src/renderer/screens/site-management/site-management-selectors.test.ts`
  - selector fallback/우선순위 회귀 테스트를 추가했다.

## 문서 영향
- `package.json`
  - 앱 버전을 `0.4.2`로 갱신했다.
- `docs/release-0.4.2.md`
  - 현재 릴리즈 상태를 `패키징 완료 / smoke·sign-off 대기` 기준으로 정리했다.
- `docs/patch-notes.md`
  - `V0.4.2` 항목을 추가했다.
- `docs/README.md`
  - 현재 릴리즈 진행 상태를 최신 기준으로 갱신했다.
- `docs/project-handbook.md`
  - 최근 반영 변경과 현재 단계 정보를 갱신했다.
- `docs/maintainer-guide.md`
  - 이번 패키징 기준 검증 로그 정보를 갱신했다.
- `docs/operator-quick-start.md`
  - 설치 파일명을 `0.4.2` 기준으로 갱신했다.
- `docs/operations-manual-qa-checklist.md`
  - 최신 자동 검증 기준을 `437 tests`로 갱신했다.
- `artifacts/releases/README.md`
  - `v0.4.2` 릴리즈 인덱스를 추가했다.

## 산출물 영향
- `release/ShiftMgmt-Setup-0.4.2-x64.exe`
- `release/ShiftMgmt-Setup-0.4.2-x64.exe.blockmap`
- `release/win-unpacked/ShiftMgmt.exe`
- `artifacts/releases/v0.4.2/logs/2026-04-21-release-package.log`
