# AGENTS.md

## 프로젝트 개요
- 이름: ShiftMgmt_V3.4
- 설명: 교대근무 현황, 근무표 배포, 실적 승인, 수당 계산을 통합 관리하는 로컬 데스크톱 웹 앱
- 기술 스택: Electron + React + TypeScript + Vite
- 계획 DB: SQLite
- 패키지 매니저: npm
- 기본 Git 브랜치: `master`
- 현재 작업 브랜치: 작업 시점의 `git branch --show-current` 결과를 기준으로 확인

## 우선 참조 문서
- 프로젝트 기준서: `docs/project-handbook.md`
- 릴리즈 문서: `docs/release-0.1.0.md`
- 운영 참고서: `docs/operations-reference.md`
- 수동 QA 체크리스트: `docs/operations-manual-qa-checklist.md`
- 운영자 가이드: `docs/operator-quick-start.md`
- 문서 안내: `docs/README.md`

## 작업 원칙
1. 3개 이상 파일을 동시에 수정할 때는 먼저 변경 범위를 정리한다.
2. UI 코드는 한국어 라벨을 사용하고, 코드 주석은 영어로 유지한다.
3. Excel 연동, 파일 감시, 수당 계산은 UI 레이어와 분리된 도메인 모듈로 설계한다.
4. 로컬 데스크톱 앱 특성상 파일 시스템 접근은 Electron main/preload를 통해서만 노출한다.
5. 새 의존성 추가나 네이티브 모듈 도입 전에는 빌드 리스크를 점검한다.
6. 계산 규칙 변경 시 코드보다 먼저 문서와 테스트 기준을 맞춘다.
7. 승인 후 결과는 재현 가능해야 하며 조용한 덮어쓰기를 금지한다.
8. 디자인 결정은 `docs/project-handbook.md`를 기준으로 일관성을 유지한다.

## 빌드 및 테스트 명령
- 의존성 설치: `npm install`
- 개발 실행: `npm run dev`
- 타입 점검: `npm run typecheck`
- 테스트: `npm run test`
- 빌드: `npm run build`
- 구조 검증: `node scripts/validate-structure.mjs`

## 코딩 컨벤션
- 파일명: kebab-case, 단 React 컴포넌트 파일은 PascalCase 허용
- 함수/변수: camelCase
- 타입/인터페이스: PascalCase, `I` 접두어 금지
- React import: 배럴 파일 대신 직접 경로 import 사용
- 주석: 꼭 필요한 경우만, 영어로 간결하게 작성
- 커밋: `메뉴명.기능`
- 기본 푸시 전략: 다음 푸시부터는 기능별 새 브랜치를 생성한 뒤 원격에 푸시

## 멀티에이전트 워크플로우
- 코드 탐색: `explorer`
- 구현: `builder`
- 리뷰: `reviewer`
- 디버깅: `debugger`
- 테스트 작성 및 실행: `tester`

## 프로젝트 구조 힌트
- `src/main`: Electron main process
- `src/preload`: 안전한 브리지 노출
- `src/renderer`: React UI
- `src/shared`: 포맷터, 계산식, 타입 등 공용 로직
- `.context`: 설계 배경과 컨벤션
- `artifacts`: 계획서, 리뷰, 로그, 스크린샷

## 금지 사항
- renderer에서 직접 Node API 사용 금지
- 하드코딩된 시크릿, 메일 계정, 파일 경로 커밋 금지
- 배럴 import 기본 사용 금지
- 확인 없는 파괴적 Git 명령 금지
- 확인 없는 DB 파일 삭제 금지
- UI에 계산 규칙 하드코딩 금지
- 승인된 계산 결과의 무이력 덮어쓰기 금지

## 참조 문서
- 설계 원문: `shftMgmgt설계_V3.4.md`
- 아키텍처: `.context/architecture.md`
- 컨벤션: `.context/conventions.md`
- 스택: `.context/stack.md`
