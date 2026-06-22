# ShiftMgmt_V3.4 — Claude 하네스 사용설명서

이 프로젝트에 구성된 6가지 Claude Code 커스터마이즈 메커니즘의 **무엇/어디/언제/어떻게**. 루트 `CLAUDE.md`의 "하네스 지도"가 이 문서를 가리킨다. 새 세션의 Claude가 까먹지 않도록 여기에 사용법을 모은다.

> 메커니즘별 한 줄: **CLAUDE.md**=지도(항상 로드) · **Rules**=경로별 규칙(그 폴더 만질 때) · **Skills**=절차 · **Subagents**=격리 검증 · **Hooks**=코드 강제 금지 · **Output style**=말투/역할.

---

## 1) CLAUDE.md — 코드베이스 지도 (항상 로드)
- **위치:** 루트 `CLAUDE.md`. 매 세션 자동 로드되는 유일한 "항상 켜진" 지침.
- **용도:** 절대 규칙·하네스 지도·핵심 명령·핵심 위치. **항상 로드되므로 짧게 유지**(상세는 이 문서나 스킬로 위임).
- **확장:** 새 절대 규칙이 생기면 여기 "🔴 절대 규칙"에 한 줄 추가. 길어지는 상세는 `.claude/HARNESS.md`/스킬로 내린다.

## 2) Rules — 경로별 규칙 (그 폴더를 만질 때만 로드)
Claude Code의 경로 스코프 메커니즘 = **중첩 CLAUDE.md**. 해당 폴더의 파일을 읽거나 고칠 때 자동으로 함께 로드된다.
- `src/renderer/CLAUDE.md` — UI/디자인 규칙(단일 styles.css·토큰·가짜UI 금지·남색 금지·Material Symbols·QuestionDialog·시각 검증).
- `src/main/CLAUDE.md` — main 프로세스/IPC/데이터 무결성(FS는 브리지로만·승인+계산 단일 트랜잭션·무이력 덮어쓰기 금지·실적은 Excel 인테이크 큐로만 유입).
- `src/shared/CLAUDE.md` — 도메인 계산 규칙(계산 변경은 문서·테스트 먼저·휴일 크레딧 함정·요율 backdating).
- `scripts/CLAUDE.md` — 릴리즈/빌드 스크립트 규칙(게시 흐름·매니페스트 한도·버전 동기화).
- **확장:** 특정 폴더에서만 적용할 규칙이 생기면 그 폴더에 `CLAUDE.md`를 추가하면 끝.

## 3) Skills — 절차 (호출형)
재현 가능한 다단계 작업. `/이름` 또는 Skill 도구로 호출.
- **`/release-shiftmgmt`** — 정식 릴리즈 게시 절차(버전 충돌 프리플라이트 → 게이트 → 태그/푸시 → `release:publish` → 게시 검증). 사용자가 "패키징/게시/배포"를 요청하면 이 절차를 따른다.
- **`/design-apply`** — 시안(mockup) ↔ 실제 화면 비주얼 일치 루프(시안+소스 읽기 → 시각 차이만 → 기능 유지·가짜 금지 → typecheck/lint/build/캡처/test → 커밋 → 컨펌 → 다음).
- **위치:** `.claude/skills/<name>/SKILL.md`. **확장:** 새 반복 절차가 생기면 폴더+SKILL.md 추가.

## 4) Subagents — 격리 검증 (결과만 반환)
독립 컨텍스트에서 검증/탐색을 돌리고 판정만 돌려받는다. Agent 도구의 `subagent_type` 또는 워크플로에서 사용.
- **`release-verifier`** — 매니페스트 한도·버전 정합성·`release:check`·게시 후 `latest.yml`/draft=false 검증.
- **`ui-mock-comparator`** — 렌더 스크린샷 ↔ 시안 시각 차이만 추출, 가짜 요소 신설 플래그.
- **`holiday-calc-verifier`** — 휴일/대체 크레딧·수당 계산 변경을 알려진 함정 대비 적대 검증.
- **위치:** `.claude/agents/<name>.md`. **확장:** 격리가 필요한 반복 검증이 생기면 추가.
- ※ 참고: `.codex/agents/*.toml` 은 OpenAI Codex CLI용(별개 도구). Claude는 위 `.claude/agents/`만 쓴다.

## 5) Hooks — 코드 강제 금지 (자동)
"지시로 부탁"하는 게 아니라 **코드로 차단**한다.
- **위치:** `.claude/hooks/guard-dangerous-bash.cjs` + 등록 `.claude/settings.json`(PreToolUse, matcher `Bash|PowerShell`).
- **무엇을 막나:** `release:publish`, `electron-builder --publish always`, `git push --force(-with-lease)`, `git push main/master`.
- **통과 방법:** 사용자가 그 턴에 명시 승인했을 때만 같은 명령 앞에 **`RELEASE_CONFIRM=1`**(PowerShell은 `$env:RELEASE_CONFIRM='1';`) 토큰을 붙인다. **컨펌 없이 토큰 금지.**
- **자가검증:** `echo GUARD_SELFTEST` 를 실행해 차단되면 활성. (해롭지 않음)
- **확장:** 새 위험 패턴은 `RULES` 배열에 정규식 한 줄 추가.

## 6) Output style — 말투·역할 (항상)
- **위치:** `.claude/output-styles/shiftmgmt-plain-korean.md`. 활성화: `.claude/settings.local.json` 의 `"outputStyle"`(또는 `/output-style` 메뉴에서 "ShiftMgmt Plain Korean" 선택).
- **용도:** 엔지니어링 역량은 그대로 유지하되, **사용자 대면 설명을 비전문가용 쉬운 한국어**로 고정 + 핵심 안전 규칙 상기.
- **되돌리기:** `/output-style default`.

---

## 게시(릴리즈) 빠른 절차 — 외워둘 골격
실수가 잦은 영역이라 골격만 박아둔다. 자세한 단계·검증은 **`/release-shiftmgmt` 스킬**에 있다.
1. **프리플라이트:** GitHub 최신 릴리즈 태그 확인 → `package.json` 버전과 **같으면 반드시 bump**(같은 버전 재게시는 자동업데이트 안 됨).
2. 버전 동기화: `package.json` + `package-lock.json`(2곳) + `artifacts/releases/vX.Y.Z/RELEASE_MANIFEST.json`(version 일치) + `docs/release-X.Y.Z.md`.
3. 게이트: `npm run release:check` → `RELEASE_CHECK_OK`.
4. 커밋 → 브랜치/태그 `vX.Y.Z` 푸시(브랜치 푸시는 hook 통과, main 직접 푸시는 차단).
5. **사용자 명시 승인 후** `RELEASE_CONFIRM=1 npm run release:publish`(build→721 test→release:check→electron-builder --publish always→publish-release-assets).
6. 검증: `releases/tags/vX.Y.Z` draft=false·prerelease=false·자산 4개(setup.exe·.blockmap·latest.yml·RELEASE_MANIFEST.json)·`latest.yml` version 일치.

GitHub: owner `hacker943410-debug`, repo `ShiftMS`. 토큰은 `gh auth token` / git credential manager에서 직접(묻지 않음, [[publish-without-asking-for-token]]).
