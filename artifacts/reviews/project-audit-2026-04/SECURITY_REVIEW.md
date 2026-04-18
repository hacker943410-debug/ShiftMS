# Security Review

## 목적
- Electron 로컬 앱 기준으로 실제 위험이 되는 취약 지점을 찾는다.
- 파일 접근, 권한, 스크립트 실행, 인증 경계를 우선 검토한다.

## 점검 기준
- Electron 보안 설정
- preload 노출 범위와 IPC 검증
- 인증/권한 모델
- 파일 경로 처리와 외부 스크립트 실행
- 의존성 취약점과 설치본 안전성

## 초기 관찰
- `contextIsolation: true`, `nodeIntegration: false`는 기본 방어로 적절하다.
- `sandbox: true`가 main window와 숨김 export window(`allowance-document-pdf-service`, `dashboard-chart-export-service`)에 적용됐다.
- 인증은 `app_users.password_hash` + 랜덤 salt `scrypt` 기반으로 이관됐고, `5회 실패 시 15분 잠금`, `sign-in-failed` 감사로그, `must_change_password` 기반 첫 로그인 비밀번호 변경 강제가 추가됐다. seeded 기본 계정도 설치별 bootstrap credential 또는 환경변수 override로 바뀌었고, 첫 비밀번호 변경 후 bootstrap file entry는 per-user retire된다. 세션은 `8시간 만료 + 인증된 main-process access 시 renewal`로 정리됐고, dependency audit은 `0 vulnerabilities`까지 정리됐다. role 정책은 `src/shared/domain/authorization.ts` 기준 `admin / planner / reviewer / operator` 4단계로 고정됐고, runtime-only(in-memory) 세션 정책도 `auth-session-policy.ts`와 health/login/account UI 노출까지 반영됐다. `employees/sites/shift-patterns/monthly-schedules` 쓰기와 배포는 `planner`, `performance/allowance` 승인 계열은 `reviewer`, `operations/access-history`는 `admin`으로 분리됐고, `SiteManagement` step1/step2 footer action도 기준정보 수정 권한 기준으로 맞췄다. packaged/installer smoke뿐 아니라 `operations-user` smoke도 planner/reviewer 메뉴 및 action-level 권한 회귀까지 포함한다. 남은 핵심은 새 role 체계 기준 운영 문서와 수동 QA 절차 정리다.
- 복원 흐름은 PowerShell과 Access provider에 의존하므로 입력 파일, 실행 경로, 오류 메시지 노출 범위를 함께 봐야 한다.
- `Wave 3` batch 1에서 `database-file-policy-service.ts`를 추가해 backup/migration의 경로 검증 기준선은 일단 공통화됐다.
- `Wave 3` batch 2에서 `database-powershell-diagnostic-service.ts`를 추가해 PowerShell raw output을 사용자 메시지에서 분리했다.
- `Wave 3` batch 3에서 `ipc-handler-helpers.ts`를 추가해 `operations` registrar의 성공/실패/result 조립을 공통화했다.
- `Wave 3` batch 4에서 같은 helper를 `workforce`, `performance` registrar까지 확장해 조회/실행 error mapping 편차를 더 줄였다.
- `Wave 3` batch 5에서 같은 helper를 `allowance`, `core` registrar까지 확장해 export/access-log/result 조립 편차를 더 줄였다.
- `Wave 3` batch 6에서 `runIpcActionWithCleanup()`를 추가해 DB 복원 preview/update의 file-watch restart를 성공/실패 공통 패턴으로 고정했다.
- `Wave 3` batch 7에서 `runIpcSaveDialogAction()`와 `runIpcSaveDialogResultAction()`를 추가해 대시보드 export와 양식 미리보기 저장 다이얼로그 분기의 cancel/error handling을 공통화했다.
- `Wave 3` batch 8에서 `runIpcOpenPathAction()`를 추가해 `performance:open-source-file`의 파일 존재 확인과 `shell.openPath()` 결과 해석을 공통화했다.

## 우선 점검 대상
1. 관리자 전용 기능의 호출 보호
2. 파일 선택/저장/복원 경로 검증
3. Access export PowerShell 실행 경로
4. renderer에서 유추 가능한 내부 경로/설정 정보 노출 범위
5. dependency audit 결과

## Findings

### Critical 1. 서버측 권한 검증이 약하고, 다수 IPC handler가 세션 없이 호출 가능하다.
- 상태:
  - `2026-04-16` Wave 1에서 1차 완화 적용
  - `access-logs:list` -> 관리자 세션 필수
  - `operations:*` -> 관리자 세션 필수
  - `dashboard`, `employees`, `sites`, `shift-patterns`, `monthly-schedules`, `performance`, `allowance` -> 로그인 세션 필수
