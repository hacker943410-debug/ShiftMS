# 유지보수자 가이드

## 문서 역할
- 이 문서는 `교대근무관리시스템 v0.4.14`의 현재 코드 기준 유지보수 절차를 정리한 문서다.
- 신규 담당자가 코드 진입점, IPC 추가 순서, 복원/백업/패키징 절차, 장애 진단 기준을 빠르게 따라갈 수 있게 하는 것이 목적이다.
- 제품 방향은 `docs/project-handbook.md`, 기능 범위는 `docs/functional-spec.md`, 구현 구조는 `docs/technical-overview.md`, 운영 기준은 `docs/operations-reference.md`를 우선 참조한다.
- 정리 기준일: `2026-05-21`
- 코드 기준 브랜치: `release/0.4.14`

## 현재 기준
- 최신 검증:
  - `npm run typecheck` 통과
  - `npm run test` 통과
  - `npm run build` 통과
  - `npm run release:check` 통과
  - `node scripts/validate-structure.mjs` 통과
  - 최신 패치 기준: `artifacts/releases/v0.4.14/`
  - 현재 기준 테스트: `123 files / 537 tests`
- 최근 구조 변경:
  - Electron main IPC가 registrar 구조로 분리됨
  - backup/migration 관련 경로 정책, PowerShell 진단, DB replace/rollback helper가 분리됨
  - `SiteManagementScreen.tsx`의 drag auto-scroll, registration reset, list focus 복귀 orchestration이 hook으로 분리됨
  - seeded 기본 계정은 첫 로그인 시 `PasswordChangeScreen`에서 비밀번호를 바꾸기 전까지 운영 IPC가 차단됨
  - 첫 비밀번호 변경이 끝난 seeded 계정의 `bootstrap-credentials.json` entry는 retire되어 재발급되지 않음
- 아직 남은 큰 과제:
  - runtime-only 세션 정책은 `src/shared/config/auth-session-policy.ts` 기준으로 고정
  - 현재 role 정책은 `src/shared/domain/authorization.ts` 기준 `admin / planner / reviewer / operator` 4단계로 유지
  - 0.4.14 수동 QA와 패키징/GitHub Release 게시 확인은 아직 남아 있다
  - 자동업데이트는 GitHub Releases Published 상태와 `RELEASE_MANIFEST.json`을 기준으로 동작한다.

## 권장 읽기 순서
1. `docs/project-handbook.md`
2. `docs/functional-spec.md`
3. `docs/technical-overview.md`
4. 이 문서
5. `docs/operations-reference.md`
6. `docs/patch-notes.md`
7. `artifacts/releases/README.md`
8. `artifacts/releases/v0.4.14/README.md`

## 빠른 시작

### 필수 명령
- 의존성 설치: `npm install`
- 개발 실행: `npm run dev`
- 타입 점검: `npm run typecheck`
- 테스트: `npm run test`
- 전체 빌드: `npm run build`
- 구조 검증: `node scripts/validate-structure.mjs`
- 로컬 설치본 생성: `npm run release:package`
- GitHub Release 공개 게시: `npm run release:publish`
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
3. `npm run release:package`
4. 필요 시 `npm run smoke:electron:packaged`
5. 필요 시 `npm run smoke:electron:installer`
6. 전체 릴리즈 검증은 `npm run release:verify-package`
7. 릴리즈 PC에서 sign-off 로그를 남길 때는 `npm run release:signoff`
8. 사용자가 별도 제한 없이 패키징을 요청한 경우 최종 배포는 `npm run release:publish`로 수행하고 GitHub Release가 Published 상태인지 확인한다.

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
- `npm run release:publish`는 GitHub Release 본문과 `RELEASE_MANIFEST.json`을 동기화한 뒤 Release를 공개 게시한다.
- `GH_TOKEN`이 없거나 권한이 부족하면 GitHub Release 게시가 실패하므로, 로컬 설치본 생성과 원격 게시 실패를 분리해서 진단한다.
- 사용자가 `로컬만`, `Draft만`, `게시 금지`라고 명시한 경우가 아니면 `package:win` 또는 `release:package`만으로 패키징 작업을 종료하지 않는다.

