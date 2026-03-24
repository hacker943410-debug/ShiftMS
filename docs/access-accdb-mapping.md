# ACCDB 실데이터 매핑 메모

## 대상 파일
- 원본 파일: `양식샘플/DT사업1팀_교대근무관리DB.accdb`
- 확인 일자: `2026-03-24`
- 연결 방식: `Microsoft.ACE.OLEDB.16.0` 우선, 실패 시 `12.0`

## 연결 확인 결과
- 현재 PC에서 `ACCDB` 파일 열기 가능
- `Microsoft Access Driver (*.mdb, *.accdb) 64-bit` 확인
- `Microsoft.ACE.OLEDB.16.0`, `Microsoft.ACE.OLEDB.12.0` 연결 성공
- 단순 조회, 집계, `LEFT JOIN` 쿼리까지 정상 동작

## 발견된 사용자 테이블
| 원본 테이블 | 건수 | 성격 |
|---|---:|---|
| `공휴일` | 82 | 운영 기준 공휴일 |
| `근무자별시급관리` | 91 | 직원별 시급 이력 |
| `사업조직별근로시간관리` | 14 | 근무지별 기준 근로시간 |
| `사업조직별근무실적` | 317 | 승인/미승인 실적 원본 |
| `사업조직별근무자현황` | 208 | 근무지/그룹별 직원 현황 |
| `사업조직별패턴` | 15 | 근무지별 패턴 문자열 정의 |
| `사업조직현황` | 11 | 근무지별 근무형태 및 시간대 |
| `연장근로요율` | 5 | 수당 요율 |
| `직무해제자현황` | 21 | 직무해제/대체 참고 정보 |

## 앱 도메인 매핑

### 1. 바로 매핑 가능한 항목
| 원본 테이블 | 앱 대상 | 대상 서비스/도메인 | 매핑 난이도 | 비고 |
|---|---|---|---|---|
| `공휴일` | `holiday_calendars`, `holiday_items` | `operations-storage-service.ts` / `HolidayCalendar`, `HolidayItem` | 낮음 | 연도별 전체 교체 방식이 적합 |
| `연장근로요율` | `allowance_rate_versions`, `allowance_rate_items` | `operations-storage-service.ts` / `AllowanceRateVersion` | 낮음 | `요율정의년도` 기준 버전 생성 |
| `사업조직현황` | `sites` | `site-storage-service.ts` / `SiteRecord` | 중간 | `siteCode`, `timezone`, `status` 보정 규칙 필요 |
| `사업조직별근무자현황` | `employees`, `employee_site_assignments` | `employee-storage-service.ts`, `employee-history-service.ts` / `EmployeeRecord`, `EmployeeSiteAssignment` | 중간 | 빈 슬롯 행(`None_A3`) 제외 필요 |
| `근무자별시급관리` | `wage_rates` | `employee-history-service.ts` / `WageRateRecord` | 중간 | `적용유무=True` 우선, 이력 정렬 규칙 필요 |

### 2. 추가 설계가 필요한 항목
| 원본 테이블 | 앱 대상 후보 | 난이도 | 판단 |
|---|---|---|---|
| `사업조직별패턴` | `shift_patterns` | 높음 | 패턴 문자열(`주*3,휴*3...`)을 현재 cycle/step 구조로 파싱해야 함 |
| `직무해제자현황` | `employee_site_assignments.end_date` | 중간 | `퇴사일` 이 아니라 `배정 종료일` 로만 반영한다 |
| `사업조직별근로시간관리` | 현재 직접 대응 없음 | 중간 | 참고성 데이터로만 보관할지 결정 필요 |

### 3. 현재 구조와 1:1로 맞지 않는 항목
| 원본 테이블 | 앱 대상 후보 | 문제 |
|---|---|---|
| `사업조직별근무실적` | `performance_files`, `performance_entries`, `performance_approvals`, `allowance_calculations` | 원본 DB는 행 중심 구조라, 현재 앱에는 `site + month + 승인상태` 기준 synthetic file로 변환해 반영한다 |

## 주요 구조 차이

### 공휴일
- 원본은 `공휴일명`, `날짜`만 보유
- 앱은 `year`, `sourceName`, `sourceVersion`, `isSubstitute` 를 추가로 관리
- 권장 방식:
  - 원본 연도별로 읽어 `replaceStoredHolidayCalendar` 로 전체 반영
  - `sourceName = access-db`, `sourceVersion = <file date>` 형태 권장

