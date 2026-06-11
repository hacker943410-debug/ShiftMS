# ShiftMgmt v0.4.19

## 상태
- 현재 작업 브랜치: `release/0.4.19`
- 대상 버전: `0.4.19`
- 현재 단계: 근무지 패턴 시간 저장 안정화, Excel 병합 오류 진단 강화, 패키징 진행 중
- 기준 산출물:
  - `artifacts/releases/v0.4.19/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.19/RELEASE_MANIFEST.json`
  - `artifacts/releases/v0.4.19/QA_CHECKLIST.md`

## 요약
0.4.19는 근무지 수정 시 교대 시간이 뒤바뀌는 문제를 막고, 품의서 Excel 출력 실패 원인을 기능과 셀 범위 기준으로 확인할 수 있게 하는 패치입니다. 보라매DC처럼 저장된 패턴 순서가 `A,C,B`인 근무지도 수정 화면과 저장 결과에서 1근, 2근, 3근 시간이 안정적으로 유지됩니다.

## 변경 사항
- 근무지 수정 draft를 `A/B/C`, `D/N` canonical 슬롯 기준으로 생성합니다.
- 슬롯별 휴게시간을 저장 payload와 시뮬레이션 지표에 반영합니다.
- 품의서 고객사 요약 병합 전 기존 병합을 넓은 범위로 정리합니다.
- Excel 병합 실패 메시지에 문서, 기능, 처리 구간, 시도 범위, 기존 병합 범위를 포함합니다.

## 검증
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `node scripts/validate-structure.mjs`
- `npm run release:check`
- `npm run release:publish`
- `npm run smoke:electron:packaged`
- `npm run smoke:electron:installer`

## 남은 확인
- 설치본에서 보라매DC 수정 저장 후 시간 유지 확인
- 실제 운영 품의서 양식 기준 Excel 출력 확인