- 근거:
  - [IPC_ACCESS_MATRIX.md](C:/Projects/Active/ShiftMgmt_V3.4/artifacts/reviews/project-audit-2026-04/IPC_ACCESS_MATRIX.md)
  - `src/main/main.ts`
  - `src/main/ipc/register-core-handlers.ts`
  - `src/main/ipc/register-workforce-handlers.ts`
  - `src/main/ipc/register-operations-handlers.ts`
  - `src/main/ipc/register-performance-handlers.ts`
  - `src/main/ipc/register-allowance-handlers.ts`
  - `src/main/services/ipc-auth-guard-service.ts`
- 해석:
  - 초기 감사 시점에는 renderer 라우트에서 `adminOnly`를 일부 숨기지만 main handler에서 동일한 role 검증이 비어 있었다.
  - 현재는 main 기준 최소 세션/관리자 가드가 적용됐고, 핵심 registrar가 분리되어 권한 적용 지점을 추적하기 쉬워졌다.
  - `operations` registrar는 공통 helper로 error mapping과 성공 result 조립이 정리되어, 같은 admin route 안에서 정책 누락 가능성이 줄었다.
  - 다만 세부 도메인별 role 모델은 아직 단순하다.
- 권장:
  - `performance`, `allowance`, `shift-patterns`, `monthly-schedules`에서 “로그인 사용자”와 “관리자만 가능한 작업”을 다시 세분화
  - 2026-04-18 기준 `shift-pattern-write`, `site-write`, `employee-write`, `schedule-deploy`는 `planner`, `performance-approval`, `allowance-approval`은 `reviewer` action key로 main과 renderer entry point 양쪽에 반영됨
  - handler 등록을 registrar 단위로 분리하면서 권한 정책을 도메인별로 고정

### Closed 1-a. `adminOnly` UI와 실제 main 권한 모델 불일치는 shared authorization으로 정리됐다.
- 상태:
  - `operations`, `access-history`의 대표 불일치는 Wave 1에서 완화
  - 다른 메뉴는 여전히 UI와 main이 “동일한 세분 role”을 공유하지 않는다.
- 근거:
  - `src/renderer/route-config.ts:39`
  - `src/renderer/route-config.ts:45`
  - `src/main/main.ts`
  - `src/main/ipc/register-core-handlers.ts`
  - `src/main/ipc/register-workforce-handlers.ts`
  - `src/main/ipc/register-operations-handlers.ts`
  - `src/main/ipc/register-performance-handlers.ts`
  - `src/main/ipc/register-allowance-handlers.ts`
- 해석:
  - `운영 관리`, `활동 이력`은 이제 main에서도 관리자 세션을 요구한다.
  - 다만 다른 업무 메뉴는 UI 정책과 main 정책이 모두 “로그인 사용자 공통” 수준이라, 향후 관리자/운영자 분리가 필요한지 재검토가 필요하다.
- 권장:
  - “보이는 메뉴”와 “호출 가능한 IPC”를 같은 정책 소스로 묶어야 한다.

### Closed 1-b. runtime-only 세션 정책이 shared config와 UI 노출까지 포함해 명문화됐다.
- 근거:
  - `src/main/services/auth-service.ts`
  - `src/main/services/auth-password-service.ts`
  - `src/main/services/operations-storage-service.ts`
  - `src/main/services/sqlite-storage-service.ts`
- 세부 내용:
  - 로그인은 더 이상 `auth-service.ts` 내부 하드코딩 계정을 직접 참조하지 않고 `app_users.password_hash`를 조회한다.
  - 비밀번호 해시는 랜덤 salt 기반 `scrypt` 형식(`scrypt:salt:hash`)으로 저장된다.
  - 로그인 실패는 `sign_in_failure_count`, `sign_in_locked_until`에 저장되고 `5회 실패 시 15분 잠금`이 적용된다.
  - 실패 시도는 `sign-in-failed` access log로 남는다.
  - seeded 기본 계정은 설치별 `bootstrap-credentials.json` 또는 `AUTH_BOOTSTRAP_*` 환경변수로 주입된다.
  - 로그인 화면은 bootstrap credential 파일 경로를 노출해 운영자가 설치별 초기 비밀번호를 확인할 수 있게 했다.
  - `must_change_password`와 `auth:change-password`가 추가되어 초기 비밀번호 로그인 후 운영 IPC는 비밀번호 변경 전까지 차단된다.
  - 첫 비밀번호 변경이 끝나면 해당 seeded 계정의 bootstrap file entry는 retire되어 다음 앱 시작 시 다시 생성되지 않는다.
  - bootstrap state file은 retired marker를 유지해 기존 설치에서 재발급을 막고, 새 DB seed가 필요한 경우에만 재활성화된다.
  - 세션은 메모리에만 유지되지만 `expiresAt`을 강제해 8시간이 지나면 자동으로 제거된다.
  - 인증된 main-process access는 `getSessionWithRenewal()`을 통해 만료 시각을 갱신한다.
  - `ipc-auth-guard-service.ts`는 만료된 세션과 `passwordChangeRequired` 상태를 운영 IPC 앞단에서 차단한다.
