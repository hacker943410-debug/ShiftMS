# v0.4.21 릴리즈 아카이브

## 요약
- 버전: `0.4.21`
- 기준일: `2026-06-11`
- 브랜치: `release/0.4.21`
- 성격: 치환 슬롯 실적 시간 복구 및 품의서 선지급 병합 충돌 방지 패치

## 주요 결과
- 실투입자 이름이 월근무표에 없어도 변경표 슬롯의 `dutyCode` 기준 시간으로 법정휴일/대체근무 실적을 계산한다.
- 대체근무 표의 원근무자가 `-`인 empty-marker 치환 슬롯도 같은 날짜 변경표 슬롯에서 `dutyCode`를 역추적해 0분 누락을 막는다.
- 품의서 정규 요약 행이 템플릿 용량을 넘어 `spliceRows`가 발생해도 선지급 헤더가 합계 병합 행과 겹치지 않도록 시작행을 재계산한다.
- 선지급 헤더 병합 전 언머지 범위를 한 줄 위까지 확장해 stale 병합 모델에 대한 방어를 강화한다.

## 산출물
- `COMPACT_CONTEXT.md`
- `IMPLEMENTATION_ANALYSIS.md`
- `FILE_IMPACT.md`
- `FUNCTIONAL_SPEC.md`
- `RELEASE_MANIFEST.json`
- `TODO.md`
- `QA_CHECKLIST.md`
- `RESULT_REPORT.md`
- `logs/`
- `screenshots/`

## 배포 기준
- `npm run typecheck`
- `npm run test`
- `npm run build`
- GitHub Release `v0.4.21` Published 상태와 필수 자산 확인은 패키징 단계에서 완료한다.
