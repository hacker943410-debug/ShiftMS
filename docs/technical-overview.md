# 기술 구성 및 구현 원리

## 문서 역할
- 이 문서는 `교대근무관리시스템 V0.3.1`의 개발 언어, 로컬 백엔드 구성 방식, 저장소, 파일 연동, 구현 원칙을 코드 기준으로 정리한 기술 개요서다.
- 제품 기능 범위는 `docs/functional-spec.md`, 운영 기준은 `docs/operations-reference.md`, 개발/릴리즈 규칙은 `docs/project-handbook.md`를 우선 참조한다.
- 정리 기준일: `2026-04-13`
- 코드 기준 브랜치: `feature/v0.1.1-patch-finalize`

## 한눈에 보는 구조
- 앱 형태: Windows 중심 로컬 데스크톱 앱
- 프레임워크: Electron + React + TypeScript + Vite
- 로컬 백엔드: 별도 HTTP 서버가 아니라 Electron main process가 담당
- UI 계층: React renderer
- 브리지 계층: Electron preload + `contextBridge` + typed IPC
- 저장소: Node 24 내장 `node:sqlite`의 `DatabaseSync` 기반 SQLite 파일
- 파일 연동: main process에서 Excel 입출력, 파일 감시, 파일 선택/저장 다이얼로그 처리
- 테스트: Vitest + jsdom + 서비스 단위 테스트
- 패키징: electron-builder NSIS Windows 설치본

## 개발 언어와 런타임

### 언어
- TypeScript를 기본 언어로 사용한다.
- React 컴포넌트는 TSX로 작성한다.
- main/preload/shared/renderer 모두 TypeScript로 관리하며, renderer와 shared는 Vite/ESNext 설정을 사용하고 main/preload는 Electron 실행을 위해 CommonJS로 컴파일한다.

### 주요 런타임과 라이브러리
- Node.js: `>=24 <25`
- Electron: 데스크톱 셸, main process, preload, 패키징 실행 환경
- React: 화면 구성과 사용자 상호작용
- Vite: renderer 개발 서버와 정적 빌드
- Vitest: 단위 테스트와 renderer 테스트
- ExcelJS: Excel 파일 읽기/쓰기
- chokidar: 승인 대기/승인 완료 폴더 감시
- ECharts: 대시보드 차트
- electron-builder: Windows NSIS 설치본 생성

## 프로젝트 계층

### `src/main`
- Electron main process 코드다.
- 로컬 백엔드 역할을 수행한다.
- 담당 범위:
  - 앱 생명주기와 `BrowserWindow` 생성
  - SQLite 초기화와 종료
  - IPC handler 등록
  - 파일/폴더 선택, 저장 다이얼로그, 원본 파일 열기
  - 파일 감시 런타임 시작/중지
  - Excel 파싱/출력
  - JSON 기반 DB 업데이트
  - DB 백업과 승인/수당/양식 등 영속 데이터 처리

### `src/preload`
- renderer에 허용된 API만 노출하는 브리지 계층이다.
- `contextBridge.exposeInMainWorld("appBridge", appBridge)`로 typed bridge를 노출한다.
- renderer는 `window.appBridge`만 호출하고, Electron/Node API에 직접 접근하지 않는다.

### `src/renderer`
- React UI 계층이다.
- 담당 범위:
  - 로그인/대시보드/인력/근무지/근무표/실적/수당/운영 관리 화면
  - 사용자 입력, 필터, 상태 표시, 가이드 모달
  - `window.appBridge`를 통한 main process 호출
- renderer에는 DB 접근, 파일 시스템 접근, Excel 처리, 계산 규칙 하드코딩을 두지 않는다.

### `src/shared`
- renderer와 main이 공유하는 타입, 포맷터, 순수 도메인 로직을 둔다.
- 주요 범위:
  - IPC 계약 타입: `src/shared/bridge/contracts.ts`
  - 도메인 모델: `src/shared/domain/model.ts`
  - 수당/시간 계산: `src/shared/domain/calculation.ts`, `src/shared/domain/allowance-service.ts`
  - 근무 패턴, 조 표기, 반올림, Excel 컬럼 유틸 등 공용 로직

## 로컬 백엔드 구성 방식

이 프로젝트는 웹 서버를 띄우지 않는다. 백엔드는 Electron main process 안에 구성한다.

1. `app.whenReady()`에서 SQLite 저장소를 초기화한다.
2. main process가 `ipcMain.handle(...)`로 기능별 IPC handler를 등록한다.
3. preload가 `ipcRenderer.invoke(...)`를 감싼 `window.appBridge` 메서드를 노출한다.
4. renderer는 `window.appBridge` 메서드를 호출하고 `BridgeResult<T>` 형태의 성공/실패 결과를 받는다.
5. main service가 SQLite, Excel, 파일 시스템, 외부 API 호출을 처리한다.
6. 앱 종료 시 파일 감시 런타임, 백업 런타임, SQLite 연결을 정리한다.

