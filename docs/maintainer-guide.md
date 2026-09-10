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
- 되돌리기 실패는 더 이상 설치를 `Abort` 하지 않는다. 라이브 폴더를 비우거나 갈아엎지 않으므로 되돌릴 것도 없다. 앞으로 이 단계에 **삭제를 다시 넣지 말 것.** (⚠️ 이건 **되돌리기 단계** 이야기다. **백업 단계는 지금도 `Abort` 한다** — 아래 종료코드 표 밑의 경고를 볼 것.)
- 백업 단계는 파일 하나가 잠겨 있어도 그 파일만 건너뛰고 계속한다. 운영자가 엑셀을 열어 둔 것만으로 업데이트가 막히면 안 된다.
- **SQLite 짝꿍 파일(`-wal`·`-shm`) 판정은 "복원을 시작하기 전에 DB 본체가 살아 있었는가"로 한다.** "지금 본체가 있는가"로 물으면 안 된다 — 복사 순서가 `x.sqlite` → `x.sqlite-wal` 이라, 방금 자기가 되돌려 놓은 본체를 보고 "살아 있다"고 답하며 로그를 건너뛴다. **아직 정리(checkpoint)되지 않은 승인 기록은 그 로그에만 있어서 통째로 사라지고**, 스크립트는 성공으로 끝나며 백업까지 지운다. 그래서 복사 루프에 들어가기 **전에** 본체 존재 여부를 먼저 적어 둔다.
  - 본체가 원래 있었다 → 백업의 로그는 남의 로그다. 넣지 않는다.
  - 본체가 없어서 함께 복원한다 → 본체와 로그를 **한 묶음으로** 되돌린다.
  - ⚠️ **"살아남았다"는 이제 "파일이 있다"는 뜻이 아니다.** 그룹을 갈아 끼우는 동안에는 본체 옆에 `<본체이름>.restore-incomplete` 표시 파일을 만들어 두고, 다 끝나면 지운다. 도중에 전원이 나가면 그 표시가 남고, **표시가 붙은 본체는 다음 실행에서 "살아남은 것"으로 치지 않는다.** 이 표시가 없던 시절에는 반쯤 되돌려진 본체가 밖에서 보면 살아남은 본체와 똑같아서, 그 옆에 옛 로그가 그대로 붙은 채 **둘 다 가진 적 없는 값**이 읽혔다.