### 수당 요율
- 원본 `연장근로요율` 은 다음 5개 유형을 직접 보유
  - `법정공휴일`
  - `평_대체근로수당`
  - `휴_대체근로수당`
  - `평_연장근로수당`
  - `휴_연장근로수당`
- 앱의 `AllowanceRateCategoryCode` 와 직접 매핑 가능

| 원본 근로유형 | 앱 categoryCode |
|---|---|
| `법정공휴일` | `legal-holiday` |
| `평_대체근로수당` | `weekday-substitute` |
| `휴_대체근로수당` | `holiday-substitute` |
| `평_연장근로수당` | `weekday-overtime` |
| `휴_연장근로수당` | `holiday-overtime` |

### 요율 차이 주의
- 원본 DB 조회 결과 `평_대체근로수당` 의 `기본근로수당요율` 은 `1.00`
- 현재 앱 기본값 `allowanceRateDefaultMatrix.weekday-substitute.base` 는 `1.5`
- 따라서 실데이터 import 시에는 앱 기본값을 쓰면 안 되고, 반드시 Access 원본값을 저장 기준으로 써야 한다.

### 근무지 / 근무형태
- `사업조직현황` 은 근무지명, 근무형태, 정원, 최대 3개 근무 슬롯을 보유
- 앱 `SiteRecord` 는 시간 정보를 직접 저장하지 않고, 패턴/step 쪽에 근무시간을 저장한다.
- 따라서 `사업조직현황` 단독으로는 `sites` 까지만 안정적으로 매핑 가능하고, 시간대는 `사업조직별패턴` 파싱 결과와 함께 봐야 한다.

### 인력 현황
- `사업조직별근무자현황` 에는 `근무지`, `그룹명`, `그룹번호`, `사원번호`, `직원명`, `재직유무`, `그룹유형`, `직무적용일자`, `조직개편일자`, `직무대체대상자` 가 있다.
- 빈 슬롯 표현(`None_A3`, `None_P1`)이 실제 데이터에 섞여 있으므로 import 시 제외 규칙이 필요하다.
- 권장 매핑:
  - `사원번호` -> `employeeCode`
  - `직원명` -> `name`
  - `재직유무` -> `status`
  - `근무지` -> `currentSite`
  - `그룹명` -> `shiftGroup` 또는 `teamName`

### 시급 이력
- `근무자별시급관리` 는 `사원번호`, `직원명`, `통상시급`, `시급정의년도`, `시급등록일시`, `적용유무` 를 보유
- 현재 앱은 `effective_from`, `effective_to` 가 필요한 이력형 구조다.
- 권장 1차 규칙:
  - `적용유무=True` 인 최신 항목을 현재 활성 시급으로 import
  - `시급등록일시` 를 `effective_from` 후보로 사용
  - `적용유무=False` 이력은 후속 단계에서만 보관

### 패턴
- `사업조직별패턴` 의 `근무시작패턴` 은 압축 문자열 형태다.
  - 예: `주*3,휴*3,야*3,휴*3`
  - 예: `(주야휴휴)*7`
- 앱 `ShiftPatternRecord` 는 cycle, step, team index 분리 구조다.
- 따라서 import 전 별도 패턴 파서가 필요하다.
- 2026-03-24 기준 현재 앱은 `src/shared/domain/shift-pattern-compression.ts` 를 통해 아래 형식을 공용 규칙으로 인식한다.
  - 반복식: `주*2`, `1*3`
  - 그룹 반복식: `(야휴)*7`, `(주야휴휴)*7`
  - 2교대: `주/야/휴`
  - 3교대: `주/석/야/휴` 또는 `1/2/3/휴`
  - 4교대 이상: `1/2/3.../휴`
- 즉 Access 원본 문자열을 현재 근무지 관리 화면에서도 바로 입력해 pattern preview / step 생성 / 저장 검증까지 같은 파서로 처리할 수 있다.

## 추천 이행 순서

### Phase A: 기준정보 Import
목표: 운영 관리 실데이터를 앱에 우선 반영한다.

- `공휴일`
- `연장근로요율`
- `사업조직현황` 기반 `sites`

### Phase B: 인력 Import
목표: 인력/시급/배정 상태를 운영 화면 기준으로 맞춘다.

- `사업조직별근무자현황`
- `근무자별시급관리`
- 필요 시 `직무해제자현황`

