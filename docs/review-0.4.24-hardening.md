# 0.4.24 근무표 복구 하드닝 — 적대적 검증 라운드 기록

> 0.4.23(`065dfca`, 듀티코드 매핑 수정)에 대한 후속 하드닝. 모든 변경은 `release/0.4.24`
> 브랜치 **로컬 커밋**이며 **푸시·게시되지 않음**(패키징 지시 전까지 게시 금지).
> `package.json`은 아직 `0.4.23` — 버전 올림/릴리즈 아티팩트는 패키징 단계에서만.

## 대상 코드
- `src/main/services/monthly-schedule-restore-service.ts` (복구 본체)
- `src/main/services/monthly-schedule-restore-service.test.ts` (단위)
- `src/main/services/performance-file-intake-service.test.ts` (E2E)
- `src/main/services/performance-test-helpers.ts` (픽스처)

## 커밋
| 커밋 | 라운드 | 요지 |
|---|---|---|
| `9248d81` | R1(자체) | 퇴화창 차단·초검증·미해결 듀티 skip+경고 |
| `b742f88` | R2(코덱스) | 자정경계 분류 보정·부분복원 재복원 |
| `6749b6c` | R3(코덱스) | 레거시 미완성행 자가복구·멱등 재복원 |
| `7d62284` | R4(코덱스) | 마커 멱등성·degenerate 완성판정·서명 메타 |
| `2febbaa` | R5(코덱스) | 숨겨진 retired null-time 행 self-heal(raw items 판정) |

## 검증 방법(공통)
- 코덱스 발견은 **그대로 수용하지 않고** 매 건 코드/실행으로 교차검증.
- 각 발견에 대해 **(a) 실재 여부 (b) 0.4.24 신규 회귀 vs 0.4.23 기존결함 (c) 실데이터 영향**을 판정.
- 실데이터: 라이브 sqlite(`%AppData%/shiftmgmt-v3-4/data/shiftmgmt.sqlite`) **읽기전용** 조회.
  활성 11개 패턴은 전부 D/N 해소(2교대) 또는 D/E/N 해소(3교대) — 00:00 경계/이른 주간 시작/
  미해결 위치 근무자 **없음** → 아래 결함들의 현재 실데이터 영향은 **0**.
- 적대 검증 워크플로 사용: `wg11kz2j9`(R1 재설계 공격), `whfdk3z65`(R2 발견 + 수정안 검증).

---

## R1 — 자체 적대 검증(워크플로 `wg11kz2j9`) → `9248d81`

0.4.24 재설계(패턴 듀티코드를 시간대로 분류해 그리드 D/E/N에 매핑) 직후, 4개 에이전트로
신규 코드를 공격. 2건의 HIGH(둘 다 재설계가 새로 만든 결함)를 수정.

| # | 심각도 | 발견 | 판정 | 조치 |
|---|---|---|---|---|
| 1 | HIGH | 시작==종료 퇴화창이 밴드로 재분류돼 다운스트림 ~24h 유령근무(1380분) 저장 | 실재(신규) | `hasUsableWindow`가 start===end 거부, `classifyGridDutyCode` null 반환 → skip+경고 경로로 | 
| 2 | HIGH | 미해결 듀티 skip+경고 동작에 테스트 0건 | 실재(신규) | skip+warn E2E 추가(나래 E 누락+경고 단언) |
| 3 | LOW | 초(SS) 범위 미검증(08:00:99 통과) | 실재 | `toMinuteOfDay` 초>59 거부 |
| 4 | LOW | 전부 미해결 시 모순 이중 메시지 | 실재 | items=0 & 미해결 있으면 "근무자 못 찾음" 억제 |
| - | MEDIUM | A/B/C E2E가 비검증(시드 D/N 패턴이 먼저 선택돼 A/B/C 미사용) | 실재 | 시드 비활성화로 A/B/C 패턴 실사용 → load-bearing화 |

여러 LOW(다중 사이클 창 붕괴 등)는 기존/구조적이라 범위 외로 분류.

---

## R2 — 코덱스 2건 → `b742f88`

코덱스 판정: 승인 거부. 교차검증(워크플로 `whfdk3z65` 포함) 결과 **둘 다 0.4.23 기존결함**.

### R2-1 (BLOCK) 부분복원 후 재복원 영구차단
- **위치**: `buildMissingScheduleTargets`
- **주장**: items>0면 미해결 있어도 저장→`(site,월)` 키 존재→다음부터 대상 0건.
- **판정**: 실재하나 **기존결함**. 0.4.23도 0분 행을 저장해 동일하게 키 생성·차단. 9248은
  오히려 경고를 노출해 개선. 실데이터 영향 0.
