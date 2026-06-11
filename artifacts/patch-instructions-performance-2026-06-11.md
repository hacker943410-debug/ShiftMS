# 실적관리 패치 지시문 (Codex 작업용)

- 작성일: 2026-06-11
- 작성: Claude (적대적 검증 역할) — **본 문서 작성자는 코드를 수정하지 않았음**
- 구현 담당: Codex
- 검증 근거: 실 SQLite 읽기전용 조회 + `git HEAD` 원본 대조 + 전체 테스트 563/563 실행 + 적대적 4차원 분석
- 대상 파일(현 안정 스냅샷 기준 라인):
  - `src/main/services/schedule-return-performance-parser.ts`
  - `src/main/services/performance-management-service.ts`
  - `src/main/services/performance-approval-service.ts`
  - `src/main/services/performance-file-intake-service.ts`
  - `src/main/services/performance-file-archive-service.ts`
  - `src/main/services/performance-test-helpers.ts`
  - `src/shared/domain/schedule-plan.ts`
  - `src/main/services/database-migration-service.ts`
- 운영 DB(읽기전용 확인): `C:\Users\pangyo\AppData\Roaming\shiftmgmt-v3-4\data\shiftmgmt.sqlite`
  - `monthly_schedules = 0행`, `monthly_schedule_items = 0행`, `schedule_plan_exports = 0행`
  - `performance_files = 32`, `performance_entries = 317`, `performance_approvals = 257`(logical_key 257 distinct, null 0, 교차충돌 0)

> 표기: **[확정]** = 코드·DB·테스트로 입증 / **[가설]** = 미입증(반증조건 명시). 라인 번호는 작성 시점 기준이며 구현 전 재확인 요망.

---

## 0. 작업 원칙 (Codex 확인 요망)

- 각 항목은 **요구 동작(behavior)** 과 **수용 기준(테스트)** 으로 기술. 구현 방식은 Codex 재량이되, 수용 기준은 충족해야 함.
- AGENTS.md 원칙 준수: 계산/분류 규칙은 도메인/서비스 레이어에 두고 UI 하드코딩 금지, 승인 결과 무이력 덮어쓰기 금지, 한국어 UI·영어 주석.
- "passing tests ≠ fixed" — 아래 다수 항목의 핵심은 **기존 테스트가 버그 상태를 검증하지 못한다**는 것. 새 테스트는 반드시 **구(버그) 동작에서 FAIL** 하도록 작성할 것.
- 각 항목 끝의 **[Codex 확인]** 질문에 답(동의/이견/대안)을 먼저 달고 작업 착수 권장.

### 우선순위 요약

| ID | 우선 | 영역 | 한 줄 |
|----|------|------|-------|
| P0-1 | P0 | task2 | 법정공휴일 실적 0/누락의 진짜 원인 = `context.schedule=null`(운영 monthly_schedules 0행). schedule 부재 시 동작을 명시 결정 |
| P0-2 | P0 | task3 | 미승인 근무지에 "재승인 대기" 오발화 — 내용 기반 logical_key 충돌로 다른 fileId 승인이 신규 pending을 오분류 |
| P1-1 | P1 | task5 | before열='-' 빈슬롯 투입 누락 잔존 경로 + 헤드라인 테스트가 수정을 고정 못 함 |
| P1-2 | P1 | task1 | `_1` 중복 strip 테스트 실고정 + 워크시트(C3)-우선 회귀 + bare-digit 미처리 |
| P1-3 | P1 | intake | parseLimit 초과 시 prune 블록 전면 스킵(유령 행 잔존) |
| P1-4 | P1 | task6 | 품의서 고객사 병합 "Cannot Merge already merged cells" — 진단/unmerge 패치는 양호. 단 행계산 오버랩·E2E 테스트 갭 잔존 |
| P2-1 | P2 | task4 | 폴더 구조: `_dup` 접미사↔키 비대칭, 비원자적 이동, chokidar awaitWriteFinish 부재 |
| P2-2 | P2 | task1/3 | 구키(`_1`/잘못된 키)로 영속된 행 데이터 마이그레이션 |

---

## P0-1 · [task2] 법정공휴일 실적 0/누락 (연장 근무지에서 두드러짐)

### 증상
연장근무(연장)가 있는 근무지에서 법정공휴일 실적이 0 또는 누락으로 보임.

### 근본원인 [확정]
운영 DB의 `monthly_schedules` 0행 → `resolveScheduleContext`(parser.ts:499-516)가 `schedule: null` 반환 → `resolveScheduleItem`/`resolveScheduleItemByDutyCode`(537-587) null → `createWorkTimeFromScheduleItem(null, "holiday")`(약 657-670)가 **0분/시간 undefined** 반환. `buildHolidayEntries`(808-935)는 **모든 분(分)을 schedule에서 도출**하므로 법정공휴일 줄이 0으로 붕괴.

대조: `buildOvertimeEntries`(약 1043-1114)는 **워크시트 셀에서 시간을 직접 읽음**(schedule 비의존). 그래서 같은 파일에서 **연장 줄은 살아남고 법정공휴일 줄만 0** → "연장 근무지에서 특히" 누락으로 인지됨. `supportedWorkingDutyCodes = D|E|N`(schedule-plan.ts:10).

### 요구 동작 (택1, 제품오너 합의 필요)
- (A) **차단/에러 승격**: schedule가 없으면 법정공휴일 항목을 0분으로 조용히 방출하지 말고, 파일 단위로 "근무표 저장본 없음 — 실적 산출 불가" 에러를 명시(현재도 alert는 있으나 항목은 push됨).
- (B) **워크시트 시간 폴백**: holiday 줄도 overtime처럼 워크시트 셀 시간으로 폴백(가능한 경우).
- 어느 쪽이든 **"무경고 0분 항목"은 금지**.

### 수용 기준
1. 새 테스트: `monthly_schedules` **미저장 상태**(`saveStoredMonthlySchedule` 호출 안 함)로 휴일/대체 행이 있는 파일을 파싱 → 선택한 동작(A 또는 B)을 단언. 현재 테스트는 전부 schedule를 시드하므로 이 상태가 **전혀** 검증되지 않음 [확정: performance-test-helpers.ts:318-344].
2. 회귀: 기존 schedule-시드 테스트는 그대로 통과.

### [Codex 확인]
- (A)/(B) 중 선택? 운영상 "월간 근무표 저장본이 왜 0행인지"(마이그레이션 후 미재생성 추정 [가설])를 먼저 확인할 것. **스케줄 복구 없이 파서만 패치하면 증상은 그대로다.**

---

## P0-2 · [task3] 미승인 근무지에 "재승인 대기" 오발화

### 증상
파라다이스 시티를 포함해, **승인 절차를 거치지 않았고 실적 확인조차 안 한** 근무지들에서도 간헐적으로 "재승인 대기/재승인 필요" 문구가 발생.

### 근본원인 [확정 — 코드 경로 / 가설 — 특정 데이터셋 발화]
1. `isPendingReapprovalFile`(performance-management-service.ts:179-185) = `hasPriorApprovedContentForPendingFile` **OR** `hasApprovedArchiveForSchedule`.
2. `hasPriorApprovedContentForPendingFile`(150-161): pending 파일의 payroll 관련 entry 중 하나라도 `latestApprovals.get(toLogicalKey(entry.logicalKey))`의 최신 승인이 `decision==='approved'` **그리고 `fileId !== detail.id`** 이면 발화.
3. logical_key는 **내용 기반(월+사이트+직원+날짜+duty)** 이라 **파일 인스턴스가 달라도 동일**. 따라서 **이미 승인된 (사이트·월)에 대해 새 파일 인스턴스가 들어오면**(재배포, 재임포트, 특히 **task1의 `_1` 중복본**) 그 새 pending 파일은 한 번도 승인/검토 안 했어도 "재승인 대상"으로 오분류.
4. `reapprovalPendingCount = max(changeableEntryCount − reapprovalCompletedCount, 0)`(368). 새 파일은 자기 자신 승인 이력이 없어 `reapprovalCompletedCount=0`(`isCompletedInCurrentReapprovalCycle`는 `latestApproval.fileId === detail.id` 요구, 126-134) → pending 카운트가 항상 양수 → **영구 표시**.

### 부수 버그 [확정]
- `hasApprovedArchiveForSchedule`(163-177)는 `item.scheduleKey === detail.scheduleKey` 비교인데, 운영 schedule_key가 **디렉터리 접미사를 포함**(`access-performance:2025-08:판교dc:pending` vs `...:approved`) → pending↔approved가 **절대 불일치** → 이 분기는 **구조적으로 작동 불가(누락 방향 버그)**. 의도대로면 키 비교에서 디렉터리 접미사를 제외해야 함.
- `listLatestPerformanceApprovalsByLogicalKey`(performance-approval-service.ts:212) `const key = record.logicalKey || record.entryId` — 빈 logical_key(레거시/마이그레이션 행)는 entryId로 폴백되어 **교차 오키잉** 가능. 현 dev DB는 빈 키 0이나 필드 빌드에선 위험 [가설].

