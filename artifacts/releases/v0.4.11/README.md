# v0.4.11 릴리즈 아카이브

## 요약
- 버전: `0.4.11`
- 기준일: `2026-05-07`
- 브랜치: `release/0.4.11`
- 성격: 실적관리 조회 범위 제한 및 승인대기 stale 행 표시 방지 패치

## 핵심 변경
- 실적관리 조회구분에서 `전체`를 제거하고 `승인대기`, `승인완료 보관본`만 유지했다.
- 승인완료 보관본은 연도와 월이 선택된 경우에만 조회되도록 UI와 main 서비스에 이중 방어를 추가했다.
- 승인대기 조회는 실제 승인대기 폴더에 존재하는 파일만 표시하도록 stale DB 행 표시를 차단했다.
- 변경 없는 승인완료 Excel도 기존 분석 결과를 재사용하도록 보강했다.

## 검증
- `npm run typecheck`
- `npm test`
- `npm run build`

## 산출물
- `RELEASE_MANIFEST.json`
- `RESULT_REPORT.md`
- `QA_CHECKLIST.md`
- `FILE_IMPACT.md`
- `FUNCTIONAL_SPEC.md`
- `IMPLEMENTATION_ANALYSIS.md`
- `COMPACT_CONTEXT.md`
- `TODO.md`
