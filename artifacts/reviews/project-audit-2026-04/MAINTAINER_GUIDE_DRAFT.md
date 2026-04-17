# Maintainer Guide Draft

## 목적
- 신규 유지보수 담당자가 코드와 운영 흐름을 스스로 따라갈 수 있게 만든다.

## 목표 독자
- 개발을 직접 이어받는 운영/개발 담당자
- 배포와 장애 대응을 맡는 실무자

## 초안 범위
1. 아키텍처 개요
2. 메뉴별 코드 진입점
3. IPC 추가/수정 절차
4. DB 스키마와 설정 관리 방법
5. 복원/백업/패키징 절차
6. 자주 발생하는 장애 진단표

## 현재 상태
- 감사 결과와 Wave 1 권한 기준선이 반영됨
- `register-core`, `register-workforce`, `register-operations`, `register-performance`, `register-allowance` 분리까지 반영됨
- `database-file-policy-service.ts` 기준으로 backup/migration 경로 정책 1차 공통화가 반영됨
- `database-powershell-diagnostic-service.ts`, `database-replacement-service.ts` 기준으로 Wave 3의 PowerShell/rollback 2차 하드닝이 반영됨
- `ipc-handler-helpers.ts` 기준으로 `operations`, `workforce`, `performance`, `allowance`, `core` registrar의 success/error/activity 조립 공통화가 반영됨
- 다음 과제는 backup/migration 운영 문서를 정식화하고 `Wave 4` renderer 분해 기준을 고정하는 것이다

## 빠른 시작

### 필수 명령
- 의존성 설치: `npm install`
- 개발 실행: `npm run dev`
- 타입 점검: `npm run typecheck`
- 테스트: `npm run test`
- 전체 빌드: `npm run build`
- 설치본 생성: `npm run package:win`
- 설치본 검증: `npm run release:verify-package`

### 코드 진입점
- Electron 진입점: `src/main/main.ts`
- core registrar: `src/main/ipc/register-core-handlers.ts`
- workforce registrar: `src/main/ipc/register-workforce-handlers.ts`
- operations registrar: `src/main/ipc/register-operations-handlers.ts`
- performance registrar: `src/main/ipc/register-performance-handlers.ts`
- allowance registrar: `src/main/ipc/register-allowance-handlers.ts`
- IPC helper: `src/main/ipc/ipc-handler-helpers.ts`
- preload 브리지: `src/preload/index.ts`
- renderer 루트: `src/renderer/App.tsx`
- IPC 계약 타입: `src/shared/bridge/contracts.ts`
- SQLite 초기화: `src/main/services/sqlite-storage-service.ts`
- 운영 설정 해석: `src/main/services/app-settings-service.ts`
- DB 파일 경로 정책: `src/main/services/database-file-policy-service.ts`
- PowerShell 진단 정책: `src/main/services/database-powershell-diagnostic-service.ts`
- DB 교체/rollback 정책: `src/main/services/database-replacement-service.ts`
- DB 백업/복원: `src/main/services/database-backup-service.ts`, `src/main/services/database-migration-service.ts`

## 유지보수 기본 규칙
1. renderer에서 Node API를 직접 추가하지 않는다.
2. 새 기능은 `shared contracts -> main service -> ipc handler -> preload -> renderer` 순서로 추가한다.
3. 계산 규칙 변경 전에는 문서와 테스트를 먼저 맞춘다.
4. 파일 경로/복원/백업 변경은 `database-file-policy-service.ts` 기준 정책을 먼저 보고 overwrite 방지와 절대경로 해석을 함께 확인한다.
5. 패키징 이슈는 `release/win-unpacked`와 NSIS 설치본을 분리해서 확인한다.

## 메뉴별 1차 코드 맵
- 대시보드: `src/renderer/screens/DashboardScreen.tsx`, `src/main/services/dashboard-chart-export-service.ts`
- 인력 관리: `src/renderer/screens/WorkforceManagementScreen.tsx`, `employee-* service`
- 근무지 관리: `src/renderer/screens/SiteManagementScreen.tsx`, `site-storage-service.ts`, `shift-pattern-storage-service.ts`
- 근무표 배포: `src/renderer/screens/ScheduleManagementScreen.tsx`, `schedule-plan-* service`
- 실적 관리: `src/renderer/screens/PerformanceManagementScreen.tsx`, `performance-* service`
- 수당 관리: `src/renderer/screens/AllowanceManagementScreen.tsx`, `allowance-* service`
- 운영 관리: `src/renderer/screens/ShiftPatternManagementScreen.tsx`, `operations-* service`, `database-migration-service.ts`

## 패키징/설치본 메모
- 실행파일 아이콘 반영은 `package.json`의 `afterPack`과 `build/after-pack-set-icon.cjs`를 통해 처리된다.
- Access 복원은 설치본에 `resources/scripts/export-access-db.ps1`가 포함되어야 하며, 대상 PC에는 ACE OLEDB 환경이 필요할 수 있다.