새 백엔드 기능을 추가할 때의 기본 순서는 다음과 같다.

1. `src/shared/bridge/contracts.ts`에 입력/출력 타입과 bridge 메서드를 정의한다.
2. `src/main/services/`에 실제 서비스 함수를 구현한다.
3. `src/main/main.ts`에 `ipcMain.handle("기능:동작", ...)` handler를 등록한다.
4. `src/preload/index.ts`에 `ipcRenderer.invoke(...)` wrapper를 추가한다.
5. `src/renderer` 화면에서는 `window.appBridge`를 통해 호출한다.
6. shared 순수 계산 또는 main service 기준으로 테스트를 추가한다.

## SQLite 저장소

### 구현 방식
- 저장소 초기화는 `src/main/services/sqlite-storage-service.ts`에서 담당한다.
- Node 24의 `node:sqlite` 모듈에서 `DatabaseSync`를 사용한다.
- 기본 DB 파일명은 `shiftmgmt.sqlite`다.
- 기본 데이터 루트는 Electron `app.getPath("userData")` 아래의 `./data`이며, 환경 변수 또는 운영 관리 화면 설정으로 조정한다.
- 앱 시작 시 `PRAGMA journal_mode = WAL`과 `CREATE TABLE IF NOT EXISTS` 기반 마이그레이션을 적용한다.
- 기존 DB에 새 컬럼이 필요한 경우 `PRAGMA table_info` 확인 후 `ALTER TABLE ... ADD COLUMN`으로 보강한다.

### 주요 테이블 범위
- 기준정보: `sites`, `employees`, `employee_site_assignments`, `wage_rates`
- 근무 패턴/근무표: `shift_patterns`, `shift_pattern_*`, `monthly_schedules`, `monthly_schedule_items`
- 운영 기준: `holiday_calendars`, `holiday_items`, `allowance_rate_versions`, `allowance_rate_items`, `allowance_rate_history`, `app_users`
- 활동/설정: `access_logs`, `app_setting_entries`
- 양식 관리: `document_template_versions`, `document_template_history`
- 실적 승인: `performance_files`, `performance_entries`, `performance_approvals`, `hidden_approved_performance_rows`
- 수당/품의: `allowance_calculations`, `allowance_calculation_items`, `allowance_document_exports`, `allowance_approvals`, `allowance_proposal_approvals`

## 설정과 경로

- 기본 설정은 `src/main/services/app-settings-service.ts`의 `DEFAULT_SETTINGS`와 `.env.example`을 기준으로 한다.
- 운영 중 변경 가능한 설정은 `app_setting_entries`에 저장한다.
- 주요 설정:
  - `APP_NAME`
  - `HOLIDAY_API_BASE_URL`
  - `DATA_DIR`
  - `DATABASE_PATH`
  - `WATCH_PENDING_DIR`
  - `WATCH_APPROVED_DIR`
  - `SCHEDULE_EXPORT_DIR`
  - `ALLOWANCE_PROPOSAL_EXPORT_DIR`
  - `ALLOWANCE_ATTACHMENT1_EXPORT_DIR`
  - `ALLOWANCE_ATTACHMENT2_EXPORT_DIR`
  - `DATABASE_BACKUP_DIR`
  - `DATABASE_BACKUP_SCHEDULE`
  - `DATABASE_BACKUP_TIME`
  - `MIGRATION_FILE_PATH`
- 상대 경로는 데이터 루트 기준 절대 경로로 해석한다.
- 승인 대기 폴더와 승인 완료 폴더는 서로 달라야 한다.

## 파일 연동

### Excel 입출력
- Excel 파일 파싱과 출력은 main service에서 ExcelJS로 처리한다.
- 근무표 배포, 실적 반납 파일 파싱, 수당 품의서/별첨 출력, DB 백업 Excel 생성이 이 범위에 포함된다.
- renderer는 파일 경로나 사용자 입력만 전달하고 Excel workbook을 직접 다루지 않는다.

### 폴더 감시
- `src/main/services/file-watch-service.ts`는 chokidar watcher를 생성한다.
- `src/main/services/file-watch-runtime-service.ts`는 승인 대기/승인 완료 폴더 감시 상태를 관리한다.
- 파일 추가/변경/삭제 이벤트는 실적 파일 intake 서비스로 전달되고, 최근 이벤트는 운영 관리 화면에서 확인 가능한 snapshot 형태로 유지된다.

