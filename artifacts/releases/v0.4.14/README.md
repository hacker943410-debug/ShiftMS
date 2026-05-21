# v0.4.14 릴리즈 아카이브

## 요약
- 버전: `0.4.14`
- 기준일: `2026-05-21`
- 브랜치: `release/0.4.14`
- 성격: 인력관리 목록/연락처/고용형태 정리, 삭제 근무지 인력 제외 안내, 2026-04 품의서/별첨1 양식 반영, 별첨1 시급 표기, 수당 올림, 품의서 체크박스/대상자 카운트/로고/폰트/총합계 테두리 보정
- 배포 상태: 구현 및 자동 검증 완료, 수동 QA와 패키징/GitHub Release 게시 전

## 핵심 변경
- 인력관리 상단 필터를 한 줄 toolbar로 정리하고 검색 입력을 우측으로 이동했다.
- 인력관리 목록에 하단 페이지게이트와 페이지당 `10 / 20 / 50`명 선택을 추가했다.
- 직원 연락처를 DB, 신규 등록, 프로필 수정, 검색 조건에 추가했다.
- 고용형태는 `정규 / 계약 / BP` 3개로 통일하고 파견/용역 계열은 계약으로 정규화한다.
- 삭제된 근무지에 배정된 인력은 목록과 집계에서 제외하고 내부 모달로 대상 목록을 확인한다.
- 별첨1 Excel 선택값 없는 칸은 Blank로 되돌리고 시급 셀은 숫자값과 `#,##0.00원` 표시 형식을 유지한다.
- 별첨1 PDF 시급은 소수점 둘째 자리까지 표시한다.
- 수당 산출은 `시급 * 요율 * 근로시간` 결과에 원 단위 올림을 적용한다.
- 기본 품의서/별첨1 양식을 2026-04 수정본으로 갱신한다.
- 품의서 Excel 최상단은 `☑ 품의`, `☐ 보고` 체크박스 표기로 출력하고 `당월 지급 대상자` 수는 퇴사자 조기 지급 대상자를 포함한다.
- 품의서 Excel 최상단 로고는 배경 제거 로고로 교체해 `A1:C1`에 배치하고, 작성자/전화번호/총합계 폰트와 `B30:H30` medium 테두리를 보정한다.
- 별첨1 Excel 출력은 `별첨1` 시트만 남기고, 퇴사자 조기 지급 대상이 없어도 `해당 없음` 행과 새 샘플 기준 정적 계산 안내를 포함한다.
- 별첨1 조기 지급 `해당 없음` 행의 근무시간/수당/요율/시급/지급비용 영역 `H:S`는 Blank로 출력한다.

## 검증 결과
- `npm run typecheck`: 통과
- `npx vitest run src/main/services/allowance-document-export-service.test.ts --maxWorkers=1 --minWorkers=1`: 통과
- `npx vitest run src/main/services/operations-storage-service.test.ts src/main/services/document-template-source-path-service.test.ts --maxWorkers=1 --minWorkers=1`: 통과
- `npm run test`: 통과
- `npm run build`: 통과
- `npm run release:check`: 통과

## 남은 작업
- `QA_CHECKLIST.md` 기준 수동 QA 실행
- 패키징 진행 시 `npm run release:publish` 실행
- GitHub Release `v0.4.14` Published 상태와 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json` asset 확인
- 릴리즈 PC sign-off 또는 수동 QA 결과를 `logs/` 하위에 기록

## 산출물
- `RELEASE_MANIFEST.json`
- `RESULT_REPORT.md`
- `QA_CHECKLIST.md`
- `FILE_IMPACT.md`
- `FUNCTIONAL_SPEC.md`
- `IMPLEMENTATION_ANALYSIS.md`
- `COMPACT_CONTEXT.md`
- `TODO.md`
