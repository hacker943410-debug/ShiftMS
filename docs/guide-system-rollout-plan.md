# 가이드 시스템 롤아웃 계획

## 문서 목적
- 전 메뉴와 기능별 `가이드 보기`를 하나의 공통 구조로 통합한다.
- 구현 순서와 Todo를 배치 단위로 관리한다.
- 기존 부분 가이드 구현을 재사용하면서 중복 UI를 줄인다.

## 현재 전제
- 기준 버전: `0.3.0`
- 다음 대형 패치에서 전역 가이드 시스템을 도입한다.
- 가이드는 실제 제품 화면과 동일한 정보 구조를 유지하되, 영상 파일 대신 `SVG/CSS 기반 모션 그래픽`으로 구현한다.
- 메뉴별 `가이드 보기`는 공통 플레이어를 사용하고, 복잡한 기능은 세부 가이드를 추가로 연결한다.

## 현재 자산
- 공통 모달 초안: `src/renderer/components/GuideModal.tsx`
- 도식 컴포넌트: `src/renderer/components/SpreadsheetGuideFigure.tsx`
- 기존 부분 가이드:
  - 인력 관리 `시급 일괄 업데이트`
  - 근무지 관리 `패턴 적용된 근무지 추가`

## 최종 목표
1. 모든 메뉴 상단에서 해당 메뉴의 가이드를 열 수 있다.
2. 모든 가이드는 `소개 -> 목차 -> 기능별 상세 페이지` 구조를 가진다.
3. 상세 페이지는 `이전 / 다음 / 진행률 / 현재 위치`를 제공한다.
4. 상세 페이지는 실제 클릭 흐름을 설명하는 마우스 포인터 이동, 클릭, 강조, 상태 변화를 모션으로 보여준다.
5. 복잡한 기능은 메뉴 가이드에서 개별 기능 가이드로 이어질 수 있다.

## 공통 구조

### 1. 전역 가이드 엔진
- 새 공통 컴포넌트 `GuideFlowModal`을 만든다.
- 기본 구성:
  - 제목
  - 현재 페이지 번호 / 전체 페이지 수
  - 진행률 바
  - `이전`, `다음`, `닫기`
  - 목차 이동
  - 좌측 비주얼 / 우측 설명 레이아웃

### 2. 가이드 데이터 모델
- 메뉴별 가이드 내용을 코드 내부 하드코딩이 아니라 데이터 구조로 분리한다.
- 페이지 타입:
  - `intro`
  - `toc`
  - `feature`
- `feature` 페이지는 아래 정보를 가진다.
  - 기능명
  - 실무 용도
  - Step 목록
  - 모션 씬 정의
  - 주의사항 / 선행조건 / 결과

### 3. 모션 씬 라이브러리
- 공통 씬 primitive를 먼저 만든다.
- 1차 primitive 후보:
  - 마우스 포인터 이동
  - 클릭 ripple
  - 버튼 강조
  - 입력 필드 focus
  - 드롭다운 열기
  - 탭 전환
  - 테이블 행 선택
  - 모달 열기
  - 저장 성공 상태
  - 문서 출력 / 백업 완료 상태

### 4. 진입 방식
- 기본 진입: 각 메뉴 상단 `가이드 보기`
- 추가 진입: 복잡한 기능 모달 또는 섹션 안의 세부 `가이드 보기`
- 추천 기준:
  - 메뉴 전체 흐름 설명은 상단 공통 버튼
  - Excel Import, 패턴 산출, 품의 승인, DB업데이트 같은 복잡 기능은 별도 세부 버튼 유지

### 5. 기존 GuideModal 이관 규칙
- 기존 `GuideModal` 사용처는 즉시 제거하지 않고 유지한다.
- 새 `GuideFlowModal` 은 메뉴 소개/목차/상세 페이지 구조가 필요한 메뉴 단위 가이드부터 우선 적용한다.
- 기존 단건 가이드는 배치 4와 배치 5에서 `소개 -> 목차 -> 상세` 흐름으로 점진 이관한다.
- 이관 전까지는 기존 `GuideModal` 과 새 `GuideFlowModal` 이 병행될 수 있다.

## 배치 전략

### 배치 1. 공통 엔진
목표:
- 공통 플레이어와 데이터 구조를 먼저 안정화한다.
- 기존 `GuideModal` 단건 모달을 대체할 수 있는 기반을 만든다.