- **DB 본체·`-wal`·`-shm` 은 한 묶음으로 판정한다 — 파일 하나씩 보면 안 된다.** 복사 전에 그룹별로 한 번 정한다.
  **그룹 목록은 백업과 라이브 양쪽을 합쳐서 만든다.** 백업에만 있는 DB도, 라이브에만 남은 로그도 전부 답해야 하는 질문이 되어야 한다.
  | 라이브 본체 | 백업 본체 | 처리 |
  |---|---|---|
  | 있음 | — | 그 그룹은 손대지 않는다(백업 로그는 다른 실행의 것) |
  | 없음 | 있음 | **백업이 들고 있는 모양 그대로** 복원. 라이브에 남은 로그는 **지우지 않는다** — 아래 짝꿍 처리를 따른다 |
  | 없음 | 없음 · **내용 있는 로그가 어느 쪽에든 있음** | 복원하지 않고 **오류로 끝낸다** |
  | 없음 | 없음 · **내용 있는 로그가 없음**(`-shm` 이거나 0 바이트 `-wal`) | 복원할 것도 잃을 것도 없다. **라이브에 남은 것은 그대로 두고** 업데이트는 정상으로 끝난다 |
  - 아래 칸을 나눈 이유: 커밋을 들고 있을 수 있는 것은 **내용이 있는 `-wal`** 하나뿐이다. `-shm` 은 이 스크립트가 몇 줄 아래에서 스스로 지우는 **다시 만들 수 있는 색인**이고, 0 바이트 `-wal` 은 머리말도 프레임도 없다. 이 둘 때문에 업데이트 전체를 막으면 **되돌릴 것이 애초에 없던 실행**을 실패로 끝내는 셈이다. **내용 있는 고아 로그를 막는 규칙은 그대로다.**
    - ⚠️ **"내용이 있느냐" 는 `-wal` 한쪽에만 묻는다** — 그래서 **내용이 든 `-shm`** 도 이 칸으로 떨어진다. 그리고 이 칸으로 떨어지면 종료코드가 `0` 이라 **그 실행이 만든 안전 복사본은 지워진다**, 복사본이 그 짝꿍을 아직 들고 있어도. 이 완화로 예전 교차검증 서신 R24 4장의 세 경우 중 **둘이 판정이 뒤집힌다** → `docs/open-defects.md` 5장 6번에 그대로 적어 두었다.
  - **되돌리기는 "먼저 옆에 깔고, 마지막에 한꺼번에 갈아 끼운다".** 백업에서 온 파일은 우선 `.restore-part` 라는 임시 이름으로 복사하고, 그룹의 모든 파일을 실제로 바꿔 끼울 수 있다는 것을 **라이브를 한 바이트도 건드리기 전에** 확인한 뒤에야 진짜 이름으로 옮긴다. **깔기 단계에서** 하나라도 안 되면 임시 파일만 지우고 **라이브는 손대지 않은 채** 실패로 끝난다. 예전에는 파일을 하나씩 옮기다 중간에 막혀 **반쪽짜리 DB**가 남았다.
    - ⚠️ **마지막(갈아 끼우는) 단계에서 멈추면 이야기가 다르다.** 임시 파일을 지우는 처리는 깔기 단계만 감싸고 있어서, 그때는 표시 파일과 `.restore-part` 임시 파일이 **라이브 폴더에 남는다.** 남은 한계로 `docs/open-defects.md` 5장 3번에 적어 두었다.
      - ⚠️ **"다음 업데이트가 알아서 마저 끝낸다" 고 쓰지 말 것 — 실측으로 틀렸다.** 되돌리기를 **곧바로 다시** 부르면 마저 끝나는 것은 맞다. 그러나 **실제 업데이트는 그 사이에 새 백업 단계가 끼어든다.** 그 백업이 멀쩡한 안전 복사본을 `-unrestored-` 로 치워 두고 **본체가 없는 라이브 폴더를 새 복사본으로 담기 때문에**, 뒤이은 되돌리기에는 되돌릴 본체가 **양쪽 어디에도 없다.** 예전에는 그걸 "되돌릴 것이 없다" 로 읽고 **성공으로 끝내며 마지막 남은 복사본까지 지웠다**(실측 종료코드 `1 → 0 → 1` 이어야 할 것이 `1 → 0 → 0`). 지금은 **표시 파일이 그 판정보다 우선**이라 실패로 멈추고 **복사본을 전부 지킨다.** 진짜 DB 는 치워 둔 복사본 안에 있으므로 **손으로 되살려야 한다.**
    - 갈아 끼운 뒤에는 **실제로 무엇이 놓였는지 다시 묻는다.** 진짜 이름 자리가 폴더였다면 `Move-Item` 은 그 폴더 **안으로** 파일을 넣는다 — 그러면 DB 이름을 단 폴더가 남고, 실행은 성공이라고 보고하며 백업까지 지운다. 그래서 깔기 전에 임시 이름 자리를 **먼저 비우고**, 갈아 끼운 뒤에는 **크기가 깔아 둔 파일과 같은 진짜 파일인지** 확인한다. 비울 때 지우는 것은 **이름뿐**이다 — 그 자리가 **다른 파일의 두 번째 이름이나 바로가기**면 복사는 그 이름을 **뚫고 지나가** 운영자의 진짜 파일을 통째로 덮어쓰는데(갈아 끼운 뒤의 크기 검사도 양쪽 다 0으로 읽혀 그냥 통과한다), 이름만 지우면 **알맹이는 반대쪽 제 이름 아래 그대로 남는다.** 그 자리가 **무엇인지 묻지 않는 이유**: 두 번째 이름인지 알아보려면 그 파일을 **열어 봐야** 하는데, 운영자가 그 파일을 열어 둔 동안에는 **평범한 파일로 읽힌다**(실측: 같은 링크가 안 잡혀 있을 때는 `HardLink` 로 읽히지만, 다른 프로그램이 **읽기를 허용하지 않는 방식**으로 그 파일을 잡고 있으면 **빈 값**으로 읽힌다. 잡는 방식 17가지로 돌려 보니 예전 규칙은 그중 **3가지**에서 그냥 지나가 운영자 파일이 **DB 내용으로 덮여 사라졌고**(종료코드 0·안전 복사본 삭제·안내 없음), 지금 규칙은 **17가지 전부**에서 운영자 파일이 온전하고 DB도 되돌아왔다). **안에 무엇이 든 폴더**처럼 비울 수 없는 것만 남고, 그때는 표시 파일을 **남긴 채** 실패로 끝낸다 — 그 표시가 바로 다음 실행이 다시 되돌리게 만드는 장치다.
  - ⚠️ **라이브에 남은 로그(`-wal`)에 내용이 있으면 절대 지우지 않는다.** `...-wal-unrestored-<시각>` 으로 **이름만 바꿔 그 자리에 둔다.** 그 로그가 백업 본체보다 **더 새 승인 기록**을 들고 있을 수 있어서다(백업 본체는 한 번 덜 정리된 같은 DB다). 예전에는 이걸 지웠다 — 기계에서 가장 새 자료를 버리고 성공이라고 보고한 셈이다. **0 바이트 로그**는 안에 아무것도 없으니 지운다. **`-shm`** 은 로그 위에 다시 만들 수 있는 색인이라 **커밋을 들고 있을 수 없다.** 백업 쪽 복사본과 바이트까지 똑같으면 **그대로 두고**, 아니면 **지운다**(백업에 복사본이 있으면 그 자리에 그것이 들어온다). 예전에는 "백업에 있으면 덮어쓴다" 였는데, 덮어쓰려면 '바꿔 끼울 수 있는가' 관문을 지나야 해서 **읽기 전용 표시 하나**만으로 되돌리기 **전체**가 거절되고 운영자에게 **DB가 아예 없는 상태**가 남았다(실측: 같은 입력에서 종료코드 `1`·DB 없음 → `0`·DB 복원). 다만 **다른 프로그램이 색인을 붙잡고 있으면 여전히 실패한다** — 그때는 지우려다 실패하는 것이라 표시 파일과 임시 파일이 남는다. 붙잡은 쪽이 놓은 뒤 **되돌리기를 곧바로 다시 부르면** 스스로 끝난다(실측). **실제 업데이트처럼 사이에 백업 단계가 끼면 그렇지 않다** — 바로 위 경고 참고.
    - **짝꿍 두 개(`-wal`·`-shm`)는 같은 함수 하나(`Get-LiveSidecarDisposition`)로 판정한다.** 예전에는 손으로 쓴 갈래가 여덟 줄 간격으로 둘 있었고, 그래서 어긋났다 — `-wal` 에만 보호막을 달고 `-shm` 은 빠뜨린 탓에, `-wal` 이름 자리의 **폴더**는 아무 갈래에도 안 걸려 그대로 지나갔고(성공으로 끝내고 안전 복사본까지 지웠다. 그 폴더 옆의 DB는 앱이 열지 못한다) `-shm` 이름 자리의 폴더는 `Remove-Item` 으로 들어가 **날것의 오류**를 뱉었다(그 글은 아무도 읽지 못한다 — 아래 종료코드 표 밑 참고). 세 번째 갈래를 새로 쓰지 말 것.
    - **파일이 아닌 것(폴더·정션·바로가기)은 어느 짝꿍 이름에 있든 지우지 않고 이름만 바꿔 둔다.** 안에 운영자 파일이 들어 있을 수 있고, 그대로 두면 앱이 DB를 열지 못한다. 이때도 종료코드는 `3` 이다.
    - **같은 설치가 방금 만든 복사본과 바이트까지 똑같은 라이브 짝꿍(`-wal`·`-shm` 둘 다)에는 아무것도 하지 않는다** — 깔지도, 갈아 끼우지도, 치워 두지도 않는다. 똑같은 내용으로 덮어 봐야 얻는 것이 없고, '바꿔 끼울 수 있는가' 관문에 세우면 **읽기 전용 표시 하나**만으로 멀쩡히 끝났을 되돌리기가 거절로 바뀌어 운영자에게 **DB가 아예 없는 상태**를 남긴다.
  - ⚠️ 그룹 판정은 “이미 그 자리에 있으면 건드리지 않는다” 규칙보다 **먼저** 묻는다. 나중에 물으면, 라이브에 남은 로그가 “이미 있는 파일” 로 건너뛰어져 **복원된 DB 옆에 남고**, 둘 다 가진 적 없는 값이 읽힌다.
 백업은 못 읽는 파일을 한 개씩 건너뛰므로 이런 반쪽 백업이 생길 수 있다. 로그만 되돌리면 SQLite 가 열지 못하는 폴더가 남는데, 그대로 성공 처리하면 **백업까지 지우고 끝난다.** 라이브 본체가 살아 있는 경우는 애초에 로그를 넣지 않으므로 이 오류가 나지 않는다.
