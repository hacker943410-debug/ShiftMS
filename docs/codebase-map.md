# 코드베이스 길잡이 (요청 → 찾아갈 곳)

> **이 문서의 목적**: 어떤 요청이 들어왔을 때 **전체를 다 읽지 않고 바로 해당 파일로 가기 위한 지도**다.
> 규칙·금지사항은 `CLAUDE.md`, 절차는 `.claude/HARNESS.md`, 배경은 `AGENTS.md`에 있다. 여기는 **위치만** 다룬다.
>
> ⚠️ **위치를 찾은 다음이 진짜다.** "그래서 규칙이 뭔데?"는 [`docs/rules/`](rules/README.md) **규칙 대장**에 있다.
> 아래 2장 표에서 📖 표시가 붙은 줄은 **코드로 가기 전에 그 문서를 먼저 읽는다.** 그러면 코드를 다시 다 읽지 않아도 된다.
> (2026-09-04, 규칙이 안 적혀 있어서 조사 한 번에 2,400만 토큰이 든 적이 있다. 그래서 만든 것이다.)
>
> 유지 규칙: 파일을 새로 만들거나 옮기면 이 문서의 해당 줄도 같이 고친다.
> 코드를 파서 규칙을 새로 알아냈으면 **`docs/rules/`에 적어 넣고** 끝낸다.

---

## 1. 30초 요약 — 데이터가 흐르는 길

```
운영자 엑셀 파일 (C:\연장근무실적\)
   ↓ 인테이크(감시 폴더 → 대기 목록)
실적 관리 화면에서 승인
   ↓ 승인 + 계산은 한 덩어리(트랜잭션)
수당 계산 결과 저장 (allowance_calculations)
   ↓ 수당 승인 → 품의 승인
품의서 / 별첨1 / 별첨2 엑셀·PDF 출력
```

화면 한 번 누를 때 코드가 지나가는 길은 항상 이 순서다:

| 순서 | 위치 | 하는 일 |
|---|---|---|
| 1 | `src/renderer/screens/…` | 화면·버튼 |
| 2 | `src/preload/index.ts` | 화면과 내부를 잇는 창구 |
| 3 | `src/shared/bridge/contracts.ts` | 주고받는 값의 약속(타입) |
| 4 | `src/main/ipc/register-*-handlers.ts` | 요청 접수 |
| 5 | `src/main/services/*-service.ts` | 실제 처리·파일·DB |
| 6 | `src/shared/domain/*.ts` | 계산 규칙(수당·휴일·근무표) |
| 7 | `src/main/services/sqlite-storage-service.ts` | 데이터베이스 |

**계산 규칙을 바꿔야 하면 6번(`shared/domain`), 화면 표시만이면 1번**이다. 대부분의 요청은 둘 중 하나다.

---

## 2. 운영자 말 → 찾아갈 곳 (실제로 들어온 요청 기준)