### Phase C: 패턴 Import
목표: 근무표 배포/시뮬레이션 기준이 되는 패턴 구조를 반영한다.

- `사업조직별패턴`
- 별도 패턴 문자열 파서 필요

### Phase D: 과거 실적 Backfill
목표: Access 실적을 현재 앱 승인/수당 구조로 기본 이관한다.

- `사업조직별근무실적`
- `performance_files`, `performance_entries`, `performance_approvals`, `allowance_calculations`, `allowance_calculation_items`
- 승인 여부와 Pool 여부에 따라 synthetic file와 승인/수당 이력을 분리 반영한다

## 권장 결정 사항
1. `사업조직별근무실적` 은 synthetic file 방식으로 기본 이관하되, 원본 파일 자체는 생성하지 않는다.
2. `근무자별시급관리` 는 1차로 활성 시급만 가져오고, 전체 이력 이관은 다음 단계로 미룬다.
3. `사업조직별패턴` 은 압축 문자열 파서 규칙을 먼저 합의한 뒤 구현한다.
4. `직무해제자현황` 은 `retireDate` 로 가져오지 않고 `employee_site_assignments.end_date` 로만 반영한다.

## 2026-03-24 실적 migration 구현 기준
- `사업조직별근무실적` 은 `근무지 + YYYY-MM + 승인상태` 기준 synthetic file로 묶는다.
- 승인 완료 행은 `performance_approvals`, `allowance_calculations`, `allowance_calculation_items` 까지 함께 만든다.
- 미승인 행은 `performance_entries` 만 만들고 approval/calculation 은 만들지 않는다.
- Pool 대체근무는 현재 앱 규칙을 그대로 따라 `is_pool_worker = 1` 로만 남기고 화면/수당 대상에서는 제외한다.
- `통상시급` 이 비어 있으면 `기본/연장/야간 시간 × 배수 × 금액` 에서 역산한 시급을 우선 사용하고, 그래도 없으면 활성 시급 이력을 fallback 으로 사용한다.
- `근무시작시간_시/분`, `근무종료시간_시/분` 은 `HH:mm` 으로 변환하고, `총근로시간` 과 raw duration 차이로 `break_minutes` 를 계산한다.
- 수당 snapshot 은 Access 원본 line amount 와 총액을 그대로 저장하고, `rate_version_id` 는 `Access 실적 이관 <year>` 라벨의 inline marker 로 기록한다.
- 2026-03-24 임시 DB 기준 Access `DB업데이트` 실행 결과:
  - 근무지 14건
  - 인력 85명
  - 패턴 11건
  - 실적 엔트리 258건
  - 승인 이력 257건
  - 수당 계산 257건
  - 배정 종료 6건
- 현재 경고:
  - `SK증권 홍길동1 2024-08-15` 승인 행 1건은 시급을 복원하지 못해 approval/calculation 을 만들지 않았다.
  - 패턴 제외 근무지: `대전DC`, `대전NOC`, `울산CLX`

## 읽기 전용 추출 도구
- 스크립트: `scripts/export-access-db.ps1`
- 용도:
  - 테이블 목록과 스키마 확인
  - 선택 테이블 JSON 추출
  - import 전 원본 스냅샷 보관
- 잠금 대응:
  - 원본 `accdb` 가 Access/Explorer/백업 도구에 의해 잠겨 있어도 읽을 수 있도록, 스크립트가 임시 복사본을 만든 뒤 그 복사본에 연결한다.

### 예시
```powershell
powershell -ExecutionPolicy Bypass -File scripts/export-access-db.ps1 `
  -DatabasePath "C:\Projects\Active\ShiftMgmt_V3.4\양식샘플\DT사업1팀_교대근무관리DB.accdb" `
  -IncludeRows
```

## Electron import PoC
- 스크립트: `artifacts/scripts/electron-access-import-poc.cjs`
- 실행 스크립트: `npm run import:access:poc`
- 기본 대상:
  - `공휴일`
  - `연장근로요율`
  - `사업조직현황`
- 동작:
  1. `export-access-db.ps1` 로 원본 테이블을 JSON 으로 추출한다.
  2. 임시 `DATA_DIR` 로 Electron 앱을 실행한다.
  3. `window.appBridge.replaceHolidayCalendar`, `saveAllowanceRateVersion`, `saveSite` 를 호출해 SQLite 에 반영한다.
  4. `listHolidayCalendars`, `listAllowanceRateVersions`, `listSites` 로 반영 결과를 다시 검증한다.
  5. 실행 결과를 `artifacts/access-import-poc/<timestamp>/import-summary.json` 에 남긴다.

