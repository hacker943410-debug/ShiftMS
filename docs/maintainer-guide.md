# 유지보수자 가이드

## 문서 역할
- 이 문서는 `교대근무관리시스템 V0.4.1`의 현재 코드 기준 유지보수 절차를 정리한 문서다.
- 신규 담당자가 코드 진입점, IPC 추가 순서, 복원/백업/패키징 절차, 장애 진단 기준을 빠르게 따라갈 수 있게 하는 것이 목적이다.
- 제품 방향은 `docs/project-handbook.md`, 기능 범위는 `docs/functional-spec.md`, 구현 구조는 `docs/technical-overview.md`, 운영 기준은 `docs/operations-reference.md`를 우선 참조한다.
- 정리 기준일: `2026-04-20`
- 코드 기준 브랜치: `release/0.4.1`

## 현재 기준
- 최신 검증:
  - `npm run typecheck` 통과
  - `npm run test` 통과
  - `npm run build` 통과
  - `npm run smoke:electron:operations-user` 통과
  - `npm run smoke:electron:packaged` 통과
  - `npm run smoke:electron:installer` 통과
  - `npm run release:signoff` 통과 (`artifacts/releases/v0.4.1/logs/release-signoff-2026-04-20T08-00-14-672Z.md`)
  - `npm audit --audit-level=high` 통과
  - 현재 기준 테스트: `107 files / 428 tests`
- 최근 구조 변경:
  - Electron main IPC가 registrar 구조로 분리됨
  - backup/migration 관련 경로 정책, PowerShell 진단, DB replace/rollback helper가 분리됨
  - `SiteManagementScreen.tsx`의 drag auto-scroll, registration reset, list focus 복귀 orchestration이 hook으로 분리됨
  - seeded 기본 계정은 첫 로그인 시 `PasswordChangeScreen`에서 비밀번호를 바꾸기 전까지 운영 IPC가 차단됨
  - 첫 비밀번호 변경이 끝난 seeded 계정의 `bootstrap-credentials.json` entry는 retire되어 재발급되지 않음
- 아직 남은 큰 과제:
  - runtime-only 세션 정책은 `src/shared/config/auth-session-policy.ts` 기준으로 고정
  - 현재 role 정책은 `src/shared/domain/authorization.ts` 기준 `admin / planner / reviewer / operator` 4단계로 유지
  - packaged / installer 단계 자동 sign-off는 완료됐고, 남은 검증은 운영 데이터 수동 QA다

## 권장 읽기 순서
1. `docs/project-handbook.md`
2. `docs/functional-spec.md`
3. `docs/technical-overview.md`
4. 이 문서
5. `docs/operations-reference.md`
6. `docs/patch-notes.md`
7. `artifacts/releases/README.md`
8. `artifacts/releases/v0.4.1/README.md`

## 빠른 시작

### 필수 명령
- 의존성 설치: `npm install`
- 개발 실행: `npm run dev`
- 타입 점검: `npm run typecheck`
- 테스트: `npm run test`
- 전체 빌드: `npm run build`
- 구조 검증: `node scripts/validate-structure.mjs`
- 설치본 생성: `npm run package:win`
- 설치본 검증: `npm run release:verify-package`
- 릴리즈 PC sign-off 실행: `npm run release:signoff`

### 작업 시작 전 기본 확인
1. 현재 브랜치와 작업 트리를 확인한다.
2. `docs/README.md`와 `docs/project-handbook.md`의 현재 기준을 먼저 읽는다.
3. 배치 성격의 작업이면 관련 `artifacts/releases/vX.Y.Z/` 또는 `artifacts/reviews/...` 문서를 같이 연다.
4. 계산 규칙, 승인 흐름, 복원/백업 로직은 코드보다 먼저 문서와 테스트를 확인한다.

## 계층과 코드 진입점

### Electron / Bridge
- 앱 진입점: `src/main/main.ts`
- preload 브리지: `src/preload/index.ts`
- IPC 계약 타입: `src/shared/bridge/contracts.ts`
- 공통 IPC helper: `src/main/ipc/ipc-handler-helpers.ts`
- 권한 가드: `src/main/services/ipc-auth-guard-service.ts`

### IPC registrar
- core: `src/main/ipc/register-core-handlers.ts`
- workforce: `src/main/ipc/register-workforce-handlers.ts`
- operations: `src/main/ipc/register-operations-handlers.ts`
- performance: `src/main/ipc/register-performance-handlers.ts`
- allowance: `src/main/ipc/register-allowance-handlers.ts`

