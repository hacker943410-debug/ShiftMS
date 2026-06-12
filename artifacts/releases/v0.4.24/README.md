# v0.4.24

## 요약
0.4.23(근무표 복구 시 패턴 듀티코드 A/B/C↔그리드 D/E/N 매핑 수정)에 대한 후속 안정화. 복구 시 ① 시작=종료 같은 0길이(퇴화) 근무시간을 차단해 유령 24시간 근무를 막고, ② 패턴에서 시간을 찾지 못한 칸은 0분 행으로 저장하는 대신 건너뛴 뒤 경고하며, ③ 자정 경계(16:00–00:00=석간, 00:00–08:00=야간) 분류를 보정하고, ④ 부분만 복구된 달과 옛 버전이 남긴 미완성 근무표(빈 시간·0건·중복 행)를 다시 복구 대상으로 삼아 기존 행을 교체하며 채운다. ⑤ 결과가 동일하면 다시 저장하지 않는 멱등 복구로 매 부팅 시 불필요한 재처리를 막는다. 수동 근무표는 절대 자동으로 덮어쓰지 않는다.

## 변경 범위
- `src/main/services/monthly-schedule-restore-service.ts` — 퇴화창 차단(`hasUsableWindow`/`classifyGridDutyCode` null 반환), 초(SS) 범위 검증, 자정 경계 분류 보정, `system-restore-partial` 태깅+기존 id 재사용 교체, 레거시 미완성 행 자가 치유, 멱등 재복구(서명+마커 비교), raw-items 완성 판정(숨겨진 퇴사자 null 행 감지).
- `src/main/services/monthly-schedule-storage-service.ts` — `listRawMonthlyScheduleItemsByScheduleId`(retired 필터 미적용) 추가.
- 신규 테스트: `monthly-schedule-restore-service.test.ts`(단위), `performance-file-intake-service.test.ts`(E2E 다수), `dongjak-hong-yuseong-verification.test.ts`(동작국사 A/B/C 치환 슬롯 실데이터 검증).

## 핵심 커밋
- `9248d81` 퇴화창 차단·초검증·미해결 듀티 skip+경고
- `b742f88` 자정 경계 분류 보정·부분 복구 재복구
- `6749b6c` 레거시 미완성 행 자가 치유·멱등 재복구
- `7d62284` 마커 멱등성·degenerate 완성 판정·서명 메타
- `2febbaa` raw-items 완성 판정(숨겨진 퇴사자 null 행 self-heal)
- `6c3ece7` 동작국사 치환 슬롯 실데이터 회귀 테스트

## 검증
- 적대적 검증 5라운드(코덱스 R2–R5 교차검증, R5=조건부 승인 가능). 전 라운드 기록: `docs/review-0.4.24-hardening.md`.
- 실데이터 end-to-end: 동작국사 A/B/C, 치환 슬롯 홍길동→유성 → 복구 후 유성 420분(135,450원), 한가람 휴일 660분(237,600원). 복구 전 0분 → 복구 후 정상.
- `npm run typecheck` 통과(0)
- `npm run test` 통과 — `130 files / 625 tests`
- `npm run build` / `npm run release:check` 통과

## 비고(이 패치 범위 밖, 남은 한계)
- 해당 월 근무표 원본(배포 근무표 파일)이 없으면 복구할 게 없어 여전히 0 — 별도 사안.
- 비연속/모호 패턴(예: 20:00–00:00 + 00:00–08:00 동시)의 자동 D/E/N 매핑은 불완전 → 미해결 경고+재복구로 안전 강등(현실 연속 패턴엔 영향 없음).
- 한 (근무지,월)에 중복 근무표 행이 존재하고 PC 시계가 과거로 틀어진 경우에만 파서가 미완성본을 고를 수 있음(정상 시계·정상 흐름에선 비도달). 근본 해결은 `(site,월)` 유니크 제약 등 별도 작업.