- **조치(채택)**: 부분복원을 `system-restore-partial`로 태깅 → 완전복원 전까지 재복원 대상 유지.
  기존 행 id 재사용으로 **중복행 없이 교체**, 완전복원 시 마커 전환. 재복원/교체/완료전환 E2E 추가.

### R2-2 (HIGH) 자정경계 분류
- **위치**: `classifyGridDutyCode`
- **주장**: 16:00-00:00→N(should E), 00:00-08:00→D(should N).
- **판정**: 실재하나 **기존결함**(0.4.23 `<=`도 동일 오분류). 실데이터 영향 0.
- **수정안 1차의 자가결함**: `시작<06:00→N`은 **새 회귀** 유발(05:00-13:00 같은 이른 주간이
  N으로 오분류 + first-wins로 N슬롯 충돌해 D 비움) — 워크플로가 적발.
- **조치(채택, 수정안 변경)**: (a) 종료 "00:00"을 자정(1440)으로 정규화 → 16:00-00:00→E.
  (b) 시작 **정확히 00:00**이면 N(00:00-08:00→N), 05:00 등 이른 주간은 D 유지.
  잠긴 케이스(17:00-23:00→N, 판교 08:00-20:00→D, 08:00-08:00→null) 전부 보존.
  연속 8h-3교대(08-16/16-00/00-08) 맵 테스트 추가.

---

## R3 — 코덱스 4건 → `6749b6c`

코덱스 판정: 승인 거부. 교차검증 결과 #1·#3 실재, #2 실결함 아님, #4 테스트 보강.

### R3-1 (BLOCK) 레거시 system-restore 미완성행 백필 안 됨
- **주장**: 0.4.23/9248가 만든 `system-restore` 미완성 행을 0.4.24가 "완료"로 보고 제외.
- **판정**: **실재**. R2 수정이 신규 partial만 태깅 → 기존 설치 DB의 미완성 행은 영구 제외.
- **조치(채택)**: `isCompleteRestore` = `generatedBy==="system-restore"` **이면서 모든 item이
  시간 보유**. 미완성(partial 마커 OR null-time)인 restore 스케줄은 재복원 대상에 포함, 기존
  id로 교체. **수동 스케줄(generatedBy≠system-restore\*)은 done 처리해 자동으로 절대 안 덮음.**

### R3-2 (HIGH) 20:00-00:00→N 충돌
- **주장**: 08-16/20-00/00-08에서 E 비고 N 오선택.
- **판정**: **실결함 아님**. 현실적 *연속* 8h-3교대(00-08/08-16/16-00)는 충돌 없이 N/D/E 해결.
  코덱스 예시는 16-20시 공백이 있는 **비연속** 패턴이고, 20:00-00:00(저녁8시~자정)은 정당하게
  야간(N) — 잠긴 17:00-23:00→N과 일관. 분류 변경 시 정상 실패턴이 깨짐.
- **조치(문서화+잠금)**: 분류 변경 안 함. 20:00-00:00→N 잠금 테스트 추가. 비연속/모호 패턴은
  미해결 경고+재복원으로 안전 강등(코덱스 권고와 일치).

### R3-3 (MEDIUM) 재복원 churn → startup forceReparse
- **주장**: stuck partial이 매부팅 재저장→restoredScheduleCount=1→승인파일 재파싱 반복.
- **판정**: **실재**(`performance-startup-recovery-service.ts:27` `restoredScheduleCount>0`→forceReparse).
- **조치(채택)**: **멱등 재복원** — `scheduleItemSignature` 비교로 결과가 기존 행과 동일하면
  저장·카운트 스킵.

### R3-4 (MEDIUM) 테스트 미비 → 위 수정 E2E(레거시 자가복구·멱등·20:00 잠금) 추가.

---

## R4 — 코덱스 4건 → `7d62284`

코덱스 판정: 승인 거부. 교차검증 결과 #1·#3·#4 실재(수정), #2 비도달(문서화).

### R4-1 (HIGH) 서명만 비교해 마커 영구 stuck
- **주장**: 미해결 근무자가 export에서 사라져 사실상 완전해졌는데도 서명이 같아 저장 스킵 →
  `system-restore-partial` 마커가 영구 유지.
- **판정**: **실재**, R3 멱등 검사(`6749b6c`)가 만든 결함.
- **조치(채택)**: 멱등 스킵 조건에 **마커 일치**도 추가(서명 AND generatedBy 동일일 때만 스킵).
  미해결이 사라지면 마커가 partial→full로 전환. E2E 추가(근무자 명칭 변경 시 마커 flip).