- 권장:
  - 현재 정책은 runtime-only 유지 + 재시작 시 로그아웃 + 활성 사용 중 8시간 sliding renewal이다.
  - 추후 persistent session을 검토하더라도 `auth-session-policy.ts`, `AppHealth`, 로그인/계정 UI를 같은 변경 단위로 묶어야 한다.

### Closed 1. Electron renderer sandbox 전환 완료
- 근거:
  - `src/main/main.ts`
  - `src/main/services/allowance-document-pdf-service.ts`
  - `src/main/services/dashboard-chart-export-service.ts`
  - `artifacts/scripts/electron-operations-user-smoke.cjs`
- 해석:
  - main window와 숨김 export window 모두 `sandbox: true`로 전환했고, 전체 테스트/빌드/operations-user smoke까지 회귀 검증했다.
- 잔여:
  - preload API가 늘어날 때마다 build/smoke 재검증을 유지할 것.

### High 2. 외부 PowerShell 실행은 입력 이스케이프를 하고 있지만 여전히 민감한 공격면이다.
- 근거:
  - `src/main/services/database-migration-service.ts:339`
  - `src/main/services/database-migration-service.ts:404`
  - `src/main/services/database-migration-service.ts:801`
- 해석:
  - 현재 `toPowerShellLiteral()`로 문자열 이스케이프를 하고 있어 기본 방어는 있다.
  - `database-powershell-diagnostic-service.ts` 도입으로 raw stderr/stdout는 내부 로그로 보내고 사용자에게는 요약 메시지만 반환하도록 1차 분리했다.
  - 그러나 `-ExecutionPolicy Bypass`와 외부 파일 입력 조합은 운영 PC 정책, 경로 검증, 에러 메시지 설계까지 같이 봐야 한다.
- 권장:
  - 실행 가능한 입력 파일/출력 디렉터리 검증 규칙 명시
  - PowerShell 실패 로그와 사용자 메시지 분리

### Closed 2. 의존성 보안 베이스라인 audit은 직접/전이 의존성 패치로 정리됐다.
- 근거:
  - `npm audit --audit-level=high` 실행 결과 `0 vulnerabilities`
  - `npm ls electron vite wait-on axios lodash @xmldom/xmldom follow-redirects brace-expansion picomatch`
- 정리 내용:
  - 직접 의존성 `electron`은 `41.2.1`, `vite`는 `7.3.2`로 올라갔다.
  - 전이 의존성 `axios`, `lodash`, `@xmldom/xmldom`, `follow-redirects`, `brace-expansion`, `picomatch`도 패치 버전으로 정리됐다.
  - `npm run build`, `npm test`, `npm run smoke:electron:operations-user`, `npm run package:dir`, `npm run smoke:electron:packaged`까지 회귀를 확인했다.

## Notes
- `database-migration-service.ts`의 PowerShell 호출은 단순 문자열 결합이 아니라 literal escaping을 사용하므로, 현재 시점에서는 “즉시 exploit”보다는 “민감한 실행 경로”로 분류하는 것이 정확하다.
- `database-file-policy-service.ts` 도입으로 복원 입력과 설정 기반 Access 원본 경로는 `blank / missing / not-file / unsupported-extension` 분기를 같은 정책으로 검증한다.
- `database-replacement-service.ts` 도입으로 DB 교체 실패 시 원본 복구 규칙은 helper 테스트로 고정됐다.
- 현재 잔여 최우선 보안 과제는 정리된 role 정책과 수동 QA 체크리스트를 실제 운영 환경 sign-off까지 연결하는 것이다.
- IPC helper는 현재 주요 registrar 전반에 적용됐고, DB 복원 preview/update의 cleanup 패턴, 저장 다이얼로그 분기, local file open 분기까지 공통화됐다. 역할 정책은 shared authorization 기준으로 고정됐고 role smoke도 붙었으므로, 다음 보안 관점의 초점은 실제 운영 QA 기록과 릴리즈 마감 근거를 남기는 일이다.