### 예시
```powershell
npm run import:access:poc
```

### 비고
- 이 PoC 는 임시 `DATA_DIR` 기준으로만 동작하므로 현재 운영 데이터는 건드리지 않는다.
- `사업조직현황` 에서 시간대/패턴은 아직 가져오지 않고, 근무지 이름만 `sites` 로 반영한다.
- `연장근로요율` 은 Access 원본 배율을 그대로 저장한다. 앱 기본값과 달라도 원본값이 우선이다.

## 2026-03-24 PoC 실행 결과
- 명령: `npm run import:access:poc`
- 결과: 성공
- 산출 경로: `artifacts/access-import-poc/20260324-103928`
- 확인된 반영 건수:
  - 공휴일 달력 4개 연도
    - 2024년 20건
    - 2025년 20건
    - 2026년 21건
    - 2027년 21건
  - 수당 요율 버전 1건
    - 2024년 / `ACCDB 2024 20260209`
  - 근무지 11건
- 검증:
  - `replaceHolidayCalendar` 반영 후 `listHolidayCalendars` 재조회 일치
  - `saveAllowanceRateVersion` 반영 후 `listAllowanceRateVersions` 재조회 일치
  - `saveSite` 반영 후 `listSites` 재조회 일치

## Electron 인력/시급 import PoC
- 스크립트: `artifacts/scripts/electron-access-workforce-import-poc.cjs`
- 실행 스크립트: `npm run import:access:workforce:poc`
- 기본 대상:
  - `사업조직현황`
  - `사업조직별근무자현황`
  - `근무자별시급관리`
- 동작:
  1. 원본 3개 테이블을 JSON 으로 추출한다.
  2. `사업조직현황` 과 `사업조직별근무자현황` 의 근무지를 합쳐 `sites` 를 만든다.
  3. `사업조직별근무자현황` 에서 인력을 추린다.
  4. `근무자별시급관리` 에서 활성 + 양수 시급만 current wage 로 반영한다.
  5. Electron bridge 로 `saveSite`, `saveEmployee`, `saveEmployeeAssignment`, `saveEmployeeWageRate` 를 호출한다.
  6. `listEmployees`, `listEmployeeAssignments`, `listEmployeeWageRates` 로 재검증한다.

### 적용 규칙
- 제외:
  - `None_*`
  - `공석`
  - `TBD`
  - 사원번호가 비어 있는 행
- 배정 중복:
  - 같은 사번/이름이 여러 행에 있으면 `그룹유형 = 기본` 을 우선한다.
  - 그다음 `그룹번호` 가 작은 행을 우선한다.
- 시급:
  - `적용유무 = true` 이면서 `통상시급 > 0` 인 행만 가져온다.
  - 여러 건이면 `시급등록일시` 가 가장 늦은 행을 우선한다.
- 근무지:
  - `사업조직현황` 에 없는 근무지라도 `사업조직별근무자현황` 에 있으면 fallback `site` 를 생성한다.

## 2026-03-24 인력/시급 PoC 실행 결과
- 명령: `npm run import:access:workforce:poc`
- 결과: 성공
- 산출 경로: `artifacts/access-import-poc/workforce-20260324-104805`
- 확인된 반영 건수:
  - 근무지 14건
  - 직원 85명
  - 활성 시급 83건
- 원본 규칙 요약:
  - `사업조직별근무자현황` 208행 중
    - placeholder 97행 제외
    - 무사번 16행 제외
    - 중복 배정 10행 병합
    - 최종 import 85명
  - `근무자별시급관리` 91행 중
    - 비활성 6행 제외
    - 0원 시급 2행 제외
    - 최종 active wage 83건
- 시급 없이 남은 인력:
  - `BP(정다운)` / `보라매NOC`
  - `전인환` / `판교DC`

## 직무해제일자 정책
- `직무해제일자` 는 현재 앱에서 `퇴사일` 로 취급하지 않는다.
- 반영 대상은 `employee_site_assignments.end_date` 이다.
- 즉 Access 원본의 `직무해제자현황` 은 인사 상태 변경이 아니라 `현재 배정 종료 이력` 으로만 가져온다.
- `퇴사일` 은 계속 `인력 관리 -> 인력 상세 -> 현재상태 = 퇴사 -> 퇴사 처리일 저장` 흐름에서만 기록한다.
- 자동 반영 기준:
  - `근무지 + 직원명 + 그룹명 + 그룹번호 + 그룹유형` 정확 매칭 1건
  - 또는 `근무지 + 이름 정규화` 단일 매칭 1건
