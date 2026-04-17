# Code Quality Report

## 목적
- 구조적 복잡도, 중복, 결합도, 테스트 공백을 기록한다.
- 리팩토링 우선순위의 근거 문서로 사용한다.

## 평가 기준
- 파일 크기와 책임 집중도
- 서비스 경계 명확성
- renderer/main/shared 분리 상태
- 입력 검증과 오류 처리 일관성
- 테스트 존재 여부와 회귀 방어력

## 초기 관찰
- `main.ts`의 IPC 집중은 줄었지만, 아직 앱 부트스트랩과 일부 업무 IPC 조립 책임을 동시에 가진다.
- `src/main/services` 비중이 커서, 기능 확장 시 서비스 간 결합과 중복 검토가 필요하다.
- 테스트 수는 적지 않지만, 구조 리팩토링 보호막 관점에서는 golden path 테스트 목록을 별도로 정리해야 한다.
- 문서 기준 대비 “개발자 유지보수용 절차 문서”는 아직 부족하다.

## 진행 메모
- `Wave 3` batch 1에서 `src/main/services/database-file-policy-service.ts`를 추가해 backup/migration 경로 정책 중복을 제거했다.
- `Wave 3` batch 2에서 `src/main/services/database-powershell-diagnostic-service.ts`, `src/main/services/database-replacement-service.ts`를 추가해 PowerShell/rollback 분기를 service 밖으로 걷어냈다.
- `Wave 3` batch 3에서 `src/main/ipc/ipc-handler-helpers.ts`를 추가하고 `register-operations-handlers.ts`에 1차 적용해 success/error/activity 조립 중복을 줄였다.
- `Wave 3` batch 4에서 같은 helper를 `register-workforce-handlers.ts`, `register-performance-handlers.ts`까지 확장했다.
- `Wave 3` batch 5에서 같은 helper를 `register-allowance-handlers.ts`, `register-core-handlers.ts`까지 확장했다.
- 현재 남은 품질 과제는 backup/migration smoke 고정과 `Wave 4` renderer 분해 착수 전 기준 문서 보강이다.

## 다음 기록 예정
- IPC handler 수와 도메인별 분포
- 장대 파일 및 다중 책임 파일 목록
- 입력 검증/에러 메시지 일관성 점검
- 테스트가 약한 흐름 식별

## Findings

### Major 1. `main.ts`에 앱 부트스트랩과 IPC 조립 책임이 과도하게 집중되어 있다.
- 근거:
  - `src/main/main.ts`
  - 감사 시작 시 파일 길이 `1836` lines
  - 현재 파일 길이 `192` lines
  - 현재 inline `ipcMain.handle(...)` 등록 `0`건
  - 분리된 registrar: `src/main/ipc/register-core-handlers.ts`, `src/main/ipc/register-workforce-handlers.ts`, `src/main/ipc/register-operations-handlers.ts`, `src/main/ipc/register-performance-handlers.ts`, `src/main/ipc/register-allowance-handlers.ts`
- 영향:
  - 새 기능 추가 시 충돌 범위가 커진다.
  - 권한 검증, 오류 처리, activity logging 패턴이 handler별로 흩어진다.
  - 도메인별 IPC 모듈화 없이 유지보수할수록 실수 가능성이 높아진다.
- 진행 상태:
  - `core`, `workforce`, `operations`, `performance`, `allowance` registrar 분리로 `main.ts` 집중도는 크게 낮아졌다.
  - `ipc-handler-helpers.ts`로 `operations`, `workforce`, `performance`, `allowance`, `core` registrar의 공통 조립을 흡수했다.
  - 다음 핵심 대상은 renderer 장대 화면 분해 전에 테스트와 변경 경계를 더 분명히 고정하는 것이다.
- 권장:
  - 도메인별 IPC registrar 분리
  - 공통 `requireSession`, `requireAdmin`, `withActivityLog`, `withErrorBoundary` 래퍼 도입

### Major 2. renderer 핵심 화면들이 장대 컴포넌트로 커져서 변경 난이도가 높다.
- 근거:
  - `src/renderer/screens/SiteManagementScreen.tsx`: `3966` lines
  - `src/renderer/screens/AllowanceManagementScreen.tsx`: `2768` lines
  - `src/renderer/screens/DashboardScreen.tsx`: `2216` lines
  - `src/renderer/screens/ShiftPatternManagementScreen.tsx`: `2192` lines
  - `src/renderer/screens/ScheduleManagementScreen.tsx`: `1996` lines
- 영향:
  - UI 수정이 곧 상태, API 호출, 계산 보조 로직 수정으로 이어진다.
  - 화면 단위 회귀 테스트 없이 리팩토링하기 어렵다.
- 권장:
  - 화면을 `container + section + hook` 구조로 분리
  - 조회/편집/모달/가이드 로직 분리

### Major 3. 도메인 서비스 일부는 전용 테스트 없이 핵심 흐름에 연결된다.
- 근거:
  - `src/main/services` 기준 전용 테스트 부재 파일 `11`개
  - 특히 문서 템플릿 보조 서비스와 실적 보조 서비스가 포함된다.
- 영향:
  - 리팩토링 시 보조 서비스의 회귀가 늦게 드러날 수 있다.
  - 장대 서비스 분리를 시작하려면 먼저 보호 테스트가 필요하다.
- 권장:
  - 구조 리팩토링 전에 `database-migration`, `operations-storage`, 문서 출력 주변 보조 서비스부터 golden test 확보

### Major 4. 공통 cross-cutting concern이 handler마다 수동으로 흩어져 있다.
- 근거:
  - `src/main/main.ts`
  - `src/main/ipc/ipc-handler-helpers.ts`
  - `src/main/ipc/register-core-handlers.ts`
  - `src/main/ipc/register-workforce-handlers.ts`
  - `src/main/ipc/register-operations-handlers.ts`
  - `src/main/ipc/register-performance-handlers.ts`
  - `src/main/ipc/register-allowance-handlers.ts`
  - activity logging, error mapping, session 주입이 registrar별 수기 구현
- 영향:
  - 동일한 보안/로깅/에러 정책이 기능마다 달라진다.
  - 새 handler 추가 시 정책 누락이 구조적으로 반복된다.
- 진행 상태:
  - `runIpcActionWithCleanup()` 도입으로 DB 복원 preview/update의 file-watch restart는 공통 패턴으로 이동했다.
  - `runIpcSaveDialogAction()` / `runIpcSaveDialogResultAction()` 도입으로 대시보드 export와 양식 미리보기의 저장 다이얼로그 분기는 공통 패턴으로 이동했다.
  - `runIpcOpenPathAction()` 도입으로 `performance:open-source-file`의 파일 존재 확인과 OS open 결과 해석도 공통 패턴으로 이동했다.
- 권장:
  - 다음 배치부터는 IPC helper 확장보다 renderer hotspot 분해나 운영 문서 보강으로 무게중심을 옮긴다

### Minor 1. 코드 기준 문서는 존재하지만 유지보수 절차 문서는 아직 얇다.
- 근거:
  - `docs/technical-overview.md`, `docs/functional-spec.md`는 제품/구현 개요 중심
  - 신규 유지보수자 기준의 “어디를 수정해야 하는지” 문서는 부족
- 권장:
  - 유지보수자 문서에 메뉴별 진입점, IPC 추가 절차, 패키징 절차, 장애 진단표를 별도 제공
