# 구현 계획: ShiftMgmt_V3.4

**상태**: 진행 중
**시작일**: 2026-03-12
**최종 수정일**: 2026-03-23
**예상 완료일**: 2026-05-29

---

**중요 지침**: 각 단계를 마칠 때마다 아래 순서를 지킨다.
1. 완료한 작업 체크박스를 갱신한다.
2. 필수 검증 명령을 실행한다.
3. 변경 범위와 결과를 사용자에게 공유한다.
4. `최종 수정일`과 진행 상태를 갱신한다.
5. 이탈 사항, 위험, 학습 내용을 기록한다.
6. 검토 후에만 다음 단계로 진행한다.

**검증, 아키텍처 경계, 사용자 검토 체크포인트를 건너뛰지 않는다**

---

## 개요

### 기능 설명
ShiftMgmt_V3.4는 교대근무 운영 업무를 하나로 묶는 로컬 데스크톱 웹 앱이다. 인력 관리, 근무지 패턴 구성, 월간 근무표 배포, 실적 승인, 수당 계산, 운영 설정을 Electron + React + TypeScript 기반 단일 앱 안에서 처리한다.

### 성공 기준
- [ ] 7개 메뉴가 UI용 더미 데이터가 아니라 실제 서비스와 연결된다.
- [ ] renderer는 UI와 bridge 호출만 담당하고, 파일 접근은 main/preload에서만 처리된다.
- [ ] 인력, 근무지, 근무표, 승인, 수당, 운영 설정에 대한 SQLite 저장 구조와 이력 정책이 정리된다.
- [ ] 수당 계산과 승인 로직이 재현 가능한 테스트로 검증된다.
- [ ] Excel 생성, 파일 감시, 결과 이력이 Electron main 서비스로 연결된다.
- [ ] 각 단계의 검증 시점마다 build, typecheck, test, 구조 검증이 유지된다.

### 사용자 영향
구현 완료 후에는 본사 운영자가 흩어진 엑셀과 수작업에 의존하지 않고, 사이트별 인력 현황 확인, 근무표 배포, 실적 승인, 수당 계산, 품의 문서 생성을 하나의 앱 안에서 처리할 수 있어야 한다.

### 협업 방식
- [ ] 각 구현 작업을 시작하기 전에 대상 범위와 예상 변경 파일을 먼저 공유한다.
- [ ] 각 구현 작업이 끝나면 변경 내용, 검증 결과, 남은 위험 요소를 바로 보고한다.
- [ ] 사용자가 결과를 확인할 기회를 갖기 전에는 다음 큰 작업이나 다음 단계로 넘어가지 않는다.
- [ ] 보류된 UI 미세 조정 항목은 별도 메모로 관리하고, 요청이 있을 때만 반영한다.

---

## 아키텍처 결정

| 결정 | 이유 | 트레이드오프 |
|----------|-----------|------------|
| renderer는 UI 전용으로 유지 | 로컬 파일 접근과 DB 접근을 main/preload 뒤로 숨기기 위해 | IPC 계약과 연동 유지 비용이 늘어난다 |
| SQLite를 기본 로컬 저장소로 사용 | 데스크톱 앱 운영에 적합하고 배포 복잡도가 낮기 때문 | 마이그레이션과 파일 잠금 처리에 주의가 필요하다 |
| 계산 규칙은 `src/shared/domain` 또는 main 서비스에 둔다 | UI에 비즈니스 규칙이 박히는 것을 막기 위해 | 공유 타입 경계를 계속 관리해야 한다 |
| Excel 생성과 폴더 감시는 `src/main/services`에서 처리 | Electron 보안 경계와 로컬 자동화 요구에 맞기 때문 | renderer 작업 흐름이 bridge 성숙도에 의존한다 |
| UI 기준선은 요청된 패치 외에는 고정 | 연동 시작 후 레이아웃 흔들림을 줄이기 위해 | 일부 미세 조정 이슈는 당분간 남을 수 있다 |

---

## 선행 조건과 의존성

### 시작 전 필요 조건
- [x] 현재 UI 기준선이 서비스 연동을 시작할 수준으로 정리된다.
- [x] 화면별 bridge/service 매핑 목록이 작성된다.
- [x] SQLite 엔터티와 이력 정책 초안이 문서화된다.
- [x] 필요한 Excel 샘플 양식과 감시 폴더 규칙이 정리된다.

### 외부 의존성
- Electron `^37.3.1`
- React `^19.1.1`
- Vite `^7.1.7`
- ExcelJS `^4.4.0`
- Chokidar `^5.0.0`
- `src/main/services/sqlite-storage-service.ts` 기반 SQLite 저장 구현

---

## 테스트 전략

### 테스트 접근 방식
- 도메인 계산, 승인 흐름, 저장 구조 변경은 test-first 또는 test-with-change 방식으로 진행한다.
- 순수 UI 배치 조정은 수동 확인과 build/typecheck로 검증한다.
- 연동 작업은 동작이 바뀌는 서비스와 bridge에 대해 테스트를 함께 보강한다.

### 테스트 피라미드
| 테스트 유형 | 적용 대상 | 목적 |
|-----------|-----------------|---------|
| Unit Tests | 도메인 규칙과 헬퍼 | 수당, 반올림, 근무표 변환, 저장 헬퍼 검증 |
| Integration Tests | 주요 서비스 흐름 | SQLite 저장, 승인 흐름, 내보내기/이력, bridge 계약 검증 |
| Manual UI Checks | UI가 바뀌는 모든 단계 | 화면 흐름, 한국어 라벨, 레이아웃 회귀 확인 |

