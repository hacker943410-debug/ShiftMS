# IPC Access Matrix

## 목적
- main process 기준으로 어떤 IPC가 인증/권한 검증을 거치는지 기록한다.
- UI 가드와 main 권한 검증이 불일치하는 지점을 식별하고, 현재 완화 상태를 남긴다.

## Legend
- Session: `Y` = main에서 로그인 세션 필수, `N` = 세션 없이 호출 가능
- Admin: `Y` = main에서 관리자 role 필수, `N` = 관리자 role 미요구
- Mutates: `Y` = 상태 변경, 외부 실행, 파일 출력/열기 수행, `N` = 조회 중심

## Route UI 기준
- `operations`: `adminOnly`
- `access-history`: `adminOnly`
- 나머지 주요 메뉴는 일반 로그인 사용자 접근 가능

## 현재 기준선
- `2026-04-16` 기준 `src/main/main.ts`는 registrar wiring만 맡고, 실제 권한 가드는 분리된 `src/main/ipc/*` registrar에 적용했다.
- `access-logs:list`와 `operations:*`는 관리자 세션 필수다.
- `dashboard`, `employees`, `sites`, `shift-patterns`, `monthly-schedules`, `performance`, `allowance`는 최소 로그인 세션 필수다.

## Matrix

| Domain | IPC | Session | Admin | Mutates | Notes |
|---|---|---:|---:|---:|---|
| app | `app:get-version` | N | N | N | 공개 정보 |
| app | `app:get-health` | N | N | N | 환경 정보 노출 범위는 별도 검토 |
| auth | `auth:sign-in` | N | N | Y | 인증 진입점 |
| auth | `auth:sign-out` | N | N | Y | 기존 세션 유무만 사용 |
| auth | `auth:get-session` | N | N | N | 현재 세션 반환 |
| dashboard | `dashboard:export-chart-data` | Y | N | Y | 파일 저장 |
| dashboard | `dashboard:export-report` | Y | N | Y | 파일 저장 |
| access-logs | `access-logs:list` | Y | Y | N | UI와 main 모두 admin 기준 일치 |
| access-logs | `access-logs:record` | Y | N | Y | 일반 사용자 활동 이력 기록용 |
| employees | `employees:list` | Y | N | N | 최소 세션 보호 적용 |
| employees | `employees:list-wage-rates` | Y | N | N | 최소 세션 보호 적용 |
| employees | `employees:list-assignments` | Y | N | N | 최소 세션 보호 적용 |
| employees | `employees:save-wage-rate` | Y | Y | Y | 인력 기준정보 쓰기는 admin action policy 적용 |
| employees | `employees:close-wage-rate` | Y | Y | Y | 인력 기준정보 쓰기는 admin action policy 적용 |
| employees | `employees:save-assignment` | Y | Y | Y | 인력 기준정보 쓰기는 admin action policy 적용 |
| employees | `employees:close-assignment` | Y | Y | Y | 인력 기준정보 쓰기는 admin action policy 적용 |
| employees | `employees:save` | Y | Y | Y | 인력 기준정보 쓰기는 admin action policy 적용 |
| employees | `employees:preview-wage-bulk-update` | Y | N | N | 파일 기반 민감 입력 |
| employees | `employees:apply-wage-bulk-update` | Y | Y | Y | 대량 수정, admin action policy 적용 |
| sites | `sites:list` | Y | N | N | 최소 세션 보호 적용 |
| sites | `sites:save` | Y | Y | Y | 근무지 기준정보 쓰기는 admin action policy 적용 |
| sites | `sites:delete` | Y | Y | Y | 근무지 기준정보 쓰기는 admin action policy 적용 |
| shift-patterns | `shift-patterns:list` | Y | N | N | 최소 세션 보호 적용 |
| shift-patterns | `shift-patterns:analyze-import` | Y | N | N | Excel 입력 처리 |
| shift-patterns | `shift-patterns:save` | Y | Y | Y | `shift-pattern-write` admin action policy 적용 |
| shift-patterns | `shift-patterns:deactivate` | Y | Y | Y | `shift-pattern-write` admin action policy 적용 |
| monthly-schedules | `monthly-schedules:list` | Y | N | N | 최소 세션 보호 적용 |
| monthly-schedules | `monthly-schedules:save` | Y | Y | Y | `schedule-deploy` admin action policy 적용 |
| monthly-schedules | `monthly-schedules:preview-plan` | Y | N | N | 미리보기 생성 |
| monthly-schedules | `monthly-schedules:export-plan` | Y | Y | Y | `schedule-deploy` admin action policy 적용 |
| monthly-schedules | `monthly-schedules:list-exports` | Y | N | N | 출력 이력 조회 |
| monthly-schedules | `monthly-schedules:publish-export` | Y | Y | Y | `schedule-deploy` admin action policy 적용 |
| performance | `performance:list-files` | Y | N | N | 최소 세션 보호 적용 |
| performance | `performance:list-overview` | Y | N | N | 최소 세션 보호 적용 |
| performance | `performance:get-file-detail` | Y | N | N | 최소 세션 보호 적용 |
| performance | `performance:get-comparison` | Y | N | N | 최소 세션 보호 적용 |
| performance | `performance:list-pending-files` | Y | N | N | 최소 세션 보호 적용 |
| performance | `performance:get-pending-file-detail` | Y | N | N | 최소 세션 보호 적용 |
| performance | `performance:approve` | Y | Y | Y | `performance-approval` admin action policy 적용 |
| performance | `performance:finalize-reapproved-file` | Y | Y | Y | `performance-approval` admin action policy 적용 |
| performance | `performance:reject` | Y | Y | Y | `performance-approval` admin action policy 적용 |
| performance | `performance:hide-approved-row` | Y | Y | Y | `performance-approval` admin action policy 적용 |
| performance | `performance:list-approval-history` | Y | N | N | 최소 세션 보호 적용 |
| performance | `performance:open-source-file` | Y | N | Y | 로컬 파일 열기 |
| allowance | `allowance:run-approved-calculation` | Y | N | Y | 계산 실행 |
| allowance | `allowance:list-results` | Y | N | N | 최소 세션 보호 적용 |
| allowance | `allowance:list-history` | Y | N | N | 최소 세션 보호 적용 |
| allowance | `allowance:set-early-payout` | Y | N | Y | 계산 결과 수정 |
| allowance | `allowance:review-calculations` | Y | Y | Y | `allowance-approval` admin action policy 적용 |
| allowance | `allowance:list-approval-history` | Y | N | N | 최소 세션 보호 적용 |
| allowance | `allowance:list-approved-targets` | Y | N | N | 최소 세션 보호 적용 |
| allowance | `allowance:export-documents` | Y | N | Y | 파일 출력 |
| allowance | `allowance:list-document-exports` | Y | N | N | 출력 이력 조회 |
| allowance | `allowance:preview-proposal` | Y | N | N | 품의 미리보기 |
| allowance | `allowance:approve-proposal` | Y | Y | Y | `allowance-approval` admin action policy 적용 |
| allowance | `allowance:list-proposal-approvals` | Y | N | N | 최소 세션 보호 적용 |
| allowance | `allowance:preview-calculation` | Y | N | N | 계산 미리보기 |
| operations | `operations:get-app-settings` | Y | Y | N | UI와 main 정책 일치 |
| operations | `operations:save-app-settings` | Y | Y | Y | 운영 설정 변경 |
| operations | `operations:select-directory` | Y | Y | Y | OS dialog |
| operations | `operations:select-migration-file` | Y | Y | Y | OS dialog |
| operations | `operations:select-spreadsheet-file` | Y | Y | Y | OS dialog |
| operations | `operations:check-database-migration-requirements` | Y | Y | N | 복원 사전 점검 |
| operations | `operations:preview-database-migration-update` | Y | Y | Y | DB 복원 미리보기 |
| operations | `operations:update-database-from-migration` | Y | Y | Y | DB 복원 반영 |
| operations | `operations:run-database-backup-now` | Y | Y | Y | 백업 실행 |
| operations | `operations:get-file-watch-status` | Y | Y | N | 런타임 상태 조회 |
| operations | `operations:restart-file-watch` | Y | Y | Y | watcher 재시작 |
| operations | `operations:stop-file-watch` | Y | Y | Y | watcher 중지 |
| operations | `operations:list-holiday-calendars` | Y | Y | N | 운영 기준 정보 |
| operations | `operations:fetch-holiday-api-items` | Y | Y | Y | 외부 API 호출 |
| operations | `operations:add-holiday-item` | Y | Y | Y | 기준정보 수정 |
| operations | `operations:rename-holiday-item` | Y | Y | Y | 기준정보 수정 |
| operations | `operations:delete-holiday-item` | Y | Y | Y | 기준정보 삭제 |
| operations | `operations:replace-holiday-calendar` | Y | Y | Y | 기준정보 일괄 반영 |
| operations | `operations:list-allowance-rate-versions` | Y | Y | N | 요율 버전 조회 |
| operations | `operations:list-allowance-rate-history` | Y | Y | N | 요율 이력 조회 |
| operations | `operations:save-allowance-rate-version` | Y | Y | Y | 요율 저장 |
| operations | `operations:delete-allowance-rate-version` | Y | Y | Y | 요율 삭제 |
| operations | `operations:list-users` | Y | Y | N | 사용자 목록 |
| operations | `operations:save-user` | Y | Y | Y | 사용자 저장 |
| operations | `operations:delete-user` | Y | Y | Y | 사용자 삭제 |
| operations | `operations:list-site-name-options` | Y | Y | N | 기준값 조회 |
| operations | `operations:save-site-name-option` | Y | Y | Y | 기준값 저장 |
| operations | `operations:delete-site-name-option` | Y | Y | Y | 기준값 삭제 |
| operations | `operations:list-document-template-history` | Y | Y | N | 양식 이력 조회 |
| operations | `operations:select-document-template-file` | Y | Y | Y | OS dialog |
| operations | `operations:inspect-document-template` | Y | Y | Y | 양식 검사 |
| operations | `operations:preview-document-template` | Y | Y | Y | 미리보기 파일 저장 |
| operations | `operations:save-document-template-version` | Y | Y | Y | 양식 등록 |
| operations | `operations:approve-document-template-version` | Y | Y | Y | 양식 승인 |
| operations | `operations:set-default-document-template-version` | Y | Y | Y | 기본 양식 지정 |
| operations | `operations:update-document-template-output-file-name` | Y | Y | Y | 출력 파일명 규칙 저장 |
| operations | `operations:delete-document-template-version` | Y | Y | Y | 양식 삭제 |
| operations | `operations:list-document-template-versions` | Y | Y | N | 양식 버전 조회 |

## 1차 결론
1. `operations`와 `access-history`의 UI/main 불일치는 Wave 1에서 실질적으로 해소됐다.
2. 업무 도메인 대부분은 이제 최소 세션 보호를 받는다.
3. `employees`, `sites`, `shift-patterns`, `monthly-schedules` 쓰기와 배포는 이제 `planner` action policy로 올라갔다.
4. `performance`, `allowance` 승인 계열은 `reviewer`, `operations`와 `access-history`는 `admin`으로 고정됐고, `SiteManagement` step footer action도 기준정보 수정 권한 기준으로 맞췄다.
