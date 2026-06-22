---
name: release-shiftmgmt
description: ShiftMgmt_V3.4 정식 릴리즈 게시 절차 — 버전 충돌 프리플라이트부터 GitHub 공개·전사용자 자동업데이트 검증까지. 사용자가 "패키징/설치본/버전 게시/배포"를 요청할 때 사용한다. (release:publish 는 되돌릴 수 없으므로 반드시 이 절차를 따른다.)
---

# 릴리즈 게시 (ShiftMgmt_V3.4)

`release:publish` 는 전 사용자 자동업데이트를 즉시 트리거하는 **되돌릴 수 없는** 작업이다. 아래 순서를 그대로 따른다. 하드 게이트 hook(`guard-dangerous-bash`)이 토큰 없는 게시를 차단한다.

## 0. 승인 확인
- 사용자가 **이번 턴에** 게시를 명시 승인했는가? ("게시/배포해줘") 아니면 로컬 설치본까지만인가?("로컬만/Draft만")
- 로컬만이면 `npm run package:win`(또는 `release:package`)에서 끝낸다 — `--publish never`, 안전.

## 1. 프리플라이트 — 버전 충돌 (가장 중요, 0.5.0→0.5.1 사건)
```bash
GH_TOKEN="$(gh auth token)" gh api repos/hacker943410-debug/ShiftMS/releases/latest --jq '.tag_name'
```
- 최신 태그(예 `v0.5.1`)의 버전이 현재 `package.json` `version`과 **같으면** → 같은 버전 재게시는 자동업데이트가 안 된다 → **반드시 patch bump.**
- 사용자에게 올릴 버전을 쉬운 말로 확인(추천안 제시).

## 2. 버전 동기화 (모두 일치해야 release:check 통과)
- `package.json` `version`
- `package-lock.json` **2곳**: 최상위 `"version"` + `packages."" .version`
- `artifacts/releases/vX.Y.Z/RELEASE_MANIFEST.json` (`version` 일치, 한도: summary ≤220, notes ≤120·숫자시작 금지, item.detail ≤240, `requiresDbBackup`/`required` 적절히)
- `docs/release-X.Y.Z.md` (쉬운 한국어 릴리즈 노트)

## 3. 게이트
```bash
npm run release:check        # → RELEASE_CHECK_OK
node scripts/publish-release-assets.mjs --dry-run   # 버전/태그 resolve 확인
```

## 4. 커밋 + 태그/푸시
- 버전 bump 커밋(기능 변화 없으면 chore(release)).
- 태그 `vX.Y.Z` 생성, **기능 브랜치 + 태그** 푸시(main 직접 푸시는 hook이 차단 — 푸시는 브랜치로).

## 5. 게시 (위험 — 승인 후에만)
```bash
# bash
GH_TOKEN="$(gh auth token)" RELEASE_CONFIRM=1 npm run release:publish
# PowerShell
$env:GH_TOKEN=(gh auth token).Trim(); $env:RELEASE_CONFIRM='1'; npm run release:publish
```
- `RELEASE_CONFIRM=1` 없이는 hook이 막는다. **사용자 컨펌 없이 토큰을 붙이지 말 것.**
- 내부: `build → test(721, 단일워커 ~10분) → release:check → electron-builder --win nsis --publish always(draft 생성) → publish-release-assets.mjs(매니페스트 업로드 + draft=false PATCH)`.
- 시간이 걸리니 백그라운드 실행 + 완료 알림 대기.

## 6. 게시 후 검증 (또는 `release-verifier` 서브에이전트)
```bash
GH_TOKEN="$(gh auth token)" gh api repos/hacker943410-debug/ShiftMS/releases/tags/vX.Y.Z \
  --jq '{tag:.tag_name, draft:.draft, prerelease:.prerelease, assets:[.assets[].name]}'
```
- 합격: `draft=false`, `prerelease=false`, 자산 4개(`ShiftMgmt-Setup-X.Y.Z-x64.exe`, `.exe.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`).
- `latest.yml`의 `version`이 X.Y.Z인지 확인 → 기존 사용자 자동업데이트 정상.

## 7. 보고 + 기억
- 사용자에게 쉬운 말로: 릴리즈 URL, "기존 사용자는 다음 실행 때 자동 업데이트", 무엇이 바뀌었는지.
- 자동기억에 게시 결과 1줄 갱신([[release-publish-flow]] 흐름, [[no-autopublish-until-requested]] 준수).
