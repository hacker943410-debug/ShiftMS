# Decision Log

## 2026-04-16

### 결정 1
- 감사 중간 산출물은 `docs/`가 아니라 `artifacts/reviews/project-audit-2026-04/` 아래에 둔다.
- 이유: 현재 정책상 `docs/`는 최신 운영 기준 문서만 유지하고, 감사/분석 성격의 중간 산출물은 아카이브 성격으로 관리해야 한다.

### 결정 2
- 분석과 리팩토링을 한 번에 진행하지 않고, 먼저 인벤토리와 품질/보안 근거를 고정한다.
- 이유: 승인/수당/복원 흐름은 회귀 위험이 크므로, 근거 없이 구조부터 바꾸면 실수 가능성이 높다.

### 결정 3
- 권한 모델 정비의 첫 배치는 `main.ts` 전역 registrar 분리보다 `withSession`/`withAdmin` 기준선 적용을 먼저 한다.
- 이유: 현재 가장 큰 위험은 handler가 열려 있는 상태 자체이므로, 구조 개선보다 먼저 호출 차단부터 고정하는 편이 리스크를 더 빠르게 낮춘다.

### 결정 4
- `Wave 2`의 첫 registrar 분리는 가장 큰 admin 전용 도메인인 `operations`부터 시작한다.
- 이유: `operations`는 파일 선택, 백업/복원, 기준정보, 양식 관리가 몰려 있어 `main.ts` 복잡도를 크게 낮추면서도 권한 정책을 그대로 유지하기 가장 좋은 분리 단위다.

### 결정 5
- `Wave 2`의 두 번째 registrar 분리는 `performance`를 우선한다.
- 이유: 승인, 반려, 재승인 확정, 원본 파일 열기처럼 권한과 로컬 파일 경계가 함께 걸린 도메인이라 별도 registrar로 빼 두는 편이 보안 정책과 회귀 검증을 같이 고정하기 좋다.

### 결정 6
- `Wave 2`의 세 번째 registrar 분리는 `app/auth/dashboard/access-logs`를 `core` 묶음으로 정리한다.
- 이유: 앱 상태, 인증, 활동 이력, 대시보드 출력은 서로 다른 도메인이지만 모두 shell 성격의 상위 진입점이라 `main.ts`에서 먼저 걷어내면 남은 업무 도메인 분리가 훨씬 단순해진다.

### 결정 7
- `Wave 2`의 네 번째 registrar 분리는 `employees/sites/shift-patterns/monthly-schedules`를 `workforce` 묶음으로 정리한다.
- 이유: 인력 기준정보와 근무표 준비 흐름은 같은 사용자 여정에서 연속적으로 수정되는 경우가 많고, 동일한 세션 가드와 activity logging 패턴을 공유하므로 한 registrar로 묶는 편이 변경 추적과 회귀 검증에 유리하다.

### 결정 8
- `Wave 2`의 마지막 registrar 분리는 `allowance`를 별도 묶음으로 정리한다.
- 이유: 수당 계산, 승인, 품의, 출력은 같은 도메인 안에서도 실패 원인과 감사 로그가 민감하고, `performance`와는 다르게 문서 출력/백업까지 걸려 있어 독립된 registrar 경계가 유지보수상 더 명확하다.

### 결정 9
- `Wave 3`의 첫 배치는 backup/migration 전체를 한 번에 바꾸지 않고, 경로 해석과 파일 검증 규칙만 `database-file-policy-service.ts`로 먼저 공통화한다.
- 이유: 복원 흐름은 PowerShell, SQLite replace, Access provider 의존성이 동시에 걸려 있어 한 배치에 모두 건드리면 회귀 범위가 커진다. 먼저 상대경로 해석, 존재 여부, directory guard 같은 순수 파일 정책을 분리해 두는 편이 테스트와 후속 하드닝을 훨씬 안전하게 만든다.

### 결정 10
- `Wave 3`의 두 번째 배치는 PowerShell 실행 자체를 바꾸지 않고, 실패 진단과 DB replace/rollback 규칙만 helper로 분리한다.
- 이유: Access export 호출부는 OS/PowerShell/ACE OLEDB 환경에 묶여 있어 실행 방법까지 바꾸면 위험 범위가 커진다. 먼저 사용자 메시지와 내부 진단을 분리하고, 원본 DB 복구 규칙을 독립 테스트로 고정하는 편이 운영 안정성에 더 직접적이다.

### 결정 11
- registrar 공통화의 첫 helper 적용은 `operations`에 한정하고, cleanup이 필요한 예외 케이스는 그대로 둔다.
- 이유: `operations`는 관리자 전용 handler가 가장 많고 success/error/activity 중복도 가장 심하다. 반면 DB 복원 preview/update와 양식 미리보기는 file-watch restart나 save dialog가 섞여 있어, 첫 배치에서 무리하게 일반화하면 회귀 위험이 커진다.

### 결정 12
- `Wave 3`의 네 번째 배치는 `workforce`와 `performance`에 helper를 확장하되, `performance:open-source-file` 같은 로컬 파일 예외 분기는 유지한다.
- 이유: 두 registrar는 조회/저장/승인 흐름의 공통 조립은 많지만, 파일 열기처럼 OS 결과를 단계별로 분기해야 하는 handler까지 한 번에 일반화하면 helper가 불필요하게 복잡해진다.

### 결정 13
- `Wave 3`의 다섯 번째 배치는 `allowance`와 `core`에 helper를 확장하되, `BridgeResult`를 직접 반환하는 서비스는 `runIpcResultAction()`으로만 감싼다.
- 이유: 수당 승인/품의/출력과 대시보드 export는 이미 service 층에서 실패 코드를 결정하고 있다. registrar에서 다시 errorCode를 합성하기보다, 성공 시 activity만 붙이고 조회성 응답만 `createIpcSuccess()`로 통일하는 편이 회귀 위험이 낮다.

### 결정 14
- `Wave 3`의 여섯 번째 배치는 `runIpcActionWithCleanup()`를 추가해 DB 복원 preview/update처럼 성공/실패와 무관하게 runtime 상태를 복구해야 하는 handler만 먼저 공통화한다.
- 이유: file-watch restart는 예외가 나더라도 반드시 실행돼야 하는 cleanup이어서 별도 helper 가치가 높다. 반면 save dialog나 `shell.openPath()`는 UI/OS 분기가 더 많으므로 같은 배치에 억지로 일반화하지 않는 편이 안전하다.

### 결정 15
- `Wave 3`의 일곱 번째 배치는 `runIpcSaveDialogAction()`와 `runIpcSaveDialogResultAction()`를 추가해 저장 다이얼로그가 포함된 export/template preview 흐름만 먼저 공통화한다.
- 이유: 저장 다이얼로그는 cancel/result/error 패턴이 반복되지만, local file open은 파일 존재 확인과 OS 반환값 해석이 더 도메인 특화되어 있다. 따라서 save dialog만 먼저 묶고 `shell.openPath()` 분기는 별도 배치로 남기는 편이 안전하다.

### 결정 16
- `Wave 3`의 여덟 번째 배치는 `runIpcOpenPathAction()`를 추가해 local file open의 공통 부분만 묶고, `fileId -> 메타데이터 조회` 같은 도메인 해석은 각 registrar에 남긴다.
- 이유: 파일 존재 확인과 `shell.openPath()` 결과 해석은 재사용 가치가 높지만, 어떤 파일을 열지 찾는 과정은 도메인마다 기준이 다르다. OS 분기만 helper로 이동하는 편이 가장 작은 변경으로 중복을 줄인다.
