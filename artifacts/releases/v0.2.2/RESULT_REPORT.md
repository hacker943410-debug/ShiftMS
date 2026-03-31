# V0.2.2 결과 보고서

## 1. 작업 개요
- 버전 목표: `0.2.2`
- 작업 브랜치: `feature/v0.1.1-patch-finalize`
- 작업 일시: `2026-03-31`
- 최종 범위:
  - 우측 상단 `내 정보` 모달 추가 및 세션 정보 통합
  - 좌측 `세션 정보` 패널 제거
  - `접속 이력 관리` 메뉴 및 조회 기능 추가
  - 인력 관리 `시급 일괄 업데이트` 열 입력 대문자 고정
  - 인력 관리 `고용형태`, `배정상태` 표시 보정
  - 운영 관리 `DB 자동백업 설정` 시간 선택 UI 개선
  - 수당 관리 정렬/필터 보강
  - 품의서/별첨 PDF 출력 포맷 보정
  - 실적 관리 승인완료 목록 행 숨김 처리 추가
  - 독립 연장근무 실적의 수당 계산 보정 및 기존 저장 이력 복구
  - 윈도우 앱 아이콘 투명 배경 재생성

## 2. 구현 결과 요약
- 공통 셸:
  - 우측 상단 프로필 요약을 버튼으로 바꾸고, 클릭 시 `내 정보` 모달에서 계정 정보와 세션 정보를 함께 확인할 수 있게 했다.
  - 로그아웃 동선은 좌측 사이드바가 아니라 `내 정보` 모달 안으로 옮겼다.
  - 운영 관리 전용 `접속 이력 관리` 화면을 추가해 로그인, 로그아웃, 화면 이동 기록을 날짜/사용자/액션/키워드 기준으로 조회할 수 있게 했다.
- 인력 관리:
  - `시급 일괄 업데이트`의 `근무지명 열`, `이름 열`, `시급 열` 입력은 영문 대문자만 유지되도록 고정했다.
  - `근무 인력 관리` 테이블의 `고용형태`는 공통 정규화 기준으로 표기하고, Access 이관 시 원천 필드를 우선 사용하도록 맞췄다.
  - `배정상태`는 `배정중` 아래에 `(근무지명, 조명)` 보조 문구를 줄바꿈으로 표시하도록 정리했다.
- 운영 관리/수당 관리:
  - `DB 자동백업 설정`의 백업 시간 입력은 텍스트형 time input 대신 시간/분 선택형 UI로 교체해 기존 근무지 등록 시간 입력과 시각적 기준을 맞췄다.
  - `수당 산출 현황`의 전체 조회는 최신 근무일 우선으로 정렬되도록 조정했다.
  - `수당 이력` 상단에 `현재상태` 필터를 추가해 `전체 / 재직중 / 휴직 / 퇴사` 기준으로 이력을 좁혀 볼 수 있게 했다.
- PDF 출력:
  - 품의서, 별첨1, 별첨2 PDF의 금액 표기는 모두 `원` 형식으로 맞췄다.
  - 별첨1 PDF는 `기본 / 연장 / 야간` 병합 컬럼 아래에 각각 `시간 / 요율 / 수당`을 표시하도록 재구성했다.
  - 별첨1 PDF 요율 표기는 `x0`, `x0.5`, `x1.5` 형식으로 통일했고, `수당 = 시간 x 요율 x 시급` 결과를 직접 표기한다.
  - 별첨1 PDF에 `유형구분` 컬럼을 추가해 일반 근무는 `평일`, 등록 공휴일은 해당 `공휴일명`을 표시하도록 했다.
  - 별첨1 PDF의 등록 공휴일 `근무일` 셀은 연한 붉은색으로 하이라이트되도록 보강했다.
  - 별첨1 PDF의 `적용 요율 설명`은 항목 수와 총 줄 수를 기준으로 1열, 2열, 3열 레이아웃을 동적으로 선택해 불필요한 추가 페이지를 줄이도록 바꿨다.
  - 별첨1 PDF는 각 유형별 `소계` 아래 전체 시간/수당을 다시 묶는 `총소계` 행을 추가해 검토자가 문서 한 장에서 전체 합산값을 바로 확인할 수 있게 했다.
  - 별첨2 PDF는 `근무일`, `이름` 값을 가운데 정렬하고 `근무일` 열을 함께 표시하도록 정리했다.
  - 별첨2 PDF 하단 최종 합계 행도 `총소계` 기준으로 정리해 대체/연장/법정휴일 수당 전체 합산값을 명확히 표시하도록 맞췄다.
