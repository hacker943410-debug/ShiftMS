# ShiftMgmt v0.4.18

## 상태
- 현재 작업 브랜치: `release/0.4.18`
- 대상 버전: `0.4.18`
- 현재 단계: 품의승인 Excel 자동 출력 복구, 자동 검증, 패키징, GitHub Release 공개 게시 완료. 수동 QA sign-off 전
- 기준 산출물:
  - `artifacts/releases/v0.4.18/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.18/RELEASE_MANIFEST.json`
  - `artifacts/releases/v0.4.18/QA_CHECKLIST.md`

## 요약
0.4.18은 최종 품의승인 이후 Excel 문서가 생성되지 않던 흐름을 복구하는 패치입니다. 백엔드 Excel 생성 서비스는 정상 동작했지만, renderer의 최종 품의승인 액션이 PDF 출력 형식을 고정해 보내고 있었습니다. 이번 버전에서 최종 품의승인 요청을 Excel 출력으로 변경했습니다.

## 변경 사항
- 최종 품의승인 요청의 출력 형식을 `xlsx`로 변경했습니다.
- 품의승인 완료 안내 문구를 Excel 문서 출력 기준으로 변경했습니다.
- 품의 승인 미리보기 제목에서 PDF 한정 표현을 제거했습니다.
- 품의승인 Excel 처리, 별도 PDF 출력, 별도 Excel 출력 경로를 타깃 테스트로 확인했습니다.

## 검증
- `npx vitest run src/main/services/allowance-document-export-service.test.ts src/main/services/allowance-proposal-approval-service.test.ts src/renderer/screens/allowance-management/allowance-management-review-actions.test.ts src/renderer/screens/allowance-management/allowance-management-modal-actions.test.ts --maxWorkers=1 --minWorkers=1`: `4 files / 21 tests` 통과
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `node scripts/validate-structure.mjs`
- `npm run release:check`
- `npm run release:publish`
- `npm run smoke:electron:packaged`
- `npm run smoke:electron:installer`
- GitHub Release `v0.4.18`: Published 상태, 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json` 포함 확인

## 남은 확인
- 설치본에서 실제 운영 양식 기준 최종 품의승인 Excel 3종 생성 확인