포함 작업:
- `GuideFlowModal` 공통 UI
- 가이드 데이터 타입 정의
- 공통 모션 씬 컴포넌트
- 상단 `가이드 보기` 진입 버튼 연결 방식 정리
- 기존 `GuideModal` 사용처를 새 구조로 흡수할 수 있게 변환 규칙 정의

완료 기준:
- 샘플 메뉴 1개에서 소개/목차/상세 페이지 이동이 동작한다.
- SVG/CSS 포인터 모션이 정상 재생된다.

### 배치 2. 핵심 업무 흐름 메뉴
우선 대상:
- 대시보드
- 실적 관리
- 수당 관리

선정 이유:
- 운영자가 가장 자주 보는 실무 흐름이다.
- `실적 승인 -> 수당 승인 -> 품의 승인` 설명 가치가 가장 크다.

완료 기준:
- 각 메뉴에 공통 `가이드 보기`가 붙는다.
- 메뉴 소개/목차/핵심 기능 상세 페이지가 모두 연결된다.

### 배치 3. 운영/기준정보 메뉴
대상:
- 운영 관리
- 활동 이력
- 근무표 배포

선정 이유:
- 운영 기준 설정과 추적 기능은 업무 표준화에 중요하다.
- `DB업데이트`, 공휴일, 요율, 사용자, 양식은 세부 기능 분기가 많다.

완료 기준:
- 운영 관리는 메뉴 소개 외에 탭별 이동 구조가 목차에 반영된다.
- 활동 이력은 필터, 조회, 상태 해석 중심으로 정리된다.

### 배치 4. 기준 마스터 메뉴
대상:
- 인력 관리
- 근무지 관리

선정 이유:
- 기존 부분 가이드 자산이 있어 재사용성이 높다.
- 세부 기능 수가 많아 공통 엔진 안정화 뒤 진행하는 편이 안전하다.

완료 기준:
- 기존 `시급 일괄 업데이트`, `패턴 적용된 근무지 추가` 가이드를 새 플레이어 구조로 이관한다.
- 인력/근무지 일반 흐름도 메뉴 단위 가이드에 포함한다.

### 배치 5. 복잡 기능 세부 가이드 확장
대상 기능:
- 시급 일괄 업데이트
- 패턴 적용된 근무지 추가
- 품의 승인
- DB업데이트
- 양식 등록 / 승인 / 기본 사용
- 향후 추가되는 복잡 모달 기능

완료 기준:
- 각 기능이 메뉴 가이드 또는 기능 버튼에서 개별 상세 가이드로 진입 가능하다.
- 모든 세부 가이드는 Step 기반 모션 씬을 가진다.

## 메뉴별 가이드 기본 구성

### 대시보드
- 첫 페이지: 대시보드 역할, 월별 집계 확인 용도
- 목차: KPI, 차트, 필터, 내보내기
- 상세: 연도/월 필터, 차트 읽기, 내보내기 흐름

### 인력 관리
- 첫 페이지: 인력 등록, 배정, 시급 이력 관리
- 목차: 목록 조회, 신규 등록, 상세, 시급 이력, 일괄 업데이트
- 상세: 기능별 Step + 기존 일괄 업데이트 가이드 이관

### 근무지 관리
- 첫 페이지: 근무지 등록, 패턴, 조직 구성
- 목차: 1단계 등록, 2단계 조직, 상세 보기, 패턴 산출
- 상세: 기능별 Step + 기존 패턴 산출 가이드 이관

### 근무표 배포
- 첫 페이지: 월간 근무표 확인과 배포
- 목차: 월 선택, 근무지 선택, 양식 선택, 배포, 이력
- 상세: 기능별 Step

### 실적 관리
- 첫 페이지: 승인대기 검토와 승인 흐름
- 목차: 필터, 승인, 재승인, 비교, 승인 이력
- 상세: 실제 승인 흐름 Step

### 수당 관리
- 첫 페이지: 수당 산출 검토, 승인, 품의 승인, 문서 출력
- 목차: 상태 검토, 행 승인, 근무지 승인, 품의 승인, 품의 이력
- 상세: `검토대기 -> 승인 -> 품의 승인 -> 백업` 흐름

### 운영 관리
- 첫 페이지: 경로, 공휴일, 요율, 사용자, 양식, DB업데이트
- 목차: 하위 탭 소개
- 상세: 하위 탭별 Step

