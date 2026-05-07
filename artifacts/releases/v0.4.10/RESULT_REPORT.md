# v0.4.10 결과 보고

## 구현 결과
- 승인대기 실적 조회 시 선택 월 기준으로 스캔 범위를 좁혔다.
- 변경 없는 파일은 DB 캐시를 재사용해 반복 조회 비용을 줄였다.
- 전체 기간 조회에서 새 파일이 과도하게 많으면 한 번에 처리하는 파싱 수를 제한하고 사용자에게 안내한다.
- 실적 Excel 파싱 진행률을 내부모달로 표시한다.
- 파싱 규격이 맞지 않는 Excel은 별도 내부모달로 문제 파일과 사유를 안내한다.
- 기존 설치본의 복구키 발급을 위한 `.cmd/.mjs` 유지보수 스크립트를 설치본에 포함한다.

## 검증 결과
- `npm run typecheck`: 통과
- `npm run test -- src/main/services/performance-file-intake-service.test.ts src/main/services/performance-management-service.test.ts src/main/services/performance-queue-service.test.ts`: 통과, 19건

## 배포 기준
- 버전: `0.4.10`
- 설치본: `release/ShiftMgmt-Setup-0.4.10-x64.exe`
- 업데이트 메타데이터: `release/latest.yml`
- 앱 패치노트 메타데이터: `artifacts/releases/v0.4.10/RELEASE_MANIFEST.json`