### 요구 동작
"재승인 대기"는 **이 파일(또는 그 effective 계보) 자신의 내용이 이전에 승인되었고 그 후 변경되었다**는 사실을 반영해야 함. **단지 내용이 동일한 logical_key가 다른 fileId로 승인된 적 있다는 이유만으로 발화 금지.**
- 한 번도 승인/제출되지 않았고 기존 승인본과 내용이 동일한 신규 pending은 "재승인 대기"가 아니라 "이미 승인된 내용과 동일"(무액션) 또는 "신규 검토 대기"로 분류.
- `hasApprovedArchiveForSchedule`의 scheduleKey 비교는 디렉터리 접미사 제외(정규화) 후 비교하거나, 명확히 제거.
- `|| entryId` 폴백은 빈 logical_key를 별도 처리(빈 키끼리 병합 금지).

### 수용 기준
1. 새 테스트(구 동작에서 FAIL): 사이트·월이 이미 다른 fileId로 승인된 상태에서, **동일 내용의 신규 pending 파일**(또는 `_1` 중복본)을 추가 → 그 신규 파일의 `reapprovalPendingCount === 0`(또는 "재승인 대기" 미표시) 단언.
2. 새 테스트: `hasApprovedArchiveForSchedule`가 의도대로 동일 (사이트·월) approved를 매칭하는지(접미사 제외) 단언.
3. 회귀: 실제로 승인 후 내용이 바뀐 파일은 여전히 "재승인 대기"로 표시.

### 두 번째 재승인 신호 (entry-level) — 패치가 대량 오발화 유발 가능 [확정·중요]
"재승인" 문구는 파일 배지(`reapprovalPendingCount`)뿐 아니라 **entry 단위 `needsReapproval`**(performance-management-service.ts:353-355)에서도 나옴. `resolvePerformanceEntryApprovalState`(performance-approval-resolution-service.ts:51-100):
- entry의 logical_key가 prior 승인과 매칭되고 **스냅샷이 비동등**(`arePerformanceEntriesEquivalent`, 46-49)이면 `needsReapproval=true`(92-99). 비교 대상 `toComparableEntry`(23-44)에 **startTime/endTime/totalWorkMinutes/overtimeMinutes/nightMinutes/note/alerts 포함**.
- 승인 스냅샷이 파싱 불가/없으면 **무조건 `needsReapproval=true`**(81-90).

⚠️ **패치 상호작용 [확정]:** logical_key는 `${월}:${normalizeLookupKey(site)}:${sourceToken}`(parser.ts:775,1266)로 **재임포트/재파싱해도 동일**. 그런데 **이번 parser 패치가 holiday 근무열 시간(dutyScheduleItem 우선)·alerts를 바꾸므로**, 기존 승인 사이트를 재파싱하면 스냅샷이 달라져 `needsReapproval`이 **대량 true**가 됨. P0-1(schedule=null → 0분)도 같은 방향으로 작용. → **패치 배포 후 "여러 근무지에 재승인 문구"가 오히려 증가할 수 있음.** 분류는 알림만 추가하므로 데이터가 망가지진 않으나 사용자 혼란.

### 재현/확인 (Codex용, 읽기전용) — 현 dev DB는 미재현임을 확정
라이브 DB 직접 검증 결과:
- pending 엔트리 ↔ 승인 간 **공유 logical_key 0건**, **파싱불가 스냅샷 0건** → 현 dev DB는 발화 안 함 [확정].
- 유일한 pending 파일(판교DC 2025-08/2025-10)은 직원코드 미해소(`...:판교dc:0:...`)라 실코드 승인과 키 불일치.
- logical_key 실측 형식: `access-performance:2025-08:판교dc:{직원코드}:{날짜}:{행토큰}`.

재현 방법(택1):
1. 이미 승인된 (사이트·월)에 대해 **직원코드가 해소된 신규 pending 파일**(또는 `_1` 중복본)을 import → overview에서 그 신규 파일이 "재승인"으로 분류되는지 확인.
2. 기존 승인 사이트를 **패치된 parser로 재파싱**해 `needsReapproval` 대량 발화 여부 확인.
3. 증상이 실제로 보이는 환경(설치본/다른 PC)의 DB 경로를 받아 동일 read-only 쿼리로 발화 분기(archive vs priorContent vs needsReapproval-snapshot) 특정.

### [Codex 확인]
- "이미 승인된 내용과 동일한 신규본"의 정확한 UX 분류(무액션 vs 신규검토)를 제품오너와 합의 요망. task1(`_1` 중복)과 **동일 근본축**이므로 함께 처리 권장.

---

## P1-1 · [task5] before='-' 빈슬롯 투입 누락 잔존 + 헤드라인 테스트 보강

### 맥락 [확정]
Codex 패치로 (A) duty 근무열 시간 우선(`dutyScheduleItem ?? directScheduleItem`, 850-856), (B) empty-marker 블록 제거로 실근무자 변경셀 None 시 휴일근로 유지 — 둘 다 건전. 단 **헤드라인이 가리킨 "홍길동→실투입자 파싱"은 `git HEAD`에서 이미 동작**했고 통과 테스트도 있었음(test.ts:96).

### 잔존 문제 [확정]
`parser.ts:830` `if (regularName.length === 0 || isEmptyMarker(regularName)) return;` 가 변경셀을 읽기 **전에** 슬롯 스킵. 사용자가 **before열을 '-'로 둔 채 after열에만** 실투입자를 입력하면 그 휴일근로는 **무알림 누락**. 수정은 사용자가 before열에 '홍길동'(VIRTUAL_ORIGINAL_WORKER_NAME, parser.ts:119)을 **수동 타이핑**하는 데 의존.

### 테스트 약점 [확정]
헤드라인 테스트 `should parse a manually filled empty duty slot on a holiday row`는 라온(투입자) 본인 schedule_item을 시드하지 않아 `directScheduleItem=null`(구·신 동일) → 둘 다 dutyScheduleItem 폴백 → **구 코드에서도 통과**(수정 고정 실패).
신규 경고(858-862, `...근무열 기준을 찾지 못해 투입자 원래 근무시간을 사용했습니다`)와 분기 `!dutyScheduleItem && directScheduleItem`는 **어떤 테스트도 발화 안 함**, `alerts` 단언 테스트 부재.

### 요구 동작 (택1, 확인)
- (A) before열이 '-'(빈슬롯)이고 after열에 실투입자만 있는 경우도 휴일근로로 인식(현재는 '홍길동' 타이핑 요구). 또는
- (B) 현 동작 유지하되 UI/문서로 "빈슬롯 투입 시 before열에 홍길동 입력" 규약을 명시.

### 수용 기준
1. 헤드라인 테스트 보강: 투입자 본인 항목을 시드하고 duty열과 **다른 시간**을 부여해, 변경(A) duty-우선이 실제로 결과를 가르도록(구 코드 FAIL). 또는 신규 경고 발화 케이스 + `alerts` 단언 추가.
2. (A) 선택 시: before='-' + after=실투입자 → 휴일 항목 생성 단언(구 코드 FAIL).

### [Codex 확인]
- (A) 자동 인식 vs (B) 규약 명시 중 선택? 자동 인식은 의도치 않은 행까지 잡을 위험이 있으니 제품 의도 확인.

---

## P1-2 · [task1] `_1` 중복(SKB동작국사) — 테스트 실고정 + C3-우선 회귀 + bare-digit

### 맥락 [확정]
중복 원인은 `C:\연장근무실적\배포관리\2026년\3월\2026_3_SKB동작국사_1.xlsx`(언더스코어 `_1`). Codex의 `stripFileDuplicateSuffix`(214-215, `/(?:_dup\d+|_\d+)$/i`)가 타격. 정상 동작.

### 문제 [확정]
1. **테스트가 strip을 고정 못 함**: 두 새 테스트는 C3 셀에 이미 클린명이 있는 픽스처라 `siteName = worksheetSiteName || fileIdentity?.siteName`(266-279)의 **워크시트-우선으로만 통과**. `stripFileDuplicateSuffix`가 no-op이어도 통과.
2. **회귀 위험(High)**: `resolveFileIdentityFromWorksheet`가 이제 **C3를 모든 반환 파일의 사이트명 권위로** 삼음(구: 파일명 우선, `return fileIdentity`). C3는 strip 미적용. 수동 리네임/C3 편집/illegal-char(`/`,`:`) 사이트는 scheduleKey가 패치 전과 다르게 분기 가능. `schedule?.siteName ?? identity.siteName`(1265)이 스케줄 존재 시 마스킹하나 **운영 monthly_schedules 0행이라 노출**.
3. **bare-digit 미처리**: `동작국사1`(언더스코어 없는 trailing 숫자)은 정규식 미매칭. 정상 숫자 사이트명(`센터1`)과 중복본 구분 불가 가능성.

### 요구 동작
- C3-우선 동작변경이 의도적이면 유지하되, **C3 값에도 동일 중복접미사 정규화 적용** 검토(또는 strip 일원화).
- bare-digit 중복마커 정책 명시(처리할지/안 할지).