### ⚠️ 업데이트는 사용자 데이터를 건드리지 않는다 (건드리게 만들지 말 것)
운영자의 DB·계정·수집함은 `%APPDATA%\ShiftMgmt\` 에 있고 **설치본은 Program Files 쪽 앱 파일만 교체한다.**
`nsis.deleteAppDataOnUninstall` 은 설정하지 않는다 — 기본값 `false` 이고, 원클릭 설치본에만 적용되는 옵션이다(이 프로젝트는 `oneClick: false`). **켜지 말 것.**

- `build/installer.nsh` 가 설치 전에 `%APPDATA%\ShiftMgmt*` 를 **`%LOCALAPPDATA%\ShiftMgmt-update-backup`** 으로 복사하고, 설치 후 `build/installer-update-data.ps1` 로 되돌린다.
- ⚠️ **그 경로를 NSIS 가 계산해 넘기지 않는다 — 스크립트가 직접 `%LOCALAPPDATA%` 를 읽는다.** NSIS 의 `$LOCALAPPDATA` 는 shell var context 를 따르고, electron-builder 의 `initMultiUser` 가 `customInit` 보다 먼저 돌면서 **전체 사용자 설치에서는 context 가 `all`** 이 된다. 그때 `$LOCALAPPDATA` 는 **`C:\ProgramData`** — 로컬 사용자 누구나 읽을 수 있고 서로 공유하는 폴더다. 그 백업에는 계정과 DB 가 들어 있다. 스크립트가 자기 프로세스의 `%LOCALAPPDATA%` 를 읽으면 **백업하는 `%APPDATA%` 와 같은 사용자**로 항상 맞추어진다.

- ⚠️ **백업 위치를 `$PLUGINSDIR`(설치 임시 폴더)로 되돌리지 말 것.** 그 폴더는 설치 프로그램이 끝나는 순간 사라진다. 되돌리기가 중간에 멈추면 **아직 못 채운 파일이 세상에 남는 곳이 없어진다.** 실패한 뒤에 안전한 곳으로 옮기는 방식도 썼다가 접었다 — 그 복사 역시 실패할 수 있고, 하필 필요할 때 실패한다. 지금은 **처음부터 오래 남는 곳에 만들고, 실패해도 아무것도 옮기지 않는다.**
- ⚠️ **`%APPDATA%` 밑에 두지 말 것** — 백업 대상 판정이 `%APPDATA%\ShiftMgmt*` 를 전부 사용자 데이터로 보므로, 다음 업데이트가 백업을 라이브 데이터로 착각한다.
- **되돌리기가 끝나지 않은 백업은 지우지 않는다.** 다음 백업 때 `...-unrestored-<시각>` 으로 **이름만 바꿔 옆에 둔다.** 그 백업이 유일한 사본일 수 있어서다. `installer.nsh` 에서 이 폴더를 `RMDir` 하지 말 것.
- ⚠️ **개수나 날짜로 지우지 말 것.** “최근 3개만 유지” 를 썬 적이 있고, 네 번째 실패한 업데이트가 **아직 복구되지 않은 가장 오래된 자료를 지우고 종료코드 0 으로 끝났다.** 지우는 조건은 하나뿐이다 — 그 백업의 **모든 파일이 라이브에 바이트 단위로 같이 있을 때**(크기 보고 → SHA-256). 경로만 같고 내용이 다르면 남긴다 — 백업은 자동 복원의 재료이기도 하지만 운영자가 손으로 꺼내는 사본이기도 하다.
- ⚠️ **해시는 `Get-FileHash` 를 쓰지 말 것.** 설치 프로그램이 띄우는 `powershell.exe` 에서 그 cmdlet 을 **못 찾는 환경이 실제로 있다**(모듈 경로 의존). 실패하면 “다르다” 로 읽혀 지우지 못하거나 반대로 지울 수 있다. `[System.Security.Cryptography.SHA256]` 을 직접 쓴다.

- **되돌리기는 "빠진 파일만 채운다."** 살아 있는 폴더를 지우지 않고, 이미 있는 파일을 덮어쓰지 않는다.
- 이유: 예전에는 되돌리기가 라이브 폴더를 **통째로 지운 뒤** 복사했다. 그 사이에 복사가 실패하면(파일 잠김·디스크 부족·백신) 운영 데이터가 사라지고, 유일한 복사본은 NSIS가 설치 종료와 함께 지우는 `$PLUGINSDIR` 에 있었다. **무인 자동업데이트에서는 안내조차 없이 날아간다.**
- 되돌리기 실패는 더 이상 설치를 `Abort` 하지 않는다. 지운 것이 없으므로 되돌릴 것도 없다. 앞으로 이 단계에 **삭제를 다시 넣지 말 것.**
- 백업 단계는 파일 하나가 잠겨 있어도 그 파일만 건너뛰고 계속한다. 운영자가 엑셀을 열어 둔 것만으로 업데이트가 막히면 안 된다.
- **SQLite 짝꿍 파일(`-wal`·`-shm`) 판정은 "복원을 시작하기 전에 DB 본체가 살아 있었는가"로 한다.** "지금 본체가 있는가"로 물으면 안 된다 — 복사 순서가 `x.sqlite` → `x.sqlite-wal` 이라, 방금 자기가 되돌려 놓은 본체를 보고 "살아 있다"고 답하며 로그를 건너뛴다. **아직 정리(checkpoint)되지 않은 승인 기록은 그 로그에만 있어서 통째로 사라지고**, 스크립트는 성공으로 끝나며 백업까지 지운다. 그래서 복사 루프에 들어가기 **전에** 본체 존재 여부를 먼저 적어 둔다.
  - 본체가 원래 있었다 → 백업의 로그는 남의 로그다. 넣지 않는다.
  - 본체가 없어서 함께 복원한다 → 본체와 로그를 **한 묶음으로** 되돌린다.
- **DB 본체·`-wal`·`-shm` 은 한 묶음으로 판정한다 — 파일 하나씩 보면 안 된다.** 복사 전에 그룹별로 한 번 정한다.
  | 라이브 본체 | 백업 본체 | 처리 |
  |---|---|---|
  | 있음 | — | 그 그룹은 손대지 않는다(백업 로그는 다른 실행의 것) |
  | 없음 | 있음 | **백업이 들고 있는 모양 그대로** 복원 + 라이브에 남은 로그는 치운다 |
  | 없음 | 없음 | 복원하지 않고 **오류로 끝낸다** |
  - ⚠️ 그룹 판정은 “이미 그 자리에 있으면 건드리지 않는다” 규칙보다 **먼저** 묻는다. 나중에 물으면, 라이브에 남은 로그가 “이미 있는 파일” 로 건너뛰어져 **복원된 DB 옆에 남고**, 둘 다 가진 적 없는 값이 읽힌다.
 백업은 못 읽는 파일을 한 개씩 건너뛰므로 이런 반쪽 백업이 생길 수 있다. 로그만 되돌리면 SQLite 가 열지 못하는 폴더가 남는데, 그대로 성공 처리하면 **백업까지 지우고 끝난다.** 라이브 본체가 살아 있는 경우는 애초에 로그를 넣지 않으므로 이 오류가 나지 않는다.
- 근거 시험: `src/main/services/installer-update-data-script.test.ts` (Windows 전용). "leaves a database that survived the install exactly as it is" 가 덮어쓰기 금지를, "brings back a missing database with the commits that only its write-ahead log holds" 가 실제 WAL 커밋 보존을(진짜 SQLite 로 확인), "leaves the backup where it is when the restore cannot finish" · "keeps a backup whose restore never finished instead of writing over it" · "refuses to finish when the backup holds a log with no database to put it beside" 가 나머지를 고정한다.
- 앱 쪽은 안전하다 — 스키마는 전부 `CREATE TABLE IF NOT EXISTS` 이고 마이그레이션에 `DROP`·`DELETE` 가 없다. 표 전체를 비우는 구문은 `reset*ForTest` 뿐이다.
- 별도 안전망: 릴리즈 매니페스트의 `requiresDbBackup: true` 를 켜면 적용 직전에 앱이 JSON 백업을 뜬다(0.5.4~0.5.7 은 꺼져 있었다).
- **`build.productName` 과 `build.appId` 를 바꾸지 말 것.** 데이터 폴더 이름이 `productName` 에서 나오므로, 바꾸는 순간 기존 운영 데이터는 옛 폴더에 남고 앱은 **빈 DB로 새로 시작한다**. 운영자 눈에는 자료가 통째로 사라진 것으로 보인다. 0.5.3~0.5.7 은 전부 `ShiftMgmt` / `com.shiftmgmt.desktop` 로 동일하다. 부득이 바꾸려면 옛 폴더에서 옮겨오는 이전 절차를 먼저 만든다.

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
- 릴리즈 PC에서는 `npm run release:signoff` 결과 로그가 해당 `artifacts/releases/vX.Y.Z/logs/`에 남는지 같이 확인한다.
- 임시 설치 경로와 기존 실행 중 프로세스가 충돌하는지 확인한다.
- 아이콘, 추가 리소스, `export-access-db.ps1` 포함 여부를 같이 본다.

### 4. GitHub Release 게시가 실패할 때
- `GH_TOKEN` 환경 변수와 repository release 권한을 확인한다.
- `docs/release-X.Y.Z.md`, `artifacts/releases/vX.Y.Z/RELEASE_MANIFEST.json`, `package.json` 버전이 같은지 확인한다.
- GitHub Release asset에 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`이 모두 있는지 확인한다.
- Release가 Draft 상태로 남아 있으면 사용자 앱은 최신 업데이트로 감지하지 못한다.

### 5. 운영 설정 변경 후 앱 동작이 이상할 때
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