- ambiguous, unmatched, placeholder, 날짜 누락 행은 자동 종료하지 않고 리포트만 남긴다.

## 직무해제 분석 결과
- 스크립트: `artifacts/scripts/access-duty-release-analysis.cjs`
- 실행 스크립트: `npm run analyze:access:duty-release`
- 결과:
  - exact match 2건
  - 이름 정규화 unique match 10건
  - unmatched 7건
- 해석:
  - `SKB동작국사` 는 자동 종료 후보
  - `판교DC` 는 현재 인력 스냅샷에 없는 이름이 섞여 있어 자동 종료에서 제외하는 편이 안전

## Electron 직무해제 import PoC
- 스크립트: `artifacts/scripts/electron-access-duty-release-import-poc.cjs`
- 실행 스크립트: `npm run import:access:duty-release:poc`
- 동작:
  1. `사업조직현황`, `사업조직별근무자현황`, `근무자별시급관리`, `직무해제자현황` 을 JSON 으로 추출한다.
  2. 임시 `DATA_DIR` 에 근무지/인력/배정/시급을 먼저 반영한다.
  3. `직무해제자현황` 은 `정확 매칭` 또는 `이름 정규화 단일 매칭` 인 경우에만 `closeEmployeeAssignment` 로 종료한다.
  4. 종료 후 `listEmployeeAssignments` 로 `status = ended`, `endDate = 직무해제일자` 인지 재검증한다.
  5. 결과를 `artifacts/access-import-poc/<timestamp>/import-summary.json` 에 남긴다.

## 2026-03-24 직무해제 PoC 실행 결과
- 명령: `npm run import:access:duty-release:poc`
- 결과: 성공
- 산출 경로: `artifacts/access-import-poc/duty-release-import-20260324-130207`
- 확인된 요약:
  - 자동 종료 검증 성공 6건
  - skip 6건
  - unmatched 7건
- skip 사유:
  - 이미 앞선 행에서 같은 인력/근무지 배정을 종료해 `active-assignment-not-found`
  - `직무해제일자 < 배정 시작일` 인 `before-assignment-start`
- 해석:
  - 현재 원본은 `직무해제자현황` 자체가 부분적으로 중복/과거 이력을 포함한다.
  - 따라서 자동 반영은 “종료 가능한 현재 배정만 닫고, 나머지는 리포트로 남기는” 방식이 안전하다.

## 패턴 skip 3건 메모
- 남은 대상:
  - `대전DC`
  - `대전NOC`
  - `울산CLX`
- 현재 원본 상태:
  - `사업조직현황` 에 해당 근무지 행이 없다.
  - `사업조직별근로시간관리` 에는 `월평균총근로시간`, `주휴일_시간`, `기본급구성_시간` 만 있고, 근무 슬롯 시작/종료시각은 없다.
- 결론:
  - 현재 원본만으로는 3개 근무지의 `day/night` 시간 슬롯을 안전하게 복원할 수 없다.
  - 다른 근무지의 4조2교대 정의를 복사해 추정하는 것은 가능하지만, 그건 원본 근거가 아니라 운영 규칙 확인이 필요한 추론이다.
- 검증:
  - `saveEmployee` 반영 후 `listEmployees` 재조회 일치
  - `saveEmployeeAssignment` 반영 후 `listEmployeeAssignments` 재조회 일치
  - `saveEmployeeWageRate` 반영 후 `listEmployeeWageRates` 재조회 일치

## 2026-03-24 패턴 파서 구현 메모
- 파일: `src/shared/domain/shift-pattern-compression.ts`
- 검증:
  - `src/shared/domain/shift-pattern-compression.test.ts`
  - 실제 Access 예시 문자열 2건 포함
- 현재 상태:
  - Access 압축 문자열을 현재 앱의 pattern 입력창에서 바로 사용할 수 있다.
  - parser 는 `expanded tokens -> step input` 변환까지 제공하므로, 다음 단계에서 `사업조직별패턴 -> shift_patterns` import PoC 에 그대로 재사용할 수 있다.
- 다음 단계:
  - `사업조직별패턴` 테이블을 읽어 `site + cycle + step + team index` 구조로 저장하는 3차 import PoC 구현