### 단계별 테스트 집중 포인트
- Phase 1: 계획 문서와 갭 목록 정리, 신규 커버리지 목표 없음
- Phase 2: SQLite, 계약, 저장소/서비스 테스트 보강
- Phase 3: 인력/근무지/근무표 연동 테스트와 수동 UI 흐름 점검
- Phase 4: 승인/수당 회귀 테스트 우선 확장
- Phase 5: 파일 감시와 Excel 출력 서비스 테스트 및 수동 출력 검증
- Phase 6: 전체 메뉴 대상 스모크 검증

### 검증 명령
```bash
npm run typecheck
npm run test
npm run build
node scripts/validate-structure.mjs
```

---

## 구현 단계

### Phase 1: 연동 기준선 고정
**목표**: 현재 UI 기준선을 고정하고, 실제 연동 대상과 협업 방식을 확정한다.
**예상 기간**: 1-2일
**상태**: 완료

#### 작업 항목
- [x] 현재 UI 확정 범위와 보류 UI 패치 목록을 문서화한다.
  - 대상 파일: `docs/work-plan.md`, 필요 시 `artifacts/` 하위 메모
  - 목표: 지금 당장 구현할 것과 나중에 다듬을 것을 분리한다.
- [x] 메뉴별 bridge/service 매핑 목록을 작성한다.
  - 대상 파일: `docs/work-plan.md`, `src/shared/bridge/contracts.ts`, `src/main/services/*`
  - 목표: 어떤 화면부터 실제 데이터로 전환할지 우선순위를 정한다.
- [x] 주요 작업마다 사용자 검토 체크포인트를 정의한다.
  - 대상 파일: `docs/work-plan.md`
  - 목표: 구현 과정이 항상 확인 가능한 상태로 유지되게 한다.

#### 현재 UI 기준선
- 대시보드, 인력 관리, 근무지 관리, 근무표 배포, 실적 관리, 수당 관리, 운영 관리까지 7개 메뉴의 기본 재배치가 완료된 상태를 현재 기준선으로 본다.
- 공통 사이드바, 상단 컨텍스트, 브랜드 영역, 필터 폭 정리, 캘린더 레이아웃 등 주요 레이아웃 패치는 현재 상태를 유지한다.
- 현재 renderer 화면들은 대부분 `window.appBridge`를 직접 사용하지 않고 있으며, 화면 더미 데이터와 read-only 입력값을 중심으로 구성돼 있다.

#### 보류 UI/UX 항목
- 간격, 카드 높이, 버튼 위치, 테이블 헤더 높이 같은 미세 시각 조정
- 차트/요약 카드 수치 표현 방식과 강조 톤 보정
- 상세 라우팅 전환감, 확장행, drag-and-drop, 경로 선택 UI 같은 상호작용 정리
- 실제 서비스 연동 후 발견되는 사용성 문제에 대한 후속 패치

#### 메뉴별 bridge/service 매핑
| 메뉴 | 현재 renderer 상태 | 연결 가능한 기존 bridge / service | 현재 갭 | 권장 착수 순서 |
|------|---------------------|----------------------------------|---------|----------------|
| 대시보드 | `DashboardScreen.tsx` 정적 카드/차트 더미 데이터 | `getAppHealth`, `listEmployees`, `listSites`, `listPendingFiles`, `listCalculationResults`, `listMonthlySchedules`로 원시 데이터 수집 가능 | KPI 집계용 전용 서비스/DTO 부재, 기간 필터 부재, 화면 조합 로직 미정 | 후순위 |
| 인력 관리 | `WorkforceManagementScreen.tsx` 목록/상세/등록 UI는 있으나 모두 목업 상태 | `listEmployees`, `listEmployeeWageRates`, `listEmployeeAssignments`, `saveEmployee`, `saveEmployeeWageRate`, `closeEmployeeWageRate`, `saveEmployeeAssignment`, `closeEmployeeAssignment`, `listSites` | renderer 데이터 계층 부재, 상세 선택 상태와 저장 후 갱신 흐름 미연결 | 1순위 |
| 근무지 관리 | `SiteManagementScreen.tsx` 1단계/2단계 저장, 상세 보기, 패턴/설정 불러오기, 삭제 흐름까지 실제 bridge 기반 | `listSites`, `saveSite`, `deleteSite`, `listShiftPatterns`, `saveShiftPattern`, `deactivateShiftPattern`, `listEmployees` | 근무표 배포 양식과의 downstream 확인, 수동 UI 검증이 남아 있다 | 2순위 |
| 근무표 배포 | `ScheduleManagementScreen.tsx` 달력/요약/경로 표시 UI는 있으나 정적 데이터 기반 | `listMonthlySchedules`, `saveMonthlySchedule`, `previewMonthlySchedulePlan`, `exportMonthlySchedulePlan`, `listSchedulePlanExports`, `publishSchedulePlanExport`, `listSites`, `listShiftPatterns` | 직원 배정 데이터 소스, 실제 경로 선택 흐름, 화면 액션 연결 부재 | 3순위 |
| 실적 관리 | `PerformanceManagementScreen.tsx` 표와 경로 표시만 목업 상태 | `listPendingFiles`, `getPendingFileDetail`, `approvePendingFile`, `rejectPendingFile`, `listApprovalHistory` | 상세 보기 UI, 승인/반려 입력 흐름, 감시 폴더 설정 노출 부재 | 4순위 |
| 수당 관리 | `AllowanceManagementScreen.tsx` 분석 카드/상세 테이블이 목업 상태 | `previewAllowanceCalculation`, `runApprovedCalculation`, `listCalculationResults` | 월/근무지/직원 기준 조회 계약 부족, 품의/산출물 흐름 부재, 상세 결과 조회 단위 미정 | 5순위 |
| 운영 관리 | `ShiftPatternManagementScreen.tsx`가 공휴일/요율/사용자/양식 화면을 mock 데이터로 표시 | 내부적으로 `app-settings-service`, `file-watch-service`, `auth-service`, 요율 fixture, `excel-template-parser` 존재 | 공휴일/요율/사용자/양식 CRUD bridge 전무, 외부 API 호출/설정 저장/UI 탭 액션 모두 미구현 | 6순위 |

