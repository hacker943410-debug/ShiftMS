# ShiftMgmt_V3.4

교대근무 인력 운영, 근무표 배포, 실적 승인, 수당 계산, 운영 설정을 하나의 로컬 데스크톱 앱에서 처리하기 위한 Electron 기반 앱입니다.

## 현재 구성

- Electron main/preload/renderer 기본 구조
- 인력, 근무지, 근무표, 실적, 수당, 운영 관리 화면의 실제 bridge 연동
- 근무지 상세 보기/삭제, 패턴 및 설정정보 불러오기, 1단계 시뮬레이션 UI 보정까지 반영한 근무지 관리 흐름
- 대시보드 집계 화면과 차트 내보내기 흐름
- SQLite 기반 로컬 저장, 파일 감시 런타임, Excel 출력 이력
- Codex/Antigravity 작업 지침과 프로젝트 컨텍스트
- 공용 도메인 계산 로직과 Vitest 기반 서비스/도메인 테스트
- 구조 검증 스크립트

## 실행 전제

- Node.js `24.x`
- npm `11.x`

## 시작 방법

```bash
npm install
npm run dev
```

## 주요 명령

```bash
npm run typecheck
npm run test
npm run build
node scripts/validate-structure.mjs
```

## 현재 검증 상태

- `npm run typecheck`: 통과
- `npm run build`: 통과
- `node scripts/validate-structure.mjs`: 통과
- `npm run test`: 테스트 본문은 실행되지만 종료 시 `ERR_IPC_CHANNEL_CLOSED` 로 실패

## 폴더 요약

- `src/main`: Electron main process
- `src/preload`: renderer bridge
- `src/renderer`: React UI
- `src/shared`: 공용 로직
- `.context`: 설계 메모
- `.codex`, `.agents`, `.antigravity`: 에이전트 설정

## 다음 권장 작업

1. 근무표 배포 양식 정의를 확정하고 실제 배포 화면 흐름과 맞춘다.
2. 운영 관리의 공휴일, 요율, 사용자, 양식 탭에 저장/수정/동기화 액션을 추가한다.
3. 대시보드 집계를 실데이터 전용으로 정리하고 demo fallback 의존을 줄인다.
4. `npm run test` 종료 시 발생하는 `ERR_IPC_CHANNEL_CLOSED` 를 해결하고 Phase 3-6 검증 게이트를 정리한다.
