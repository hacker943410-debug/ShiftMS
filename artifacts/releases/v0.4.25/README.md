# v0.4.25

## Summary
실적관리 계산과 표시 안정화 패치. 근무지 상세의 Cycle 근무시간은 실제 슬롯 기준으로 1근부터 표시하고, 실적관리 새로고침은 저장된 근무시간 기준으로 반환 파일을 다시 계산한다. 근무표의 `None` 입력은 실적 제외 대상으로 처리하며, 구형 품의서 템플릿 등록 차단과 실적관리 화면 정리도 포함한다.

## Scope
- 근무지 관리 상세 보기 Cycle 근무시간 표시 순서 보정.
- 실적관리 수동 새로고침 시 변경 없는 반환 파일도 강제 재파싱.
- 반환 근무표에서 `None` 입력 시 법정휴일, 대체, 연장 실적 생성 제외.
- 실적관리 필터 순서 변경: 연도, 월, 근무지명, 조회구분, 근로유형.
- 실적관리 테이블 밀도 조정 및 좁은 화면 fallback 유지.
- 양식 등록 단계에서 구형 품의서 템플릿 저장 차단.

## Verification
- `npm run test` 통과: 130 files / 630 tests.
- `npm run build` 통과.
- `git diff --check` 통과: CRLF 변환 경고만 확인.

## Release
- Package version: 0.4.25.
- Packaging target: GitHub Release `v0.4.25` Published.
- Required assets: installer, blockmap, `latest.yml`, `RELEASE_MANIFEST.json`.