#### 연동 착수 순서 결정 이유
1. 인력 관리는 저장 서비스와 이력 서비스가 가장 잘 준비돼 있어 첫 연동 대상으로 적합하다.
2. 근무지 관리는 인력 배정과 패턴 저장이 근무표 생성의 전제가 되므로 두 번째가 맞다.
3. 근무표 배포는 인력/근무지 데이터가 연결된 뒤에야 실제 미리보기와 배포가 의미를 가진다.
4. 실적 관리와 수당 관리는 승인/계산 흐름이 기존 데이터 기반 위에서 동작하므로 뒤따라가는 것이 안전하다.
5. 운영 관리와 대시보드는 집계/설정 성격이 강하고 추가 계약이 필요해 후순위로 둔다.

#### 품질 게이트
- [x] 7개 메뉴의 범위가 명시된다.
- [x] 보류 UI 항목이 연동 작업과 분리된다.
- [x] 사용자 검토 흐름이 문서에 반영된다.
- [x] `docs/work-plan.md`가 최신 실행 순서를 반영한다.

---

### Phase 2: 데이터 기반과 계약 정렬
**목표**: renderer가 사용할 실제 저장소와 bridge 기반을 확정한다.
**예상 기간**: 4-6일
**상태**: 진행 중

#### 작업 항목
- [ ] 인력, 근무지, 근무표, 승인, 수당, 운영 설정에 대한 SQLite 엔터티와 이력 구조를 검토하고 확정한다.
  - 대상 파일: `src/main/services/sqlite-storage-service.ts`, 관련 저장 서비스, 계획 문서
  - 목표: 저장 경계와 이력 정책을 먼저 잠근다.
- [ ] `src/shared/bridge/contracts.ts`를 실제 메뉴 액션 기준으로 점검한다.
  - 대상 파일: `src/shared/bridge/contracts.ts`, preload bridge 모듈, renderer 호출부
  - 목표: UI가 필요로 하는 액션과 현재 IPC 계약 사이의 빈틈을 없앤다.
- [ ] 저장소와 계약 동작에 대한 테스트를 추가하거나 보강한다.
  - 대상 파일: `src/main/services/*.test.ts`, `src/shared/domain/*.test.ts`
  - 목표: 구조 변경이 재현 가능하도록 만든다.
- [x] renderer 연동에 들어가기 전에 미해결 결정을 문서화한다.
  - 대상 파일: `docs/work-plan.md`, 필요 시 ADR 메모
  - 목표: 숨은 범위 확장을 줄인다.

#### 현재 저장 구조 갭 분석
| 영역 | 현재 상태 | 갭 | 정리 방향 |
|------|-----------|----|-----------|
| 인력 / 근무지 / 배정 / 시급이력 | SQLite 테이블과 저장 서비스가 이미 존재한다 | renderer에서 직접 활용할 조회/선택 상태만 아직 없다 | 현재 스키마를 기준선으로 두고 renderer 연동부터 시작 가능 |
| 근무 패턴 / 월간 근무표 / 배포이력 | SQLite 테이블과 저장/미리보기/내보내기 서비스가 존재한다 | 시뮬레이션 입력과 배정 후보 계산용 보조 모델은 없다 | 저장 구조는 유지하되 renderer 액션 기준 조회 단위를 보강 |
| 실적 파일 / 승인 / 수당 계산 | SQLite 테이블과 승인/계산 서비스가 존재한다 | `src/shared/domain/model.ts`의 `PerformanceFileRecord` 계열과 실제 `performance-file.ts` + DB 구조가 다르다 | 실적 도메인의 단일 기준 타입을 하나로 정리해야 한다 |
| 공휴일 / 요율 / 사용자 / 양식 버전 | 도메인 타입은 일부 존재하지만 SQLite 테이블은 없다 | 운영 관리 화면이 요구하는 핵심 기준정보 저장 구조가 비어 있다 | Phase 2에서 운영 관리용 테이블과 CRUD 계약을 새로 설계해야 한다 |
| 대시보드 집계 | 원시 데이터 소스는 일부 존재한다 | KPI/차트용 집계 결과를 조합하는 저장 구조나 전용 서비스가 없다 | 대시보드는 후순위로 두고 집계 DTO/서비스를 별도 설계한다 |

#### 현재 bridge / IPC 갭 분석
| 영역 | 현재 상태 | 갭 | 정리 방향 |
|------|-----------|----|-----------|
| 인력 관리 | 목록/저장/이력 관련 IPC가 이미 연결돼 있다 | renderer 쪽 소비 계층과 상세 전환 흐름만 없다 | 현 계약 유지 후 화면 연결부터 시작 |
| 근무지 관리 | `listSites`, `saveSite`, `deleteSite`, `listShiftPatterns`, `saveShiftPattern`, `listEmployees`가 연결돼 있다 | 배정 후보는 `listEmployees` 조합 기준이며, 근무표 양식과의 downstream 검증이 남아 있다 | 현 계약을 유지하고 근무표 배포 양식/수동 검증에서 마무리한다 |
| 근무표 배포 | 월간 근무표 저장/미리보기/내보내기 계약이 있다 | 월/근무지 기준 조회, 경로 선택, 배포 후 상태 갱신 흐름이 부족하다 | 기존 계약 보강과 renderer 액션 모델 정리가 필요 |
| 실적 관리 | 대기목록/상세/승인/반려/이력 계약이 이미 있다 | 감시 폴더 상태와 파일 수집 설정을 renderer에서 볼 수 없다 | 운영 설정 계약과 함께 파일 감시 상태 조회를 추가한다 |
| 수당 관리 | 미리보기/확정 계산/결과 목록 계약은 있다 | 월/근무지/직원 기준 필터 조회와 상세 결과 조회 계약이 없다 | 조회용 쿼리 계약과 결과 상세 DTO를 추가한다 |
| 운영 관리 | 전용 bridge 계약이 없다 | 공휴일, 요율, 사용자, 양식, 앱 설정을 읽고 저장할 경로가 전혀 없다 | 운영 관리 bridge를 별도 정의하고 preload/main에 노출해야 한다 |
| 대시보드 | 전용 bridge 계약이 없다 | KPI/차트 집계용 응답 형식과 기간 필터가 없다 | 후순위로 두되 dashboard 전용 집계 계약을 별도로 추가한다 |
| Allowance preview 명명 | 계약 타입은 `previewCalculation`, preload/window 노출 이름은 `previewAllowanceCalculation`이다 | 타입/구현 명명이 불일치해 추후 소비 코드가 혼란스러울 수 있다 | Phase 2에서 bridge 명명을 통일한다 |