### R4-2 (HIGH) 수동 full행 + 더 최신 partial행 공존 시 파서가 partial 선택
- **위치**: 파서 `schedule-return-performance-parser.ts:520`(generatedAt DESC 정렬, 최신 선택).
- **판정**: **기존결함, 정상 흐름에서 비도달**. 복구는 수동/완전 행 있으면 **skip**하고,
  `saveStoredMonthlySchedule`는 id 재사용 시 **원래 generatedAt 유지** → 시스템이 수동행보다
  최신인 partial을 만들지 않음. 코덱스 repro는 더 최신 partial을 강제 삽입한 인위적 상황.
  중복 `(site,월)` 행 + 파서 최신선택은 0.4.23 이전부터의 데이터모델/파서 사안.
- **조치(문서화)**: 파서 변경 안 함(범위 외, completeness 지표가 partial을 깔끔히 구분 못함).
  권고 별도수정: `(site_id, schedule_month)` 유니크 제약 또는 파서가 완전본 우선 선택.

### R4-3 (HIGH) 0-item/degenerate row를 complete로 오판
- **주장**: `system-restore` 0-item 또는 08:00-08:00 degenerate item만 있어도 complete로
  판정(`items.every(start&&end)`는 빈배열에 true, degenerate에도 start/end 존재) → 미수복 +
  다운스트림 24h 유령근무.
- **판정**: **실재**(레거시 행 한정; 0.4.24는 degenerate를 애초에 저장 안 함).
- **조치(채택)**: `isCompleteRestore`에 **items 비어있지 않음 AND 모든 item `hasUsableWindow`**
  추가. 0-item/degenerate 레거시 행을 재복원 대상으로. degenerate 자가복구 E2E 추가.

### R4-4 (LOW) 서명이 teamLabel/sortOrder 제외 → 메타만 틀린 행 미정정
- **판정**: **실재(LOW)**. 해당 필드는 데이터 동일 시 부팅 간 안정적이라 포함해도 churn
  재유발 없음.
- **조치(채택)**: `scheduleItemSignature`에 teamLabel/sortOrder 포함. 메타 드리프트 정정 E2E 추가.

---

## R5 — 코덱스 2건 → `2febbaa`

코덱스 판정: **조건부 승인 가능**. BLOCK/HIGH 재현 안 됨, R4-1/R4-3/R4-4 수렴 확인.
MEDIUM 1건(실재) 수정, LOW 1건(=R4-2 재확인) 문서 유지.

### R5-1 (MEDIUM) 숨겨진 retired null-time 행이 self-heal 누락
- **위치**: `isCompleteRestore`가 `listStoredMonthlySchedules()`의 retired-필터된 items로 판정.
- **주장**: 퇴사일 이후 item은 storage layer에서 숨겨지므로, raw DB에 retired 직원의 null-time
  행이 남아도 visible item만 정상이면 complete로 판정 → self-heal 제외.
- **판정**: **실재**. 계산 경로도 retired item을 숨겨 즉시 0분 영향은 낮으나 "legacy null-time
  전량 self-heal" 주장은 부분 성립.
- **조치(채택)**: 완성판정+서명을 **raw items 기준**으로 변경 — 신규
  `listRawMonthlyScheduleItemsByScheduleId()`(retired 필터 미적용)로 숨겨진 null/degenerate
  행을 감지해 재복원·정리. E2E 추가(retired 직원 hidden null 행 self-heal).

### R5-2 (LOW) 수동행+더 최신 partial행 공존 시 파서 최신선택
- R4-2와 동일. 정상 순차 경로에서 재반증 못 함(비도달) → 파서 미변경, 문서 유지(아래 한계 2).

## 이월/알려진 한계(미수정, 의도적)
1. **R3-2** 비연속/모호 패턴(예 20:00-00:00 + 00:00-08:00 동시)의 자동 D/E/N 매핑은 불완전 →
   미해결 경고+재복원으로 강등. 현실 연속 패턴엔 영향 없음.
2. **R4-2** 한 `(site,월)`에 중복 스케줄 행이 존재하면 파서가 generatedAt 최신을 선택 →
   인위적으로 수동행보다 최신인 미완성행을 만들면 잘못 선택될 수 있음. 정상 흐름 비도달.
   별도수정 권고: `(site_id, schedule_month)` 유니크 제약 또는 파서 완전본 우선.
3. 복구는 배포관리 plan 원본 파일 필요 — 없으면 스케줄 자체가 없어 실적 0(이 버그 아님).

## 상태
- 모든 라운드 후 `typecheck` 0, 전체 테스트 통과(R5 시점 624). `release/0.4.24` 로컬 커밋.
- **게시·푸시 안 됨.** 패키징은 별도 지시 시에만.