### 활동 이력
- 첫 페이지: 업무 추적과 감사용 조회
- 목차: 날짜 필터, 사용자 필터, 액션 필터, 해석 방법
- 상세: 기능별 Step

## 구현 원칙
1. 외부 영상 파일, gif, 무거운 리소스를 기본 전제로 두지 않는다.
2. 렌더러 내부 SVG/CSS 애니메이션으로 구현한다.
3. 실제 화면 구조와 최대한 같은 정보 위계를 유지한다.
4. 설명은 운영자 기준 한국어로 작성한다.
5. 장식용 애니메이션보다 `실제 사용 순서` 설명을 우선한다.
6. 공통 플레이어와 콘텐츠 데이터를 분리해 유지보수성을 확보한다.

## 리스크
- 전 메뉴/전 기능을 한 번에 넣으면 콘텐츠 작성량이 급격히 커진다.
- 화면 구조가 바뀌면 가이드 씬도 같이 수정돼야 한다.
- 기능별 세부 가이드가 너무 많아지면 오히려 탐색성이 떨어질 수 있다.

## 대응 전략
- 메뉴 공통 가이드와 세부 기능 가이드를 분리한다.
- 공통 씬 primitive를 먼저 만든다.
- 1차는 핵심 업무 흐름 메뉴부터 넣고 나머지는 배치로 확장한다.
- 기존 부분 가이드는 새 구조에 맞게 재사용한다.

## Todo

### 공통 엔진
- [x] `GuideFlowModal` 공통 플레이어 설계
- [x] 가이드 데이터 타입 정의
- [x] 공통 모션 씬 primitive 정의 (`motion-primitives.tsx` 분리 완료 — 2026-04-02)
- [x] 상단 공통 `가이드 보기` 진입 UI 추가
- [x] 기존 `GuideModal` 자산 이관 전략 정리
- [x] `GuidePageDefinition`에 `preconditions`, `outcome` 선택 필드 추가 (2026-04-02)
- [x] `GuideFlowModal` 공통 UI 재배치 1차 (`GuideFlowModal.tsx`, `styles.css`, batch3~5 smoke 재검증 — 2026-04-02)
- [x] 가이드 smoke 공통 helper 및 가시 영역 검증 추가 (`guide-smoke-helpers.cjs`, overlay viewport assertion — 2026-04-02)

### 배치 1
- [x] 샘플 메뉴 1개에 공통 가이드 적용
- [x] 소개/목차/상세 페이지 이동 검증
- [x] 포인터 이동/클릭 모션 검증

### 배치 2
- [x] 대시보드 메뉴 가이드
- [x] 실적 관리 메뉴 가이드
- [x] 수당 관리 메뉴 가이드
- [x] 배치 2 전용 가이드 smoke 추가 (`artifacts/scripts/electron-guide-batch2-smoke.cjs` — 2026-04-02)
- [x] 대시보드 / 실적 관리 / 수당 관리 씬 좌표 정밀 보정 1차 (`styles.css`, `smoke:electron:guide-batch2` 재검증 — 2026-04-02)

### 배치 3
- [x] 근무표 배포 메뉴 가이드 (`ScheduleGuideScene.tsx` 신규, route-guides 등록 — 2026-04-02)
- [x] 운영 관리 메뉴 가이드 (`OperationsGuideScene.tsx` 신규, route-guides 등록 — 2026-04-02)
- [x] 활동 이력 메뉴 가이드 (`AccessHistoryGuideScene.tsx` 신규, route-guides 등록 — 2026-04-02)
- [x] 배치 3 가이드 레이아웃/콜아웃/포인터 위치 재정렬 (`styles.css` 정리 — 2026-04-02)
- [x] Electron smoke 검증 추가 (`artifacts/scripts/electron-guide-batch3-smoke.cjs` — 2026-04-02)
- [x] 배치 3 페이지 단위 가이드 smoke 확장 및 좌표 정밀 보정 1차 (`schedule / operations / access-history` 전 페이지 캡처, `styles.css`, `smoke:electron:guide-batch3/4/5` 재검증 — 2026-04-02)