#### Phase 2 우선 정리 순서
1. `performance-file.ts`와 `model.ts` 사이의 실적 도메인 중복을 정리한다.
2. 운영 관리에 필요한 SQLite 테이블 후보와 bridge 계약 초안을 확정한다.
3. 기존 allowance preview 계약의 명명 불일치를 정리한다.
4. 근무표/수당 조회 계약에 필요한 필터 단위를 확정한다.
5. 이 결과를 기준으로 Phase 3 renderer 연동에 들어간다.

#### 이번 단계에서 반영된 내용
- `performance-file.ts`를 실적 파일 도메인의 단일 기준 타입으로 유지하고, 중복 정의는 `model.ts`에서 제거했다.
- 운영 관리 foundation으로 공휴일, 요율 버전, 사용자, 양식 버전용 SQLite 테이블을 추가했다.
- 운영 관리 조회용 IPC/bridge/preload 타입을 추가했고, allowance preview bridge 명명을 계약 기준으로 통일했다.
- 운영 관리 seed 데이터와 조회 테스트를 추가해 이후 renderer 연동의 기반을 만들었다.

#### 다음 코드 변경 대상
- `src/shared/bridge/contracts.ts`
- `src/preload/index.ts`
- `src/renderer/vite-env.d.ts`
- `src/main/main.ts`
- `src/main/services/sqlite-storage-service.ts`
- 필요 시 운영 관리용 신규 service/test 파일

#### 품질 게이트
- [ ] SQLite 저장 모델이 필요한 엔터티와 이력 규칙을 지원한다.
- [ ] 예정된 흐름에서 renderer 직접 Node/DB 접근이 필요하지 않다.
- [ ] 로직이 바뀐 계약은 테스트로 커버된다.
- [x] `npm run typecheck`
- [ ] `npm run test`
- [x] `node scripts/validate-structure.mjs`

---

### Phase 3: 인력, 근무지, 근무표 연동
**목표**: 계획 영역의 UI 전용 데이터를 실제 서비스 기반 동작으로 바꾼다.
**예상 기간**: 5-7일
**상태**: 진행 중

#### 작업 항목
- [x] 인력 목록, 상세, 이력 조회 화면을 저장 서비스와 연결한다.
  - 대상 파일: `src/renderer/screens/WorkforceManagementScreen.tsx`
  - 목표: 실제 인력 데이터와 근무지/배정/시급 이력을 화면에서 조회할 수 있게 한다.
- [x] 인력 배정/시급 이력 저장 액션을 renderer에서 연결한다.
  - 대상 파일: `src/renderer/screens/WorkforceManagementScreen.tsx`, 관련 bridge 호출부
  - 목표: 목록 조회를 넘어서 배정 변경과 시급 이력 저장/종료까지 실제 흐름으로 닫는다.
- [x] 근무지 등록 1단계와 2단계를 공유 상태와 저장소에 연결한다.
  - 대상 파일: 근무지 관련 renderer 화면, `site-storage-service.ts`, `shift-pattern-storage-service.ts`
  - 목표: 근무지/패턴 저장과 조별 인력 배정 흐름이 실제 bridge와 SQLite를 사용하도록 바꾼다.
- [x] 근무표 미리보기, 배포, 내보내기 이력 흐름을 연결한다.
  - 대상 파일: `ScheduleManagementScreen`, 근무표 서비스, 내보내기 이력 서비스
  - 목표: 캘린더를 실제 월간 계획 화면으로 전환한다.
- [x] 이 세 메뉴 사이의 라우팅과 상태 연속성을 점검한다.
  - 대상 파일: renderer 라우트 설정과 관련 화면
  - 목표: 화면이 각각 따로 노는 상태를 없앤다.
- [x] 운영 관리 화면의 기준정보 조회를 새 bridge와 연결한다.
  - 대상 파일: `src/renderer/screens/ShiftPatternManagementScreen.tsx`
  - 목표: 공휴일/요율/사용자/양식 버전을 SQLite/bridge 기반 데이터로 표시한다.
- [x] 근무지 상세 보기, 삭제, 패턴/설정 불러오기와 1단계 시뮬레이션 UI 보정을 반영한다.
  - 대상 파일: `SiteManagementScreen.tsx`, `site-storage-service.ts`, 관련 bridge/test, `styles.css`
  - 목표: 실제 운영 흐름에서 근무지 정리 권한과 1단계 검토 사용성을 함께 닫는다.