## Electron 패턴 import PoC
- 스크립트: `artifacts/scripts/electron-access-pattern-import-poc.cjs`
- 실행 스크립트: `npm run import:access:pattern:poc`
- 기본 대상:
  - `사업조직현황`
  - `사업조직별패턴`
- 동작:
  1. 원본 2개 테이블을 JSON 으로 추출한다.
  2. `사업조직현황` 에서 근무지별 근무시간과 휴게시간 정의를 읽는다.
  3. `사업조직별패턴` 을 `근무지 + 패턴시작일 + 근무유형` 기준으로 묶는다.
  4. 각 row 를 cycle 1개로 보고 공용 압축 패턴 파서로 `steps` 를 만든다.
  5. `A~H` 컬럼을 조별 index / cycle assignment 로 변환한다.
  6. Electron bridge 로 `saveSite`, `saveShiftPattern` 을 호출한다.
  7. `listShiftPatterns` 로 저장 결과를 다시 검증한다.

### 적용 규칙
- `사업조직현황` 에 없는 근무지는 패턴 import 대상에서 제외하고 summary 에 남긴다.
- `사업조직현황` 의 `근무형태` 와 `사업조직별패턴` 의 `근무유형` 에서 읽은 교대 수가 다르면 skip 한다.
- 같은 근무지에 같은 시작일/근무유형 row 가 여러 개면 multi-cycle 패턴으로 저장한다.
- pattern 이름은 `ACCDB | <근무지> | <근무유형>` 형식으로 저장한다.

## 2026-03-24 패턴 import PoC 실행 결과
- 명령: `npm run import:access:pattern:poc`
- 결과: 성공
- 산출 경로: `artifacts/access-import-poc/pattern-20260324-111754`
- 확인된 반영 건수:
  - 근무지 14건 정리
  - 패턴 11건 저장
  - 재조회 검증 11건 모두 일치
- multi-cycle 확인:
  - `보라매NOC / 4조3교대` 는 cycle 2개로 저장 성공
- override 확인:
  - `SKB동작국사`
    - `사업조직현황 = 5조2교대`, `사업조직별패턴 = 5조3교대`
    - 실제 시간 슬롯 3개가 존재하므로 `사업조직별패턴` 의 교대 수를 우선 적용해 import 성공
- skip 된 그룹:
  - `대전DC`, `대전NOC`, `울산CLX`
    - 이유: `사업조직현황` 에 시간대 정의 없음

## 직무해제자현황 분석
- 스크립트: `artifacts/scripts/access-duty-release-analysis.cjs`
- 실행 스크립트: `npm run analyze:access:duty-release`
- 목적:
  - `직무해제자현황` 이 현재 `사업조직별근무자현황` 과 자동 매칭 가능한지 확인
  - `retireDate / assignment 종료` import 규칙을 정하기 전 리스크를 계량화

## 2026-03-24 직무해제 분석 결과
- 명령: `npm run analyze:access:duty-release`
- 결과: 성공
- 산출 경로: `artifacts/access-import-poc/duty-release-analysis-20260324-112142`
- 전체 21건 중:
  - placeholder 2건
  - exact group match 2건
  - 이름 정규화(`이주형_A -> 이주형`) 후 unique match 10건
  - ambiguous 0건
  - unmatched 7건
- 사이트별:
  - `SKB동작국사`: 5건 모두 매칭 가능
  - `판교DC`: 16건 중 7건 unmatched
- 해석:
  - `SKB동작국사` 는 자동 반영 후보로 볼 수 있다.
  - `판교DC` 는 현재 인력 스냅샷에 없는 이름(`이진영`, `임대현`)이 다수라서 단순 자동 import 는 위험하다.
  - 또한 이름만 맞고 그룹이 달라진 케이스가 있어, `직무해제` 를 곧바로 `retireDate` 로 볼지, 아니면 단순 assignment 종료/변경 이벤트로 볼지 정책 확정이 필요하다.

## 직무해제 관련 확인 필요 사항
1. `직무해제일자` 를 `퇴사일(retireDate)` 로 볼지, `현재 배정 종료일(endDate)` 로만 볼지
2. 이름 정규화 매칭(`이주형_A -> 이주형`) 을 자동 허용할지
3. 현재 인력 스냅샷에 없는 이름 7건은 manual review 로 남길지, 과거 이력 import 범위를 넓힐지
