# scripts — 릴리즈/빌드 스크립트 규칙 (scripts 작업 시 자동 로드)

릴리즈·DB·구조검증 스크립트. (전역 규칙은 루트 `CLAUDE.md`, 게시 전체 절차는 `/release-shiftmgmt` 스킬)

## 게시(릴리즈) 골격
1. **프리플라이트:** GitHub 최신 태그(`releases/latest`) vs `package.json` 버전 → **같으면 반드시 bump**(동일 버전 재게시는 자동업데이트 안 됨).
2. 버전 동기화: `package.json` + `package-lock.json`(**2곳**: 최상위 + `packages.""`) + `artifacts/releases/vX.Y.Z/RELEASE_MANIFEST.json`(version 일치) + `docs/release-X.Y.Z.md`.
3. `npm run release:check`(`release-check.mjs`) → `RELEASE_CHECK_OK`.
4. **게시는 위험 명령.** hook이 막는다 → 사용자 명시 승인 후에만 `RELEASE_CONFIRM=1 npm run release:publish`.

## 매니페스트 한도 (release-check.mjs / lib/release-publish-helpers.cjs)
- `summary` ≤ 220자, 각 `notes` ≤ 120자(숫자로 시작 금지), 섹션 `item.detail` ≤ 240자.
- `release:check` 요구물: `artifacts/releases/vX.Y.Z/RELEASE_MANIFEST.json` + `dev-app-update.yml` + `dist/index.html` + `dist-electron/main/main.js`.
- `publish-release-assets.mjs` 요구물: `docs/release-X.Y.Z.md` + 매니페스트, 그리고 `manifest.version === package.json version`.

## 게시 메커니즘 (되돌릴 수 없음)
- `release:publish` = `build && test && release:check && electron-builder --win nsis --publish always && node scripts/publish-release-assets.mjs`.
- electron-builder는 **draft** 릴리즈 생성 → `publish-release-assets.mjs`가 매니페스트 업로드 후 **draft=false**로 PATCH → 즉시 정식 공개 → `latest.yml` 서빙 → **전 사용자 자동업데이트**.
- GitHub: owner `hacker943410-debug`, repo `ShiftMS`. 토큰은 `gh auth token`(묻지 않음).

## 게시 후 검증
`releases/tags/vX.Y.Z`: draft=false·prerelease=false·자산 4개(setup.exe·.blockmap·latest.yml·RELEASE_MANIFEST.json). `latest.yml`의 version 일치. → 전 과정은 **`release-verifier`** 서브에이전트로 격리 검증 가능.

## 기타 스크립트
`reset-database.mjs`·`reset-admin-password.mjs`·`issue-account-recovery-key.mjs`(운영), `validate-structure.mjs`(구조검증), `export-access-db.ps1`(Access 내보내기).