#### 근무지 패턴 확장 기준
- 하나의 근무지는 다중 `Cycle` 패턴을 가질 수 있고, 각 Cycle은 자체 `패턴String`, `패턴 시작일`, `휴게시간`, `근무시간`, `조별 Index`를 가진다.
- 조는 1개 Cycle에만 속하며, 조별 Cycle 배정 결과를 기준으로 시뮬레이션과 근무표 초안을 생성한다.
- 각 조는 선택적으로 `정원 최대값`을 가질 수 있고, Step 2 조직 구성과 실제 인력 배정 서비스 모두 같은 정원 기준을 사용한다.
- `Pool`은 패턴 Cycle에 포함하지 않고, 별도 근무시간만 저장한다.
- `Pool` 인력은 근무지 배정은 가능하지만 월간 달력 시뮬레이션과 근무표 생성 대상에서는 제외한다.
- 시뮬레이션은 전체 달력 위에 Cycle별 결과를 합쳐 보여주되, 근무시간/총근무시간 요약은 Cycle 단위로 분리해 표시한다.

#### 품질 게이트
- [ ] 인력 CRUD 및 이력 동작이 검증 가능하다.
- [x] 근무지 1단계와 2단계 상태가 끊기지 않는다.
- [x] 근무표 미리보기 데이터가 하드코딩 배열이 아니라 서비스에서 온다.
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run build`
- [ ] 인력/근무지/근무표 흐름에 대한 수동 UI 확인이 완료된다.

---

### Phase 4: 실적 승인과 수당 도메인 연동
**목표**: 승인 흐름과 계산 규칙을 영속적이고 테스트 가능한 도메인 로직으로 연결한다.
**예상 기간**: 5-6일
**상태**: 진행 중

#### 작업 항목
- [x] 실적 대기열, 파일 메타데이터, 승인 액션을 main 서비스와 연결한다.
  - 대상 파일: 실적 renderer 화면, `performance-queue-service.ts`, `performance-approval-service.ts`, 관련 테스트
  - 목표: 승인/반려가 실제 저장 상태와 연결되게 한다.
- [x] 확정 결과에 대한 승인 이력과 스냅샷 정책을 마무리한다.
  - 대상 파일: 승인 흐름 서비스, 저장 서비스, 문서
  - 목표: 승인 결과가 조용히 덮어써지지 않게 한다.
- [x] 수당 요약/상세 UI를 shared domain과 승인 계산 서비스에 연결한다.
  - 대상 파일: 수당 renderer 화면, `allowance-service.ts`, `approved-allowance-calculation-service.ts`, 테스트
  - 목표: 화면용 자리표시 값이 아니라 실제 계산 결과를 사용한다.
- [x] 규칙 변경 전에 설계/예시 기반 회귀 케이스를 다시 만든다.
  - 대상 파일: `src/shared/domain/*.test.ts`, 서비스 테스트, fixture 파일
  - 목표: 계산 변경이 근거 있고 재현 가능하게 만든다.

#### 품질 게이트
- [x] 승인 상태 변경에 추적 가능한 이력이 남는다.
- [x] 승인된 수당 결과가 저장된 입력값으로 다시 계산 가능하다.
- [x] 계산 로직이 renderer에 하드코딩되지 않는다.
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run build`
- [ ] 승인/수당 시나리오 수동 검증이 완료된다.

---

### Phase 5: 데스크톱 파일 자동화와 운영 설정
**목표**: 템플릿, 감시 폴더, 생성 문서 중심의 데스크톱 전용 흐름을 완성한다.
**예상 기간**: 4-5일
**상태**: 진행 중

#### 작업 항목
- [x] 파일 감시 설정과 실적 수집 흐름을 연결한다.
  - 대상 파일: `file-watch-service.ts`, 실적 저장 서비스, 운영 UI
  - 목표: 로컬 환경에서 예측 가능한 방식으로 파일을 감지한다.
- [x] 근무표 내보내기, 수당 산출물, 문서 이력 흐름을 연결한다.
  - 대상 파일: 근무표 내보내기 서비스, 수당/출력 모듈, renderer 액션 연결부
  - 목표: 실제 문서를 생성하고 추적 가능하게 만든다.
- [x] 공휴일, 요율, 사용자, 양식에 대한 설정을 실제 저장소와 연결한다.
  - 대상 파일: 운영 화면, `app-settings-service.ts`, 관련 저장 서비스
  - 목표: 운영 설정을 자리표시 데이터에서 벗어나게 한다.
- [x] 덮어쓰기 방지와 사용자 메시지 표시를 검증한다.
  - 대상 파일: renderer 액션 핸들러, main 서비스, 필요 시 테스트
  - 목표: 승인 결과 보호 규칙과 일치시킨다.

#### 현재 확정된 폴더/양식 운영 기준
- 승인 대기, 승인 완료, 근무표 내보내기 폴더는 운영 관리에서 저장하며 서로 다른 경로를 사용한다.
- 파일 감시는 앱 시작 시 현재 저장 경로 기준으로 기동하고, 경로 변경 뒤에는 감시 재시작으로 새 설정을 반영한다.
- 승인 완료된 원본 실적 파일은 `approved/<YYYY-MM>` 하위 경로로 이동 보관한다.
- 기본 양식 기준 경로는 `양식샘플` 디렉터리의 근무표, 품의서, 별첨1, 별첨2 샘플 파일이다.
- 현재 근무표 Excel 양식은 최대 3개 근무 코드만 지원한다.

#### 품질 게이트
- [x] 감시 폴더 설정 방식이 명시적이고 재현 가능하다.
- [x] Excel/양식 출력이 main 서비스만 통해 동작한다.
- [x] 운영 설정이 앱 재시작 후에도 유지된다.
- [x] `npm run typecheck`
- [ ] `npm run test`
  - Vitest 전체 suite는 현재 runner 종료 시 `ERR_IPC_CHANNEL_CLOSED` 가 발생해 추가 정리가 필요하다.
- [x] `npm run build`
- [ ] 출력 및 파일 감시 수동 검증이 완료된다.

---

### Phase 6: 최종 통합, QA, 배포 준비
**목표**: 통합된 앱을 안정화하고 반복 사용 가능한 상태로 마무리한다.
**예상 기간**: 3-4일
**상태**: 대기

#### 작업 항목
- [ ] 대시보드, 인력, 근무지, 근무표, 실적, 수당, 운영 메뉴 전체에 대해 스모크 체크를 수행한다.
  - 목표: 메뉴 간 흐름이 끊기지 않는지 확인한다.
- [ ] 연동 이후 실제 사용 중 발견된 고우선 UI 문제만 정리한다.
  - 목표: UI 미세 조정은 실제 사용 중 발견된 문제에 한정한다.
- [ ] Electron 로컬 배포 관점의 패키징 가정을 다시 점검한다.
  - 목표: 경로와 에셋 문제를 배포 직전에 발견하지 않게 한다.
- [ ] 최종 문서와 알려진 제한 사항을 업데이트한다.
  - 대상 파일: 필요 시 문서 및 산출물
  - 목표: 재현 가능한 인수 기록을 남긴다.

#### 품질 게이트
- [ ] 주요 메뉴 흐름이 모두 수동 점검된다.
- [ ] 높은 심각도의 blocker가 남아 있지 않다.
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `node scripts/validate-structure.mjs`

---

## 위험 관리

| 위험 | 가능성 | 영향도 | 대응 전략 |
|------|-------------|--------|---------------------|
| 연동 중 UI 범위가 다시 열림 | 중간 | 높음 | UI 기준선을 유지하고, 미세 조정은 별도 목록으로 분리해 요청 시만 반영한다 |
| SQLite/이력 스키마가 후반에 바뀜 | 중간 | 높음 | renderer 연동 전에 Phase 2에서 저장 구조와 이력 정책을 먼저 확정한다 |
| 승인/계산 규칙이 설계와 어긋남 | 중간 | 높음 | 규칙 변경 전 문서와 테스트를 먼저 갱신하고 회귀 fixture를 유지한다 |
| 파일 감시/Excel 경로가 사용자 환경마다 다름 | 높음 | 중간 | Phase 5에서 설정 가능 항목과 수동 검증 절차를 명시한다 |
| 빠른 수정 중 renderer에 비즈니스 로직이 들어감 | 중간 | 높음 | 작업별 변경 파일을 검토하고 UI 측 하드코딩을 거부한다 |

---

## 롤백 전략

### Phase 2 실패 시
- 문제가 있는 메뉴만 mock 기반 모드로 되돌린다.
- 다른 메뉴를 건드리기 전에 미완성 계약 변경을 되돌린다.
- 롤백 이유를 저장 구조 메모에 남긴다.

### Phase 3 또는 Phase 4 실패 시
- 해당 메뉴 연동 커밋 단위로 롤백한다.
- 도메인 및 서비스 테스트를 기준 상태로 유지한다.
- 계약 또는 스키마 갭이 문서화된 뒤에만 작업을 다시 연다.

### Phase 5 실패 시
- 문제가 있는 자동화 진입점을 UI에서 비활성화한다.
- 생성 이력과 원본 파일은 보존한다.
- 마지막으로 수동 검증된 출력/감시 설정 상태에서 다시 시작한다.

---

## 진행 현황

### 단계별 진행률
- **Phase 1**: 완료 100%
- **Phase 2**: 진행 중 75%
- **Phase 3**: 진행 중 94%
- **Phase 4**: 진행 중 90%
- **Phase 5**: 진행 중 88%
- **Phase 6**: 대기 0%

**전체 진행률**: 80%

### 시간 추적
| 단계 | 예상 | 실제 | 차이 |
|-------|-----------|--------|----------|
| Phase 1 | 1-2일 | 완료 | - |
| Phase 2 | 4-6일 | 진행 중 | 운영 관리 foundation, 실적 도메인 정리, allowance 계약 명명 통일에 더해 양식 버전/이력/기본 사용/파일명 규칙 저장 구조까지 반영했다. 남은 핵심은 공휴일·요율·사용자 탭을 같은 수준으로 확장하는 일이다 |
| Phase 3 | 5-7일 | 진행 중 | 인력, 근무지, 근무표, 운영 관리 조회 연동은 완료됐고 근무표 양식 2종 선택 배포, 템플릿 프로필 편집기, 배포 화면 압축 UX까지 반영했다. 인력 CRUD 최종 검증과 화면 수동 확인이 남아 있다 |
| Phase 4 | 5-6일 | 진행 중 | 승인/수당 연동, 재승인/선지급 정책, 회귀 케이스는 현재 기준선으로 정리됐다. 남은 핵심은 Electron smoke 환경 정리와 운영 시나리오 마감이다 |
| Phase 5 | 4-5일 | 진행 중 | 경로 설정, 감시 런타임, intake, 원본 보관, Excel/PDF 출력은 연결됐고 전체 Vitest 종료 이슈까지 정리했다. 남은 핵심은 출력/패키징 최종 점검이다 |
| Phase 6 | 3-4일 | - | - |
| **합계** | 22-30 작업일 | - | - |

---

## 메모와 학습 내용

### 현재 메모
- 기본 UI 재배치는 사용 가능한 체크포인트까지 왔으며, 이제는 최종 디자인보다 연동 기준선으로 다룬다.
- 기존 main 서비스와 shared domain 테스트가 이미 존재하므로, 다음 단계는 연동 중심으로 진행하는 것이 맞다.
- 이후 UI 변경은 디자인 취향이 아니라 실제 사용 흐름에서 발견된 문제를 근거로만 수행한다.
- 운영 관리 기준정보는 SQLite와 bridge 기준선뿐 아니라 renderer 조회 연결까지 완료됐고, 다음 단계는 저장 액션과 외부 API/설정 저장 흐름을 구체화하는 일이다.
- 실적 파일 도메인 기준 타입은 `src/shared/domain/performance-file.ts`로 수렴시켰다.
- 인력 관리 화면은 실제 인력 목록, 상세, 배정 이력, 시급 이력을 조회하도록 바뀌었고 신규 인력 저장도 실제 bridge를 사용한다.
- 인력 상세 화면은 이제 배정 이력과 시급 이력을 renderer에서 직접 저장/종료할 수 있고, `고용형태`, `상태`, `퇴사 처리일`을 상세 화면에서 수정할 수 있다. `퇴사 처리일`부터는 월간 근무표 생성 대상에서 자동 제외된다.
- 근무지 관리 화면은 이제 실제 근무지/패턴 저장, 다중 `Cycle`/`Pool` 운영 구조, 선택형 근무 시각 입력, Step 2 드래그앤드롭 조배정/해제, 조별 `정원 최대` 검증까지 실제 employee assignment bridge와 저장소 규칙으로 처리한다.
- 근무지 상세 보기에서는 soft delete 기반 `근무지 삭제`를 지원하고, 이미 실적에 반영된 데이터는 유지한 채 목록에서만 제거한다. 등록/수정 1단계에는 `패턴 및 설정정보 불러오기`, 시간대 입력 제거, 시뮬레이션 범례/달력 색상 일치, `오늘` 배지 줄바꿈 방지까지 반영했다.
- 근무표 관리 화면은 이제 실제 월간 스케줄 초안을 shared domain 유틸에서 생성하고, 선택 근무지의 조별 편성/제외 사유를 함께 보여주며, 단일 `배포` 흐름과 `미배포/배포완료` 상태로 단순화했다. 배포 직전에는 근무지와 기준 월을 포함한 확인 문구를 한 번 더 표시한다.
- 현재 근무표 Excel 양식은 최대 3개 근무 코드만 지원하므로, 4개 이상 교대 코드를 쓰는 패턴은 월간 초안 생성 단계에서 제한한다.
- 앱 전역 workflow context로 현재 메뉴, 선택 근무지, 선택 근무월을 공유하도록 바꿨고, `artifacts/scripts/electron-workflow-smoke.cjs` 로 `인력 관리 -> 근무표 배포 -> 근무지 관리 -> 근무표 배포` 연속 흐름을 Electron 기준으로 확인했다.
- 실적 관리 화면은 이제 실제 승인대기 파일 목록, 파일 메타데이터/미리보기/파싱 엔트리 상세, 승인/반려 액션, 승인 이력을 모두 bridge 기준으로 표시한다.
- `artifacts/scripts/electron-performance-smoke.cjs` 로 `로그인 -> 실적 관리 -> 승인대기 선택 -> 상세/이력 확인` 읽기 전용 흐름을 Electron 기준으로 검증했다.
- 승인 완료 뒤 수당 계산은 더 이상 현재 파일 상세를 다시 읽지 않고 승인 시점 `snapshot_json` 만 기준으로 재현하며, 승인/반려된 실적 파일은 다른 원본으로 같은 ID를 덮어쓸 수 없게 막았다.
- 수당 관리 화면은 이제 실제 계산 결과 목록, 미산출 승인 목록, 요율 버전, 유형별 합계, 상세 line breakdown을 bridge 기준으로 보여주고 `artifacts/scripts/electron-allowance-smoke.cjs` 로 `로그인 -> 승인 -> 수당 산출 -> 수당 화면 확인` 흐름을 임시 저장소에서 검증한다.
- shared 계산 회귀에는 설계서의 `시작된 4시간마다 30분 휴게` 예시와 `22:00~06:00 구간 - 휴게시간` 야간 계산 예시를 반영했다.
- 승인된 `별첨1`의 `근무시간`은 현재 파일 형식상 이미 확정된 시간으로 취급하고 있으며, start/end 시각이 없는 동안에는 승인 수당 서비스에서 휴게를 다시 차감하지 않는다.
- `artifacts/scripts/electron-approval-allowance-smoke.cjs` 로 `로그인 -> 실적 관리에서 반려 1건/승인 1건 처리 -> 수당 관리에서 미산출 목록 확인 -> 산출 실행 -> 승인 메모 반영 확인` 흐름을 임시 저장소 기준으로 검증한다.
- 운영 관리 화면에서 승인대기/승인완료/근무표 내보내기 경로와 공휴일 API 주소를 저장할 수 있게 했고, 이 설정은 SQLite에 남아서 이후 근무표 내보내기/배포 서비스가 같은 경로를 재사용한다.
- `artifacts/scripts/electron-operations-settings-smoke.cjs` 로 `로그인 -> 운영 관리에서 경로 저장 -> 실적 관리에서 경로 반영 확인` 흐름을 임시 저장소 기준으로 검증한다.
- `file-watch-runtime-service` 로 앱 시작 시 파일 감시를 자동 기동하고, 운영 관리와 실적 관리 화면에서 현재 감시 경로, 최근 이벤트, 감시 재시작/중지 상태를 볼 수 있게 했다.
- `artifacts/scripts/electron-file-watch-status-smoke.cjs` 로 `로그인 -> 운영 관리에서 경로 저장/감시 재시작 -> 테스트 파일 생성 감지 -> 실적 관리 반영 확인` 흐름을 임시 저장소 기준으로 검증한다.
- 운영 관리의 양식 탭은 이제 `양식등록 1단계/2단계 -> 미승인 저장 -> 승인 -> 기본 사용 전환 -> 수정/삭제 -> 이력 확인`까지 실제 bridge/SQLite 기준으로 동작한다.
- 양식 프로필 편집기는 근무표/품의서/별첨1/별첨2를 같은 승인형 흐름으로 다루고, 근무표는 샘플 2종 기반 좌표/프로필 편집과 미리보기 저장을 지원한다.
- 근무표 배포는 `근무표 양식 1/2` 선택, 월별 저장 경로 규칙, 날짜/공휴일 색상 반영, 좌측/우측 요약 카드 압축까지 정리했다.
- 운영 관리의 공휴일, 요율, 사용자 탭은 아직 seed/list 중심이며, 실제 생성/수정/동기화 액션은 다음 단계 범위로 남아 있다.
- 실적 대기열은 더 이상 앱 런타임에서 샘플 파일을 강제로 주입하지 않고, 실제 pending 폴더의 Excel 파일을 초기 scan과 watcher add/change/unlink 이벤트 기준으로 SQLite에 동기화한다.
- `performance-file-intake-service` 와 관련 테스트로 pending 폴더 초기 intake, 삭제 반영, 승인된 파일 보호 규칙을 검증했고, Electron 스모크는 임시 데이터 폴더에 샘플 파일을 명시적으로 seed 하도록 바꿨다.
- 승인 처리 시 원본 실적 파일은 `approved` 폴더의 월별 하위 경로로 이동 보관하고, 승인 이력과 `performance_files` 메타데이터에 실제 보관 경로를 남긴다.
- 반환 근무표 기반 실적 파서는 이제 양식 1/2를 함께 읽고, 빈 슬롯 표시 `-` 는 근무자로 해석하지 않도록 정리했다.
- 실적 관리 화면은 `승인대기 / 승인완료` 필터를 지원하고, 승인완료 조회 시 `저장된 승인 경로/YYYY-MM` 하위 폴더를 자동 스캔해 월별 실적 파일을 다시 파싱한다.
- 같은 실적의 재승인은 이전 승인 이력과 계산 결과를 남긴 채 최신 승인본만 유효하도록 다루는 방향으로 저장 구조를 정리했다.
- 수당 관리 화면의 `품의 신청`은 현재 필터 기준 결과를 실제 Excel 3종으로 출력하고, 출력 이력은 SQLite에 별도로 남긴다. 현재는 동일 계산월 결과만 함께 출력하도록 제한한다.
- `artifacts/scripts/electron-allowance-document-smoke.cjs` 로 `로그인 -> 승인 -> 수당 산출 -> 품의 신청 -> export 폴더 3개 파일 생성` 흐름을 임시 저장소 기준으로 검증한다.
- 대시보드는 승인/수당/인력/근무지 원시 데이터를 조합한 실데이터를 우선 사용하지만, 산출 결과가 없을 때는 demo fallback을 사용한다. 최종 성공 기준을 위해 전용 집계/empty state 정리가 필요하다.
- `document-template-management-service` 의 승인본 편집 경로는 Windows에서 `copy -> delete` 대신 `rename` 으로 바꿔 worker 종료 이슈를 피하도록 정리했다.
- Vitest는 `forks + singleFork + fileParallelism: false` 기준으로 안정화했고, 현재 전체 suite `39 files / 151 tests` 가 통과한다.
- `npm run typecheck`, `npm run test`, `npm run build`, `node scripts/validate-structure.mjs` 를 2026-03-23 기준으로 다시 통과시켰다.
- Electron smoke 스크립트는 `playwright` 패키지가 현재 로컬 의존성에 없어 바로 실행되지는 않으며, 이는 다음 단계에서 실행 환경을 정리해야 한다.

### 작업 보고 규칙
- 새 작업은 항상 짧은 범위 요약과 대상 파일 공유로 시작한다.
- 완료 보고에는 변경 영역, 검증 결과, 남은 우려 사항을 포함한다.
- 작업이 합의 범위를 넘기 시작하면 멈추고 다시 확인한다.

---

## 참고 문서

### 프로젝트 문서
- `docs/development-direction.md`
- `docs/project-rules.md`
- `docs/ui-design-brief.md`
- `.context/architecture.md`
- `shftMgmgt설계_V3.4.md`

### 참조 양식
- `C:\Projects\Tools\cc-feature-implementer-main\plan-template.md`

### 주요 구현 영역
- `src/main/services`
- `src/shared/bridge/contracts.ts`
- `src/shared/domain`
- `src/renderer`

---

## 최종 체크리스트

**계획 완료로 표시하기 전 확인할 항목**:
- [ ] 모든 단계가 완료되고 필요한 검증 게이트를 통과한다.
- [ ] 핵심 메뉴 흐름이 실제 데이터 또는 실제 파일 흐름으로 검증된다.
- [ ] 최종 동작과 제약 사항이 문서에 반영된다.
- [ ] 승인 결과와 계산 흐름이 재현 가능하게 유지된다.
- [ ] renderer/main/preload 경계가 끝까지 유지된다.
- [ ] 사용자 검토 체크포인트가 실행 과정 전반에서 지켜진다.

---

**계획 상태**: 진행 중
**2026-03-23 마감 메모**:
- 우선순위 1~3 범위는 코드, 테스트, 문서 정리까지 마감했다.
- `npm run test`, `npm run typecheck`, `npm run build`, `node scripts/validate-structure.mjs` 를 다시 확인했고 모두 통과했다.
- Electron smoke 스크립트는 로컬 `playwright` 미설치로 실행 환경 정리 작업만 남겨두고 다음 작업으로 이월한다.
**다음 작업**:
1. 운영 관리의 공휴일, 요율, 사용자 탭을 저장/수정/동기화 액션까지 확장한다.
2. 대시보드 실데이터 집계와 empty state, 문서 출력 후속 polish를 마감 수준으로 정리한다.
3. Electron smoke 스크립트 실행 환경과 패키징/릴리스 점검을 마무리한다.
**보류 작업**:
- Playwright 기반 Electron smoke 스크립트 실행 환경 정리
- 운영 관리의 남은 수동 검증과 메뉴별 마감 정리
- 대시보드 집계와 empty state의 실데이터 기준 정리
- Phase 6 스모크, 패키징 점검, 최종 사용자 문서 업데이트
**현재 blocker**: 없음
