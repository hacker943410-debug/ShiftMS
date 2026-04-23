# v0.4.5 파일 영향 범위

## Main / Preload / Shared
- `src/main/services/app-update-service.ts`: 업데이트 확인/다운로드/설치 서비스
- `src/shared/domain/app-update.ts`: 업데이트 상태/매니페스트 타입
- `src/shared/domain/employment-type.ts`: BP 표시와 고용형태 정규화
- `src/main/services/*employee*`, `monthly-schedule-*`, `schedule-*`: BP/배정 순서/근무표 반영

## Renderer
- `src/renderer/components/AppUpdateModal.tsx`: 업데이트/패치노트 내부 모달
- `src/renderer/components/FormSelect.tsx`: 선택값 fallback 표시 보정
- `src/renderer/screens/WorkforceManagementScreen.tsx`: BP 등록과 고용형태 form 정규화
- `src/renderer/screens/site-management/*`: 조별 배정 순서와 UI 보강

## Release / Docs
- `package.json`, `scripts/publish-release-assets.mjs`: GitHub Release 게시 흐름
- `docs/`, `artifacts/releases/`: 최신 기준 문서와 릴리즈 아카이브 정리