- 실적 관리:
  - 기존 `미승인 파일 삭제` 구현은 제거했다.
  - 대신 승인완료 목록에 대해서만 `목록삭제`를 지원하고, 실제 파일/승인 이력/수당 이력은 보존한 채 목록 표시만 숨기도록 변경했다.
  - 숨김 대상은 `최신 승인 이력`, `승인완료 보관본`, `수당 이력 미연결` 조건을 모두 만족해야 한다.
  - `목록삭제` 버튼은 기본 숨김으로 두고, 실제로 숨김 가능한 승인완료 행에서만 `수당 이력 미반영 행` 안내와 함께 노출되게 조정했다.
- 앱 아이콘:
  - 기존의 짙은 배경 사각형 아이콘을 제거하고, 브랜드 심볼 기반 투명 배경 아이콘으로 다시 생성했다.

## 3. 판교DC 2026-03 연장수당 이슈 분석 및 조치
- 재현 데이터:
  - `김영서 / 2026-03-21 / 20:00~22:00 / 휴게 30분`
  - `이상우 / 2026-03-24 / 08:00~10:30 / 휴게 30분`
- 문제 상태 확인 결과:
  - 두 건 모두 `work_type = overtime`인데 저장된 분해값이 `base_work_minutes > 0`, `overtime_minutes = 0`으로 들어가 있었다.
  - 그 결과 승인 후 생성된 수당 계산도 `total_allowance_amount = 0`이었다.
- 원인:
  - 독립 `연장근무` 행도 일반 근무처럼 `기본 8시간 우선 배정` 규칙을 타고 있었고, 짧은 연장근무는 전부 `기본`으로 들어가 연장수당이 0원으로 계산됐다.
- 수정:
  - `work_type = overtime`일 때는 비야간 구간 전체를 `연장`으로 계산하도록 공통 시간 분해 로직을 수정했다.
  - Access 이관 데이터도 같은 기준으로 정규화하도록 보정했다.
  - 이미 저장된 `performance_entries`, `performance_approvals.snapshot_json`, `allowance_calculations`, `allowance_calculation_items`를 함께 복구하는 보정 서비스를 추가했다.
- 실데이터 적용 결과:
  - 복구 실행 요약: `repairedEntryCount = 3`, `repairedApprovalCount = 2`, `repairedCalculationCount = 2`
  - `김영서 / 2026-03-21`: `base 90 -> 0`, `overtime 0 -> 90`, `total_allowance_amount = 30,749원`
  - `이상우 / 2026-03-24`: `base 120 -> 0`, `overtime 0 -> 120`, `total_allowance_amount = 40,998원`
  - 추가로 `김미영 / 2026-03-15` 독립 연장근무 1건도 분해값은 정상화됐지만, 승인/수당 이력은 없어서 계산 이력 재생성 대상은 아니었다.
- 안전 조치:
  - 실DB 보정 전 백업 경로: `C:\Users\pangyo\AppData\Roaming\shiftmgmt-v3-4\data\repair-backup-20260331-153941`

## 4. 실적 목록삭제 설계 이유
- 사용자가 원하는 것은 `승인완료 목록에서 필요 없는 행 제거`이지, 원본 파일 삭제나 승인/수당 이력 삭제가 아니었다.
- 파일 단위 삭제는 승인 이력과 수당 이력을 깨뜨릴 수 있고, 복구 범위도 커진다.
- 행 단위 실제 삭제도 승인 문맥과 수당 정산 추적을 손상시킬 수 있다.
- 그래서 `목록삭제 = 승인완료 목록에서만 숨김`으로 정의했다.
- 이 방식은 다음을 보장한다.
  - 원본 파일 보존
  - 승인 이력 보존
  - 수당 이력 보존
  - 최신 승인행만 대상으로 제한
  - 이미 수당 이력이 연결된 행은 숨김 차단