### 배치 4
- [x] 인력 관리 메뉴 가이드 (`WorkforceGuideScene.tsx`, `route-guides.tsx` — 2026-04-02)
- [x] 근무지 관리 메뉴 가이드 (`SiteGuideScene.tsx`, `route-guides.tsx` — 2026-04-02)
- [x] 기존 부분 가이드 이관 (`GuideModal` -> `GuideFlowModal`, `smoke:electron:guide-batch4` — 2026-04-02)
- [x] 배치 4 메뉴/세부 가이드 좌표 정밀 보정 1차 (`workforce / site` 씬 스케일, 미리보기 콜아웃/포인터 상향, `smoke:electron:guide-batch3/4/5` 재검증 — 2026-04-02)
- [x] 배치 4 페이지 단위 가이드 smoke 확장 (`artifacts/scripts/electron-guide-batch4-smoke.cjs`, `workforce / site / nested guide` 전체 페이지 캡처 — 2026-04-02)

### 배치 5
- [x] 시급 일괄 업데이트 세부 가이드 (`workforceWageBulkGuide`, `smoke:electron:guide-batch4` — 2026-04-02)
- [x] 패턴 적용된 근무지 추가 세부 가이드 (`sitePatternImportGuide`, `smoke:electron:guide-batch4` — 2026-04-02)
- [x] 품의 승인 세부 가이드 (`allowanceProposalGuide`, `AllowanceManagementScreen.tsx`, `smoke:electron:guide-batch5` — 2026-04-02)
- [x] DB업데이트 세부 가이드 (`operationsDatabaseUpdateGuide`, `ShiftPatternManagementScreen.tsx`, `smoke:electron:guide-batch5` — 2026-04-02)
- [x] 양식 관리 세부 가이드 (`operationsTemplateManagementGuide`, `OperationsTemplateSection.tsx`, `TemplateWizardModal.tsx`, `smoke:electron:guide-batch5` — 2026-04-02)
- [x] 배치 5 세부 가이드 좌표 정밀 보정 1차 (`allowance proposal / operations template / db-update` 씬 스케일 재조정, `smoke:electron:guide-batch3/4/5` 재검증 — 2026-04-02)
- [x] 배치 5 페이지 단위 가이드 smoke 확장 (`artifacts/scripts/electron-guide-batch5-smoke.cjs`, `allowance / operations nested guide` 전체 페이지 캡처 — 2026-04-02)

## 현재 결론
- 구현은 `공통 엔진 -> 핵심 메뉴 -> 운영/기준 메뉴 -> 세부 기능` 순서로 진행한다.
- Todo는 이 문서를 기준으로 계속 갱신한다.
- 공통 엔진과 `대시보드` 샘플 메뉴 연결까지 1차 완료했다.
- `실적 관리` 와 `수당 관리` 메뉴 가이드를 같은 구조로 확장했다.
- **2026-04-02**: 배치 3 완료. `근무표 배포`, `운영 관리`, `활동 이력` 메뉴 가이드가 추가되었다.
  - `motion-primitives.tsx` 분리로 공통 모션 코드 중복 제거 완료.
- **2026-04-02**: 배치 3 정밀 보정 1차 완료.
  - `artifacts/scripts/electron-guide-batch3-smoke.cjs`를 페이지 단위 캡처로 확장했다.
  - `근무표 배포`, `운영 관리`, `활동 이력` 가이드의 하단 기준 콜아웃과 포인터를 상단 기준으로 재배치했다.
  - `npm run build`, `npm run smoke:electron:guide-batch3`, `npm run smoke:electron:guide-batch4`, `npm run smoke:electron:guide-batch5`를 다시 통과했다.
  - 다음 정밀 보정 대상은 배치 4~5 메뉴와 세부 기능 가이드다.
  - `GuidePageDefinition`에 `preconditions`, `outcome` 선택 필드 추가.
  - 6개 메뉴(배치 1~3)가 `GuideFlowModal` 엔진으로 동작함.
  - 배치 3은 화면 구조 기준으로 재정렬했고, `smoke:electron:guide-batch3`로 기본 진입과 feature 페이지 캡처를 검증한다.
- **2026-04-02**: 배치 4 완료. `인력 관리`, `근무지 관리` 메뉴 가이드와 기존 부분 가이드 2종이 새 플레이어 구조로 이관되었다.
  - `WorkforceGuideScene.tsx`, `SiteGuideScene.tsx` 추가로 기준 마스터 메뉴의 소개/목차/상세 페이지가 연결되었다.
  - 인력 관리 `시급 일괄 업데이트`, 근무지 관리 `패턴 적용된 근무지 추가`가 `GuideFlowModal` 세부 가이드로 이관되었다.
  - 배치 4 레이아웃 보정으로 근무지 요약 카드 그리드와 세부 가이드 모달 positioning 이슈를 정리했다.
  - `smoke:electron:guide-batch4`로 메뉴 가이드 2종과 이관된 세부 가이드 2종의 진입 및 feature 페이지 캡처를 검증한다.