### 주요 서비스 진입점
- SQLite 초기화: `src/main/services/sqlite-storage-service.ts`
- 설정 해석: `src/main/services/app-settings-service.ts`
- 운영 기준 저장: `src/main/services/operations-storage-service.ts`
- 근무지/패턴 저장: `src/main/services/site-storage-service.ts`, `src/main/services/shift-pattern-storage-service.ts`
- 근무표 배포: `src/main/services/schedule-plan-*.ts`
- 실적 파싱/승인: `src/main/services/performance-*.ts`
- 수당 계산/품의/출력: `src/main/services/allowance-*.ts`
- 양식 관리: `src/main/services/document-template-*.ts`
- DB 백업/복원: `src/main/services/database-backup-service.ts`, `src/main/services/database-migration-service.ts`
- 복원 경로 정책: `src/main/services/database-file-policy-service.ts`
- PowerShell 진단: `src/main/services/database-powershell-diagnostic-service.ts`
- DB 교체/rollback: `src/main/services/database-replacement-service.ts`

### Renderer 주요 화면
- 루트: `src/renderer/App.tsx`
- 대시보드: `src/renderer/screens/DashboardScreen.tsx`
- 인력 관리: `src/renderer/screens/WorkforceManagementScreen.tsx`
- 근무지 관리: `src/renderer/screens/SiteManagementScreen.tsx`
- 근무표 배포: `src/renderer/screens/ScheduleManagementScreen.tsx`
- 실적 관리: `src/renderer/screens/PerformanceManagementScreen.tsx`
- 수당 관리: `src/renderer/screens/AllowanceManagementScreen.tsx`
- 운영 관리: `src/renderer/screens/ShiftPatternManagementScreen.tsx`

## 유지보수 기본 원칙
1. renderer에서 Node API, 파일 시스템, SQLite를 직접 사용하지 않는다.
2. 새 기능은 `shared contracts -> main service -> ipc registrar -> preload -> renderer` 순서로 추가한다.
3. 계산 규칙 변경 전에는 문서와 테스트를 먼저 맞춘다.
4. 승인 결과와 이력 데이터는 조용히 덮어쓰지 않는다.
5. 파일 경로, 복원, 백업 변경은 overwrite 방지와 절대경로 해석을 같이 확인한다.
6. 질문/확인/사유 입력은 `QuestionDialog`와 `useQuestionDialog().askQuestion(...)` 패턴을 사용한다.
7. 패키징 이슈는 `release/win-unpacked` 문제와 NSIS 설치본 문제를 분리해서 본다.

## 자주 쓰는 변경 절차

### 1. 새 IPC 추가 또는 수정
1. `src/shared/bridge/contracts.ts`에 입력/출력 타입과 bridge 시그니처를 추가한다.
2. `src/main/services/`에 실제 로직을 구현한다.
3. `withSession` 또는 `withAdmin` 중 어떤 보호가 필요한지 먼저 정한다.
4. 기존 registrar에 handler를 추가하고, 가능하면 `ipc-handler-helpers.ts`의 공통 패턴을 사용한다.
5. `src/preload/index.ts`에 `ipcRenderer.invoke(...)` wrapper를 추가한다.
6. renderer에서는 `window.appBridge`로만 호출한다.
7. service 테스트를 먼저 추가하고, 필요 시 화면 단위 테스트나 smoke를 보강한다.

### 2. 설정 / 경로 / 저장소 변경
1. `app-settings-service.ts`와 `app-settings-storage-service.ts`에서 설정 해석 경로를 먼저 확인한다.
2. 상대 경로 해석과 입력 파일 검증은 `database-file-policy-service.ts` 기준으로 맞춘다.
3. SQLite 테이블 변경이 필요하면 `sqlite-storage-service.ts`의 초기화와 보강 로직을 같이 수정한다.
4. 운영 관리 화면이 보여주는 설명 문구와 `docs/operations-reference.md`를 같이 맞춘다.

### 3. 대형 renderer 화면 정리
1. 화면 파일에서 selector, hook, action, presentational component로 분리 가능한 블록을 먼저 찾는다.
2. 순수 계산은 selector/helper 파일로, async 흐름은 action 파일로, UI 조립은 panel/view component로 이동한다.
3. 상태가 복잡하면 hook으로 위임하되, 화면 파일은 wiring과 route-level orchestration만 남긴다.
4. 이번 기준으로 `DashboardScreen.tsx`, `AllowanceManagementScreen.tsx`, `SiteManagementScreen.tsx`는 이미 1차 분해가 반영돼 있다.

### 4. 복원 / 백업 / Access 연동 변경
1. `database-backup-service.ts`와 `database-migration-service.ts`를 직접 수정하기 전에 helper 세 파일을 먼저 본다.
2. 사용자 메시지와 내부 진단 로그는 분리한다.
3. 복원 전 현재 DB 백업, 임시 DB 검증, 최종 교체, rollback 순서를 깨지 않는다.
4. Access export는 `resources/scripts/export-access-db.ps1` 포함 여부와 ACE OLEDB 환경을 같이 점검한다.

### 5. 패키징 / 릴리즈 검증
1. `npm run build`
2. `node scripts/validate-structure.mjs`
3. `npm run package:win`
4. 필요 시 `npm run smoke:electron:packaged`
5. 필요 시 `npm run smoke:electron:installer`
6. 전체 릴리즈 검증은 `npm run release:verify-package`
7. 릴리즈 PC에서 sign-off 로그를 남길 때는 `npm run release:signoff`

