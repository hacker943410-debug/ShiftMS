# v0.5.8 QA 체크리스트

## 자동 검증

- [x] `npm run typecheck`
- [x] `npm run lint` (오류 0개, 기존 경고 25개)
- [x] `npm run test` (178개 파일, 1,267개 테스트)
- [x] `npm run build`
- [x] `npm run validate:map` (161개 경로)
- [x] `npm run validate:harness`
- [x] `git diff --check`
- [x] `npm run release:check`

## 핵심 회귀

- [x] 재분석 전 승인 차단 및 성공 후 승인
- [x] 반복 읽기/저장 실패에도 마커 유지
- [x] 같은 시작일 삭제의 정확한 대체 시급 확인
- [x] 삭제 감사 이력 실패 시 전체 롤백
- [x] 월별 직원 DTO의 연락처·시급·삭제 시각 미노출
- [x] 승인/품의 잠금 안내 우선순위 보존

## 게시·설치

- [ ] GitHub Release `v0.5.8` Published
- [ ] 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json` 존재
- [x] packaged smoke
- [x] installer smoke 및 기존 데이터 보존
