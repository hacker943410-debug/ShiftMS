# 별첨1 Blank/요건 검증

- 판정: PASS

## 기억한 요건

- 별첨1 시트만 생성
- 2026-04 샘플 기준
- 조기 지급 대상 없어도 해당 없음
- 해당 없음 행의 숫자 영역 H:S Blank
- 선택값 없는 숫자 칸 Blank
- 시급 숫자값 #,##0.00원
- 시급 x 요율 x 시간 결과 원 단위 올림

## 대상 없음 케이스

- 생성 별첨1: C:\Projects\Active\ShiftMgmt_V3.4\artifacts\releases\v0.4.14\logs\attachment1-blank-empty-verification-20260521-074700\no-early-payout\generated\attachment1\2026년\03월\2026_03_별첨1.xlsx
- 단일 시트: PASS
- 조기 지급 블록/해당 없음: PASS (해당 없음)
- 해당 없음 행 H:S Blank: PASS
- 수당 계산식 검증: PASS

## 조기 지급 있음 케이스

- 생성 별첨1: C:\Projects\Active\ShiftMgmt_V3.4\artifacts\releases\v0.4.14\logs\attachment1-blank-empty-verification-20260521-074700\with-early-payout\generated\attachment1\2026년\03월\2026_03_별첨1.xlsx
- 단일 시트: PASS
- 조기 지급 상세 출력: PASS (가람)
- 시급 숫자/표시 형식: PASS (12900, #,##0.00원)
- 정적 안내/적용 요율 제거: PASS
- 수당 계산식 검증: PASS

## 비교 메모

- 샘플 파일은 검증/인력현황/계산식 시트를 포함하지만 최종 생성 파일은 요청대로 별첨1 시트만 남김.
- 일반 지급/조기 지급 상세 행 수에 따라 섹션 위치는 이동하며, 행/열 스타일은 샘플 행에서 캡처해 적용함.