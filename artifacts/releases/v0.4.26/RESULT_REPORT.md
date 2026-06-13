# Result Report

## Result
구현, 자동 검증, 패키징, GitHub Release 게시 완료.

## Implemented
- `employees.deleted_at` 컬럼을 추가하고, 퇴사자 삭제는 물리 삭제 대신 숨김 처리로 전환했다.
- 삭제 시 직원 행, 시급 이력, 근무지 배치 이력을 보존한다.
- 실적 파서는 숨김 직원과 전체 배치 이력을 포함해 근무일 기준 사번/시급을 해석한다.
- 월근무표 복원은 대상 월의 근무지 배치 이력을 기준으로 직무이동/퇴사/숨김 인력을 찾는다.
- 기존 물리 삭제로 빈 사용자 근무표처럼 보이는 경우 재복원 대상이 될 수 있도록 했다.

## Verification
- RED 확인: 기존 구현에서 삭제 후 과거 실적 0분/시급 없음, 복원 0건 실패.
- Focused tests: 3 files / 58 tests passed.
- `npm run typecheck` passed.
- `npm run test` passed: 130 files / 633 tests.
- `npm run build` passed.
- `npm run release:check` passed.
- `npm run release:publish` passed.
- `npm run smoke:electron:packaged` passed.
- `npm run smoke:electron:installer` passed: reinstall verified, dataPreserved=true.

## Release
- Commit: `e726d23 실적관리.퇴사인력실적복구`
- Branch: `origin/release/0.4.26`
- Tag: `v0.4.26`
- GitHub Release: Published
- Assets: `ShiftMgmt-Setup-0.4.26-x64.exe`, `ShiftMgmt-Setup-0.4.26-x64.exe.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`

## Operational Limitation
이미 이전 버전에서 물리 삭제된 직원은 DB에 직원/시급/배치 이력이 남아 있지 않으면 자동 계산할 수 없다. 이 경우 DB 백업을 복원하거나 동일 사번 기준으로 직원, 시급, 과거 근무지 배치 이력을 재등록한 뒤 실적을 재파싱해야 한다.