| 운영자가 이렇게 말하면 | 실제 원인이 있는 곳 |
|---|---|
| "별첨1에 **직급이 안 나와요**" | `main/services/allowance-document-export-service.ts` (조회) · `shared/domain/employee-rank.ts` (인정 어휘 5개) |
| 📖 "**시급을 고쳤는데 금액이 안 바뀌어요**" | **먼저 [`docs/rules/wage-and-workforce.md`](rules/wage-and-workforce.md) T-1** — 시급은 실적을 처음 읽을 때 그 줄에 박히므로, 실적 화면에서 다시 읽기 전엔 안 바뀐다. ⚠️배포판 0.5.4는 확인창이 "다시 계산됩니다"라고 반대로 안내한다(패치 후 문구는 사실대로) |
| 📖 "**시급 적용일**이 다른 날로 저장돼요" | 규칙 대장 T-5(기본값 자동 채움)·T-6(종료일 예고 오류) · `renderer/components/DateField.tsx` · `shared/lib/local-date.ts` |
| 📖 "시급 **일괄 업데이트**에서 몇 명이 빠져요" | 규칙 대장 T-7~T-11 · `main/services/workforce-wage-bulk-update-service.ts` |
| 📖 "**입사일**을 잘못 넣었는데 못 고쳐요" | 규칙 대장 R-1~R-5 · T-12 · `main/services/employee-storage-service.ts` |
| 📖 "**시급이 없어서** 승인이 안 돼요 / 옛날 달을 못 불러와요" | 규칙 대장 R-11 · T-15 → `node artifacts/scripts/diagnose-wage-history.cjs` 먼저 실행 |
| "배포 엑셀에 **조원 순서**가 뒤바뀌어요" | `main/services/schedule-plan-preview-service.ts` (이름순 재정렬 금지) |
| "휴일인데 **평일 근무시간**으로 나와요" | `shared/domain/monthly-schedule-draft.ts` → `shouldUseHolidayTimes` (관문 3개, `holiday-time-three-gates` 참고) |
| "**법정공휴일 실적이 0원**이에요" | `main/services/monthly-schedule-restore-service.ts` · `schedule-return-performance-parser.ts` |
| "**변경후 칸** 사람이 수당을 못 받아요" | `main/services/schedule-return-performance-parser.ts` · `shared/domain/changed-slot-priority-policy.ts` |
| "**대체근무수당**이 지급/미지급이 이상해요" | `shared/domain/substitute-allowance-policy.ts` · `team-work-type.ts` |
| "이미 승인한 게 **다시 승인 대기**로 떠요" | `main/services/performance-approval-*.ts` 4종 · `performance-startup-recovery-service.ts` |
| "엑셀을 넣었는데 **목록에 안 떠요**" | `main/services/performance-file-intake-service.ts` · `file-watch-service.ts` |
| "**품의서 양식**이 깨져요 / 칸이 밀려요" | `main/services/allowance-document-export-service.ts` · `proposal-template-layout.ts` · `document-template-*.ts` |
| "**근무표가 안 만들어져요**" | `shared/domain/monthly-schedule-draft.ts` · `main/services/shift-pattern-storage-service.ts` |
| "**조/근무 묶음** 설정이 안 먹어요" | `renderer/screens/site-management/` · `shared/domain/shift-pattern-*.ts` |
| "**금액이 틀려요**" | `shared/domain/calculation.ts` · `allowance-service.ts` · `allowance-rate-matrix.ts` · `rounding.ts` |
| "**로그인/비밀번호**가 안 돼요" | `main/services/auth-*.ts` · `account-recovery-service.ts` · `scripts/reset-admin-password.mjs` |
| "**DB를 복원**하고 싶어요" | `main/services/database-replacement-service.ts` · `database-backup-service.ts` · `database-migration-service.ts` |
| "업데이트가 안 떠요" | `main/services/app-update-service.ts` · `release-history-service.ts` · `.claude/skills/release-shiftmgmt` |

---

## 3. 화면(메뉴) 8개 → 파일

메뉴 정의는 `src/renderer/route-config.ts` 한 곳에 있다.

| 메뉴 | 화면 파일 | 딸린 폴더 | 주로 부르는 서비스 |
|---|---|---|---|
| 대시보드 | `screens/DashboardScreen.tsx` | `screens/dashboard/` | `dashboard-chart-export-service.ts` |
| 인력 관리 | `screens/WorkforceManagementScreen.tsx` (84KB) | `screens/workforce/` (시급 구간 판정 `screens/workforce/wage-rate-timeline.ts`) | `employee-storage-service.ts` · `employee-history-service.ts` · `workforce-wage-bulk-update-service.ts` |
| 근무지 관리 | `screens/SiteManagementScreen.tsx` (68KB) | `screens/site-management/` (23개) | `site-storage-service.ts` · `shift-pattern-storage-service.ts` · `site-pattern-extraction-service.ts` |
| 근무표 배포 | `screens/ScheduleManagementScreen.tsx` (89KB) | — | `schedule-plan-*.ts` 5종 · `monthly-schedule-*.ts` |
| 실적 관리 | `screens/PerformanceManagementScreen.tsx` (**123KB, 최대**) | `screens/performance-management/` | `performance-*.ts` (20개 이상) |
| 수당 관리 | `screens/AllowanceManagementScreen.tsx` | `screens/allowance-management/` (12개) | `allowance-*.ts` · `approved-allowance-calculation-service.ts` |
| 운영 관리 | `screens/OperationsManagementScreen.tsx` (99KB) | `screens/operations-management/` (11개) | `operations-storage-service.ts` · `document-template-*.ts` · `holiday-api-service.ts` |
| 활동 이력 | `screens/AccessHistoryScreen.tsx` | — | `access-log-service.ts` |

**화면 파일이 크다.** 고칠 곳을 찾을 때는 파일을 통째로 읽지 말고, 화면에 보이는 **한국어 라벨로 검색**하는 게 가장 빠르다.

부속:
- 공용 부품: `renderer/components/` (달력 `DateField`, 팝업 `QuestionDialog`, 표 껍데기 `DashboardShell`)
- 화면 안내(가이드): `renderer/guides/` — `route-guides.tsx`가 151KB로 최대. 기능과 무관한 설명 텍스트다.
- 스타일: `renderer/styles.css` **한 파일에 전부**(~19,000줄)

