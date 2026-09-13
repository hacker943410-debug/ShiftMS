# AGENTS.md

## 프로젝트 개요
- 이름: ShiftMgmt_V3.4
- 설명: 교대근무 현황, 근무표 배포, 실적 승인, 수당 계산을 통합 관리하는 로컬 데스크톱 웹 앱
- 기술 스택: Electron + React + TypeScript + Vite
- 계획 DB: SQLite
- 패키지 매니저: npm
- 기본 Git 브랜치: `main`
- 현재 작업 브랜치: 작업 시점의 `git branch --show-current` 결과를 기준으로 확인

## 우선 참조 문서
- 코드베이스 지도: `docs/codebase-map.md`
- AI 작업 하네스: `.codex/HARNESS.md`
- 프로젝트 기준서: `docs/project-handbook.md`
- 릴리즈 문서: `docs/release-0.4.5.md`
- 릴리즈 아카이브: `artifacts/releases/README.md`
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
9. 질문/확인/사유 입력 팝업은 renderer의 공통 React 내부 모달인 `src/renderer/components/QuestionDialog.tsx`와 `useQuestionDialog().askQuestion(...)` 패턴을 사용한다.
10. 파일/폴더 선택처럼 OS 네이티브 다이얼로그가 필요한 경우에만 Electron main/preload 브리지의 전용 API를 사용한다.
11. `docs/`에는 최신 운영 기준 문서만 유지하고, 버전별 릴리즈 상세/구현 계획/작업 로그는 `artifacts/releases/vX.Y.Z/` 또는 `artifacts/` 아래에 둔다.
12. 새 패치나 릴리즈를 시작할 때는 `artifacts/releases/vX.Y.Z/` 표준 구조를 먼저 만들고, 종료 전 `README`, `COMPACT_CONTEXT`, `IMPLEMENTATION_ANALYSIS`, `FILE_IMPACT`, `FUNCTIONAL_SPEC`, `RELEASE_MANIFEST.json`, `TODO`, `QA_CHECKLIST`, `RESULT_REPORT`, `logs/`, `screenshots/` 누락 여부를 확인한다.
13. 문서 구조를 바꾼 경우 `docs/README.md`와 `artifacts/releases/README.md`를 함께 갱신해 현재 문서와 아카이브 경계를 명확하게 유지한다.
14. 사용자가 `패키징`, `설치본 생성`, `버전으로 패키징`을 요청하면 기본값은 로컬 설치본 생성에서 끝내지 않고 GitHub Releases 공개 게시까지 완료하는 것이다.
15. 패키징 요청의 표준 종료 조건은 버전/릴리즈 문서/`RELEASE_MANIFEST.json` 정합성 확인, `npm run release:publish` 실행, GitHub Release가 Published 상태이며 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`을 포함하는지 확인하는 것이다.
16. 사용자가 `로컬만`, `Draft만`, `업로드만 하고 게시 금지`처럼 명시한 경우에만 GitHub Release 공개 게시를 생략한다. 단순 `git push`는 사용자 업데이트 배포가 아니며, 설치 PC 자동업데이트는 Published GitHub Release를 기준으로 한다.

## 빌드 및 테스트 명령
- 의존성 설치: `npm install`
- 개발 실행: `npm run dev`
- 타입 점검: `npm run typecheck`
- 테스트: `npm run test`
- 빌드: `npm run build`
- 구조 검증: `node scripts/validate-structure.mjs`
- 로컬 설치본 생성: `npm run release:package`
- GitHub Release 공개 게시: `npm run release:publish`
- 설치본 smoke 포함 검증: `npm run release:verify-package`

## 코딩 컨벤션
- 파일명: kebab-case, 단 React 컴포넌트 파일은 PascalCase 허용
- 함수/변수: camelCase
- 타입/인터페이스: PascalCase, `I` 접두어 금지
- React import: 배럴 파일 대신 직접 경로 import 사용
- 주석: 꼭 필요한 경우만, 영어로 간결하게 작성
  - ⚠️ 이 규칙은 오래 지켜지지 않아 **한국어 주석이 이미 700줄 넘게** 있다(2026-09-04 실측 755줄).
    규칙은 그대로 유지하되 일괄 정리는 하지 않는다 — **새로 쓰거나 실제로 고치는 주석부터** 영어로 바꾼다.
    사용자에게 보이는 화면 문구·라벨은 당연히 한국어다. (2026-09-04 결정, Codex 검수 합의)
- 커밋: `메뉴명.기능`
- 기본 푸시 전략: 다음 푸시부터는 기능별 새 브랜치를 생성한 뒤 원격에 푸시

## AI 작업 하네스
- 단일 지휘자: frontier 등급의 Codex primary가 요구사항 해석, 설계, 작업 분해, 지시, 검증 기준, 결과 취합, 최종 판정을 전담한다.
- 직접 위임: economy/balanced 등급 Codex subagent는 탐색, 사실 추출, 제한된 진단, 리뷰, 정해진 검증 실행만 담당한다. 기본은 read-only이며 설계 확정이나 범위 확대를 하지 않는다.
- 코드 작성: 애플리케이션 코드와 테스트 코드의 실제 구현은 Gemini가 담당한다. Codex는 구현 전략과 허용 파일을 `HANDOFF.md`에 작성하는 데서 멈추며, 사용자가 Gemini에 직접 지시하고 결과를 다시 중계한다.
- 구현 금지: Codex subagent는 추적 파일을 수정하지 않는다. Codex primary는 하네스·지시·검증·통합 문서는 직접 관리하지만, Gemini에 넘긴 구현 파일을 동시에 수정하지 않는다.
- 최종 책임: subagent나 Gemini의 결론을 그대로 채택하지 않는다. Codex primary가 diff, 불변식, 테스트 증거를 독립 확인한 뒤 ACCEPT/REJECT를 결정한다.
- 병렬 한도: 독립적인 read-only 작업만 최대 3개 병렬화한다. 같은 파일, 같은 원인, 선후 의존 작업은 순차 실행한다.
- 상세 절차와 프롬프트 계약은 `.codex/HARNESS.md`를 따른다.

## Gemini 핸드오프 규칙
- 활성 작업 지시는 루트 `HANDOFF.md` 하나만 사용한다.
- Codex는 Gemini CLI를 실행하거나 Gemini 세션에 직접 명령하지 않는다. Gemini 실행과 지시 전달은 사용자만 담당한다.
- Gemini는 `status=READY`, `recipient=Gemini`, 기준 브랜치/커밋 일치, 명시적 `allowedPaths`가 모두 확인될 때만 구현한다.
- Codex는 목표, 확정 전략, 파일별 변경 순서, 비목표, 불변식, 실패 모드, 검증 명령, 중지 조건, 응답 형식을 빠짐없이 작성한다.
- Gemini는 허용 목록 밖 변경, 새 의존성, 마이그레이션, 커밋, 푸시, 패키징, 게시를 하지 않는다. 필요하면 수정하지 않고 BLOCKED로 답한다.
- 요청과 답신은 덮어쓰기 전에 `handoff-log/`에 보존한다. 파일명과 라운드 규칙은 `.codex/HARNESS.md`를 따른다.
- Claude는 현 작업 흐름에서 폐기됐다. `CLAUDE.md`와 `.claude/`는 이전 하네스 기록일 뿐 현재 권한이나 지시 출처가 아니다.

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
- 질문형 UI에 `window.confirm`, `window.prompt`, `window.alert`, `dialog.showMessageBox` 직접 사용 금지

## 참조 문서
- 설계 원문: `shftMgmgt설계_V3.4.md`
- 아키텍처: `.context/architecture.md`
- 컨벤션: `.context/conventions.md`
- 스택: `.context/stack.md`
