# v0.4.3 QA 체크리스트

## 설치본 확인
- `release/ShiftMgmt-Setup-0.4.3-x64.exe`
- `release/ShiftMgmt-Setup-0.4.3-x64.exe.blockmap`
- `release/win-unpacked/ShiftMgmt.exe`

## 직접 테스트 포인트
- 근무지 등록 및 수정 1단계에서 조별 Index 카드가 입력 블록을 침범하지 않는지 확인
- Access DB 복원 후 시급 미복원 실적이 `시급미반영항목`으로 보이는지 확인
- Pool 대체근무가 수당 이력에 포함되지 않는지 확인