---

## 4. 기능 영역별 지도

### 수당 계산·출력
| 무엇 | 파일 |
|---|---|
| 계산 공식 | `shared/domain/calculation.ts` · `allowance-service.ts` |
| 요율표(배율) | `shared/domain/allowance-rate-matrix.ts` · `allowance-rate-service.ts` |
| 원 단위 처리 | `shared/domain/rounding.ts` |
| 승인 절차 | `main/services/allowance-approval-service.ts` · `allowance-proposal-approval-service.ts` |
| 문서 출력(엑셀) | `main/services/allowance-document-export-service.ts` (**118KB**) |
| 문서 출력(PDF) | `main/services/allowance-document-pdf-service.ts` |
| 요율 변경 영향 | `shared/domain/allowance-rate-impact.ts` |

### 실적(엑셀 → 승인)
| 무엇 | 파일 |
|---|---|
| 폴더 감시 | `main/services/file-watch-service.ts` · `file-watch-runtime-service.ts` |
| 엑셀 읽기 | `main/services/performance-file-intake-service.ts` · `excel-template-parser.ts` |
| 회수 근무표 해석 | `main/services/schedule-return-performance-parser.ts` (**67KB, 휴일·변경후 규칙의 핵심**) |
| 승인 | `performance-approval-flow-service.ts` · `performance-approval-service.ts` · `-resolution-` · `-snapshot-` |
| 고장 복구 | `performance-startup-recovery-service.ts` · `performance-orphan-file-healing-service.ts` · `performance-overtime-repair-service.ts` |
| 보관 | `performance-file-archive-service.ts` · `performance-archive-retention-service.ts` |

### 근무표·근무패턴
| 무엇 | 파일 |
|---|---|
| **근무표 생성 규칙** | `shared/domain/monthly-schedule-draft.ts` (조별 시작 위치, 휴일 시간 판정) |
| 패턴 문자열 해석 | `shared/domain/shift-pattern-compression.ts` |
| 설정 적용 시작일 | `shared/domain/shift-pattern-version.ts` |
| 조 이름·근무유형 | `shared/domain/team-label.ts` · `team-work-type.ts` · `team-membership.ts` |
| 저장 | `main/services/shift-pattern-storage-service.ts` · `monthly-schedule-storage-service.ts` |
| 배포 엑셀 | `main/services/schedule-plan-preview-service.ts` · `-export-` · `-publish-` · `-template-` |
| 배포본에서 되살리기 | `main/services/monthly-schedule-restore-service.ts` |

### 운영 관리(설정·양식·공휴일·사용자)
| 무엇 | 파일 |
|---|---|
| 설정 저장 | `main/services/operations-storage-service.ts` (**76KB**) · `app-settings-*.ts` |
| 양식(품의서·별첨) | `document-template-*.ts` 8종 · `proposal-template-layout.ts` |
| 공휴일 달력 | `main/services/holiday-api-service.ts` |
| 사용자·권한 | `auth-*.ts` 4종 · `shared/domain/authorization.ts` · `ipc-auth-guard-service.ts` |
| 데이터베이스 관리 | `database-backup-service.ts` · `-replacement-` · `-migration-` · `-file-policy-` |

---

## 5. 데이터가 저장되는 곳

**데이터베이스 파일** (PC마다 따로. 운영 PC와 개발 PC 내용이 다르다)
```
%APPDATA%\shiftmgmt-v3-4\data\shiftmgmt.sqlite   ← 개발 실행본
%APPDATA%\ShiftMgmt\data\shiftmgmt.sqlite        ← 설치본
```
읽기 전용으로만 열어 볼 것: `new DatabaseSync(경로, { readOnly: true })`

**주요 표(테이블)**

| 영역 | 표 이름 |
|---|---|
| 인력·근무지 | `employees`, `sites`, `employee_site_assignments`, `wage_rates` |
| 근무패턴 | `shift_patterns`, `shift_pattern_cycles`, `shift_pattern_cycle_steps`, `shift_pattern_cycle_team_indexes`, `shift_pattern_team_cycles`, `shift_pattern_team_settings`, `shift_pattern_team_capacities` |
| 근무표 | `monthly_schedules`, `monthly_schedule_items`, `schedule_plan_exports` |
| 실적 | `performance_files`, `performance_entries`, `performance_approvals`, `hidden_approved_performance_rows` |
| 수당 | `allowance_calculations`, `allowance_calculation_items`, `allowance_approvals`, `allowance_proposal_approvals`, `allowance_rate_versions`, `allowance_rate_items`, `allowance_rate_history` |
| 문서·설정 | `document_template_versions`, `document_template_history`, `allowance_document_exports`, `app_setting_entries`, `holiday_calendars`, `holiday_items` |
| 사용자 | `app_users`, `access_logs` |

