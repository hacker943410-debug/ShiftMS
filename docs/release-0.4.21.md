# ShiftMgmt 0.4.21

치환 슬롯 실적 시간 및 품의서 병합 충돌 수정

근무표에서 `홍길동` 또는 빈 슬롯에 실투입자를 넣은 경우에도 슬롯 근무시간으로 실적과 수당을 계산하고, 품의서 선지급 헤더가 요약 합계 병합과 겹치지 않도록 보정했습니다.

## 실적 파싱
- **홍길동/빈칸 치환** — 실투입자 이름이 월근무표에 없어도 변경표 슬롯의 `dutyCode` 시간으로 법정휴일 실적을 계산합니다.
- **대체근무 슬롯 복구** — 대체근무 표의 원근무자가 `-`인 경우에도 같은 날짜 변경표 슬롯을 찾아 대체근무 시간을 계산합니다.
- **회귀 방지** — holiday/substitute 양쪽 경로에 신규 인수 테스트를 추가했습니다.

## 품의서 Excel
- **행 삽입 오프셋 반영** — 정규 요약 행이 템플릿 용량을 초과해 삽입되면 삽입된 행 수를 선지급 섹션 시작행에 반영합니다.
- **병합 방어 강화** — 선지급 헤더 병합 전 주변 병합을 넓게 정리해 `Cannot Merge already merged cells` 재발 위험을 낮췄습니다.

## 검증
- focused parser/export tests 통과
- `npm run typecheck` 통과
- `node scripts/validate-structure.mjs` 통과
- `npm run test -- --reporter=dot` 통과, `128 files / 594 tests`
- `npm run build` 통과
- `npm run release:check` 통과
