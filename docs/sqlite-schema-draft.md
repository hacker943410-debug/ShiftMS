# SQLite 스키마 초안

작성일: 2026-03-11

이 문서는 ShiftMgmt_V3.4의 1차 SQLite 스키마 초안이다. 목적은 실제 DB 구현 전에 핵심 엔터티, 이력 전략, 스냅샷 저장 기준을 고정하는 데 있다.

## 1. 설계 원칙

1. 기준정보와 확정 결과 데이터를 분리 저장한다.
2. 승인 이후 계산 결과는 덮어쓰지 않고 버전으로 누적한다.
3. 변경 가능한 마스터 데이터는 가능한 한 이력 테이블을 둔다.
4. 원본 파일 메타데이터와 승인 시점 계산 근거를 함께 남긴다.
5. 날짜는 `YYYY-MM-DD`, 시각은 `HH:mm`, 일시는 ISO 8601 문자열 기준으로 저장한다.

## 2. 테이블 그룹

### 인증 및 사용자

- `users`
- `user_sessions`

### 기준정보

- `employees`
- `employee_site_assignments`
- `sites`
- `shift_patterns`
- `shift_pattern_steps`
- `wage_rates`
- `allowance_rate_versions`
- `allowance_rate_items`
- `holiday_calendars`
- `holiday_items`
- `document_template_versions`

### 운영 데이터

- `monthly_schedules`
- `monthly_schedule_items`
- `performance_files`
- `performance_entries`
- `performance_approvals`
- `allowance_calculations`
- `allowance_calculation_items`

### 감사 및 이벤트

- `audit_logs`

## 3. 테이블 초안

### `users`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| login_id | text unique | 로컬 로그인 ID |
| password_hash | text | 평문 저장 금지 |
| role | text | `admin` or `operator` |
| display_name | text | 표시명 |
| status | text | `active`, `inactive` |
| created_at | text | ISO datetime |
| updated_at | text | ISO datetime |

### `user_sessions`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| user_id | text fk | `users.id` |
| session_token | text unique | 토큰 또는 세션 식별자 |
| expires_at | text | ISO datetime |
| created_at | text | ISO datetime |
| revoked_at | text nullable | ISO datetime |

### `employees`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| employee_code | text unique | 사번 또는 내부 식별코드 |
| name | text | 이름 |
| employment_type | text | 정규, 계약 등 |
| phone | text nullable | 선택 저장 |
| status | text | `active`, `leave`, `retired` |
| hire_date | text nullable | `YYYY-MM-DD` |
| retire_date | text nullable | `YYYY-MM-DD` |
| created_at | text | ISO datetime |
| updated_at | text | ISO datetime |

### `sites`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| site_code | text unique | 근무지 코드 |
| name | text | 근무지명 |
| status | text | `active`, `inactive` |
| timezone | text | 기본 `Asia/Seoul` |
| created_at | text | ISO datetime |
| updated_at | text | ISO datetime |

### `employee_site_assignments`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| employee_id | text fk | `employees.id` |
| site_id | text fk | `sites.id` |
| team_name | text nullable | 조 이름 |
| shift_group | text nullable | 근무조 |
| start_date | text | `YYYY-MM-DD` |
| end_date | text nullable | `YYYY-MM-DD` |
| status | text | `active`, `ended` |
| created_at | text | ISO datetime |

### `shift_patterns`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| site_id | text fk | `sites.id` |
| name | text | 패턴명 |
| cycle_length | integer | 반복 일수 |
| pattern_code | text | 예: `DDNNXX` |
| start_index_rule | text | 시작 index 규칙 |
| status | text | `active`, `inactive` |
| created_at | text | ISO datetime |
| updated_at | text | ISO datetime |

### `shift_pattern_steps`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| pattern_id | text fk | `shift_patterns.id` |
| step_index | integer | 0-base |
| duty_code | text | 예: `D`, `N`, `O` |
| start_time | text nullable | `HH:mm` |
| end_time | text nullable | `HH:mm` |
| break_minutes | integer | 기본 휴게시간 |
| created_at | text | ISO datetime |

### `wage_rates`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| employee_id | text fk | `employees.id` |
| hourly_rate | integer | 통상시급 |
| effective_from | text | `YYYY-MM-DD` |
| effective_to | text nullable | `YYYY-MM-DD` |
| reason | text nullable | 변경 사유 |
| created_at | text | ISO datetime |

### `allowance_rate_versions`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| year | integer unique | 적용 연도 |
| version_label | text | 예: `2026.1` |
| status | text | `draft`, `active`, `retired` |
| effective_from | text | `YYYY-MM-DD` |
| effective_to | text nullable | `YYYY-MM-DD` |
| created_at | text | ISO datetime |
| updated_at | text | ISO datetime |

### `allowance_rate_items`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| version_id | text fk | `allowance_rate_versions.id` |
| allowance_code | text | 예: `overtime`, `night`, `holiday` |
| multiplier | real | 배수 |
| rounding_policy | text | 반올림 규칙 |
| created_at | text | ISO datetime |

