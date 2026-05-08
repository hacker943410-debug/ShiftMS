# v0.4.13 릴리즈 아카이브

## 요약
- 버전: `0.4.13`
- 기준일: `2026-05-08`
- 브랜치: `release/0.4.13`
- 성격: 품의서/별첨 출력 경로 표준화, 수당 계산 보정, DB복원/인력관리 개선
- 배포 상태: GitHub Release `v0.4.13` 공개 게시 예정

## 핵심 변경
- 품의서/별첨1/별첨2 Excel/PDF 출력 경로를 `기준폴더\YYYY년\MM월\YYYY_MM_문서명` 구조로 통일했다.
- 최종품의수당은 총수당 합계에 원 단위 올림을 적용하도록 정리했다.
- 별첨1 출력 시 필수 데이터가 Blank로 남는 문제를 보정했다.
- 연장근무 수당이 기본근로수당으로 분류되는 문제를 연장근로수당 기준으로 수정했다.
- DB복원 시 인력 상태 공백/미분류는 `재직`으로 저장한다.
- 인력관리 화면에 `전체 / BP / BP 제외` 필터와 인원 수 표시를 추가했다.
- 품의서 Excel/PDF의 문서번호는 문서일자에 표시된 월 기준으로 출력한다.

## 검증
- `npm run typecheck`
- `npm run test`
- `npm run build`
- 배포 전 `npm run release:check`, `npm run release:publish` 실행 예정

## 배포 확인
- GitHub Release: `https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.4.13`
- 공개 상태: 게시 예정
- 포함 자산: `ShiftMgmt-Setup-0.4.13-x64.exe`, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`

## 산출물
- `RELEASE_MANIFEST.json`
- `RESULT_REPORT.md`
- `QA_CHECKLIST.md`
- `FILE_IMPACT.md`
- `FUNCTIONAL_SPEC.md`
- `IMPLEMENTATION_ANALYSIS.md`
- `COMPACT_CONTEXT.md`
- `TODO.md`
