# v0.4.19 릴리즈 아카이브

## 요약
- 버전: `0.4.19`
- 기준일: `2026-06-11`
- 브랜치: `release/0.4.19`
- 성격: 근무지 패턴 시간 저장 안정화 및 Excel 병합 오류 진단 강화 패치

## 주요 결과
- 보라매DC처럼 패턴 순서가 `A,C,B`인 근무지를 수정해도 1근, 2근, 3근 시간이 뒤바뀌지 않게 했다.
- 슬롯별 휴게시간을 보존해 야간 휴게시간이 주간/석간 값으로 덮이지 않게 했다.
- 품의서 Excel 고객사/단위 조직 요약 병합 전에 기존 병합을 넓은 범위로 정리한다.
- Excel 병합 실패 시 문서, 기능, 처리 구간, 시도 범위, 기존 병합 범위를 안내한다.

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
- GitHub Release `v0.4.19` Published 상태
- 필수 자산: 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`