**운영자 실제 파일** — DB가 아니라 폴더에 있다: `C:\연장근무실적\` (배포관리 / 품의서 / 별첨1 …)
경로 설정값은 `app_setting_entries`의 `schedule_export_dir`, `allowance_proposal_export_dir` 등.

---

## 6. 문서 지도 (어떤 문서에 뭐가 있나)

| 알고 싶은 것 | 문서 |
|---|---|
| **항상 지켜야 할 규칙**(게시 금지·가짜 UI 금지 등) | `CLAUDE.md` (루트) |
| 📖 **영역별 동작 규칙과 함정**(코드 다시 안 읽고 답하기) | **`docs/rules/`** — 시급·입사일·인력관리는 `docs/rules/wage-and-workforce.md` |
| 폴더별 세부 규칙 | `src/renderer/CLAUDE.md` · `src/main/CLAUDE.md` · `src/shared/CLAUDE.md` · `scripts/CLAUDE.md` |
| 하네스(스킬·서브에이전트·훅) 사용법 | `.claude/HARNESS.md` |
| 기능별 상세 명세 | `docs/functional-spec.md` |
| 기술 구성·원리 | `docs/technical-overview.md` |
| 유지보수(진입점·IPC 추가·복원·장애) | `docs/maintainer-guide.md` |
| 수당·양식·DB업데이트 기준 | `docs/operations-reference.md` |
| 운영자용 사용법 | `docs/user-manual.md` · `docs/operator-quick-start.md` |
| 버전별 변경 이력 | `docs/patch-notes.md` (66KB, 누적) |
| 패치·릴리즈 절차 | `docs/patch-workflow.md` · `.claude/skills/release-shiftmgmt` |
| 버전별 릴리즈 결과물 | `artifacts/releases/vX.Y.Z/` |
| 제품 방향·개발 규칙 | `docs/project-handbook.md` · `AGENTS.md` |
| 설계 원본 | `shftMgmgt설계_V3.4.md` |

⚠️ `docs/README.md`는 0.4.29 기준으로 낡았다(현재 0.5.4). 문서 목록 용도로만 보고, 버전·단계 서술은 믿지 말 것.

---

## 7. 검사·도구 지도

**기본 검사** (고친 뒤 항상)
```
npm run typecheck      # 타입 검사
npm run lint           # 0 errors 유지
npm run test           # 850개 안팎, 단일 워커, 약 8분 (숫자는 계속 늘어난다)
npm run build
```

**실제 앱을 띄워 보는 검사**: `artifacts/scripts/electron-*-smoke.cjs` (`npm run smoke:electron:*`)

**진단 도구** (읽기 전용, 운영 PC에서도 안전)

| 도구 | 용도 |
|---|---|
| `artifacts/scripts/diagnose-wage-history.cjs` | 통상시급 장부 10가지 점검(구간 겹침·구멍·0원·시급 없는 재직자·입사일 불일치·실적 시급 공백). 시급 질문이 오면 **가장 먼저 돌린다** |
| `artifacts/scripts/diagnose-attachment1-rank.cjs` | 별첨1 직급이 "-"로 나오는 이유를 인원별로 분류 |
| `artifacts/scripts/count-changed-slot-impact.cjs` | 변경후 우선 규칙으로 바뀔 승인분 건수 |
| `artifacts/scripts/verify-dashboard-export-totals.cjs` | 대시보드 내보내기 합계 검증 |

**화면 캡처**: `artifacts/scripts/capture-wizard-screens.cjs` (근무지 마법사 3단계, 먼저 `npm run build` 필요)
⚠️ `src/renderer/CLAUDE.md`가 안내하는 "capture-actual-screens.cjs" · "capture-modal-screens.cjs"는 **레포에 없다**(커밋된 적 없는 일회성 스크립트). 전체 화면 캡처가 필요하면 위 마법사 캡처를 본떠 새로 만든다.

**릴리즈**: `scripts/release-check.mjs` (게이트) · `scripts/publish-release-assets.mjs` (게시)
**복구용**: `scripts/reset-admin-password.mjs` · `scripts/issue-account-recovery-key.mjs`
**이 지도 자체 검사**: `npm run validate:map` — 이 문서가 가리키는 경로가 다 살아 있는지 확인한다.

⚙️ **자동 강제**: `.claude/hooks/guard-codebase-map.cjs`가 `git commit`을 가로채 ①지도가 죽은 경로를 가리키거나 ②지도가 안내하는 계층(services·ipc·domain·화면·components·scripts·docs)의 파일이 **새로 생기거나 지워지거나 옮겨졌는데 이 문서를 안 고쳤으면** 커밋을 막는다. 라우팅이 정말 그대로면 `MAP_OK=1`로 통과할 수 있지만 습관적으로 쓰지 말 것. (루트 `CLAUDE.md` 절대 규칙 10번)

---

## 8. 손대기 전에 알아야 할 함정

| 함정 | 내용 |
|---|---|
| **게시는 되돌릴 수 없다** | `release:publish`는 전 사용자 자동업데이트를 즉시 실행. 그 턴에 명시 승인이 있을 때만. 같은 버전 재게시는 업데이트가 안 걸리니 반드시 번호를 올린다 |
| **직급은 5개뿐** | 사원·대리·과장·차장·부장 외 값은 **저장할 때 조용히 버려진다** (`shared/domain/employee-rank.ts`) |
| **휴일 시간은 관문 3개** | 묶음별 분리 스위치 → 날짜 → 단계별 휴일칸. 휴일칸이 비면 **경고 없이 평일 시간**으로 넘어간다 |
| **한 묶음 = 한 패턴** | 같은 근무 묶음 안의 조들은 같은 패턴을 며칠씩 밀어 쓴다. 회전 관계가 아닌 조는 묶음을 따로 만들어야 한다 |
| **승인분은 못 건드린다** | 승인된 계산은 이력 없이 덮어쓰기 금지. 계산 규칙을 바꾸면 재승인이 뜰 수 있으니 영향 건수부터 센다 |
| **실적은 직접 넣지 않는다** | 반드시 엑셀 인테이크(대기 폴더 → 승인) 경로로만. 테스트도 마찬가지 |
| **DB는 PC마다 다르다** | 개발 PC에서 정상이어도 운영 PC는 다를 수 있다. 운영 PC 접근은 불가하므로 **상황을 재현해 실제 출력물로 확인**한다 |
| **화면 파일이 거대하다** | 100KB 넘는 화면이 여럿. 통째로 읽지 말고 한국어 라벨로 검색 |
| **시급은 실적에 박혀서 저장된다** | 시급을 고쳐도 이미 불러온 승인 대기 실적 금액은 **안 바뀐다**(실적 화면에서 다시 읽어야 함). 게다가 시급이 승인 비교 항목에 들어 있어, 다시 읽으면 **부분 승인 파일의 이미 승인한 줄이 재검토로 뒤집힌다**(T-2, 미해결). → `docs/rules/wage-and-workforce.md` T-1·T-2 |
| **'현재 시급'은 날짜를 안 본다** | ⚠️배포판 0.5.4 한정. 현재 시급이 "종료일이 빈 줄"일 뿐이라 **미래 적용 시급도 현재로 보인다**. 패치 후에는 오늘 유효한 줄을 쓴다 → 같은 문서 T-3 |

---

## 9. 새 요청이 왔을 때 순서

0. **증상을 먼저 받는다** — 누가 / 어느 화면에서 / 무엇을 눌렀는데 / 무엇을 기대했는데 / 실제로 뭐가 나왔나.
   증상 없이 "전반 조사"에 들어가면 범위가 열 배로 커진다.
1. **어느 화면 이야기인지** 확인 → 2장·3장에서 파일 후보를 좁힌다
2. **📖가 붙은 줄이면 `docs/rules/`의 그 문서를 먼저 읽는다.** 거기 답이 있으면 코드로 안 간다.
   진단 도구가 있으면 함께 돌린다(7장). 코드 읽기는 그다음이다.
3. **표시 문제인가, 계산 문제인가** 판단 → 표시면 `renderer/`, 계산이면 `shared/domain/`
4. 계산이면 **승인된 과거 자료가 바뀌는지** 먼저 확인(재승인 위험)
5. 고친 뒤 **상황을 재현하는 시험**을 만들고, **수정을 되돌리면 실패하는지**까지 확인
6. `typecheck` · `lint` · `test` 통과 후 커밋 (게시는 별도 승인)
7. **코드를 파서 새로 알아낸 규칙·함정은 `docs/rules/`에 적어 넣는다.** 이걸 빼먹으면 다음 사람이 또 판다.
