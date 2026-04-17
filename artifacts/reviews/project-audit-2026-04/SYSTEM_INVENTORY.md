# System Inventory

## 목적
- 코드베이스를 기능별이 아니라 구조와 경계 기준으로 파악한다.
- 리팩토링과 보안 검토의 기준이 되는 시스템 지도를 만든다.

## 1. 최상위 구조
- 앱 형태: Electron 기반 로컬 데스크톱 앱
- UI: React + Vite renderer
- 로컬 백엔드: Electron main process
- 브리지: preload + typed IPC
- 저장소: Node 24 `node:sqlite` 기반 SQLite
- 파일 처리: ExcelJS, chokidar, PowerShell, Access DB export
- 패키징: electron-builder + NSIS

## 2. 코드 디렉터리
- `src/main`: Electron main process와 서비스
- `src/preload`: renderer에 노출되는 브리지
- `src/renderer`: 화면, 공통 컴포넌트, 스타일
- `src/shared`: 타입, 순수 도메인 로직, 브리지 계약

## 3. 현재 규모
- `src` 전체 파일 수: `191`
- `src/main/services` 파일 수: `100`
- `src/main/services` 테스트 파일 수: `45`
- `src/shared/domain` 파일 수: `30`

## 4. 핵심 경계
- `BrowserWindow` 설정:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: false`
- renderer는 `window.appBridge`를 통해서만 main 기능을 호출한다.
- main process는 파일 시스템, SQLite, Excel, OS 다이얼로그를 직접 담당한다.

## 5. 현재 집중 구간
- [main.ts](C:/Projects/Active/ShiftMgmt_V3.4/src/main/main.ts:312)
  - `BrowserWindow` 생성과 거의 모든 IPC handler 등록이 집중되어 있다.
- [auth-service.ts](C:/Projects/Active/ShiftMgmt_V3.4/src/main/services/auth-service.ts:22)
  - 로컬 계정과 in-memory session을 사용한다.
- [sqlite-storage-service.ts](C:/Projects/Active/ShiftMgmt_V3.4/src/main/services/sqlite-storage-service.ts:317)
  - DB 초기화와 다수 테이블 정의를 가진다.
- [database-migration-service.ts](C:/Projects/Active/ShiftMgmt_V3.4/src/main/services/database-migration-service.ts:1)
  - JSON/Access 복원, 백업, 외부 스크립트 의존성이 모인다.

## 6. 우선 인벤토리 대상
1. IPC 목록과 도메인별 분류
2. 인증/권한 흐름
3. 설정/경로 해석 규칙
4. 실적 승인 -> 수당 계산 -> 품의 승인 흐름
5. DB 백업/복원/Access export 흐름
6. 패키징 및 설치본 검증 흐름

## 7. IPC 베이스라인
- `ipcMain.handle(...)` 등록 수: `73`
- 도메인별 분포:
  - `operations`: `22`
  - `allowance`: `11`
  - `employees`: `10`
  - `performance`: `8`
  - `monthly-schedules`: `6`
  - `shift-patterns`: `4`
  - `auth`: `3`
  - `sites`: `3`
  - `access-logs`: `2`
  - `app`: `2`
  - `dashboard`: `2`

## 8. 대형 파일 베이스라인
- `3966` lines: `src/renderer/screens/SiteManagementScreen.tsx`
- `3002` lines: `src/renderer/guides/route-guides.tsx`
- `2768` lines: `src/renderer/screens/AllowanceManagementScreen.tsx`
- `2507` lines: `src/main/services/database-migration-service.ts`
- `2216` lines: `src/renderer/screens/DashboardScreen.tsx`
- `2192` lines: `src/renderer/screens/ShiftPatternManagementScreen.tsx`
- `2026` lines: `src/main/services/operations-storage-service.ts`
- `1996` lines: `src/renderer/screens/ScheduleManagementScreen.tsx`
- `1836` lines: `src/main/main.ts`
- `1828` lines: `src/main/services/allowance-document-export-service.ts`

## 9. 테스트 공백 베이스라인
- `src/main/services` 내 전용 `.test.ts`가 없는 서비스 파일 수: `11`
- 현재 확인된 파일:
  - `allowance-document-export-history-service.ts`
  - `document-brand-logo-service.ts`
  - `document-template-output-file-name-service.ts`
  - `document-template-profile-service.ts`
  - `document-template-style-apply-service.ts`
  - `performance-approval-resolution-service.ts`
  - `performance-approval-snapshot-service.ts`
  - `performance-approved-row-visibility-service.ts`
  - `performance-file-archive-service.ts`
  - `schedule-plan-template-service.ts`
- `performance-test-helpers.ts`는 helper 파일이라 테스트 부재 목록에서 별도 취급하는 것이 맞다.