- **종료코드 네 가지가 계약의 전부다.** `build/installer.nsh` 는 이 숫자만 읽는다(원문은 `build/installer-update-data.ps1` 머리말).
  | 코드 | 뜻 | 안전 복사본 | 설치 프로그램 안내 |
  |---|---|---|---|
  | `0` | 끝났고 치워 둔 것도 없다 | 지운다 | 없음 |
  | `3` | **끝났지만 라이브에 있던 것을 이름만 바꿔 옆에 뒀다**(내용 있는 로그, 또는 로그·색인 이름 자리에 있던 폴더·바로가기) | **한 번 더 남긴다** | "정상적으로 끝났고, **그것은** 지우지 않고 이름만 바꿔 두었습니다" |
  | `4` | **끝났고 채워 넣기도 끝까지 돌았지만, 라이브 폴더를 읽지 못해 "더 채울 게 없다"고 단정할 수 없다** | **한 번 더 남긴다** | "정상적으로 끝났고, 열어 보지 못한 폴더가 있어 복사본을 남겨 두었습니다" |
  | 그 외 | **끝나지 않았다** | 그대로 둔다 | **되돌리기 단계**: 실패 안내(설치를 `Abort` 하지 않는다) · **백업 단계**: 안내 없이 `Abort` |
  - ⚠️ **표의 마지막 줄은 단계마다 다르다 — "실패해도 설치는 멈추지 않는다" 는 되돌리기 단계 이야기다.** 백업 단계는 `0` 외의 모든 숫자를 실패로 보고 **설치를 `Abort` 한다**(`build/installer.nsh`: `StrCmp $0 "0" update_backup_success update_backup_failed` → `IfSilent update_backup_abort` → `Abort`). 그러면 업데이트가 통째로 멈추고, **무인 자동업데이트에서는 안내조차 뜨지 않는다.** 백업 단계가 정말 0 아닌 값을 낼 수 있다는 것도 실측했다 — **지금 만들고 있는 안전 복사본 안의 파일 하나를 다른 프로그램이 열어 두면** 옆으로 치우기가 막혀 종료코드 `1` 이 된다. 그래서 되돌리기에서는 좋은 소식인 `3`·`4` 라도 **백업 단계가 내게 만들면 안 된다.**
  - ⚠️ **`3` 도 `4` 도 실패가 아니다.** 갈래가 생기기 전에는 두 숫자 다 실패 안내로 흘러들어가 운영자에게 **사실과 반대되는 말**을 보여 줬다. `4` 는 특히 **아무것도 잘못되지 않은 실행**이다 — 채워 넣기가 끝까지 돌았고 치워 둔 것도 없다. (⚠️ "복사본에 있던 파일을 하나도 빠짐없이 되돌렸다" 는 뜻은 **아니다.** 판정이 끝난 DB 묶음의 파일은 **일부러 건너뛴다** — 살아남은 DB 옆에 백업 쪽 로그를 붙이면 둘 다 가진 적 없는 값이 되기 때문이다. 실측: 살아남은 DB + 못 읽는 폴더 + 복사본이 그 DB의 로그를 들고 있는 상황 → `4` 로 끝나고 그 로그는 라이브에 없다. 그래서 안내 문구도 그렇게 말하지 않는다.)
  - ⚠️ **안내 문구는 개수를 말하지 않는다.** 둘 다 여러 개일 수 있다 — DB 두 개의 로그를 둘 다 치워 두면 `3` 한 번에 치운 것이 둘이고, 못 읽은 폴더가 셋이어도 `4` 는 그대로 `4` 다(둘 다 측정함). "파일 하나" 라고 적으면 운영자는 하나만 찾고 멈춘다.
  - ⚠️ **`3` 과 `4` 를 한 갈래로 합치지 말 것.** 두 안내는 바꿔 쓸 수 없다. `3` 만이 **운영자가 손댈 수도 있는 이름 바뀐 파일**을 남긴다.
  - ⚠️ **라이브 쪽을 못 읽은 것과 백업 쪽을 못 읽은 것은 다른 답이다.** 백업 쪽은 그 파일들이 **정말 안 채워졌을 수 있으므로** 그대로 실패(그 외)다. 라이브 쪽은 **질문 하나가 답을 못 얻었을 뿐**이라 `4` 다. 라이브 쪽을 실패로 되돌리면, 다 채워 놓고도 못 끝냈다고 말하는 실행이 그 폴더가 막혀 있는 동안 **매 업데이트마다** 반복된다 — 무인 업데이트에서는 말없이, 그러면서 복사본만 한 벌씩 쌓인다.
    - ⚠️ **다만 "라이브 쪽은 절대 실패하지 않는다" 는 아니다 — 이 문장이 한동안 여기 그렇게 적혀 있었다.** `4` 가 나오는 건 **대개 안전 복사본이 그 폴더 안의 파일을 안 들고 있을 때**다(반드시 그런 건 아니다 — 아래 마지막 문장). 들고 있고 그 폴더가 **아무 물음에도 답하지 않으면** 채워 넣기가 파일마다 던지는 "이건 이미 있나" 라는 물음이 거절당해 **첫 번째 그런 파일에서 멈추고**, 뒤 차례 파일들도 못 채운 채 **그대로 실패**로 끝난다. 실측(같은 시나리오, 막는 시점만 바꿈): 복사본 만들기 **전**에 막으면 `4`·계정 파일 복구됨, **뒤**에 막으면 실패·계정 파일 복구 안 됨. 이 멈춤은 `d322c5a` 도 똑같으니 **동작이 아니라 문장이 틀렸던 것**이다. 폴더가 목록만 못 보여 줄 뿐 이름을 대면 답해 주는 경우에는 그 안까지 채우고 `4` 로 끝난다(이것도 실측). → `docs/open-defects.md` 5장 5번
  - 🔴 **스크립트가 찍는 글은 아무 데도 남지 않는다 — 종료코드만 밖으로 나간다.** 못 읽은 폴더 이름은 `UNCHECKED <경로>` 로 찍히고, 그 밖에도 `QUARANTINED`·`KEPT`·`DROPPED`·`SKIPPED`·`NOBACKUP`·`NODATA` 가 찍힌다. 그런데 `build/installer.nsh` 는 스크립트를 `nsExec::ExecToStack` 으로 부르고 **종료코드만 꺼내 쓴다**(`Pop $0` 네 번, 그게 전부다). 찍힌 글은 NSIS 스택에 남아 그대로 버려진다. **설치 로그도 없다** — electron-builder 는 NSIS 로그 기능을 `nsis.customNsisBinary.debugLogging` 을 켤 때만 빌드에 넣는데 이 프로젝트는 켜지 않았다(확인: `package.json` 에 그 설정이 없고, `node_modules/app-builder-lib/templates/nsis/common.nsh` 의 로그 매크로는 그 정의가 없으면 통째로 빠진다).
    - 그래서 **종료코드 `4` 가 나와도 어느 폴더였는지는 운영자도 다음 담당자도 알 수 없다.** 안내 문구에 그 경로를 넣는 것도 지금 구조로는 안 된다 — 경로를 아는 것은 스크립트 프로세스뿐이고, 설치 프로그램은 스크립트가 찍은 글을 읽지 않는다.
    - **고치는 법은 한 줄이다(다음 담당자용, 이번엔 안 했다).** 같은 호출 방식(`-File` + `ExecToStack`)으로 작은 NSIS 설치본을 직접 만들어 돌려 본 결과, **`Pop` 을 한 번 더 하면 스크립트가 찍은 줄이 그대로 나온다**(찍은 두 줄 다 나왔고 종료코드도 `4` 그대로였다). 다만 그 글은 `UNCHECKED C:\...` 같은 **영어 딱지 붙은 원문**이라 운영자 안내에 그대로 붙일 수 없고, 딱지를 떼거나 여러 줄을 문장으로 다듬는 일은 **진짜 설치본을 돌려 봐야 확인되는 변경**이라 이번 묶음에서는 손대지 않았다.
  - 성공 경로에서 나오는 `NOBACKUP <경로>` · `NODATA` 두 줄은 "이 계정에는 백업이 없었다" · "복사할 것이 없었다" 는 뜻이고 **실패가 아니다.** 다만 위와 같은 이유로 **이 두 줄도 아무도 읽지 못한다** — `docs/open-defects.md` **G29**(다른 관리자 계정으로 승격한 설치)는 지금도 **밖에서 구분할 수 없다.** 구분할 수 있게 하려면 설치 프로그램이 이 줄들을 읽도록 먼저 고쳐야 한다.
  - ⚠️ 무인 자동업데이트(`IfSilent`)에서는 `3` · `4` 안내도 실패 안내도 **뜨지 않는다.** 파일은 디스크에 그대로 남지만 아무도 듣지 못한다 → `docs/open-defects.md` 5장.
