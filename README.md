# ShiftMgmt_V3.4

교대근무 인력 운영, 근무표 배포, 실적 승인, 수당 계산을 하나의 로컬 데스크톱 앱에서 처리하기 위한 초기 프로젝트 셸입니다.

## 현재 구성

- Electron main/preload/renderer 기본 구조
- React 기반 대시보드 시작 화면
- Codex/Antigravity 작업 지침과 프로젝트 컨텍스트
- 공용 포맷터와 Vitest 기반 기본 테스트
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

## 폴더 요약

- `src/main`: Electron main process
- `src/preload`: renderer bridge
- `src/renderer`: React UI
- `src/shared`: 공용 로직
- `.context`: 설계 메모
- `.codex`, `.agents`, `.antigravity`: 에이전트 설정

## 다음 권장 작업

1. SQLite 저장소와 도메인 모델 정의
2. 근무 패턴 시뮬레이터 구현
3. 승인대기/승인완료 폴더 감시 서비스 추가
4. Excel 입출력 템플릿 서비스 추가
