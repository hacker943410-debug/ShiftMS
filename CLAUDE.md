# CLAUDE.md — ShiftMgmt_V3.4

> 이 파일은 매 세션 자동 로드됩니다. **항상 지켜야 할 핵심**만 담습니다. 상세 사용법은 `.claude/HARNESS.md`, 상세 핸드북은 `AGENTS.md` 참조.

## 프로젝트
교대근무 현황·근무표 배포·실적 승인·수당 계산을 통합 관리하는 **로컬 데스크톱 앱**. Electron + React 19 + TypeScript + Vite, SQLite, npm. **실사용자는 비기술 한국어 운영자(현장 운영자/사장)** 다.

- 기본 브랜치: **`main`** (origin/HEAD). ⚠️ `AGENTS.md`의 `master` 표기는 stale — `main`이 정답.
- 상세 핸드북: `AGENTS.md`, `docs/project-handbook.md`. 자동기억: `~/.claude/projects/C--Projects-Active-ShiftMgmt-V3-4/memory/MEMORY.md`.

## 🧭 하네스 지도 (이 프로젝트 전용 설정 — 사용법은 `.claude/HARNESS.md`)
| 기능 | 위치 | 언제 |
|---|---|---|
| 코드베이스 지도 | 이 파일(루트 CLAUDE.md) | 항상 자동 |
| 경로별 규칙(Rules) | `src/renderer/`·`src/main/`·`src/shared/`·`scripts/` 의 각 `CLAUDE.md` | 그 폴더 파일을 만질 때 자동 |
| 절차(Skills) | `/release-shiftmgmt`, `/design-apply` | 게시 / 시안 적용 시 |
| 격리 검증(Subagents) | `release-verifier`, `ui-mock-comparator`, `holiday-calc-verifier` | 검증을 격리해 돌릴 때 |
| 하드 게이트(Hooks) | `.claude/hooks/guard-dangerous-bash.cjs` | 자동 — 위험 명령 차단 |
| 말투·역할(Output style) | `ShiftMgmt Plain Korean` | 항상(활성) |

## 🔴 절대 규칙 (어기면 사고)
1. **게시는 되돌릴 수 없다.** `release:publish` / `--publish always` 는 전 사용자 자동업데이트를 즉시 트리거한다. **사용자가 그 턴에 명시 승인했을 때만** 실행하고, hook이 `RELEASE_CONFIRM=1` 토큰을 요구한다. **컨펌 없이 토큰을 붙이지 말 것.** ([[no-autopublish-until-requested]])
2. **재게시 전 버전 충돌 확인.** 이미 게시된 GitHub 최신 태그와 `package.json` 버전이 같으면 자동업데이트가 안 된다 → 반드시 bump. (0.5.0→0.5.1 사건의 원인)
3. **가짜 UI 금지.** 데이터·동작 없는 장식 요소 신설 금지: 전화/메시지 버튼, 관리자메모 남색 카드, 증명사진, 가짜 건수, 통합검색바, 눈/삭제 아이콘 등.
4. **남색 금지**(사이드바·shell 흰색 유지). 예외는 승인된 그라데이션 `linear-gradient(135deg,#3e56b6,#34459b)` 뿐.
5. **아이콘은 Material Symbols 글리프**(`<span className="material-symbols-outlined">…</span>`). 손그림 SVG 신설 금지.
6. **계산·승인·데이터 로직 보존.** 디자인/표면 작업은 표시층(CSS·아이콘)만 손댄다. 계산 규칙 변경은 문서·테스트를 먼저 맞춘다(AGENTS.md §6, §27).
7. **버전 bump은 실제 릴리즈 때만.** 평소 작업은 버전 그대로 둔다.
8. **사용자에겐 쉬운 한국어로** 설명한다(파일명·함수명·영어용어 빼고, 화면은 한국어 라벨로). 단 코드 주석·식별자·커밋 메시지는 영어(레포 컨벤션).
9. **forward-only.** 승인된 계산 결과의 무이력 덮어쓰기 금지, 확인 없는 파괴적 Git/DB 명령 금지(hook이 일부 강제).

## 자주 쓰는 명령
- 점검: `npm run typecheck` · `npm run lint`(0 errors) · `npm run test`(721개, ~10분, 단일 워커)
- 빌드: `npm run build` / 로컬 설치본 `npm run package:win`(안전, --publish never)
- 게이트: `npm run release:check`
- 게시(위험): 단독 명령으로 직접 돌리지 말고 **`/release-shiftmgmt` 스킬 절차**를 따른다.

## 핵심 위치
- UI: `src/renderer/` (단일 `styles.css` ~19k줄, 화면 `screens/`, 모달 `components/`)
- 도메인 계산: `src/shared/domain/` (allowance·calculation·schedule·holiday)
- main/IPC: `src/main/`, preload `src/preload/`, 계약 `src/shared/bridge/contracts.ts`
- 릴리즈: 스크립트 `scripts/`, 매니페스트 `artifacts/releases/vX.Y.Z/RELEASE_MANIFEST.json`, 문서 `docs/release-X.Y.Z.md`
