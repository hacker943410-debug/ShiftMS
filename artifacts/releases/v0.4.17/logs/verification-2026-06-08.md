# v0.4.17 Verification Log

## 자동 검증
- `npm run typecheck`: 통과
- `npm run test`: `127 files / 554 tests` 통과
- 업데이트 알림/패치노트/수당/품의/Excel 타깃 테스트: `9 files / 37 tests` 통과
- 수당 1회 올림 및 요율 영향 타깃 테스트: `2 files / 10 tests` 통과
- 승인완료 파일 재대기 관련 테스트: `1 file / 7 tests` 통과
- 승인/품의/Excel 출력 타깃 테스트: `4 files / 16 tests` 통과
- 승인 범위 타깃 테스트: `13 files / 59 tests` 통과
- `npm run build`: 통과
- `node scripts/validate-structure.mjs`: 통과
- `npm run release:check`: 통과
- `git diff --check`: 통과

## 추가 확인
- 시작 업데이트 확인은 사용자 알림 기준으로 실행하며, 다운로드는 사용자 버튼 클릭 전까지 시작하지 않는 테스트가 통과했다.
- 패치노트 매니페스트는 기능 중심 표 섹션을 포함하며 파싱 테스트가 통과했다.
- 동일 시급/동일 총 시간 수당은 원시 금액 합산 후 1회 올림으로 동일 총액이 되는 테스트가 통과했다.
- 승인 완료 파일 재대기 후 부분 승인 상태 재조회 시나리오 테스트가 통과했다.
- 품의 승인 후 품의서, 별첨1, 별첨2 Excel 출력 테스트가 통과했다.
- 요율 영향 미리보기 0원화 경고 단위 테스트: 통과
- 문서 출력 병합 셀 회귀 테스트: 승인 범위 타깃 테스트에 포함해 통과

## 미완료
- Electron 수동 QA: 미진행
- 패키징 및 GitHub Release 게시: 미진행