- **안내 문구가 가리키는 폴더 이름은 두 파일에 따로 적혀 있다.** `build/installer.nsh` 의 `ExpandEnvStrings $UpdateBackupDisplayPath "%LOCALAPPDATA%\ShiftMgmt-update-backup"` 과 `build/installer-update-data.ps1` 의 `$BackupRoot` 다. 둘이 어긋나지 않게 붙잡는 것은 시험 `names the same folder the script actually backs up to` **하나뿐**이니 지우지 말고, Windows 전용 블록 안으로 옮기지도 말 것(CI 는 리눅스라 그러면 아예 안 돌아간다). 폴더 이름을 바꾸려면 두 파일을 같이 고친다. 안내 문구가 말하는 꼬리표 `-unrestored-` 도 스크립트의 `Move-LiveSidecarAside` 가 붙이는 이름과 같아야 하는데, **이 짝은 아무 시험도 안 잡고 있다.**
- **복원 마지막의 직접 확인 한 줄은 아무 시험도 안 잡는다.** `build/installer-update-data.ps1` 의 `Restore-DatabaseGroup` 은 임시 이름으로 만든 복사본을 제 이름으로 옮긴 뒤에 “그 이름에 진짜 그 파일이 앉았는가” 를 한 번 더 묻는다. 이 물음을 통과하지 못하게 만드는 디스크 상태는 **앞 단계에서 모두 먼저 거절되기 때문에**, 스크립트가 돌아가는 도중에 끼어들지 않고는 시험을 쓸 수 없다. 실측: DB 이름·임시 이름·로그 이름 자리에 36가지 모양을 놓고 돌렸는데, 그 한 줄을 지운 사본과 **36개 전부 결과가 같았다.** 그래서 코드 주석에 “일부러 시험이 없다” 고 적어 두었다. 지우지 말 것 — 시험이 다 초록불이어도 그 줄은 살아 있어야 하는 마지막 방패다.
- 근거 시험: `src/main/services/installer-update-data-script.test.ts` — **46개**(대부분 Windows 전용. 진짜 `powershell.exe` 를 띄우고 진짜 SQLite 로 확인한다). 어느 시험이 무엇을 붙잡고 있는지:
  | 붙잡는 규칙 | 시험 이름 |
  |---|---|
  | 기본 왕복(백업 → 복원) | `backs up and restores the packaged user data directory` |
  | 살아남은 파일을 덮어쓰지 않는다 | `leaves a database that survived the install exactly as it is` · `fills in only what the install left missing, and keeps what it added` |
  | **폴더나 빈 파일을 살아남은 DB로 읽지 않는다** | `does not call a directory or an empty file the database that survived the install` |
  | WAL 커밋을 진짜로 되살린다 | `brings back a missing database with the commits that only its write-ahead log holds` |
  | **라이브 로그를 지우지 않고 치워 둔다** | `keeps a live log holding commits the backup body does not have` · `does not write a backup's log over a newer live one` · `never pairs a restored database with a log the install left behind` · `never pairs a live database with a write-ahead log from the backup` |
  | **같은 설치가 방금 만든 복사본은 치워 두지 않는다** | `does not set a live log aside when it is the copy this same install just made` · `does not refuse a whole restore over a live log it was never going to touch` · `does not refuse a whole restore over a live index it was never going to keep` |
  | **그룹을 통째로 갈아 끼운다(반쪽 금지)** | `does not read its own half-finished restore back as a database that survived the install` · `finishes a restore that a crash stopped between the files of one database` |
  | **DB 이름을 폴더에 넣지 않는다** | `never hands the database's name to a folder that was sitting at the staged name` · `never writes a staged copy through a name that is a second name for another file` · `does not write a staged copy through a second name it cannot be told is one` |
  | **짝꿍 이름 자리의 폴더는 무시하지도 지우지도 않는다** | `never leaves a folder standing at the log's name and calls that a finished update` · `sets aside a folder at the index's name instead of handing it to Remove-Item` |
  | 짝이 안 맞으면 조용히 끝내지 않는다 | `refuses to finish when the backup holds a log with no database to put it beside` · `refuses a log the live folder still has when neither side has its database` · `refuses to finish when the live folder holds a log whose database is in neither side` · `refuses an orphan log in a live folder the backup never held` |
  | **되돌릴 것이 없으면 막지 않는다** | `finishes an update over a leftover sidecar that cannot hold a commit` |
  | **라이브 쪽을 못 읽어도, 복사본이 그 안을 안 들고 있으면 실패가 아니다(종료코드 4)** | `finishes and keeps the backup when a folder in the LIVE tree cannot be read` |
  | 못 끝냈으면 백업을 남긴다 | `leaves the backup where it is when the restore cannot finish` · `keeps a backup whose restore never finished instead of writing over it` |
  | **안 해도 되는 일은 말이라도 한다** | `says so instead of finishing silently when this account has no backup` · `says so instead of finishing silently when there is nothing to copy` |
  | **개수·날짜로 백업을 지우지 않는다** | `never deletes a kept backup holding the only copy of a file, however many there are` · `keeps every backup that still holds a file the live folder is missing` · `drops a kept backup once the live folder holds everything it was keeping` |
  - ⚠️ 이 줄은 **붙잡는 범위가 정해져 있다.** 첫 시험은 남겨둔 백업을 200개 쌓고 그 하나하나에 다른 곳에는 없는 파일을 하나씩 들려 놓은 다음, 그 파일이 전부 **내용까지 그대로** 남아 있는지 본다. 그래서 “최근 N개만 남기기” 규칙은 **N 이 200 이하일 때만**, “오래된 것 지우기” 규칙은 **기준이 1년 반 미만일 때만** 잡힌다. 그 위는 잡지 못하며, 글자만 보는 규칙(아래 `never counts the kept backups it is deciding about`)은 함수 **밖에** 쓴 삭제를 아예 못 본다 — 둘 다 실측했다.
  | **안 본 것을 근거로 지우지 않는다** | `keeps a backup the live folder only appears to hold, because it is the same file seen twice` · `will not call a backup redundant when it never looked inside it` · `keeps a backup whose file list it could not read in full` · `keeps a backup that still holds a folder the live side lost` · `does not say it dropped a backup that is still standing there` · `keeps a backup of folders the live side only reaches through a junction` |
  | 백업을 남과 공유하는 폴더에 두지 않는다 | `puts the backup in the user's own local folder rather than a shared one` |
  | 안내 문구가 진짜 폴더를 가리킨다 | `never shows the operator a placeholder that nothing on that path expands` · `names the same folder the script actually backs up to` · `is where the backup really is` |
  | 스크립트 자체 규칙 | `is pure ASCII` · `never calls Get-FileHash` · `never counts the kept backups it is deciding about`(위 범위 참고 — 이건 읽기 보조이지 본 관문이 아니다) |
  | **종료코드마다 안내가 있다(단계별로)** | `has an answer for every exit code the script can produce, in the phase that produces it` |
  - 두 단계를 따로 본다. 백업 단계는 `0` 만 정상으로 보고 나머지는 설치를 **멈춰 버리므로**, 복원 단계에서는 좋은 소식인 `3` 이라도 백업 단계가 내면 업데이트가 통째로 중단된다. 둘을 한 덩어리로 세면 그 짝을 맞다고 한다 — 실측했다. 주석 줄과 줄 끝 주석은 양쪽 모두 떼고 읽는다(`; StrCmp …` 는 갈래가 아니고, `exit 5  # 이유` 는 여전히 exit 이다).
  - **이 시험이 정확히 무엇을 보는지**(실측한 한계까지): ① 숫자를 내놓는 방법은 `exit <숫자>` 와 `[Environment]::Exit(<숫자>)` **둘 다** 센다. ② 숫자를 못 읽는 형태(`exit $변수`, 맨 `exit`)는 "exit 이 없다" 가 아니라 **그 자체로 실패**다. ③ 갈래가 **어디로 가는지**까지 본다 — 그 단계의 실패 딱지(`update_backup_failed`·`restore_backup_failed`)로 보내는 `StrCmp` 는 답으로 치지 않는다. ⚠️ **한 칸만 따라간다**: 다른 딱지로 보낸 뒤 그 딱지가 실패로 흘러 들어가면 못 잡는다. 실측(같은 시험을 일부러 망가뜨린 사본 6개로): 예전 시험은 `[Environment]::Exit(5)`·`exit $변수`·"백업 단계 `exit 3` + 실패 딱지로 보내는 갈래" 를 **전부 통과시켰고**, 지금 시험은 셋 다 잡는다. 예전에 잡던 둘(`exit 5  # 이유`, 주석 처리된 `4` 갈래)도 그대로 잡는다.
  - ⚠️ 이 목록은 **줄지 않는다.** 여기서 시험을 빼면 위 규칙 중 하나가 아무도 안 지키는 규칙이 된다.