### DB 업데이트와 백업
- `DB업데이트`는 JSON 백업 파일만 입력으로 받는다.
- Access `.accdb`와 Excel 파일은 운영자가 임의로 DB를 핸들링할 수 있으므로 복원 입력에서 제외한다.
- 실제 업데이트 전 현재 DB 백업을 생성하고, 임시 SQLite 파일에서 복원한 뒤 기존 DB와 교체한다.
- 백업은 JSON과 Excel `.xlsx`를 기본으로 생성하며, 설정된 Access 원본이 있으면 `.accdb` 사본도 함께 보관한다.

## 구현 원리

### 보안 및 계층 경계
- renderer에서 Node API, 파일 시스템, SQLite를 직접 사용하지 않는다.
- main/preload를 통해 허용한 API만 renderer에 노출한다.
- `BrowserWindow`는 `contextIsolation: true`, `nodeIntegration: false`로 실행한다.
- 현재 창 설정의 `sandbox`는 `false`이며, renderer 접근 경계는 `contextIsolation`, `nodeIntegration: false`, preload allowlist를 중심으로 유지한다.
- OS 네이티브 파일/폴더 다이얼로그는 main process에서만 처리한다.
- 질문/확인/사유 입력 UI는 React 내부 공통 모달인 `QuestionDialog`와 `useQuestionDialog().askQuestion(...)` 패턴을 사용한다.

### 도메인 로직
- 시간 분해, 야간/연장/휴일/대체근무 계산, 반올림, 조 표기 정규화 같은 규칙은 `src/shared/domain`에 둔다.
- UI는 계산 결과를 표시하고 사용자의 의사결정을 main process에 전달하는 역할에 집중한다.
- 계산 규칙을 변경할 때는 문서와 테스트 기준을 먼저 맞춘다.

### 승인과 재현성
- 실적 승인 결과는 `performance_approvals`에 승인 스냅샷과 함께 저장한다.
- 수당 계산은 승인 당시의 실적 스냅샷, 요율 버전, 공휴일 기준을 사용한다.
- 수당 계산 결과는 `allowance_calculations`와 `allowance_calculation_items`에 저장하고, 계산 signature로 같은 계산의 재실행/재현성을 보장한다.
- 승인 완료, 반려, 재승인, 품의 승인 같은 상태 전환은 이력 테이블에 남긴다.
- 승인된 결과를 조용히 덮어쓰지 않고, 최신 승인 이력과 계산 결과를 구분한다.

### 문서 양식
- 근무표, 품의서, 별첨1, 별첨2 양식은 `document_template_versions`에서 버전으로 관리한다.
- 승인된 양식만 실제 배포/출력에 사용한다.
- 기본 사용 양식 전환과 삭제는 이력으로 남긴다.
- 이미 사용 중인 양식은 무조건 삭제하지 않고 사용 여부를 확인한다.

## 개발과 검증 명령

- 의존성 설치: `npm install`
- 개발 실행: `npm run dev`
- Electron 앱 실행: `npm run start`
- 타입 점검: `npm run typecheck`
- 테스트: `npm run test`
- 빌드: `npm run build`
- 구조 검증: `node scripts/validate-structure.mjs`
- Windows 설치본 생성: `npm run package:win`
- 릴리즈 패키지 검증: `npm run release:verify-package`

`npm run dev`는 Vite renderer 개발 서버, Electron TypeScript watch build, Electron 실행을 함께 띄운다. 운영 빌드는 `vite build`로 renderer를 `dist/`에 만들고, `tsc -p tsconfig.electron.json`으로 main/preload를 `dist-electron/`에 만든다.

## 현재 유의사항

- 백엔드는 HTTP API 서버가 아니므로 REST endpoint나 Express/NestJS 같은 서버 구성이 없다.
- 개발 중에만 Vite dev server가 `127.0.0.1:5173`에서 renderer를 제공한다.
- 패키징된 앱은 `dist/index.html`과 `dist-electron/main/main.js`를 사용한다.
- SQLite는 외부 npm 드라이버가 아니라 Node 24 내장 `node:sqlite`를 사용한다.
- 로그인은 현재 로컬 계정과 in-memory session 중심으로 구현되어 있으며, 운영 사용자 관리 데이터와 인증 저장소 통합은 별도 개선 대상으로 볼 수 있다.

## 관련 파일

- `package.json`
- `tsconfig.json`
- `tsconfig.electron.json`
- `vite.config.ts`
- `vitest.config.ts`
- `.env.example`
- `src/main/main.ts`
- `src/main/services/sqlite-storage-service.ts`
- `src/main/services/app-settings-service.ts`
- `src/main/services/app-settings-storage-service.ts`
- `src/main/services/file-watch-runtime-service.ts`
- `src/main/services/database-backup-service.ts`
- `src/main/services/database-migration-service.ts`
- `src/preload/index.ts`
- `src/shared/bridge/contracts.ts`
- `src/shared/domain/calculation.ts`
- `src/shared/domain/allowance-service.ts`
- `src/renderer/App.tsx`
