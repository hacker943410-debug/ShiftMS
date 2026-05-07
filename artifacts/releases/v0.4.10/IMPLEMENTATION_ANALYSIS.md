# v0.4.10 구현 분석

## 실적 파싱 병목
- 기존 `syncPendingPerformanceFilesToStorage`는 승인대기 루트 하위 전체를 재귀 스캔했다.
- `listPerformanceOverview` 호출 시 필터 조회와 폴더 동기화가 같이 실행되어 사용자는 조회 중 멈춤으로 인식할 수 있었다.
- 파일명과 경로에 이미 `YYYY_M` 또는 `YYYY년/M월` 정보가 있으므로 선택 월 기준으로 스캔 범위를 줄일 수 있다.

## 적용 방식
- `scheduleMonth`가 있으면 `pendingDir/YYYY년/M월` 폴더와 루트의 동일 월 파일만 후보로 잡는다.
- 동일 파일은 `fileSize`, `modifiedTimeMs`가 같으면 재파싱하지 않는다.
- 전체 기간 조회는 새 파일 파싱 수를 제한하고 안내 이슈를 반환한다.
- 진행률은 IPC 이벤트 대신 `main` 메모리 상태와 bridge polling으로 구현했다.

## 계정복구 유지보수
- 복구키 발급 스크립트는 Node.js가 없으면 설치된 `ShiftMgmt.exe`를 `ELECTRON_RUN_AS_NODE=1`로 사용한다.
- 기본 DB 후보에 `%APPDATA%\shiftmgmt-v3-4\data\shiftmgmt.sqlite`를 추가했다.
