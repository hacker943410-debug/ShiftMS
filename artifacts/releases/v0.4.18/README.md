# v0.4.18 릴리즈 아카이브

## 요약
- 버전: `0.4.18`
- 기준일: `2026-06-10`
- 브랜치: `release/0.4.18`
- 성격: 품의승인 Excel 자동 출력 복구 패치

## 주요 결과
- `최종 품의 승인` 실행 시 품의서, 별첨1, 별첨2 Excel 문서를 생성하도록 출력 형식을 복구했다.
- 품의 승인 완료 안내 문구를 Excel 출력 기준으로 정리했다.
- 품의 승인 미리보기의 PDF 한정 문구를 문서 출력 공통 문구로 바꿨다.
- 별도 PDF 출력과 Excel 출력 서비스 경로가 모두 유지되는지 타깃 테스트로 확인했다.

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
- GitHub Release `v0.4.18` Published 상태
- 필수 자산: 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`