### `holiday_calendars`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| year | integer unique | 연도 |
| source_name | text | 데이터 출처 |
| source_version | text nullable | 소스 버전 |
| created_at | text | ISO datetime |

### `holiday_items`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| calendar_id | text fk | `holiday_calendars.id` |
| holiday_date | text | `YYYY-MM-DD` |
| name | text | 공휴일명 |
| is_substitute | integer | 0 or 1 |
| created_at | text | ISO datetime |

### `document_template_versions`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| template_type | text | `schedule`, `proposal`, `attachment1`, `attachment2` |
| version_label | text | 양식 버전 |
| source_path | text | 원본 템플릿 경로 |
| checksum | text nullable | 파일 무결성 확인 |
| created_at | text | ISO datetime |

### `monthly_schedules`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| site_id | text fk | `sites.id` |
| schedule_month | text | `YYYY-MM` |
| pattern_id | text fk | `shift_patterns.id` |
| generated_at | text | ISO datetime |
| generated_by | text fk | `users.id` |
| template_version_id | text nullable | `document_template_versions.id` |

### `monthly_schedule_items`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| schedule_id | text fk | `monthly_schedules.id` |
| employee_id | text fk | `employees.id` |
| work_date | text | `YYYY-MM-DD` |
| duty_code | text | 근무 코드 |
| start_time | text nullable | `HH:mm` |
| end_time | text nullable | `HH:mm` |
| break_minutes | integer | 분 |

### `performance_files`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| site_id | text fk | `sites.id` |
| file_name | text | 파일명 |
| file_path | text | 절대경로 또는 기준경로 |
| file_checksum | text | 중복 감지 |
| file_size | integer | byte |
| received_at | text | ISO datetime |
| file_status | text | `pending`, `parsed`, `approved`, `rejected`, `error` |
| template_version_id | text nullable | `document_template_versions.id` |

### `performance_entries`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| performance_file_id | text fk | `performance_files.id` |
| employee_id | text fk | `employees.id` |
| work_date | text | `YYYY-MM-DD` |
| start_time | text nullable | `HH:mm` |
| end_time | text nullable | `HH:mm` |
| break_minutes | integer | 분 |
| duty_code | text nullable | 근무 코드 |
| note | text nullable | 비고 |

### `performance_approvals`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| performance_file_id | text fk | `performance_files.id` |
| approval_status | text | `approved`, `rejected` |
| approved_by | text fk | `users.id` |
| approved_at | text | ISO datetime |
| rejection_reason | text nullable | 반려 사유 |
| rate_version_id | text fk | `allowance_rate_versions.id` |
| holiday_calendar_id | text fk | `holiday_calendars.id` |
| snapshot_json | text | 승인 시점 스냅샷 |

### `allowance_calculations`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| performance_approval_id | text fk | `performance_approvals.id` |
| calculation_version | integer | 승인 후 재계산 버전 |
| status | text | `calculated`, `superseded` |
| total_work_minutes | integer | 총 근로시간 |
| base_work_minutes | integer | 기본근로시간 |
| overtime_minutes | integer | 연장근로시간 |
| night_minutes | integer | 야간근로시간 |
| holiday_minutes | integer | 휴일근로시간 |
| total_allowance_amount | integer | 총 수당 |
| created_at | text | ISO datetime |

### `allowance_calculation_items`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| calculation_id | text fk | `allowance_calculations.id` |
| employee_id | text fk | `employees.id` |
| allowance_code | text | 수당 항목 코드 |
| work_minutes | integer | 분 |
| amount | integer | 금액 |
| detail_json | text | 검산용 상세 근거 |

### `audit_logs`

| column | type | note |
| --- | --- | --- |
| id | text pk | UUID |
| actor_user_id | text nullable | `users.id` |
| event_type | text | 이벤트 종류 |
| entity_type | text | 대상 엔터티 |
| entity_id | text | 대상 PK |
| payload_json | text | 변경 전후 또는 메타데이터 |
| created_at | text | ISO datetime |

## 4. 우선 구현 테이블

1차 구현 우선순위는 아래 순서를 권장한다.

1. `users`
2. `employees`
3. `sites`
4. `employee_site_assignments`
5. `shift_patterns`
6. `shift_pattern_steps`
7. `wage_rates`
8. `allowance_rate_versions`
9. `allowance_rate_items`
10. `holiday_calendars`
11. `holiday_items`

이후 아래 테이블을 연결한다.

1. `monthly_schedules`
2. `monthly_schedule_items`
3. `performance_files`
4. `performance_entries`
5. `performance_approvals`
6. `allowance_calculations`
7. `allowance_calculation_items`

## 5. 오픈 이슈

1. 사용자 세션을 DB에 영속 저장할지 앱 메모리 기반으로 둘지 결정 필요
2. 개인식별정보 저장 범위를 최소화할지 운영 편의성을 위해 일부 확장할지 결정 필요
3. `performance_entries`를 원본 구조 그대로 저장할지 정규화 수준을 높일지 추가 검토 필요
4. 문서 양식 파일의 checksum 정책과 버전 채번 규칙 정의 필요
5. 공휴일 외에 회사 지정 휴무일을 별도 엔터티로 둘지 결정 필요