- 앱 쪽은 안전하다 — 스키마는 전부 `CREATE TABLE IF NOT EXISTS` 이고 마이그레이션에 `DROP`·`DELETE` 가 없다. 표 전체를 비우는 구문은 `reset*ForTest` 뿐이다.
- 별도 안전망: 릴리즈 매니페스트의 `requiresDbBackup: true` 를 켜면 적용 직전에 앱이 JSON 백업을 뜬다(0.5.4~0.5.7 은 꺼져 있었다).
- **`build.productName` 과 `build.appId` 를 바꾸지 말 것.** 데이터 폴더 이름이 `productName` 에서 나오므로, 바꾸는 순간 기존 운영 데이터는 옛 폴더에 남고 앱은 **빈 DB로 새로 시작한다**. 운영자 눈에는 자료가 통째로 사라진 것으로 보인다. 0.5.3~0.5.7 은 전부 `ShiftMgmt` / `com.shiftmgmt.desktop` 로 동일하다. 부득이 바꾸려면 옛 폴더에서 옮겨오는 이전 절차를 먼저 만든다.

### 설치본 수동 점검 — 이 저장소의 시험으로는 못 잡는 것
`npm run package:win` 은 **설치 스크립트가 컴파일된다**는 것만 증명한다. NSIS 설치를 실제로 돌려 보는 시험은 이 저장소에 하나도 없다. 아래 두 가지는 **VM 에서 사람이 직접** 해야 하고, 설치 흐름을 건드린 릴리즈에서는 빼지 말 것.

