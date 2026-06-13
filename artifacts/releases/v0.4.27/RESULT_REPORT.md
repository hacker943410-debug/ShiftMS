# Result Report

## Result
구현, 자동 검증, 패키징, GitHub Release 게시 완료.

## Implemented
- 실적 엔트리 조 정보 저장과 실적관리 조별 묶음 표시.
- 반려 승인대기 파일 재파싱.
- 변경/대체 표 `None` 취소를 법정휴일 실적에 연결.
- 비밀번호 실패 계정 잠금 제거.

## Verification
- `npm run typecheck` passed.
- Focused parser test passed: 26 tests.
- Focused management test passed: 18 tests.
- `npm run test` passed: 130 files / 635 tests.
- `npm run build` passed.
- `git diff --check` passed.
- `npm run release:check` passed.
- `npm run release:publish` passed.
- `npm run smoke:electron:packaged` passed.
- `npm run smoke:electron:installer` passed: reinstall verified, dataPreserved=true.

## Release
- Commit: `f41f870 실적관리.조별검수재파싱`
- Branch: `release/0.4.27`.
- Tag: `v0.4.27`.
- GitHub Release: Published
- Published at: `2026-06-13T08:49:46Z`
- URL: `https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.4.27`
- Assets: `ShiftMgmt-Setup-0.4.27-x64.exe`, `ShiftMgmt-Setup-0.4.27-x64.exe.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`
