# Stack Detail

상위 제품 방향과 UI 기준은 `docs/project-handbook.md`를 따른다.

## 현재 포함된 런타임
- Electron
- React
- TypeScript
- Vite
- Vitest

## 초기 의존성 방향
- UI: React + Vite
- Desktop shell: Electron
- Testing: Vitest
- Build helpers: concurrently, wait-on, cross-env

## 다음 단계 후보
- DB: better-sqlite3 또는 sqlite 계열 드라이버
- Validation: zod
- Excel I/O: exceljs
- File watcher: chokidar
- Routing: react-router-dom
- Table/UI: Ant Design 또는 동급의 데이터 밀도 중심 컴포넌트 전략 검토
- Charting: Recharts 또는 ApexCharts 계열 검토

## 환경 변수 초안
- `APP_NAME`
- `HOLIDAY_API_BASE_URL`
- `DATA_DIR`
- `WATCH_PENDING_DIR`
- `WATCH_APPROVED_DIR`
