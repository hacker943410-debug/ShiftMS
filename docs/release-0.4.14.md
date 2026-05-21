# ShiftMgmt v0.4.14

## 상태
- 현재 작업 브랜치: `release/0.4.14`
- 대상 버전: `0.4.14`
- 현재 단계: 패치 구현 및 자동 검증 완료, 수동 QA와 패키징/GitHub Release 게시 전
- 기준 산출물:
  - `artifacts/releases/v0.4.14/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.14/RELEASE_MANIFEST.json`
  - `artifacts/releases/v0.4.14/QA_CHECKLIST.md`

## 요약
0.4.14는 인력관리 목록 조회 방식과 직원 데이터 기준을 정리하고, 2026-04 품의서/별첨1 양식과 별첨1 시급 표기, 수당 올림 계산, 품의서 체크박스/대상자 카운트/로고/폰트/총합계 테두리를 보정한 패치입니다.

## 변경 사항
1. 인력관리 필터를 한 줄 toolbar로 정리하고 이름/연락처 검색을 우측에 배치했습니다.
2. 인력관리 목록에 하단 페이지게이트와 페이지당 `10 / 20 / 50`명 선택을 추가했습니다.
3. 직원 연락처를 신규 등록, 프로필 수정, DB 저장, 검색에 반영했습니다.
4. 고용형태는 `정규 / 계약 / BP`로 통일하고 파견/용역 계열은 계약으로 정규화했습니다.
5. 삭제된 근무지에 배정된 인력은 인력관리 목록과 집계에서 제외하고 내부 모달로 대상 목록을 확인할 수 있습니다.
6. 인력관리 테이블 정렬은 근무지명, 조이름, 사원번호 오름차순으로 고정했습니다.
7. 별첨1 Excel 선택값 없는 수당/시간/요율 칸은 `-`가 아닌 Blank로 출력됩니다.
8. 별첨1 Excel 시급 셀은 숫자값을 유지하고 `#,##0.00원` 표시 형식을 적용합니다.
9. 별첨1 PDF 시급은 `15,000.00원`처럼 소수점 둘째 자리까지 표시합니다.
10. 수당 계산은 `시급 * 요율 * 근로시간` 결과에 원 단위 올림을 적용합니다.
11. 기본 품의서/별첨1 양식을 `품의서_2026-04_수정본.xlsx`, `별첨1_2026-04_수정본.xlsx`로 갱신했습니다.
12. 품의서 Excel 최상단은 `☑ 품의`, `☐ 보고` 체크박스 표기로 출력합니다.
13. 품의서 Excel의 `당월 지급 대상자` 수는 일반 지급과 퇴사자 조기 지급 대상자를 모두 포함합니다.
14. 품의서 Excel 최상단 로고는 배경 제거 로고로 교체하고 `A1:C1` 범위에 맞춰 배치합니다.
15. 품의서 Excel 작성자/전화번호, `총 합계`, 총합계 금액 폰트색은 검정색으로 출력합니다.
16. 품의서 Excel 총합계 행 `B30:H30` 테두리는 두 번째 굵기인 `medium`으로 출력합니다.
17. 품의서 Excel 퇴사자 조기 지급 내역 표는 조기 지급 사이트 요약 수에 따라 행을 동적으로 삽입/삭제합니다.
18. 품의서 Excel은 일반 지급, 퇴사자 조기 지급, 총 합계, 지급 요청일/세부내역 구조를 유지합니다.
19. 별첨1 Excel은 `별첨1` 시트만 생성하고, 퇴사자 조기 지급 대상이 없어도 `해당 없음` 행과 새 샘플 기준 정적 계산 안내를 출력합니다.
20. 별첨1 Excel의 조기 지급 `해당 없음` 행은 근무시간/수당/요율/시급/지급비용 영역 `H:S`를 Blank로 유지합니다.
21. 별첨1 하단 계산식 영역은 샘플 `별첨1` 시트의 `24:45`행 문구, 병합, 테두리, 배경색, 폰트색, 굵기, 크기, 행높이를 그대로 복제합니다.

## 검증
- `npm run typecheck`
- `npx vitest run src/main/services/allowance-document-export-service.test.ts --maxWorkers=1 --minWorkers=1`
- `npx vitest run src/main/services/operations-storage-service.test.ts src/main/services/document-template-source-path-service.test.ts --maxWorkers=1 --minWorkers=1`
- `npm run test`
- `npm run build`
- `npm run release:check`

## 남은 확인
- `artifacts/releases/v0.4.14/QA_CHECKLIST.md` 기준 수동 QA 실행
- 패키징 진행 시 `npm run release:publish` 실행
- GitHub Release `v0.4.14` Published 상태와 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json` asset 확인
- 릴리즈 PC sign-off 또는 수동 QA 결과를 `artifacts/releases/v0.4.14/logs/`에 기록
