# ShiftMgmt 0.4.29

실적 재승인 복구, 시작속도, 메뉴 레이아웃 안정화 핫픽스

이번 업데이트는 `0.4.28` 후속 안정화입니다. 수당 반려 후 승인완료 파일이 수동으로 승인대기에 되돌아온 상태를 재승인 사이클로 복구하고, 시작 시 자동 업데이트/파일 감시 작업을 지연해 초기 화면 표시 지연을 줄입니다. 데스크톱 메뉴가 모바일처럼 무너지는 CSS 조건과 실적 조별 소계 라벨도 보정했습니다.

## 실적 재승인 복구
- **수당 반려 이력 기준 복구** — 승인완료로 저장된 파일이 승인대기에 다시 발견되면, 연결된 최신 수당 산출이 반려 상태일 때만 재승인 대상으로 전환합니다.
- **법정휴일 행 유지** — 수동 파일 이동 상태에서도 법정휴일 실적 행이 승인대기 목록에 유지되고 재승인할 수 있습니다.
- **반복 사이클 검증** — 승인, 수당 승인, 근무지 반려, 재승인을 두 번 반복해 법정휴일 행과 승인완료 이동을 검증했습니다.

## 시작속도와 메뉴
- **시작 작업 지연** — 자동 업데이트 확인, 파일 감시 시작, 실적 복구 작업을 창 표시 이후로 지연했습니다.
- **데스크톱 메뉴 고정** — 1280px 이하 데스크톱에서도 좌측 메뉴가 모바일 레이아웃으로 무너지지 않게 했습니다.
- **로고 크기 제한** — 좌측 브랜드 로고에 최대 크기를 지정해 전체 폭으로 커지는 표시를 막았습니다.

## 실적관리 표시
- **조 라벨 소계** — 조별 소계 행의 첫 칸을 `A조`, `B조` 같은 실제 조 이름으로 표시합니다.
- **날짜 우선 정렬 유지** — 실적 목록은 날짜를 먼저 정렬하고 같은 날짜 안에서 조별로 묶습니다.

## 검증
- `npm run test -- performance-management-service.test.ts performance-file-intake-service.test.ts performance-approval-flow-service.test.ts allowance-approval-service.test.ts approved-allowance-calculation-service.test.ts` 통과 — 65 tests
- `npm run typecheck` 통과
- `npm run test -- --reporter=dot` 통과 — `130 files / 640 tests`
- `npm run build` 통과
- `git diff --check` 통과
- `npm run release:check` 통과
- `node scripts/validate-structure.mjs` 통과
- `npm run release:publish` 통과
- `npm run smoke:electron:packaged` 통과
- `npm run smoke:electron:installer` 통과 — 재설치 후 데이터 보존 확인
- GitHub Release `v0.4.29` Published 상태 확인
- 원격 asset 확인 완료: `ShiftMgmt-Setup-0.4.29-x64.exe`, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`
