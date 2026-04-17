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
- `sandbox: false`는 이유와 필요 범위를 다시 검토해야 한다.
- 인증은 [auth-service.ts](C:/Projects/Active/ShiftMgmt_V3.4/src/main/services/auth-service.ts:22) 기준 로컬 하드코딩 계정 + in-memory session 구조다.
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
  - `performance`, `allowance`, `employees`, `sites`에서 “로그인 사용자”와 “관리자만 가능한 작업”을 다시 세분화
  - handler 등록을 registrar 단위로 분리하면서 권한 정책을 도메인별로 고정

### Critical 1-a. `adminOnly` UI와 실제 main 권한 모델이 불일치한다.
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

### Critical 2. 인증 구조가 하드코딩 계정 + 결정적 salt + in-memory session에 의존한다.
- 근거:
  - `src/main/services/auth-service.ts:15`
  - `src/main/services/auth-service.ts:22`
  - `src/main/services/auth-service.ts:29`
  - `src/main/services/auth-service.ts:36`
- 세부 내용:
  - 계정이 코드에 하드코딩되어 있다.
  - salt 값이 고정 문자열이다.
  - 로그인 시도 제한, 잠금, 감사 정책이 없다.
  - 세션은 메모리에만 유지되어 프로세스 기준으로만 보호된다.
- 권장:
  - 최소한 운영 사용자 저장소와 인증 저장소를 통합
  - 비밀번호 정책, 변경 절차, 로그인 실패 제한 추가
  - role 검증을 UI가 아니라 main service 기준으로 이동

### High 1. Electron renderer sandbox가 꺼져 있다.
- 근거:
  - `src/main/main.ts:144`
- 해석:
  - `contextIsolation: true`, `nodeIntegration: false`는 적절하지만, `sandbox: false`는 추가 방어층을 포기한 상태다.
- 권장:
  - preload 의존 기능을 점검한 뒤 `sandbox: true` 전환 가능성 검토
  - 전환이 어렵다면 이유와 예외 범위를 문서화

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

### High 3. 의존성 보안 베이스라인에 즉시 검토가 필요한 취약점이 있다.
- 근거:
  - `npm audit --audit-level=high` 실행 결과
- 추가 식별:
  - `axios@1.13.6`는 `wait-on` 전이 의존성
  - `lodash@4.17.23`는 `electron-builder`, `wait-on` 전이 의존성
  - `@xmldom/xmldom@0.8.11`는 `electron-builder -> app-builder-lib -> plist` 전이 의존성
  - `vite@7.3.1`, `electron@37.10.3`는 직접 개발 의존성
- 요약:
  - `critical`: `axios`
  - `high`: `electron`, `lodash`, `vite`, `@xmldom/xmldom`
- 권장:
  - reachability 기준으로 실제 사용 경로 확인
  - `electron`과 `vite`는 업그레이드 영향 분석 후 별도 배치로 처리
  - `wait-on`, `electron-builder` 계열은 개발/패키징 한정 위험인지 운영 앱 런타임 노출인지 구분해 대응

## Notes
- `database-migration-service.ts`의 PowerShell 호출은 단순 문자열 결합이 아니라 literal escaping을 사용하므로, 현재 시점에서는 “즉시 exploit”보다는 “민감한 실행 경로”로 분류하는 것이 정확하다.
- `database-file-policy-service.ts` 도입으로 복원 입력과 설정 기반 Access 원본 경로는 `blank / missing / not-file / unsupported-extension` 분기를 같은 정책으로 검증한다.
- `database-replacement-service.ts` 도입으로 DB 교체 실패 시 원본 복구 규칙은 helper 테스트로 고정됐다.
- Wave 2 완료 후 잔여 최우선 보안 과제는 `auth-service.ts` 구조 교체와 `sandbox: true` 전환 가능성 검토다.
- IPC helper는 현재 주요 registrar 전반에 적용됐고, DB 복원 preview/update의 cleanup 패턴, 저장 다이얼로그 분기, local file open 분기까지 공통화됐다. 다음 보안 관점의 초점은 helper 확장보다 `auth-service.ts` 구조 교체와 renderer sandbox 검토다.
