# Compact Context

## Objective
실적관리 검수 효율과 재승인 안정성을 개선하고, 불필요한 로그인 계정 잠금을 제거한다.

## Key Decisions
- 실적 행은 `teamLabel`을 저장해 조별 묶음과 재조회 정렬을 지원한다.
- 반려 상태 승인대기 파일은 캐시 재사용보다 현재 Excel 재파싱을 우선한다.
- 변경표의 `원근무자 -> None`은 해당 원근무자의 법정휴일 실적 취소로 해석한다.
- 비밀번호 실패 횟수는 감사 목적 기록으로만 유지하고 계정 잠금은 사용하지 않는다.

## Verification Snapshot
- `npm run test`: 130 files / 635 tests passed.
- `npm run build`: passed.
