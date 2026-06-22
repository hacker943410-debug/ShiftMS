# src/shared — 도메인 계산 규칙 (shared 작업 시 자동 로드)

포맷터·계산식·타입 등 공용 로직. 수당/근무표/휴일 계산의 핵심이 `domain/`에 있다. (전역 규칙은 루트 `CLAUDE.md`)

## 변경 원칙
- **계산 규칙 변경은 코드보다 문서·테스트를 먼저 맞춘다**(AGENTS.md §6). UI에 계산 규칙 하드코딩 금지.
- 변경 후 반드시 `npm run test`(도메인 단위 테스트 다수) + **`holiday-calc-verifier`** 적대 검증.
- 요율은 **근무일 기준 backdating**(allowance-rate-service). 과거 승인분 재계산 위험을 항상 점검.

## 알려진 함정 (수정/검토 전 반드시 인지)
- **휴일 변경전(정규)칸이 실제 이름이면** 변경후 근무자 크레딧이 안 되고 '법정대체휴일근무 중복' 경고가 뜬다. 정규를 홍길동/빈칸으로 둬야 크레딧. ([[holiday-changed-slot-credit-rule]])
- **복구 시 패턴 A/B/C ↔ 그리드 D/E/N 불일치**로 시간이 null→0분이 되던 이슈는 시간대 분류로 보강됨. 배포 원본이 없으면 여전히 0 가능. ([[duty-code-mismatch-holiday-zero]])
- **법정공휴일 실적 0**의 진짜 원인은 monthly_schedules 0행 → schedule null → workTime 0. ([[holiday-performance-zero-root-cause]])
- 대체취소는 슬롯 단위, 재승인창은 분배분 제외, 요율 칸은 비활성. ([[holiday-credit-adversarial-verify-2026-06-15]])

## 핵심 파일
`domain/allowance-*`(수당), `domain/calculation.ts`(계산), `domain/schedule-*`·`monthly-schedule-draft.ts`(근무표), `domain/shift-pattern-compression.ts`(패턴), `domain/authorization.ts`(권한). 픽스처는 `*-fixtures.ts`.
