# v0.4.28

## 개요
`0.4.27` 후속 핫픽스입니다. 실적관리 정렬 우선순위를 날짜 → 조로 보정하고, 기존 저장 행의 누락된 조 라벨을 복원합니다. 메뉴 화면은 동적 화면 chunk를 제거해 패치 후 asset mismatch로 메뉴가 열리지 않는 경로를 차단했습니다.

## 범위
- 실적관리 overview row 정렬 기준 변경
- 기존 `performance_entries.team_label` NULL 행의 표시용 조 복원
- 실적관리 테이블 조 요약 행을 날짜별 조 단위로 변경
- `DashboardShell` route screen lazy import 제거

## 검증 요약
- `npm run typecheck`
- `npm run test -- performance-management-service.test.ts`
- `npm run test -- DashboardShell.test.tsx`
- `npm run test -- --reporter=dot`
- `npm run build`
- `git diff --check`
- `npm run smoke:electron:performance`

## 배포 상태
- GitHub Release 게시 완료
- Release URL: https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.4.28
- Assets: `ShiftMgmt-Setup-0.4.28-x64.exe`, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`