## 새 IPC 추가 절차
1. `src/shared/bridge/contracts.ts`에 입력/출력 타입과 bridge 시그니처를 추가한다.
2. `src/main/services/`에 실제 로직을 구현한다.
3. `src/main/services/ipc-auth-guard-service.ts` 기준으로 `withSession` 또는 `withAdmin` 적용 방식을 먼저 결정한다.
4. 기존 도메인 registrar가 있으면 `src/main/ipc/` 아래 해당 파일에 `ipcMain.handle(...)`를 등록하고, 가능하면 `ipc-handler-helpers.ts`의 `createIpcSuccess()` / `runIpcAction()` / `runIpcActionWithCleanup()` / `runIpcSaveDialogAction()` / `runIpcSaveDialogResultAction()` / `runIpcOpenPathAction()` 패턴을 우선 사용한다.
5. 관련 registrar가 아직 없을 때만 새 registrar를 만들고 `src/main/main.ts`에 연결한다.
6. `src/preload/index.ts`에 `ipcRenderer.invoke(...)` wrapper를 추가한다.
7. renderer에서 `window.appBridge`로만 호출한다.
8. 가능한 경우 service 단위 테스트를 먼저 만들고, UI는 smoke 또는 최소 회귀 시나리오를 남긴다.

## 권한/보안 체크포인트
1. 새 IPC는 기본적으로 main에서 세션 검증이 필요하다고 가정한다.
2. 운영 관리와 기준정보 수정 계열은 관리자 role 검증이 필요하다.
3. 파일 선택/저장/복원 기능은 경로 검증과 overwrite 정책을 함께 확인한다.
4. 외부 프로세스 실행은 입력 이스케이프, 작업 디렉터리, 에러 메시지 노출 범위를 같이 본다.
5. UI의 `adminOnly`만으로 권한이 보호된다고 가정하지 않는다.
6. 동일 도메인 안에서도 조회/실행/승인/삭제를 같은 권한으로 묶지 말고 역할별로 다시 분류한다.

## 설정/경로 해석 메모
- 기본 설정 해석: `src/main/services/app-settings-service.ts`
- 상대 경로는 `userDataPath` 기준 `dataDir` 아래 절대 경로로 변환된다.
- 저장된 `migrationFilePath`와 Access 원본 백업 경로 해석은 `database-file-policy-service.ts`가 source of truth다.
- PowerShell raw stderr/stdout는 사용자 메시지 대신 내부 진단 로그로 우선 남기고, 사용자에게는 요약된 안내만 노출한다.
- `.env.example`에 있는 값은 초기 기본값이고, 운영 중 변경분은 저장소 설정으로 덮어쓴다.

## 현재 알려진 hotspot
- `src/main/main.ts`: runtime 시작/종료와 registrar wiring shell
- `src/main/ipc/register-core-handlers.ts`: 인증, 활동 이력, 대시보드 출력이 결합된 shell registrar
- `src/main/ipc/register-workforce-handlers.ts`: 인력, 근무지, 패턴, 근무표 흐름 집중
- `src/main/ipc/register-operations-handlers.ts`: 운영 관리 도메인 집중
- `src/main/ipc/register-performance-handlers.ts`: 승인/반려/파일 열기 흐름 집중
- `src/main/ipc/register-allowance-handlers.ts`: 계산, 승인, 품의, 출력 흐름 집중
- `src/main/ipc/ipc-handler-helpers.ts`: success/failure/activity 공통 조립
- `operations:preview-database-migration-update`, `operations:update-database-from-migration`는 `runIpcActionWithCleanup()`로 file-watch restart를 공통화했다
- `dashboard:export-*`, `operations:preview-document-template`는 저장 다이얼로그 분기를 helper로 공통화했다
- `performance:open-source-file`는 `runIpcOpenPathAction()`으로 파일 존재 확인과 `shell.openPath()` 분기를 공통화했고, handler에는 파일 메타데이터 조회만 남겼다
- `src/main/services/database-file-policy-service.ts`: 설정 기반 상대경로 해석과 복원 입력 파일 검증
- `src/main/services/database-powershell-diagnostic-service.ts`: PowerShell 실패 진단과 사용자 메시지 분리
- `src/main/services/database-replacement-service.ts`: SQLite 본파일 교체와 rollback 규칙
- `src/main/services/database-migration-service.ts`: Access/JSON 복원, 외부 PowerShell, DB 교체
- `src/main/services/operations-storage-service.ts`: 운영 기준 데이터 집중
- `src/renderer/screens/SiteManagementScreen.tsx`: 장대 UI + 다중 책임
- `src/renderer/screens/AllowanceManagementScreen.tsx`: 승인/반려/품의 흐름 집중

## 자주 볼 장애 진단

### 1. 설치본에서 Access 복원이 안 됨
- 확인 순서:
  - 설치본에 `resources/scripts/export-access-db.ps1`가 있는지
  - `DB업데이트` 사전 점검 카드에서 provider 상태가 무엇인지
  - 대상 PC에 ACE OLEDB가 있는지

### 2. 설치본 실행파일 아이콘이 기본 Electron으로 보임
- 확인 순서:
  - `build/icon.ico` 최신 생성 여부
  - `package.json`의 `afterPack`
  - `build/after-pack-set-icon.cjs` 실행 여부
  - `release/win-unpacked/ShiftMgmt.exe` 기준 아이콘 반영 확인

### 3. 패키징은 되는데 설치본 smoke가 불안정함
- 확인 순서:
  - `npm run smoke:electron:packaged`
  - `npm run smoke:electron:installer`
  - 임시 설치 경로와 기존 실행 중 프로세스 여부

### 4. 운영 설정 변경 후 동작이 이상함
- 확인 순서:
  - `operations:get-app-settings` 반환값
  - watcher/runtime 재시작 여부
  - 저장 경로가 서로 겹치지 않는지