### 수용 기준
1. 새 테스트: **C3를 비운** 픽스처 + `2026_3_SKB동작국사_1.xlsx` → `stripFileDuplicateSuffix`가 실제 발화해 `siteName==='SKB동작국사'`, scheduleKey가 비-`_1` 파일과 동일함을 단언(구 코드 또는 strip no-op 시 FAIL).
2. 회귀 테스트: 사이트명에 의도된 숫자/특수문자가 있는 경우 scheduleKey가 패치 전과 동일함을 보장(또는 변경을 의도적으로 단언).

### [Codex 확인]
- C3-우선이 의도인가, 아니면 파일명-우선 유지하며 dup만 strip하는 편이 안전한가? bare-digit를 중복마커로 볼 것인가?

---

## P1-3 · [intake] parseLimit 초과 시 prune 블록 전면 스킵

### 맥락 [확정]
intake 패치(`parsedNewFileCount`/`parsedFileCount` 분리, 681 `!isKnownChangedFile && parsedNewFileCount >= parseLimit`)는 **정확**(known-changed 항상 재파싱, 신규 캡 우회 불가, 5/5 테스트 통과).

### 잔존 문제 [확정]
`skippedByParseLimit === true`(682)이면 prune 블록(약 769, `canPruneMissingFiles && !skippedByParseLimit`)이 **전면 스킵** → 디스크에서 삭제된 파일의 저장 상세가 prune 안 되어 **유령 행** 잔존. 패치는 이 동작 불변. intake 테스트는 정확히 20 신규 vs limit 20 **경계**라 `skippedByParseLimit`가 결코 true가 안 됨 → 이 경로 **미검증**.

### 요구 동작
신규 파일 캡과 무관하게, **이번 패스에서 실제로 본 activeFileIds 기준 prune**가 가능하도록 분리(캡은 파싱 비용만 제한, 유령 행 정리는 항상 수행). 또는 월별 예산 페이징.

### 수용 기준
1. 새 테스트: **21개 이상 신규 파일 + 삭제된 파일의 저장상세** 상태에서 풀싱크 → `skippedByParseLimit===true` 이면서도 삭제 파일 prune가 수행됨(또는 의도된 동작) 단언.

---

## P2-1 · [task4] 실적 폴더 관리 구조

