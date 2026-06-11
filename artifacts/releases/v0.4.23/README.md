# v0.4.23

## 요약
근무표 복구 서비스가 근무표 칸을 주간/석간/야간 위치(D/E/N)로 읽으면서 근무시간은 패턴의 근무코드로만 조회해, 패턴이 `A/B/C` 등 D/E/N과 다른 코드를 쓰는 근무지(예: SKB동작국사 5조3교대)는 복구된 근무표에 시간이 비었고 → 법정공휴일/대체 근로시간이 0분 → 수당 0원으로 계산됐다. 복구 시 패턴 근무의 시작 시각으로 주간/석간/야간을 분류해 D/E/N 칸에 실제 시간을 채우도록 수정.

## 변경 범위
- `src/main/services/monthly-schedule-restore-service.ts` — `classifyGridDutyCode`(시작시각 기준 D/E/N 분류) 추가, `buildDutyTimeSourceMap`이 패턴 코드 키에 더해 분류된 D/E/N 키를 보강(기존 D/E/N 키는 덮어쓰지 않음).
- 신규 단위 테스트(`monthly-schedule-restore-service.test.ts`, 6건): A/B/C 패턴 → D/N 시간 보강, 판교DC식 D/N 패턴 → 자기 시간 보존.

## 핵심 커밋
- `6d88368` fix(schedule): map pattern duty letters to grid D/E/N so restored schedules carry shift times

## 검증
- 실데이터 end-to-end(실제 restore→파서→수당): SKB동작국사 2026-05-01 노동절, 빈 Day슬롯→홍길동→실투입자(조현하) → 복구 항목 `duty=D 09:00-18:00` 채움 → 480분 → 수당 191,868원(8h×15,989×1.5). 판교DC `D 08:00-20:00` 보존.
- `npm run typecheck` 통과(0)
- `npm run test` 통과 — `129 files / 602 tests`
- `npm run build` / `npm run release:check` 통과

## 비고(이 패치 범위 밖, 남은 한계)
- 해당 월 근무표 자체가 없으면(배포 근무표 원본 부재) 복구할 게 없어 여전히 0 — 별도 사안.
- 패턴에 오후 근무가 없는데 그리드 석간(E) 칸에 사람이 있으면 E 시간 미해결(드문 데이터 불일치). 주간/야간은 견고.
