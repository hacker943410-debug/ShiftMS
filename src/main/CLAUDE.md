# src/main — Electron main / IPC / 데이터 무결성 (main 작업 시 자동 로드)

Electron main process + preload 브리지. (전역 규칙은 루트 `CLAUDE.md`)

## 경계
- 파일시스템·DB·OS 다이얼로그 등 모든 네이티브 접근은 **main/preload를 통해서만** 노출. renderer 직접 접근 금지.
- IPC 계약은 `src/shared/bridge/contracts.ts` 에 정의. 채널 추가 시 계약·preload·main 핸들러를 함께 맞춘다.
- 하드코딩된 시크릿·메일 계정·절대 경로 커밋 금지.

## 데이터 무결성 (forward-only)
- **승인 + 계산은 단일 트랜잭션.** 부분 적용/조용한 덮어쓰기 금지. 승인 결과는 재현 가능해야 한다.
- 승인된 계산 결과의 **무이력 덮어쓰기 금지** (변경 이력 남긴다).
- **실적·수당 데이터는 직접 insert 금지** — 반드시 Excel 인테이크 큐(pending 디렉터리 → `approvePendingFile`)로 유입. 시드도 이 경로로만(테스트 헬퍼 recipe 필요).
- DB 파일 삭제·리셋은 **확인 없이 금지**(hook이 일부 파괴 명령을 차단).

## 라이브 데이터
실 sqlite 위치·읽기전용 조회법·실데이터(`C:\연장근무실적`)는 자동기억 [[shiftmgmt-live-db-location]] 참조. 라이브 DB는 읽기전용으로만 건드린다.

## 계산 변경 시
도메인 로직은 `src/shared/domain/`에 있다. 휴일/대체/수당 계산을 바꾸면 **`holiday-calc-verifier`** 서브에이전트로 적대 검증하고, 문서·테스트를 먼저 맞춘다.