## 5. 별첨1/접속 이력 추가 설계 이유
- 별첨1의 `유형구분`은 `평일`과 실제 `공휴일명`을 직접 보여줘야 현장 검토 시 날짜와 운영 기준을 문서에서 즉시 대조할 수 있다.
- `적용 요율 설명`은 고정 줄바꿈 기준으로 두면 버전 수가 늘어날수록 불필요한 추가 페이지가 계속 발생하므로, 항목 수와 줄 수 기준으로 열 수를 자동 조절하는 쪽이 유지보수와 가독성 모두에 유리하다.
- 별첨1/별첨2의 `총소계`는 유형별 소계만 보고 전체 합산을 다시 계산해야 하는 번거로움을 줄이기 위한 조치다. 검토 문서에서는 전체 합산값이 한 줄로 고정돼 있는 편이 확인과 결재가 빠르다.
- `접속 이력 관리`는 로그인/로그아웃뿐 아니라 화면 이동까지 남겨야 운영자가 실제 사용 흐름을 복기할 수 있다. 그래서 세션 단발 이벤트만 저장하지 않고 `route-view`도 함께 기록하도록 설계했다.
- `목록삭제` 버튼 기본 숨김은 잘못된 오조작 가능성을 줄이기 위한 조치다. 사용자가 삭제 가능한 행만 인지하도록 하고, 동시에 `수당 이력 미반영 행` 안내로 삭제 안전 범위를 명시했다.

## 6. 주요 변경 파일
- 수정 파일:
  - `src/shared/domain/calculation.ts`
  - `src/shared/domain/calculation-fixtures.ts`
  - `src/shared/domain/performance-file.ts`
  - `src/shared/domain/access-log.ts`
  - `src/shared/bridge/contracts.ts`
  - `src/preload/index.ts`
  - `src/main/main.ts`
  - `src/main/services/performance-management-service.ts`
  - `src/main/services/performance-approval-service.ts`
  - `src/main/services/sqlite-storage-service.ts`
  - `src/main/services/database-migration-service.ts`
  - `src/main/services/allowance-document-export-service.ts`
  - `src/main/services/allowance-document-pdf-service.ts`
  - `src/main/services/access-log-service.ts`
  - `src/renderer/screens/PerformanceManagementScreen.tsx`
  - `src/renderer/screens/AllowanceManagementScreen.tsx`
  - `src/renderer/screens/operations-management/OperationsSettingsSection.tsx`
  - `src/renderer/components/DashboardShell.tsx`
  - `src/renderer/components/TimeValuePicker.tsx`
  - `src/renderer/screens/AccessHistoryScreen.tsx`
  - `src/renderer/route-config.ts`
  - `src/renderer/styles.css`
  - `docs/patch-notes.md`
- 신규 파일:
  - `src/main/services/performance-approved-row-visibility-service.ts`
  - `src/main/services/performance-approved-row-management-service.ts`
  - `src/main/services/performance-overtime-repair-service.ts`
  - `src/main/services/access-log-service.ts`
  - `src/main/services/performance-approved-row-management-service.test.ts`
  - `src/main/services/performance-overtime-repair-service.test.ts`
  - `src/main/services/access-log-service.test.ts`
  - `src/renderer/components/TimeValuePicker.tsx`
  - `src/renderer/screens/AccessHistoryScreen.tsx`
  - `src/shared/domain/access-log.ts`
- 삭제 파일:
  - `src/main/services/performance-file-deletion-service.ts`
  - `src/main/services/performance-file-deletion-service.test.ts`

## 7. 검증 결과
- 타입 점검: `통과`
  - `npm run typecheck`
- 테스트: `통과`
  - `npm run test`
  - 총 `52`개 파일, `201`개 테스트 통과
- 빌드: `통과`
  - `npm run build`
- Electron UI 회귀:
  - 기존 `내 정보`/DatePicker 기준 스모크는 유지 가능한 상태이며, `docs/patch-notes.md`에 누적 기록했다.

## 8. 비고
- 승인완료 목록 `목록삭제`는 실제 삭제가 아니라 숨김 처리다.
- 숨김 정책은 `hidden_approved_performance_rows` 테이블에 별도 기록되며, 승인 이력 테이블이나 수당 계산 테이블은 직접 삭제하지 않는다.
- 독립 연장근무 보정 로직은 앱 시작 시에도 자동 실행되도록 연결해 두었다.
