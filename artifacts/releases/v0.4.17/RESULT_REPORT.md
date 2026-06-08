# v0.4.17 Result Report

## 상태
- 승인 범위 패치 적용 완료
- 전체 자동 테스트 통과
- 패키징 및 GitHub Release 공개 게시 완료

## 기준선
- Git 소스 기준: `v0.4.14`
- 마지막 배포 기준: GitHub Release `v0.4.16`
- 작업 브랜치: `release/0.4.17`
- 적용 승인 번호: `1, 2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19`
- 제외 번호: `4, 7, 8`

## 결과
- 프로그램 시작 시 업데이트가 있으면 다운로드 전에 업데이트 모달과 패치노트를 먼저 표시한다.
- 업데이트 다운로드는 사용자가 `다운로드` 버튼을 누른 뒤에만 시작된다.
- 패치노트는 기능, 사용자 영향, 검증 기준을 표로 확인할 수 있도록 개선했다.
- 수당 금액은 기본/연장/야간 항목별 올림 합산이 아니라 원시 금액 합산 후 최종 1회 올림으로 계산한다.
- 요율 영향 미리보기도 실제 수당 계산과 같은 1회 올림 기준을 사용한다.
- 승인 완료 파일을 승인 대기 폴더로 되돌려 재조회하는 부분 승인 시나리오를 검증했다.
- 품의 승인 후 품의서, 별첨1, 별첨2 Excel 출력 흐름을 검증했다.
- 문서 출력 병합 셀 정리 로직을 품의서/별첨 출력과 양식 스타일 적용 양쪽에 재반영했다.
- 화면 오류가 앱 전체 white-screen으로 확산되지 않도록 공통 `ErrorBoundary`를 추가했다.
- 월 근무표 저장은 직원 사번 검증 후 트랜잭션으로 처리하도록 변경했다.
- DB 시작 시 최신 migration backup만 남은 상황을 자동 복구한다.
- 요율 매트릭스는 빈 값과 비정상 숫자를 저장하지 않고, 저장 전 영향 미리보기를 제공한다.
- 후보 요율이 기존 지급 대상 수당 라인을 0원화하면 별도 경고로 표시한다.
- 근무표 규칙 경고, 운영 설정 기준 저장, 근무지 패턴/인력관리 집계 회귀를 반영했다.

## 검증
- `npm run typecheck`: 통과
- 수당 1회 올림 및 요율 영향 타깃 테스트: `2 files / 10 tests` 통과
- 승인 재조회 시나리오 타깃 테스트: `1 file / 7 tests` 통과
- 승인/품의/Excel 출력 타깃 테스트: `4 files / 16 tests` 통과
- 업데이트 알림 및 패치노트 타깃 테스트: 통과
- 승인 범위 타깃 테스트: `13 files / 59 tests` 통과
- 문서 출력 병합 셀 회귀 테스트: 포함 통과
- `npm run build`: 통과
- `node scripts/validate-structure.mjs`: 통과
- `npm run release:check`: 통과
- `npm run test`: `127 files / 554 tests` 통과
- `npm run release:publish`: 통과
- GitHub Release `v0.4.17`: Published 상태, 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json` 포함 확인
- `npm run smoke:electron:packaged`: 통과
- `npm run smoke:electron:installer`: 통과

## 미진행
- 수동 Electron UI QA