- **2026-04-02**: 배치 5 완료. 복잡 기능 세부 가이드 5종이 공통 플레이어 기준으로 모두 연결되었다.
  - 기존 이관 항목인 `시급 일괄 업데이트`, `패턴 적용된 근무지 추가`를 포함해 `품의 승인`, `DB업데이트`, `양식 관리` 세부 가이드가 배치 기준을 충족한다.
  - `AllowanceManagementScreen.tsx`에 `품의 승인 가이드` 진입과 품의 미리보기 모달 가이드 진입을 연결했다.
  - `ShiftPatternManagementScreen.tsx`, `OperationsTemplateSection.tsx`, `TemplateWizardModal.tsx`에 `DB업데이트` 및 `양식 관리` 가이드 진입을 연결했다.
  - `smoke:electron:guide-batch5`로 수당/운영 관리 세부 가이드 4개 진입과 feature 페이지 캡처를 검증한다.
- **2026-04-02**: 배치 4~5 정밀 보정 1차 완료.
  - `styles.css`에서 `workforce`, `site`, `operations` 씬 스케일을 조정해 모달형 가이드의 가시 영역을 넓혔다.
  - `시급 일괄 업데이트`, `패턴 적용된 근무지 추가`의 미리보기형 feature 페이지에서 콜아웃과 포인터를 상단 가시 영역으로 재배치했다.
  - `DB업데이트`, `양식 관리`, `품의 승인` 세부 가이드도 같은 공통 셸 기준으로 다시 검증했다.
  - `npm run build`, `npm run smoke:electron:guide-batch3`, `npm run smoke:electron:guide-batch4`, `npm run smoke:electron:guide-batch5`를 다시 통과했다.
- **2026-04-02**: 배치 4~5 smoke를 페이지 단위 캡처 기준으로 확장했다.
  - `artifacts/scripts/electron-guide-batch4-smoke.cjs`는 `인력 관리`, `근무지 관리`, `시급 일괄 업데이트`, `패턴 적용된 근무지 추가`의 소개/목차/상세 페이지를 각각 개별 캡처한다.
  - `artifacts/scripts/electron-guide-batch5-smoke.cjs`는 `품의 승인`, `DB업데이트`, `양식 관리`, `양식등록 모달` 가이드의 소개/목차/상세 페이지를 각각 개별 캡처한다.
  - 생성 산출물은 `artifacts/screenshots/guide-batch4-*`, `artifacts/screenshots/guide-batch5-*` 규칙으로 누적 확인한다.
- **2026-04-02**: 가이드 smoke에 공통 가시 영역 검증을 추가했다.
  - `artifacts/scripts/guide-smoke-helpers.cjs`에서 인증, 메뉴 진입, 가이드 타이틀 대기, 닫기, overlay viewport assertion을 공통 helper로 분리했다.
  - `batch2~5` smoke는 각 페이지 캡처 직전에 `guide-flow-figure-shell` 내부의 콜아웃, 포인터, ripple이 실제 가시 영역 안에 있는지 검사한다.
  - 전체 가이드를 한 번에 검증할 수 있도록 `npm run smoke:electron:guides` 엔트리를 추가했다.
  - 배치별 prefix에 해당하는 기존 자동 생성 PNG는 실행 전에 정리해 오래된 `feature` 캡처가 새 산출물과 섞이지 않게 했다. `-manual` 파일은 보존한다.
- **2026-04-02**: 가시 영역 검증 기준으로 배치 3~5의 소개/세부 가이드 위치를 재정렬했다.
  - `근무표 배포`, `운영 관리`, `활동 이력` 소개 페이지의 하단 콜아웃과 `배포 이력`, `이력 해석` 포인터를 상단 가시 영역 기준으로 다시 맞췄다.
  - `인력 관리` 소개 페이지의 프로필 콜아웃, `시급 일괄 업데이트` 미리보기 포인터/ripple을 공통 셸 높이에 맞게 조정했다.
  - `품의 승인` 세부 가이드의 포인터 경로를 실제 상단 액션 영역 기준으로 축소했고, `npm run smoke:electron:guides` 전체 통과를 확인했다.