1. **계정이 둘인 설치(권한 승격) 점검** — `docs/open-defects.md` **G29** 를 확인할 수 있는 유일한 방법이다.
   - 준비: VM 에 일반 사용자 `U` 와 **그와 다른** 관리자 `A` 를 만든다.
   - 절차: `U` 로 v(n) 을 설치 → `%APPDATA%\ShiftMgmt\data\accounts.json` 을 지운다 → `U` 로 v(n+1) 설치 파일을 실행 → "모든 사용자" 선택 → 권한 창에서 **`A` 의 암호**를 넣는다.
   - **통과**: `accounts.json` 이 다시 생기고, `U` 의 `%LOCALAPPDATA%` 에 `ShiftMgmt-update-backup` 이 남아 있지 않다.
   - **지금은 실패한다(G29 미해결).** 실패 모습까지 정해져 있다 — 종료코드 0, 안내 없음, 파일은 안 돌아오고, `U` 의 `%LOCALAPPDATA%\ShiftMgmt-update-backup` 이 그대로 남는다. 고친 뒤에는 이 절차가 **통과로 바뀌는지**로만 판단한다.
   - 곁들여: `A` 로 처음부터 "관리자 권한으로 실행" 해서 설치하면 `NODATA` 경로다. 지금은 아무 말도 나오지 않는다.