운영 실데이터는 `C:\연장근무실적\`(배포관리/승인완료/품의서), 앱 설정 pending/approved는 `%APPDATA%\shiftmgmt-v3-4\data\imports\`.

| # | 심각도 | 문제 | 증거 |
|---|--------|------|------|
| 1 | **Critical** | `_dup{NN}` archive 접미사 ↔ `normalizeLookupKey`(숫자 보존, 186-187) 비대칭 → 한 사이트 키 분열 | performance-file-archive-service.ts(buildDuplicatePath/resolveUniqueTargetPath); parser.ts:186-187,214-215 |
| 2 | High | archive 이동 ↔ DB 갱신 비원자적 → 크래시 시 고아 | performance-approval-flow-service.ts(이동 후 mark); archive-service(EXDEV copy+unlink) |
| 3 | High | chokidar `awaitWriteFinish`/디바운스 부재 → 복사 중 파일 파싱, upsert 경쟁 | file-watch-service(워처 옵션); intake `void handleFileEvent` |
| 4 | Medium | `id=경로+mtime` + Windows 케이싱 불일치 → 중복 행 / retention 없음(무한 증가) / 중첩 dir 오분류 | intake-service(createPerformanceFileId); archive-service(retention 부재) |

### 요구 동작 (최소 P2 범위)
- #1: scheduleKey/사이트 식별을 **워크시트 셀 사이트명에서만** 도출(중복 명확화 파일명 사용 금지), 또는 `normalizeLookupKey`에 `_dup/_N` 동일 strip 적용. (P0-2/P1-2와 연계)
- #3: chokidar에 `awaitWriteFinish` 설정 + 경로별 직렬화/디바운스.
- #2: 이동→DB 갱신을 복구 가능한 순서로(이동 의도 마커 → 이동 → 확인), 시작 시 disk 기준 재조정.

### 수용 기준
- 단위 테스트로 #1(접미사 다른 같은 사이트 두 파일이 동일 scheduleKey), #3(부분기록 파일이 'error' 행으로 upsert되지 않음)을 단언.

---

## P2-2 · [task1/task3] 데이터 마이그레이션

### 문제 [확정: Grep no-match / 가설: 필드 영향]
파서 수정 후에도 이미 `site_name='..._1'` 또는 구키로 영속된 `performance_files`/`performance_approvals` 행은 **자동 병합 안 됨**. `database-migration-service.ts`에 `_dup`/`stripFileDuplicateSuffix`/`UPDATE site_name`/`_1` 관련 마이그레이션 없음. dev DB엔 해당 행 0이나 필드 빌드엔 존재 가능.

### 요구 동작
업그레이드 시 (a) 전체 재파싱으로 키 재생성, 또는 (b) `_1`/구키 행을 정규 사이트/scheduleKey로 백필하는 마이그레이션. 어느 쪽이든 **승인 이력 보존**(무이력 덮어쓰기 금지, AGENTS.md).

### 수용 기준
- 마이그레이션 단위 테스트: `site_name='X_1'`/구 scheduleKey 행이 정규화 후 병합되고 승인 이력이 보존됨을 단언.

### [Codex 확인]
- 필드 빌드 DB에 실제로 그런 행이 존재하는지 확인 후 범위 결정.

---

## P1-4 · [task6] 품의서 Excel "Cannot Merge already merged cells"

### 기능 중심 원인 설명 (사용자 요청: 이해하기 쉽게 + 예시)
- **무슨 기능에서:** 품의서 Excel을 만들 때, 맨 앞 **"고객사/단위 사업 조직 요약"** 표 영역(`setProposalSiteSummaryLabel` 1350-, `mergeProposalCustomerSummaryCells` 1392-, 합계행 1532). 컬럼 B·C가 고객사명, D가 단위조직.
- **왜 실패하나(예시):** 품의서 **양식(템플릿)에는 고객사 칸이 이미 병합돼 있음**(예: `B12:C12` 병합 상태). 그런데 승인 데이터로 표를 다시 그릴 때, 고객사가 여러 행 연속이면 **세로로 다시 병합**(예: `B12:C14`)하려 함. ExcelJS는 "이미 `B12:C12`가 병합된 셀을 포함하는 `B12:C14`를 또 병합"하면 `Cannot Merge already merged cells`로 **중단**. 행 수가 양식 칸 수와 달라 `spliceRows`로 행을 끼우거나 빼면 병합 위치가 더 어긋나며 같은 충돌이 생김.
- **한 줄 요약:** "기존(템플릿/이전) 병합을 풀지 않고 그 위에 다시 병합"이 원인.

### 이미 된 패치 — 적대적 검증 결과 [확정]
- ✅ **진단 메시지 요건 충족**: `createMergeCellsDiagnosticError`(756-792)가 문서/시트·기능·처리 구간·병합하려던 범위·대상 셀 값·**이미 병합된 범위**·병합된 master·**쉬운 예시**·확인할 곳·원본 오류를 모두 출력. 테스트로 고정됨(test:490-515, 전체 메시지 정규식).
- ✅ **raw 누출 없음**: 모든 `mergeCells` 호출이 `mergeCellsWithContext`/`...ByCoordinate...` 경유(801은 래퍼 본체). 어디서 실패해도 친절한 진단이 뜸.
- ✅ **고객사 병합 unmerge 선행**: 세로 병합(1432) 앞 `unmergeCellsInRange`(1425), 상세 블록 앞(1475·1505), 헤더 앞(1573). `unmergeCellsInRange`(823-871)는 `model.merges` 교차 해제 + 셀별 `isMerged` master 해제 **이중 방어**로 spliceRows 부작용까지 처리. `setProposalSiteSummaryLabel`의 직접 병합(1359/1379)은 유일 호출처(1524)가 1505 unmerge 뒤라 보호됨.

### 잔존 문제 (적대적)
1. **[Medium·가설] 같은 실행 내 후속 병합 오버랩은 여전히 throw.** unmerge(1505)는 per-row 라벨(1518-)·그룹 세로병합(1530)·합계행(1532)보다 **먼저** 실행됨. `detailRowCount`/`totalRowNumber` 계산이 틀려 합계행이 어떤 고객사 그룹 세로병합 범위 안에 들어가면, 1530↔1532 사이에 unmerge가 없어 `B{total}:D{total}`가 그룹 `B:C`와 충돌 → 여전히 실패(단 이제 진단은 정확). 반증: 행수 경계 케이스에서도 충돌 안 남을 보이면.
2. **[Medium·확정] E2E 양성 경로 테스트 부재.** test:490-515는 진단이 **발화**하는 음성 경로만 검증. "**사전 병합된 템플릿으로 품의서 export가 throw 없이 성공**"하는 통합 테스트(특히 고객사 행수 ≠ 템플릿 capacity → spliceRows 경로)가 확인되지 않음. passing≠fixed.
3. **[Low·확정] "쉬운 예시"가 하드코딩(B12:C12/B12:C14)** — 실패한 실제 범위가 아님. 실제 범위/기존 병합은 별도 줄에 나오므로 치명적이진 않으나, 예시를 실제 값으로 동적 생성하면 더 명확.

### 요구 동작
- 행계산(detailRowCount/totalRowNumber)과 그룹 경계가 어긋나도 충돌이 안 나도록, **각 병합 직전(또는 표 전체 재구성 후 일괄) unmerge**를 보장하거나 행계산 불변식을 테스트로 고정.

### 수용 기준
1. 통합 테스트(구 동작 FAIL): 고객사 칸이 **사전 병합된 실제 품의서 템플릿** + 고객사 행수가 템플릿 capacity와 **다른** 입력으로 export → **throw 없이** 성공하고 고객사 세로 병합이 올바른 범위로 생성됨을 단언.
2. 회귀: 기존 진단 테스트(test:490-515) 유지.

### [Codex 확인]
- 진단 패치는 잘 됨(인정 가능). 추가로 P1-4 잔존 1·2를 처리할지(행계산 불변식 + E2E 양성 테스트) 합의 요망.

---

---

# 2차 보완 (patch-2 후속) — 2026-06-11 적대적 재검증 결과

- 검증 대상: Codex patch-2 (작업트리 미커밋 vs `HEAD 1da9379`, 9파일 +691/-127)
- 방법: 4개 독립 적대적 검증가 + `git diff`/`git show` 직접 재확인 + typecheck 0 / 전체 567 테스트 통과(회귀 0)
- 표기: **[확정]** 코드/git/테스트 입증, **[가설]** 미입증(반증조건)

## patch-2 요약 판정
- ✅ 회귀잠금 테스트로 잘 고정된 것: **P0-1**(schedule-null→throw), **P1-3**(parse-limit 시 prune 미스킵), **P1-1 duty-우선 시간**.
- ⚠️ 부분/미해결: **P0-2 핵심 증상(재파싱 재승인 증폭) 미해결·미테스트**, **P1-1 빈슬롯 잔존 드롭**, **P0-1 전체-파일 error 부작용**, **P1-2 C3-우선 회귀**.
- ❌ 미착수(diff 0건 확정): **P1-4**(병합), **P2-1**(폴더/워치), **P2-2**(마이그레이션/재스냅샷).

| ID | 우선 | 한 줄 |
|----|------|-------|
| F-1 | **P0** | P0-2 재승인을 **콘텐츠 동등성**이 아니라 **provenance/파서버전**에 키잉. 현 수정은 바이트동일만 막아 재파싱 드리프트로 대량 점화 |
| F-2 | **P0** | 파서 변경 배포에 **P2-2 재스냅샷/근무표 복구 동반** 필수 (없으면 전 사이트 error + 대량 재승인) |
| F-3 | P1 | P0-1 throw가 **연장근무 행까지 통째 폐기** — schedule-비의존 행은 보존 |
| F-4 | P1 | P1-1 `before='-' + after=실투입자` 무음 드롭 잔존 (`parser:830`) |
| F-5 | P1 | `hasApprovedArchiveForSchedule` 재아카이브 가드 항상-통과 (`flow-service:367`) |
| F-6 | P1 | P1-2 C3-우선 회귀 + 맨숫자 미처리 |
| F-7 | P2 | empty-key fallback / unparseable-snapshot 무조건 needsReapproval |
| F-8 | — | P1-4 · P2-1 여전히 미착수(원 사양 유효) |

---

## F-1 · [P0·최우선] P0-2 재승인 "패치 증폭" 미해결

### 확정된 문제 [확정]
patch-2는 `hasPriorApprovedContentForPendingFile`(performance-management-service.ts:188-198)의 cross-file 분기에 `resolvePerformanceEntryApprovalState(...).needsReapproval===true` 조건을 추가해 **바이트 동일** 재배포 오탐만 제거했다. 그러나:
- `needsReapproval = !isEquivalent`(resolution-service:92-99), 비교 필드 `toComparableEntry`(23-44)에 `startTime/endTime/totalWorkMinutes/overtimeMinutes/nightMinutes/note/alerts` 포함.
- **이번 patch의 parser가 그 필드를 바꿈**: 휴일 duty시간(`parser:850-856`), 신규 alert(`858-862`), note(`885`).
- ➡️ 구파서 승인 (사이트·월)을 신파서로 재파싱/재임포트 → 스냅샷 비동등 → `needsReapproval=true` → **사용자가 손대지 않은 파일이 "재승인 대기"로 대량 점화.** logicalKey는 재임포트해도 안정적이라 매칭됨.
- **테스트 사각:** 신규 P0-2 테스트는 전부 `restage`(동일 파서·동일 콘텐츠)라 스냅샷 바이트동일 → `needsReapproval=false` 구조적 보장 → 증상 미검증.

### 요구 동작
재승인 분류를 **"이 파일/계보가 실제로 승인 절차를 거쳤고 그 후 사용자가 내용을 바꿨는가"(provenance)** 기준으로. 파서 버전/수식 변경에 의한 드리프트와 사용자 편집을 구분(예: 승인 스냅샷에 파서 버전/계산 시그니처를 포함해 버전만 다르면 재승인 아님, 또는 fileId 계보 추적).

### 수용 기준 (반드시 구 동작에서 FAIL)
- **cross-parser-version 테스트:** 스냅샷 A로 승인 → 동일 logical_key를 **다른 휴일시간/alert/note**(신파서 산출)로 파싱 → 의도된 분류(재승인 아님 또는 명시적 "내용변경 검토") 단정. restage(바이트동일) 금지.

### [Codex 확인]
- provenance 키잉 방식(파서버전 시그니처 vs fileId 계보)을 제품오너와 합의. 이 항목이 **사용자가 처음 보고한 증상의 핵심**이며 현재 미해결임을 명확히.

## F-2 · [P0·최우선] 파서 변경 배포에 재스냅샷/근무표 복구 동반

### 문제 [확정]
`database-migration-service.ts` diff 0건 — 기존 `performance_approvals` 스냅샷 재생성도, `_1`/구키 행 정규화도 없음. 이 부재가 F-1(대량 재승인)과 P0-1(전 사이트 error)을 **실설치에서 동시에 도달 가능**하게 만든다.

### 요구 동작
파서 변경 릴리즈에 (a) 운영 `monthly_schedules` 복구/재생성, (b) 기존 승인 스냅샷을 신파서 기준으로 재생성(또는 파서버전 마킹) — **승인 이력 보존**(무이력 덮어쓰기 금지) 을 동반.

### 수용 기준
- 마이그레이션 테스트: 구키/구스냅샷 행이 정규화·재스냅샷되고 승인 이력이 보존됨을 단정.

## F-3 · [P1] P0-1 throw가 연장근무 행까지 폐기

### 문제 [확정]
`parser:1289-1293`의 throw는 **모든 entry 빌드 후**(`1275`) 발생해 entries 배열 전체를 폐기 → 혼합 파일의 schedule-비의존 **연장근무 행**도 함께 error(`intake catch`). 패치 전엔 연장 행은 살아남았음(사양 task2). 운영 `monthly_schedules=0`이라 휴일/대체 포함 전 파일이 통째 error.

### 요구 동작
schedule-의존 행(legal-holiday/substitute)만 error/skip 또는 0-표기하고, **연장근무 등 schedule-비의존 행은 보존**. 또는 P0-1 옵션을 (A)전체 throw가 아닌 (B)행 단위 처리로 재검토.

### 수용 기준
- 테스트: schedule 미저장 + (연장 행 + 휴일 행) 혼합 파일 파싱 → 연장 행은 산출되고 휴일 행만 error/skip 단정.

## F-4 · [P1] P1-1 `before='-' + after=실투입자` 무음 드롭 잔존

### 문제 [확정]
`parser:830` `if (regularName.length===0 || isEmptyMarker(regularName)) return;` 가 changed 셀을 읽기 **전** 발생 → before열이 '-'(EMPTY_MARKERS)면 after열 실투입자도 무음 드롭. patch-2 미수정. 신규 경고(`858-862`)에 대한 alert 단정 테스트도 없음.

### 요구 동작
before='-'이고 after에 실투입자가 있으면 인식(또는 명시 경고). 최소한 `830` early-return을 changed 셀 평가 후로 이동.

### 수용 기준 (구코드 FAIL)
- before='-' + after=실투입자 → 휴일 항목 생성 단정. + `858-862` 경고 발화 케이스의 `alerts` 단정.

## F-5 · [P1] `hasApprovedArchiveForSchedule` 재아카이브 가드 항상-통과

### 문제 [확정]
재승인 경로에선 제거됐으나 `performance-approval-flow-service.ts:363-368`에서 `!hasApprovedArchiveForSchedule(detail)`로 **재아카이브 스킵 가드**로 여전히 사용. 비교 `item.scheduleKey === detail.scheduleKey`(229-239)가 디렉터리 접미사(pending vs approved) 때문에 절대 매칭 안 됨 → 가드 항상 통과 → 이미 아카이브된 (사이트·월) **재아카이브**(false-negative).

### 요구 동작 / 수용 기준
scheduleKey 접미사 정규화 후 비교하도록 수정(또는 가드 제거). 테스트: 동일 (사이트·월) approved 존재 시 재아카이브 안 됨 단정.

## F-6 · [P1] P1-2 C3-우선 회귀 + 맨숫자 미처리

### 문제 [확정]
`resolveFileIdentityFromWorksheet`(264-279)가 모든 파일에서 worksheet C3를 siteName 권위로(`stripFileDuplicateSuffix(worksheetSiteName || fileIdentity?.siteName)`). scheduleMonth는 파일명 우선(비대칭). `scheduleKey = schedule?.siteName ?? identity.siteName`(1265)이라 운영 `monthly_schedules=0`에서 C3 파생명이 scheduleKey 직접 구동 → C3≠파일명 사이트(수기변경/특수문자)가 패치 전과 다른 scheduleKey로 분기. 맨숫자 `동작국사1`(언더스코어 없음) 미처리.

### 수용 기준
- scheduleKey 안정성 회귀 테스트(C3≠파일명 케이스). 맨숫자 중복마커 정책 명시.

## F-7 · [P2] empty-key / unparseable-snapshot

### 문제 [확정]
`approval-service:212`·`management-service:492`의 `logicalKey || entryId` fallback 미변경(빈 키 교차 오키잉). `resolution-service:81-90`이 승인 스냅샷 null/파싱불가 시 **무조건 needsReapproval=true** → F-1 분기가 이를 신뢰 → 레거시/손상 스냅샷 있으면 신규 pending도 재승인.

### 수용 기준
- 빈 logical_key 분리 처리. unparseable-snapshot 분기에 음의 테스트.

## F-8 · 여전히 미착수 (원 사양 P1-4 / P2-1 유효)
- **P1-4** 품의서 병합 행계산 오버랩 + E2E 양성 테스트 (`allowance-document-export-service.ts` diff 0).
- **P2-1** 폴더/파일워치/아카이브 (`performance-file-archive-service.ts`·`file-watch-service.ts` diff 0).

---

---

# 3차 보완 (F-라운드 후속) — 2026-06-11 적대적 재검증 결과

- 검증 대상: Codex F-items 라운드 (작업트리 vs `HEAD 1da9379` = 10파일, 배포 대상)
- 방법: 4개 독립 적대적 검증가 + `git diff`/`git show` 직접 확인 + typecheck 0 / 전체 571 테스트 통과(회귀 0)
- **핵심 결론: 사용자 최초 증상(재파싱 시간 드리프트 → 손대지 않은 파일 대량 재승인)이 여전히 OPEN. 위험도 CRITICAL.**

## F-라운드 요약 판정
- ✅ 잘 됨(회귀잠금 테스트 고정): **F-3**(스케줄null 시 연장행 보존), **F-4**(빈슬롯`'-'`+실투입자 인식), **F-6 방향**(파일명-우선으로 C3-회귀 제거), **P1-3**.
- ❌ 미해결/회귀: **F-1**(시간 드리프트 그대로 → 증상 OPEN), **신규 alerts-제외 회귀(HIGH)**.
- ❌ 미착수(diff 0건 확정): **F-2**(재스냅샷), **F-7**(empty-key/스냅샷), **F-5 본체**, P1-4·P2-1.

| ID | 우선 | 한 줄 |
|----|------|-------|
| G-1 | **P0 CRITICAL** | F-1 미해결 — note/alerts만 뺐고 **시간 6필드 비교 잔존** → 재파싱 드리프트로 대량 재승인. provenance 키잉 미구현 |
| G-2 | **P0 HIGH** | alerts-제외 **신규 회귀** — 재파싱 신규 경고가 무음 승인. 새 테스트가 회귀를 정상으로 못박음 |
| G-3 | **P0 CRITICAL** | F-2 재스냅샷/마이그레이션 미착수 — F-1·F-3와 결합 시 업그레이드에서 대량 재승인+행 누락 동시 폭발 |
| G-4 | P1 | F-7 미착수 — empty-key fallback / 미해석 스냅샷 무조건 needsReapproval |
| G-5 | P1 | F-5 본체 미수정 — 재아카이브 가드 scheduleKey 비교 미정규화(항상-통과) |
| G-6 | P1 | F-3 부작용 — 스케줄null 시 휴일행이 per-row 신호 없이 silent drop |
| G-7 | P2 | F-4 fallback 경고 alert 미검증 |
| G-8 | P2 | F-6 약한 테스트(worksheet 분기 미실행) + bare-digit 미문서화 |

---

## G-1 · [P0·CRITICAL] F-1 재승인 증폭 — 여전히 미해결

### 확정 문제 [확정]
Codex의 F-1 수정은 `toComparableEntry`에서 `note`·`alerts` **두 필드 제거**가 전부(`resolution-service.ts` diff 9줄). 그러나:
- **시간 6필드 비교 잔존** (`resolution-service.ts:26-32`): `startTime/endTime/breakMinutes/totalWorkMinutes/baseWorkMinutes/overtimeMinutes/nightMinutes`. `arePerformanceEntriesEquivalent`(:39-42)는 이들의 `JSON.stringify` 비교.
- 같은 라운드 parser가 휴일 시간 출처를 뒤집음 (`parser.ts:862` `dutyScheduleItem ?? directScheduleItem`). `createWorkTimeFromScheduleItem`(:889)이 시간을 모든 분 필드로 파생 → duty-열 시간이 투입자 본인 시간과 다르면 6필드 전부 변동.
- **재현(확정):** 구파서 시간 T1로 승인 → 재임포트(fileId=path+mtime 변경)·신파서 재파싱 → 동일 logicalKey·시간 T2≠T1 → cross-entry-id 분기(`resolution:85-92`) → `arePerformanceEntriesEquivalent(T1,T2)=false` → `needsReapproval=true` → 파일 요약 cross-file 분기(`management-service.ts:188-198`)서 점화 → **손대지 않은 파일이 "재승인 대기"로 재분류.**
- **provenance/파서버전 키잉(F-1 사양 요구)은 미구현.** 동등성 엔진은 여전히 순수 콘텐츠 비교.

### 요구 동작
재승인을 **provenance/파서버전**에 키잉: 승인 스냅샷에 parser-version 또는 계산 서명을 임베드하거나 fileId 계보를 추적해, **신 파서로 재파싱한 이미-승인 파일이 재승인을 점화하지 않게** 한다(시간 변동이 파서버전 차이에서 기인하면 재승인 아님; 사용자 편집에서 기인하면 재승인).

### 수용 기준 (반드시 구코드/현 라운드 코드에서 FAIL)
- **cross-parser-version 테스트(restage 금지):** 동일 logicalKey를 **다른 휴일 시간 T1→T2**(direct→duty 전환 산출)로 파싱해 승인본과 비교 → 의도된 분류(파서버전만 다르면 재승인 아님) 단정. 현재 suite엔 시간-드리프트를 행사하는 테스트가 **전무**.

### [Codex 확인]
- provenance 방식(parser-version 서명 vs fileId 계보)을 제품오너와 합의. **이 항목이 사용자 최초 증상의 본체이며 현재도 OPEN임을 명확히.**

## G-2 · [P0·HIGH] alerts-제외 신규 회귀

### 확정 문제 [확정]
`alerts`를 동등성에서 제거(`resolution-service.ts`)함으로써, **시간 동일·alerts만 다른** 항목이 동등 처리 → `needsReapproval=false`. 그런데 같은 라운드 parser가 휴일 항목에 **새 데이터품질 경고**를 추가(`parser.ts:864-868`: "근무열 기준 못 찾아 투입자 원래시간 사용", "근무시간 기준 못 찾음"). → 구파서 승인 파일을 신파서로 재파싱 시 **새 경고가 떠도 시간만 같으면 무음 승인** → 데이터 문제가 사람 검토 없이 통과.
- **회귀를 정상으로 못박은 테스트:** `performance-approval-resolution-service.test.ts:79-95,102` (승인본 "구 파서 경고" vs 현재 "신 파서 경고" → `needsReapproval=false` 단정).

### 요구 동작 / 수용 기준
alerts를 무조건 빼지 말 것. provenance 키잉(G-1) 도입 후, **"데이터품질 경고 신규 출현"이 무음 수용되지 않도록** 분리(예: error/warning 신규 발생은 재검토 유발, 단순 파서버전 메타 변동은 무시). `resolution-service.test.ts:79-95` 단언 재검토. 신규 경고 출현 시 재승인/표면화됨을 단정하는 테스트 추가.

## G-3 · [P0·CRITICAL] F-2 재스냅샷/스케줄 복원 마이그레이션 — 미착수

### 확정 문제 [확정]
`database-migration-service.ts` zero-diff. 기존 `performance_approvals` 스냅샷을 신 파서 기준 재생성하거나 parser-version 표기/legacy-key 백필하는 마이그레이션 없음. F-1(콘텐츠 엔진 그대로) + F-3(스케줄null 시 휴일/대체 행 drop)과 결합 → **실제 설치 업그레이드 첫 재파싱/풀싱크에서 전 사이트 행 누락 + 대량 재승인 동시 발생.**

### 요구 동작 / 수용 기준
파서 변경과 **함께** (a) 운영 `monthly_schedules` 복구/재생성, (b) 기존 승인 스냅샷 재생성(또는 parser-version 마킹)을 배포 — 승인 이력 보존. 마이그레이션 단위 테스트(구 스냅샷이 이력 보존하며 재스냅샷됨) 추가. **파서 단독 배포 금지.**

## G-4 · [P1] F-7 empty-key / 미해석 스냅샷 — 미착수

### 확정 문제 [확정]
`performance-approval-service.ts` zero-diff → `:212` `record.logicalKey || record.entryId` 빈키 fallback 그대로(빈 logical_key cross-mis-key). `resolution-service.ts:74-83` approvedEntry null(스냅샷 null/미해석) 시 `needsReapproval:true` 무조건 반환 그대로 — **G-1의 cross-file 분기가 이 값을 신뢰**하므로 단일 손상 스냅샷이 신규 pending에 재승인 점화.

### 수용 기준
빈 logical_key 분리 처리. 미해석-스냅샷 무조건-true 분기에 가드 + 음성 테스트.

## G-5 · [P1] F-5 재아카이브 가드 본체 — 미정규화

### 확정 문제 [확정]
재승인 경로에선 `hasApprovedArchiveForSchedule` 제거됐으나, 재아카이브 스킵 가드(`performance-approval-flow-service.ts:363-368`)는 미수정. 비교 `item.scheduleKey === detail.scheduleKey`(:229-239)가 디렉터리 접미사(pending vs approved) 때문에 절대 불일치 → 가드 항상 통과 → 이미 아카이브된 (사이트·월) 재아카이브(false-negative).

### 수용 기준
scheduleKey 접미사 정규화 후 비교(또는 가드 제거). 동일 (사이트·월) approved 존재 시 재아카이브 안 됨 단정 테스트.

## G-6 · [P1] F-3 부작용 — 휴일행 silent drop

### 확정 문제 [확정]
`parser.ts:1293-1304`가 스케줄 null + 스케줄-의존 항목 존재 시 legal-holiday/substitute 행을 필터링하되 **per-row 신호 없이** 파일레벨 "월간 근무표 저장본을 찾지 못했습니다" alert만 남김 → 정당한 휴일근로가 출력에서 조용히 사라짐(P0-1이 경고한 "무경고 누락"을 0분 대신 silent omission으로 재도입).

### 요구 동작 / 수용 기준
드롭되는 행에 per-row 신호(에러 항목 또는 명시 표기) 부여, 또는 제품 판단으로 처리 방식 확정. 테스트로 단정.

## G-7 · [P2] F-4 fallback 경고 alert 미검증
`parser.ts:864-868` duty-열-미발견 fallback 경고에 대한 `alerts` 단정 테스트 추가.

## G-8 · [P2] F-6 약한 테스트 + bare-digit
- `parser.test.ts:180-197`("normalize duplicate suffixes from the worksheet site name")는 C3=`보라매DC_dup01`이나 파일명 `2026_3_보라매DC.xlsx` 유지 → 파일명-우선(`parser.ts:272`)이라 **worksheet 분기 미실행 → HEAD에서도 통과(아무것도 잠그지 못함)**. 파싱 불가 파일명으로 C3 fallback을 강제하는 fixture로 교체.
- bare-digit `동작국사1`(`stripFileDuplicateSuffix` 정규식 `/(?:_dup\d+|_\d+)$/i`, `:215`) 미처리 — 정책을 주석/테스트로 명문화.
- **[Codex 확인]:** patch-2가 이미 파일명-우선이었는지 이번 라운드가 C3-우선을 되돌렸는지 확인(문서-코드 정합). 어느 쪽이든 현 배포상태는 F-6 의도 충족.

## 손대지 말 것 (F-라운드에서 제대로 됨) [확정]
- **F-3** 연장행 보존(`parser.ts:1293-1304`), **F-4** `hasManualEmptySlotActualWorker`(`:839-847`) + duty-우선, **F-6** 파일명-우선+strip 일원화(`:272,243,257`), **P1-3** prune 테스트(`intake.test:260-288`) — 모두 회귀잠금 테스트로 고정됨. 되돌리지 말 것.

---

---

# 4차 보완 (G-라운드 후속 + 제품 결정 반영) — 2026-06-11

- 검증 근거: G-items 라운드 적대적 재검증(12파일 +1094/-145, 579 테스트 통과). G-2/G-4/G-5/G-6/G-7/G-8(a)는 진짜 수정·고정됨(되돌리지 말 것). **G-1은 잘못된 접근(blanket 시간제거)으로 새 무결성 갭 주입, G-3 미착수.**
- **제품 결정(사용자 확정):**
  - **재승인 정책 = 출처 기반 자동 재승인.** 파서/계산식 변경에 의한 시간 변동 → 재승인 **금지**. 실제 소스 데이터 변경(근무표 편집·시간 보정)에 의한 변동 → 재승인 **요청**. (휴일/대체 항목 포함, 수당 무결성 보존)
  - **손상/판독불가 승인 스냅샷 = "재검토 필요"로 표면화**(무음 승인 유지 금지). 단 1건 손상이 신규 pending 전건을 재승인시키지 않도록 범위 한정.

| ID | 우선 | 한 줄 |
|----|------|-------|
| H-1 | **P0** | G-1 재구현 — blanket 시간제거 폐기, **출처 기반**으로 파서드리프트↔소스변경 구분. 행동 테스트로 강제 |
| H-2 | **P0** | 손상 스냅샷 → 재검토 표면화(범위 한정). Codex의 `true→false` 되돌리되 전건 점화 방지 |
| H-3 | **P0** | G-3 재스냅샷/마이그레이션 동반 — 기존 승인에 출처서명 스탬프 + `monthly_schedules` 복원 |
| H-4 | P1 | 드리프트 억제를 alert-경로 의존이 아닌 **출처 기반으로 통일**(H-1과 연계) |
| H-5 | P2 | G-8(b) bare-digit 정책 코드 주석+테스트 명문화 |
| H-6 | P2 | 릴리즈 위생 — 미추적 `11123.xlsx`·`디자인샘플소스/대시보드디자인.md` 커밋 제외 |

---

## H-1 · [P0] G-1 재구현 — 출처 기반 재승인 (blanket 시간제거 폐기)

### 왜 현재가 틀렸나 [확정]
G-round의 `toScheduleDerivedComparableEntry`(`performance-approval-resolution-service.ts:48-61`)는 휴일/대체 항목의 **시간 7필드를 무조건 제거**해 비교 → 파서드리프트와 **실제 소스 시간변경을 구분 불가**, 둘 다 "재승인 아님". 수당 금액은 이 분(分) 필드에서 산출(`approved-allowance-calculation-service.ts:437-442`)되므로 **실제 시간변경이 무승인 수용**됨(수당 무결성 갭).

### 요구 동작 (제품 결정 = 출처 기반)
재승인 동등성 판정이 **파생 분(分)이 아니라 출처(source)**에 근거해야 한다. 파서가 동일 소스로 다른 분을 산출(공식 변경)하면 동등; 소스 입력 자체가 바뀌면 비동등.
- **권장 메커니즘 — 출처 입력 서명:** 각 entry에 `sourceSignature`(또는 동등 필드)를 부여해 **해당 entry를 만든 raw 상류 입력**(워크시트 셀: workDate·dutyCode·before/after 근무자·휴일채움 상태 + 사용된 monthly-schedule 소스의 안정 식별자/해시)을 서명. 승인 스냅샷에도 저장. 비교는 서명 동일성으로: **서명 동일 → 파생 분이 달라도 동등(재승인 아님) / 서명 상이 → 재승인.** (파서의 duty/direct 선택 같은 *공식*은 서명에 넣지 말 것 — 그게 핵심)
- **대안(단순) — parser/calc 버전 스탬프:** 스냅샷·entry에 `calcVersion` 저장, 버전이 다르면 시간차 무시·같으면 시간차=소스변경으로 재승인. 단 공식 변경 시 버전 bump 규율 필요 + 버전·소스가 동시에 바뀌면 갭. 출처 서명을 우선 권장.

### 수용 기준 (★ B·C는 **현재 G-round 코드에서 반드시 FAIL**해야 함 — 통과하면 미구현)
- **Test A — 파서 드리프트 → 재승인 아님:** 동일 소스를 구 basis(direct, 시간 T1)로 승인 → 신 basis(duty, 시간 T2≠T1)로 재파싱 → `needsReapproval=false`. (현재도 통과 — 유지)
- **Test B — 소스 편집 → 재승인 [필수·현재 FAIL]:** 승인 후 **워크시트 소스를 편집**(근무자/시간/dutyCode 변경)해 출처가 달라짐 → 재파싱 → `needsReapproval=true`. (현재 G-round는 시간변경을 무시하므로 false → FAIL이어야 정상)
- **Test C — 수당 관련 분이 소스로 변경 → 재승인 [필수]:** 소스 변경으로 totalWorkMinutes/overtimeMinutes가 바뀜 → `needsReapproval=true` + overview가 "승인됨"으로 오표시 안 함.
- restage(동일 파서·동일 콘텐츠) 테스트로 대체 금지. overtime 행이 아닌 **legal-holiday/substitute** 행으로 검증(현재 유일한 true 테스트는 overtime이라 새 분기 미검증).

### [Codex 확인]
- 출처 서명 vs calcVersion 중 택. **Test B/C를 통과시키되 Test A를 깨지 않는 것**이 완료 기준 — 둘을 동시에 만족하려면 blanket 제거로는 불가하므로 자연히 출처 기반이 됨.

## H-2 · [P0] 손상 스냅샷 → 재검토 표면화 (범위 한정)

### 문제 [확정]
G-round가 미해석 스냅샷 분기를 `needsReapproval: true→false`로 변경(`resolution-service.ts:105-114`) → 손상/판독불가 승인 증거가 "승인됨, 재승인 불필요"로 **무음 통과**.

### 요구 동작 (제품 결정 = 표면화)
승인 스냅샷이 판독 불가하면 해당 항목을 **"재검토 필요"로 표면화**(needsReapproval 또는 별도 상태). 단 **범위 한정**: 단일 손상 스냅샷이 같은 logicalKey를 공유하는 신규 pending 전건을 재승인시키지 않도록, 손상은 **그 항목/그 승인 건에 국한**해 신호.

### 수용 기준
- 손상 스냅샷 1건 → 해당 항목만 "재검토 필요"로 표면화, 무관한 신규 pending은 영향 없음 단정(구코드/현재 코드와 구분되게).

## H-3 · [P0] G-3 재스냅샷/마이그레이션 동반

### 문제 [확정]
`database-migration-service.ts` zero-diff. 파서 단독 배포 시 첫 풀-재파싱에서 (a) `monthly_schedules=0`로 휴일/대체 행 0분+error, (b) H-1 도입 전이면 대량 재승인 동시 발생.

### 요구 동작
파서 변경과 **함께** 배포: (a) 기존 `performance_approvals` 스냅샷에 **H-1의 출처서명(또는 calcVersion) 스탬프 백필**(이력 보존) → 신 파서 재파싱이 기존 승인을 대량 재승인시키지 않게, (b) 운영 `monthly_schedules` 복구/재생성. 마이그레이션 단위 테스트(구 스냅샷 백필 시 이력 보존·동등 판정 정상) 추가.

## H-4 · [P1] 드리프트 억제 경로 의존성 제거
G-round는 alert를 두 comparable에 보존(`:45,:60`)해, 재파싱이 duty-fallback 분기(`parser.ts:864-868`)를 타 새 경고가 뜨면 alert 차이로 재승인이 **재점화** → 억제가 비결정적(공식 경로 의존). H-1 출처 기반으로 통일하면 자연 해소되나, 별도로 "동일 출처면 alert 메타 변동만으로 재승인하지 않되, **신규 데이터품질 error는 별도 신호로 표면화**"를 분리할 것(억제 ↔ 경고를 다른 축으로).

## H-5 · [P2] bare-digit 정책 명문화
`stripFileDuplicateSuffix`(`parser.ts:214-215`) 정규식이 `_dup\d+`/`_\d+`만 처리하고 bare-digit(`동작국사1`)는 보존. 이게 의도(정상 숫자명 `센터1` 보호)면 **코드 주석 + 실 production 예시(`동작국사1`) 테스트로 명문화**(현재 테스트는 구코드서도 통과하는 특성화).

## H-6 · [P2] 릴리즈 위생
미추적 산출물 `11123.xlsx`(루트), `디자인샘플소스/대시보드디자인.md` 는 릴리즈/커밋에 포함 금지 확인. (`artifacts/patch-instructions-...md`·신규 테스트는 의도된 것.)

## 손대지 말 것 (G-라운드에서 제대로 됨) [확정]
- **G-2**(alerts 재포함), **G-4**(빈키 dedup), **G-5**(재아카이브 가드 정규화), **G-6**(휴일행 신호), **G-7**(fallback 경고 테스트), **G-8(a)**(worksheet strip), 그리고 범위 밖이었으나 개선된 **management-service 재구조화**·**intake prune** — 모두 구코드서 FAIL하는 강한 테스트로 고정됨. 되돌리지 말 것.

---

## 공통 수용 기준 / 검증 명령

- `npm run typecheck` (현재 exit 0 유지)
- `npm run test` (현재 127 파일 / 563 테스트 통과 — 회귀 0 유지 + 위 신규 테스트 추가)
- 각 신규 테스트는 **해당 수정 적용 전(구 코드)에서 FAIL** 함을 Codex가 직접 확인(특성화 테스트 금지)
- UI에 분류/계산 규칙 하드코딩 금지, 한국어 라벨·영어 주석

## 검증되어 손대지 말 것(긍정 확정)
- intake 패치: known-changed 항상 재파싱 + 신규파일 캡 우회 불가 — **정확** [확정]
- empty-marker 블록 제거: 실근무자 변경셀 None 시 휴일근로 유지 — **진짜 개선이며 테스트로 고정됨** [확정]

---

# 5차 보완 — H-라운드 적대적 재검증 결과 (Codex 작업지시)

> 검증 기준: 작업트리 vs HEAD `1da9379`, 읽기전용. `npm run test` **128 파일 / 585 테스트 전부 통과(EXIT 0)** 재확인 — 직전 "584 실패" 관측은 편집 도중 stale 트리였음(반증 확정). 아래는 **남은 갭만** 다룬다.

## 먼저: 이번 H-라운드에서 제대로 끝난 것 (되돌리지 말 것) [확정]
- **H-1 출처서명 메커니즘 = 정확.** `toScheduleItemSource`(`schedule-return-performance-parser.ts:707-720`)가 **RAW 스케줄 입력만** 서명(계산된 분 미포함), duty↔direct 공식 플립에 불변(가상/빈슬롯 분기는 두 항목 모두 서명 `:918-930`). 양측 서명 보유 시 `toScheduleDerivedComparableEntry`로 타이밍 제외 비교(`performance-approval-resolution-service.ts:51-64,66-83`). **Test A(공식 드리프트→재승인 없음)가 구코드서 FAIL→신코드 PASS로 진짜 고정.**
- **H-2** 손상 스냅샷 표면화·비전파 고정, **가법 `source_signature TEXT` 컬럼** 기존 NULL 행 안전, **런타임 lazy 백필 함수** 구현됨(`performance-approval-service.ts:264-`).
- **H-4/H-5** 반영됨. → **이 부분 코드/테스트 수정 금지.**

## 남은 갭 요약
| 항목 | 우선 | 한 줄 |
|---|---|---|
| **5-1** | **P0(기존데이터 HIGH)** | `monthly_schedules=0` 미복구 → 휴일/대체 0분 근본원인 잔존 + 레거시 승인 대량 재승인 잔존. **파서 단독 배포 금지(명세 :299,:415,:467) 위반 상태.** |
| **5-2** | **P0** | 출처서명 백필이 **사용자가 해당 월 "승인완료" 스코프를 열 때만** 동작. 부팅·전월(全月)·PENDING 백필 전무 → 기존 승인 대부분 무서명. |
| **5-3** | P1 | 해상도층 "서명→재승인" 배선 미고정(Test B가 서명+타이밍 동시변경이라 구코드서도 통과). Test C 부재. |
| **5-4** | P2 | `.gitignore`에 `11123.xlsx`·`디자인샘플소스/` 미등록 → `git add -A` 혼입 위험. |

---

## 5-1 · [P0] `monthly_schedules` 복구 — 휴일/대체 0분 근본원인 (H-3(a) 미완)

### 근본원인 [확정·메모리 일치]
운영 DB `monthly_schedules` 0행 → `resolveScheduleContext`(`schedule-return-performance-parser.ts:500-536`)가 `schedule=null` 반환 → `buildHolidayEntries`(`:831-992`)의 `createWorkTimeFromScheduleItem(null,"holiday")`(`:658-670`, 호출 `:913,:971`)가 **0분**. 연장이 살아남는 이유: `buildOvertimeEntries`(`:1113-1209`)는 워크시트 셀에서 시간을 직접 읽음(`createWorkTimeFromTimeRange :1136-1142`). **현재 어떤 테스트도 schedule=null을 검증 안 함**(`performance-test-helpers.ts:318`이 항상 `saveStoredMonthlySchedule` 선호출).

### [Codex 필수 선조사 — 분기 결정]
**휴일/대체 섹션의 *복귀 실적(return) 워크시트*가 start/end 시간을 자체적으로 담는가?** (연장 섹션처럼)
- 시간을 **담음** → **경로 B(워크시트 폴백)**를 1차 영구수정으로: `buildHolidayEntries`에서 `scheduleItem=null`일 때 연장과 동일하게 셀에서 직접 시간 도출(`createWorkTimeFromWorksheetFallback` 신설, 기존 `createWorkTimeFromScheduleItem`는 연장 호출자 위해 불변). monthly_schedules 의존 자체를 제거.
- 시간을 **안 담음**(휴일근로 시간이 스케줄에서만 옴 — 도메인상 유력) → **경로 A(복구) 필수.**

### 경로 A — `monthly_schedules` 복구 (명세가 요구하는 deploy-gate)
- **출처:** 배포관리(`schedule_export_dir`)\YYYY년\M월\ 의 월간근무표 xlsx(= `exportMonthlySchedulePlan`이 쓴 산출물). **현재 역파서 부재**(`schedule-plan-export-service.ts`는 쓰기만) → 신설 필요. 레이아웃은 `resolveSchedulePlanTemplateLayout`/`regularPlanColumns` 재사용.
- **삽입 위치(정확):** 스키마 마이그레이션(`sqlite-storage-service.ts:migrateDatabase`/`ensureColumn`)이 **아님**. 부팅 **데이터-복구 루틴**으로, 이미 있는 선례 옆에 형제로:
  - `main.ts:206 app.whenReady` → `initializeSqliteStorage()`(`:211`) → `repairStoredOvertimePerformanceData()`(`:214`, 선례=`performance-overtime-repair-service.ts:193`) **직후**에 신설 `restoreMissingMonthlySchedulesFromExportedPlans()` 호출. **file-watch 초기화 이전.**
  - 동작: performance_files에 존재하는 (scheduleMonth, siteName) 중 `monthly_schedules` 0행인 것만 골라, 배포관리 xlsx를 역파싱해 `monthly_schedules`+`monthly_schedule_items` INSERT. 파일 없으면 **건너뛰되 로그**(부팅 차단 금지).

### ★ 자기점화 방지 (5-1과 H-1을 잇는 핵심 — 반드시 반영)
복구 후 기존 **승인완료** 파일을 재파싱하면 휴일 분이 0→정상으로 **바뀐다**. 이때 재승인 비교를 그대로 태우면 **마이그레이션이 스스로 대량 재승인을 유발**한다. 따라서 복구 마이그레이션은:
1. 스케줄 복구 → 2. 승인파일 재파싱(올바른 workTime + 올바른 sourceSignature 생성) → 3. **승인 스냅샷을 정정값으로 re-baseline**(decision=approved 보존, 재승인 점화 없이 스냅샷만 동기화). = 명세 "승인 이력 보존 + 재스냅샷".

### 수용 기준 (★ 구코드서 FAIL 필수)
- **Test 5-1 [필수·현재 FAIL]:** `monthly_schedules`를 **빈 상태로** 두고(픽스처에서 `DELETE FROM monthly_schedule_items; DELETE FROM monthly_schedules` 후) 휴일 실적 파싱 → `legal-holiday` entry의 `totalWorkMinutes > 0`(예: 660). 현재는 0 반환 → FAIL이어야 정상.
- **Test 5-1b:** 복구 마이그레이션 실행 후 기존 승인건이 **재승인으로 점화되지 않음**(needsReapproval=false 유지) + 휴일 분은 정정됨.

---

## 5-2 · [P0] 출처서명 백필 도달범위 — 부팅·전월 백필 (H-3(b) 미완)

### 문제 [확정]
`backfillPerformanceApprovalSnapshotSourceSignatures`는 `syncApprovedPerformanceFilesToStorage`에만 배선(`performance-file-intake-service.ts:881,937,945`), 이는 **사용자가 그 월 "승인완료" 스코프를 열 때만** 호출(`performance-management-service.ts:480-489`). 부팅 시 `file-watch-runtime-service.ts:217`은 **PENDING만** 동기화. → **부팅 백필 없음 / 전월 백필 없음 / PENDING-스코프 백필 없음.** 결과: 기존 승인 대부분 무서명 → `hasSourceSignature(양측)=false` → full 타이밍 비교 폴백 → 공식 드리프트가 재승인 재유발(= 사용자 원래 증상).

### 정정된 사실 (적대적 검증으로 refute됨)
백필은 `entry.sourceSignature`를 **복사만** 하고 재생성 안 함(빈 서명이면 `:311-313` early-return). 즉 **빈 스케줄에서 백필해도 서명을 부패시키지 않는다.** 다만 원본 파싱이 빈 스케줄에서 됐다면 `scheduleItem:null`이 박힌 stale 서명을 복사한다 → **신선한 서명은 5-1 복구 후 재파싱에서만 나온다(순서: 5-1 → 재파싱 → 백필).**

### 구현
- 신설 `backfillAllApprovedSnapshotSourceSignatures()`(전 승인파일 순회, 각 detail에 기존 백필 적용). 멱등(`:287` 동일 서명이면 no-op).
- **호출 위치:** `main.ts`에서 5-1 복구·재파싱 **직후**, file-watch 초기화 **이전**. (재처리 경합 방지)

### 수용 기준 (★ 구코드서 FAIL 필수)
- **Test 5-2 [필수·현재 FAIL]:** 레거시 승인 스냅샷(`sourceSignature` 없음)을 심고 **사용자 네비게이션 없이** 부팅 루틴만 실행 → 모든 월의 승인 스냅샷에 서명 채워짐(`snapshot_json`에 `sourceSignature` 존재). 현재는 해당 월을 수동으로 열기 전엔 미충전 → FAIL.

---

## 5-3 · [P1] 해상도층 "서명→재승인" 배선 고정 + Test C

### 문제 [확정]
현재 Test B(`performance-approval-resolution-service.test.ts:132-161`)는 **서명과 타이밍을 동시에** 변경(`before-edit`/08:00/480 → `after-edit`/06:00/660). 구코드(full 비교)는 타이밍만으로 비동등 → 통과 → **"서명이 재승인을 유발"을 격리 못 함**(적대검증: 이 테스트는 구·신 양쪽서 통과). Test C(순수 출처경유 수당 분 변경 → 재승인) 전 계층 부재.

### 추가할 테스트 (기존 Test A·B 유지, 신규만)
- **Test B′ [필수·현재 FAIL]:** 양측 **타이밍 완전 동일**, `sourceSignature`만 상이(`source:holiday:before` vs `:after`), section `legal-holiday`, 양측 서명 존재 → `needsReapproval===true`.
  - **fail-on-old 증명(검증완료):** HEAD `performance-file.ts`에 `sourceSignature` 필드 부재 + HEAD `toComparableEntry`가 서명 미포함 → 구코드선 두 항목이 동등(타이밍 동일·서명 무시) → `needsReapproval=false ≠ true` → **FAIL**. 신코드선 타이밍 제외·서명 포함 비교 → 상이 → true → PASS.
- **Test C [필수]:** 출처 변경으로 `overtimeMinutes/totalWorkMinutes`가 바뀐 케이스 = 서명도 바뀜 → `needsReapproval===true` + overview "승인됨" 오표시 안 함. B′와 차이: C는 **수당 영향 소스 편집**이 유발원임을 명시(resolution 단위 또는 management/flow 통합 중 택1).
- Test A(동일 서명·타이밍만 상이 → false)는 그대로 유지(이미 구코드서 FAIL→신코드 PASS로 고정됨, 적대검증서 HEAD 5 fail/2 pass 확인).

---

## 5-4 · [P2] 릴리즈 위생 (H-6)

- `.gitignore`(현재 22줄, `양식샘플/*_preview.xlsx`·`allowance-evidence-*.png` 등 존재)에 **추가:** 루트 `/11123.xlsx` 와 `디자인샘플소스/`(`대시보드디자인.md` 포함). 두 산출물은 **현재 미추적**이라 `.gitignore` 추가만으로 충분(이미 추적됐다면 `git rm --cached` 필요하나 해당 없음).
- `artifacts/patch-instructions-*.md`·신규 테스트 파일·`performance-approval-resolution-service.test.ts`는 **의도된 산출물 — 커밋 대상.**

---

## 5차 공통 수용 기준
- `npm run typecheck` exit 0, `npm run test` **회귀 0**(현재 585 통과 유지 + 5-1/5-2/5-3 신규 추가).
- **모든 신규 테스트는 해당 수정 전(구 코드)에서 FAIL**함을 Codex가 직접 확인(특성화 테스트 금지).
- **deploy-gate(명세 :299,:415,:467):** 파서/판정 변경은 5-1(monthly_schedules 복구)+5-2(전월 백필)+재스냅샷과 **함께만** 배포 — 파서 단독 배포 금지.
- 한국어 라벨·영어 주석, UI에 분류/계산 규칙 하드코딩 금지.
