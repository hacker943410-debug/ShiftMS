# ShiftMgmt 0.4.28

실적관리 날짜 우선 조별 정렬 및 메뉴 화면 chunk 안정화 핫픽스

이번 업데이트는 `0.4.27` 실적관리 조별 묶음 후속 보정입니다. 실적 테이블 정렬 기준을 날짜 우선으로 고정하고, 기존 DB에 조 라벨이 비어 있는 행도 근무표/인력 배정 정보로 조를 복원합니다. 메뉴 화면은 동적 화면 chunk를 제거해 패치 중 누락 asset 오류 가능성을 줄였습니다.

## 실적관리 정렬
- **날짜 우선 정렬** — 실적 목록은 근무일자를 1순위로 정렬하고, 같은 날짜 안에서 조, 근로유형, 이름 순서를 적용합니다.
- **날짜별 조 묶음** — 화면의 조 요약 행은 전체 기간 기준으로 조를 한 번에 합치지 않고, 같은 날짜 안의 조 단위로 묶습니다.
- **기존 DB 조 복원** — `team_label`이 비어 있는 기존 실적 행도 월근무표, 원근무자 메모, 인력 배정 이력을 기준으로 조를 보정합니다.

## 메뉴 화면 안정화
- **동적 화면 chunk 제거** — 주요 메뉴 화면을 정적 import로 전환해 `WorkforceManagementScreen-*.js` 같은 지연 로딩 파일 누락 오류 경로를 제거했습니다.
- **레이아웃 검증** — 로컬 Electron 실행에서 사이드바, 로고, 메뉴 grid CSS 적용 상태를 확인했습니다.

## 운영 참고
- 이미 실행 중인 로컬 앱에서 `dist/assets`가 바뀐 경우에는 앱을 완전히 종료 후 다시 실행해야 합니다.
- 설치 사용자는 `0.4.28` 업데이트 후 새 프로세스로 실행하면 메뉴/로고 레이아웃과 실적 정렬이 새 기준으로 적용됩니다.

## 검증
- `npm run typecheck` 통과
- `npm run test -- performance-management-service.test.ts` 통과 — 20 tests
- `npm run test -- DashboardShell.test.tsx` 통과 — 4 tests
- `npm run test -- --reporter=dot` 통과 — `130 files / 637 tests`
- `npm run build` 통과
- `git diff --check` 통과
- `npm run smoke:electron:performance` 통과
- 로컬 Electron 레이아웃 측정 통과 — sidebar 300px, logo 234x58.5px, route 8개
- `npm run release:check` 통과
- `npm run release:publish` 통과
- `npm run smoke:electron:packaged` 통과
- `npm run smoke:electron:installer` 통과 — 재설치 후 데이터 보존 확인
- GitHub Release `v0.4.28` Published 상태 확인
- 원격 asset 확인 완료: `ShiftMgmt-Setup-0.4.28-x64.exe`, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`