2. **"남아 있던 것을 지우지 않고 두었습니다" 안내 점검(종료코드 3)** — 되돌리기가 라이브 로그를 치워 두는 경우. (예전 제목은 안내에 있던 "파일 하나" 를 그대로 따왔는데, 그 표현은 개수와 함께 안내에서 빠졌다.)
   - 절차: 앱을 켜서 자료를 몇 건 넣어 `%APPDATA%\ShiftMgmt\data\shiftmgmt.sqlite-wal` 이 0 바이트가 아니게 만든 뒤, 본체 `shiftmgmt.sqlite` 만 지우고 업데이트를 돌린다.
   - **통과**: **실패 안내가 아니라** "정상적으로 끝났고 남아 있던 자료를 지우지 않고 두었습니다" 안내가 떠야 하고, 거기 적힌 폴더가 `%LOCALAPPDATA%...` 같은 **자리표시자가 아니라 진짜 경로**여야 한다. 그리고 `...-wal-unrestored-<시각>` 파일이 실제로 남아 있어야 한다.
   - 무인 자동업데이트에서는 이 안내가 **일부러 뜨지 않는다**(`IfSilent`). 그래서 이 점검은 **손으로 실행한 설치**에서만 의미가 있다.
   - ⚠️ **종료코드 `4` 안내는 진짜 기계에서 한 번도 띄워 본 적이 없다.** 갈래가 빠지지 않았는지는 시험이 붙잡고 있지만(`has an answer for every exit code the script can produce, in the phase that produces it`), 대화상자가 실제로 어떻게 보이는지는 사람이 확인한 적이 없다. 설치 흐름을 건드리는 다음 릴리즈에서 1·2번과 같이 VM 에서 한 번 띄워 볼 것 — 라이브 폴더 하나의 읽기 권한을 막아 두고 업데이트를 돌리면 된다. **막는 시점이 중요하다** — 업데이트를 시작하기 **전에** 막아야 안전 복사본도 그 폴더를 안 담아서 `4` 가 나온다. 복사본이 만들어진 **뒤에** 막히면 `4` 가 아니라 실패 안내가 뜬다(실측).

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