## 권한 / 보안 체크포인트
1. 새 IPC는 기본적으로 main에서 세션 검증이 필요하다고 가정한다.
2. 운영 관리는 `admin`, 기준정보/배포 계열은 `planner`, 승인 계열은 `reviewer`가 필요한지 먼저 검토한다.
3. UI의 `adminOnly`만으로 보호가 끝났다고 가정하지 않는다.
4. 외부 프로세스 실행은 입력 이스케이프, 작업 디렉터리, 로그 노출 범위를 같이 본다.
5. 파일 선택/저장/복원 기능은 경로 검증과 overwrite 방지 정책을 같이 확인한다.
6. 새 role 체계(`admin / planner / reviewer / operator`)는 `DashboardShell.test.tsx`와 `electron-operations-user-smoke.cjs`로 planner/reviewer 메뉴 및 action-level 권한까지 회귀를 잡고 있다. 운영 문서와 수동 QA 템플릿도 이 기준으로 정리됐으므로, 남은 핵심은 실제 운영 환경에서 체크리스트를 실행해 sign-off 기록을 남기는 것이다.
7. 개별 Electron smoke는 최신 `dist/`, `dist-electron/` 산출물을 사용하므로 renderer/main 변경 뒤에는 먼저 `npm run build`를 실행한다.

## 패키징 / 설치본 메모
- 출력 폴더는 `release/`다.
- unpacked 실행 확인 대상은 `release/win-unpacked/ShiftMgmt.exe`다.
- NSIS 설치본 생성은 `ShiftMgmt-Setup-${version}-${arch}.exe` 규칙을 따른다.
- 실행파일 아이콘 반영은 `package.json`의 `afterPack`과 `build/after-pack-set-icon.cjs`가 담당한다.
- 설치본에 `resources/scripts/export-access-db.ps1`가 포함되어야 Access 복원 기능이 동작한다.

## 장애 진단 기준

### 1. 설치본에서 Access 복원이 실패할 때
- `DB업데이트` 사전 점검 카드의 provider 상태를 확인한다.
- 설치본에 `resources/scripts/export-access-db.ps1`가 포함됐는지 확인한다.
- 대상 PC에 ACE OLEDB가 있는지 확인한다.
- `database-powershell-diagnostic-service.ts` 기준 사용자 메시지와 내부 로그를 분리해서 본다.

### 2. DB 복원 preview/update가 실패할 때
- 입력 파일이 `.json` 또는 `.accdb`인지 확인한다.
- 상대 경로 해석이 기대한 `dataDir` 아래 절대경로로 풀렸는지 확인한다.
- 기존 DB 백업 생성과 rollback이 동작했는지 확인한다.
- file-watch restart가 필요한 흐름인지 확인한다.

### 3. 패키징은 되는데 설치본 smoke가 불안정할 때
- `npm run smoke:electron:packaged`와 `npm run smoke:electron:installer`를 분리 실행한다.
- 릴리즈 PC에서는 `npm run release:signoff` 결과 로그가 `artifacts/releases/v0.4.1/logs/`에 남는지 같이 확인한다.
- 임시 설치 경로와 기존 실행 중 프로세스가 충돌하는지 확인한다.
- 아이콘, 추가 리소스, `export-access-db.ps1` 포함 여부를 같이 본다.

### 4. 운영 설정 변경 후 앱 동작이 이상할 때
- `operations:get-app-settings` 반환값을 먼저 확인한다.
- watcher/runtime 재시작 여부를 확인한다.
- 승인 대기, 승인 완료, export 경로가 서로 겹치지 않는지 확인한다.

## 현재 hotspot 메모

### Main / service
- `src/main/services/database-migration-service.ts`
- `src/main/services/allowance-document-export-service.ts`
- `src/main/services/operations-storage-service.ts`
- `src/main/services/allowance-document-pdf-service.ts`

### Renderer
- `src/renderer/screens/ShiftPatternManagementScreen.tsx`
- `src/renderer/screens/ScheduleManagementScreen.tsx`
- `src/renderer/screens/PerformanceManagementScreen.tsx`
- `src/renderer/screens/WorkforceManagementScreen.tsx`
- `src/renderer/screens/SiteManagementScreen.tsx`

### 이미 정리된 경계
- `SiteManagementScreen.tsx`: selector/action/hook 분리 + drag/navigation helper 분리 완료
- `AllowanceManagementScreen.tsx`: panel, selector, modal/action, state hook 분리 완료
- `DashboardScreen.tsx`: panel, selector, export action, filter state 분리 완료

## 참고 문서
- 운영 기준: `docs/operations-reference.md`
- 기능 범위: `docs/functional-spec.md`
- 기술 개요: `docs/technical-overview.md`
- 프로젝트 규칙: `docs/project-handbook.md`
- 버전별 릴리즈 아카이브: `artifacts/releases/README.md`
- 감사 산출물: `artifacts/reviews/project-audit-2026-04/`