- **2026-04-02**: 공통 UI 재배치 1차 완료. `GuideFlowModal`의 헤더, 진행률, 본문 패널, 하단 액션 구조를 공통 레이아웃으로 정리했다.
  - `GuideFlowModal.tsx`에서 페이지 요약, 이동 힌트, 시뮬레이션 화면 패널, 하단 현재/다음 단계 안내를 추가했다.
  - `styles.css`에서 가이드 모달을 고정 헤더/네비게이션/본문/하단 구조로 재배치하고 대표 배치 3~5 스모크를 재검증했다.
- **2026-04-02**: 배치 2 정밀 보정 1차 완료. `대시보드`, `실적 관리`, `수당 관리`의 콜아웃/포인터를 가시 영역 기준으로 다시 배치했다.
  - `artifacts/scripts/electron-guide-batch2-smoke.cjs`를 추가해 배치 2 전체 페이지를 개별 캡처할 수 있게 했다.
  - `styles.css`에서 core 메뉴 씬의 콜아웃 위치, 포인터 오프셋, 일부 애니메이션 이동폭을 상단 가시 영역 기준으로 재정렬했다.
  - `smoke:electron:guide-batch2`, `smoke:electron:guide-batch3`, `smoke:electron:guide-batch4`, `smoke:electron:guide-batch5`로 회귀를 재검증했다.
- **2026-04-02**: 구조 개편 1차 완료. `GuideFlowModal`의 우측 패널을 `사용 흐름 / 기능 설명` 탭 구조로 바꾸고, 배치 2(`대시보드`, `실적 관리`, `수당 관리`)를 번호형 하이라이트 구조로 이관했다.
  - `guide-types.ts`, `motion-primitives.tsx`, `GuideFlowModal.tsx`, `route-guides.tsx`, 배치 2 씬 3종, `styles.css`를 갱신했다.
  - `artifacts/scripts/electron-guide-batch2-smoke.cjs`, `artifacts/scripts/electron-guide-batch5-smoke.cjs`를 새 하이라이트 구조에 맞췄다.
  - `npm run build`, `npm run smoke:electron:guide-batch2`, `npm run smoke:electron:guide-batch5`, `npm run smoke:electron:guides`를 통과했다.
- **2026-04-02**: 배치 3~5 구조 이관과 세부 가이드 focus mapping을 완료했다.
  - `ScheduleGuideScene.tsx`, `OperationsGuideScene.tsx`, `AccessHistoryGuideScene.tsx`를 번호형 하이라이트 구조로 이관했다.
  - `route-guides.tsx`에서 배치 3 주 메뉴와 배치 5 세부 가이드의 `detailItems`/`focusIndex` 연결을 정리했다.
  - `electron-guide-batch3-smoke.cjs`, `electron-guide-batch5-smoke.cjs`를 새 준비 셀렉터 기준으로 갱신했다.
  - `npm run build`, `npm run smoke:electron:guide-batch3`, `npm run smoke:electron:guide-batch5`, `npm run smoke:electron:guides`를 통과했다.
- **2026-04-02**: 배치 2~5 smoke에 `사용 흐름 / 기능 설명` 탭 전환 검증을 추가했다.
  - `artifacts/scripts/guide-smoke-helpers.cjs`에 탭 전환, summary label, support stack, flow 복귀 상태 검증을 공통 helper로 추가했다.
  - `electron-guide-batch2/3/4/5-smoke.cjs`는 각 페이지 캡처 전에 탭 전환과 figure viewport를 함께 검사한다.
  - smoke를 붙이면서 드러난 `실적 관리 승인 이력`, `근무표 배포 배포 이력`, `운영 관리 공휴일·요율`, `DB업데이트` 장면의 가시 영역도 함께 보정했다.
  - `npm run build`, `npm run smoke:electron:guide-batch2`, `npm run smoke:electron:guide-batch3`, `npm run smoke:electron:guide-batch4`, `npm run smoke:electron:guide-batch5`, `npm run smoke:electron:guides`를 모두 통과했다.
- **다음 작업**: 사용자 검수 기준의 위치 미세 조정과 대표 스크린샷 재생성을 이어간다.
