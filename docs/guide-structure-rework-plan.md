# 가이드 구조 개편 계획

## 문서 목적
- 현재 `GuideFlowModal` 기반 가이드를 `콜아웃 박스 중심 구조`에서 `번호형 하이라이트 + 우측 탭 설명 구조`로 개편한다.
- 실제 화면을 가리는 설명 박스 문제를 해소하고, 가이드 화면의 시인성과 해석성을 높인다.
- 구현 전 영향 범위, 단계별 작업 범위, 검증 기준을 명확히 정리한다.

## 진행 상태
- **2026-04-02**: 구조 개편 1차 구현 완료.
  - `guide-types.ts`에 `flow/details` 탭, `detailItems`, `renderFigure` 상태를 추가했다.
  - `GuideFlowModal.tsx`를 `압축 헤더 + 진행/목차 + 좌측 시뮬레이션 + 우측 탭 패널` 구조로 재배치했다.
  - `motion-primitives.tsx`에 번호형 하이라이트 primitive를 추가했다.
  - 배치 2(`대시보드`, `실적 관리`, `수당 관리`)를 번호형 하이라이트 구조로 이관했다.
  - `npm run build`, `npm run smoke:electron:guide-batch2`, `npm run smoke:electron:guides`를 통과했다.
- **2026-04-02**: 배치 3~5 구조 이관과 세부 가이드 focus mapping을 완료했다.
  - 배치 3(`근무표 배포`, `운영 관리`, `활동 이력`)를 번호형 하이라이트 구조로 이관했다.
  - 배치 5 세부 가이드(`품의 승인`, `DB업데이트`, `양식 관리`)에 페이지별 `focusIndex`를 연결했다.
  - `electron-guide-batch3-smoke.cjs`, `electron-guide-batch5-smoke.cjs`를 새 하이라이트 구조에 맞게 갱신했다.
  - `npm run build`, `npm run smoke:electron:guide-batch3`, `npm run smoke:electron:guide-batch5`, `npm run smoke:electron:guides`를 통과했다.
- 현재 남은 작업은 사용자 검수 기준의 위치 미세 조정과 대표 스크린샷 재생성이다.

## 요청사항 해석

### 1. 콜아웃 박스 구조 변경
- 현재는 씬 위에 짙은 색 설명 박스를 직접 올려서 설명한다.
- 이 방식은 포인터 이동과 겹치면 실제로 무엇을 설명하는지 시야가 끊긴다.
- 개편 후에는 씬 안에는 아래 요소만 남긴다.
  - 대상 영역을 감싸는 하이라이트 박스
  - 해당 하이라이트와 연결된 번호 표식
  - 필요한 경우 포인터 이동 / ripple
- 설명 텍스트는 우측 패널에서 번호 기준으로 읽도록 바꾼다.

### 2. 모달 공간 재배치
- 현재 상단은 `제목 + 설명 + 요약 칩 + 보조 카드 + 진행률 + 아웃라인`이 모두 독립 블록으로 있어 높이를 많이 차지한다.
- 요청 의도는 “설명용 UI를 압축하고 실제 시뮬레이션 화면을 크게” 만드는 것이다.
- 개편 후에는 상단을 `압축 헤더 + 얇은 진행/목차 영역`으로 줄이고, 본문 시뮬레이션 패널 높이를 우선 확보한다.

### 3. 우측 설명 패널 이원화
- 우측 패널은 `사용 흐름`, `기능 설명` 두 탭으로 분리한다.
- `사용 흐름`
  - 번호형 하이라이트와 1:1 대응되는 Step을 순서대로 설명
  - 포인터 이동, ripple, 활성 하이라이트를 함께 보여준다
- `기능 설명`
  - 기존 콜아웃 박스가 말하던 맥락, 주의사항, 선행조건, 결과를 읽는 용도
  - 포인터 애니메이션보다 정적인 설명 읽기에 초점을 둔다

## 현재 구조 진단

### 현재 모달 구조
- `GuideFlowModal.tsx`
  - 헤더
  - 요약 칩 3개
  - 우측 helper/context 카드
  - 진행률과 페이지 버튼 목록
  - 좌측 시뮬레이션 / 우측 설명 패널
  - 하단 이전/다음

### 현재 데이터 구조
- `guide-types.ts`
  - 페이지별 `steps`, `notes`, `preconditions`, `outcome`, `figure` 정도만 있음
- 현재 모델에는 아래 정보가 없다.
  - 하이라이트 번호와 step의 직접 연결
  - `사용 흐름`과 `기능 설명`의 분리
  - 화면 오버레이 종류를 `callout`, `highlight`, `marker`로 나누는 표현

### 현재 씬 구조
- 각 GuideScene이 절대 좌표 기반 `.guide-scene-callout--*` 클래스를 다수 사용한다.
- 대부분의 설명 문구가 씬 위에 올라가 있으며, 번호/순서 해석이 CSS 위치에 강하게 묶여 있다.
- `motion-primitives.tsx`는 포인터와 ripple만 공통화돼 있고, 번호 마커/하이라이트 primitive는 아직 없다.

### 현재 문제 요약
1. 설명 박스가 실제 타겟을 가린다.
2. 상단 안내 UI가 커서 시뮬레이션 패널 높이가 줄어든다.
3. 설명 패널이 `흐름 설명`과 `기능 설명`을 한 덩어리로 섞어 보여준다.
4. 씬별 절대 좌표 조정 부담이 크다.

## 목표 구조

### A. 시뮬레이션 패널
- 설명 박스 제거
- 번호형 하이라이트 마커 도입
- 대상 요소 강조 방식
  - outline box
  - subtle glow
  - number badge
  - active/inactive state
- 탭 상태에 따른 동작
  - `사용 흐름`: 포인터 이동 + 활성 하이라이트
  - `기능 설명`: 포인터 비활성 또는 약화 + 번호형 하이라이트만 유지

### B. 우측 설명 패널
- 상단 탭
  - `사용 흐름`
  - `기능 설명`
- `사용 흐름` 탭
  - 번호별 Step 목록
  - 현재 선택 번호 강조
  - 순서 중심 설명
- `기능 설명` 탭
  - 기능 목적
  - 기존 콜아웃 설명 문구
  - 선행조건 / 결과 / 주의사항

### C. 모달 레이아웃
- 상단
  - 가이드 제목
  - 현재 페이지 / 전체 페이지
  - 간단한 설명 1~2줄
  - 닫기 버튼
- 중간
  - 얇은 진행률 바
  - 압축형 페이지 네비게이션
- 본문
  - 좌측 시뮬레이션 패널 비중 확대
  - 우측 설명 패널 고정 폭
- 하단
  - 이전 / 다음 / 마침
  - 현재 단계 정보만 유지

## 설계 원칙
1. 설명은 씬 밖으로 빼고, 씬 안에는 “무엇을 봐야 하는지”만 남긴다.
2. 하이라이트 번호는 우측 설명 번호와 항상 일치해야 한다.
3. 같은 페이지 안에서 `사용 흐름`과 `기능 설명`이 서로 다른 데이터 표현을 쓰더라도 번호 체계는 공유한다.
4. 소개 페이지와 feature 페이지를 동일한 상호작용 규칙으로 유지한다.
5. 기존 가이드 콘텐츠 문구는 최대한 재사용하고, 표현 방식만 재구성한다.

## 예상 영향 범위

### 핵심 컴포넌트
- `src/renderer/components/GuideFlowModal.tsx`
- `src/renderer/guides/guide-types.ts`
- `src/renderer/guides/motion-primitives.tsx`

### 가이드 데이터/씬
- `src/renderer/guides/route-guides.tsx`
- `src/renderer/guides/DashboardGuideScene.tsx`
- `src/renderer/guides/PerformanceGuideScene.tsx`
- `src/renderer/guides/AllowanceGuideScene.tsx`
- `src/renderer/guides/ScheduleGuideScene.tsx`
- `src/renderer/guides/OperationsGuideScene.tsx`
- `src/renderer/guides/AccessHistoryGuideScene.tsx`
- `src/renderer/guides/WorkforceGuideScene.tsx`
- `src/renderer/guides/SiteGuideScene.tsx`

### 스타일/검증
- `src/renderer/styles.css`
- `artifacts/scripts/guide-smoke-helpers.cjs`
- `artifacts/scripts/electron-guide-batch2-smoke.cjs`
- `artifacts/scripts/electron-guide-batch3-smoke.cjs`
- `artifacts/scripts/electron-guide-batch4-smoke.cjs`
- `artifacts/scripts/electron-guide-batch5-smoke.cjs`

## 데이터 모델 개편안

### 1. 번호형 포커스 단위 추가
- 신규 개념 예시
  - `GuideFocusTarget`
  - `id`
  - `number`
  - `label`
  - `mode`: `flow | description | both`
  - `tone`

### 2. Step과 하이라이트 연결
- 현재 `GuideStep`은 제목과 설명만 가진다.
- 개편 후에는 아래 연결 정보가 필요하다.
  - `focusTargetId`
  - `tab`: `flow | description`

### 3. 기능 설명 데이터 분리
- 기존 `goal`, `notes`, `preconditions`, `outcome`만으로는 설명 탭을 구성하기 어렵다.
- 별도 정보 묶음 예시
  - `featureSummary`
  - `featureDetails`
  - `cautions`
  - `expectedResult`

### 4. figure 렌더 제어 상태
- 각 씬은 `activeTab`, `activeFocusId`를 받아 조건부로
  - 하이라이트 강조
  - 포인터 표시
  - ripple 표시
  - 설명 박스 미표시
하도록 바뀌어야 한다.

## 구현 전략

### 단계 1. 엔진 설계 개편
목표:
- 콜아웃 제거가 가능한 데이터/렌더링 구조를 먼저 만든다.

작업:
- `guide-types.ts` 확장
- 하이라이트 번호 / 설명 탭 모델 추가
- `GuideFlowModal.tsx`에 탭 상태와 active focus 상태 추가

완료 기준:
- 한 페이지에서 `사용 흐름` / `기능 설명` 탭 전환이 가능하다.
- 탭 전환이 씬 figure 상태에 반영된다.

### 단계 2. 공통 UI 재배치
목표:
- 상단과 우측 패널 구조를 압축하고 시뮬레이션 면적을 확장한다.

작업:
- 헤더 단순화
- summary/helper 카드 축소 또는 통합
- 진행률/목차 압축
- 본문 2패널 비율 재조정

완료 기준:
- 현재보다 figure shell 높이와 폭이 유의미하게 커진다.
- 작은 해상도에서도 하단 액션과 우측 탭을 함께 볼 수 있다.

### 단계 3. 공통 하이라이트 primitive 도입
목표:
- 모든 씬이 같은 방식으로 번호형 강조를 그릴 수 있어야 한다.

작업:
- `motion-primitives.tsx` 또는 별도 파일에 아래 추가
  - `GuideHighlightBox`
  - `GuideNumberBadge`
  - `GuideFocusLayer`
- 기존 `.guide-scene-callout` 스타일을 대체할 공통 class 설계

완료 기준:
- 콜아웃 텍스트 없이도 번호와 하이라이트만으로 포커스가 보인다.

### 단계 4. 배치 2 메뉴 먼저 이관
대상:
- 대시보드
- 실적 관리
- 수당 관리

이유:
- 사용자 검수 빈도가 높은 핵심 메뉴
- 새 구조 품질을 가장 빨리 체감할 수 있음

작업:
- 소개 / feature 페이지를 번호형 하이라이트로 변환
- 우측 탭 설명 구조 연결
- 포인터 경로 재정렬

완료 기준:
- 배치 2 전체가 새 구조로 통일된다.

### 단계 5. 배치 3~5 순차 이관
대상:
- 근무표 배포
- 운영 관리
- 활동 이력
- 인력 관리
- 근무지 관리
- 세부 모달 가이드

작업:
- 기존 `guide-scene-callout--*`를 단계적으로 제거
- 하이라이트 번호 시스템으로 교체
- batch smoke 기준 업데이트

완료 기준:
- 전 가이드 페이지에서 설명 박스가 씬 위를 직접 가리지 않는다.

### 단계 6. 검증 체계 개편
목표:
- 새 구조에서 “번호/하이라이트/설명 탭 불일치”를 잡을 수 있어야 한다.

작업:
- smoke 검증 포인트 추가
  - 활성 하이라이트 존재 여부
  - 우측 탭 전환 가능 여부
  - `사용 흐름` 탭에서 포인터 표시 여부
  - `기능 설명` 탭에서 설명 카드 렌더 여부
- 기존 viewport 검증 유지

완료 기준:
- `npm run smoke:electron:guides` 한 번으로 구조 회귀를 기본 검출할 수 있다.

## Todo

### 설계
- [x] guide data model에 focus target / tab 개념 추가
- [x] `GuideFlowModal` 새 와이어프레임 반영
- [x] 하이라이트 primitive 설계

### 구현 1차
- [x] 배치 2 메뉴를 새 구조로 변환
- [x] `사용 흐름` / `기능 설명` 탭 동작 연결
- [x] 상단 영역 압축 및 figure shell 확대

### 구현 2차
- [x] 배치 3 메뉴 변환
- [x] 배치 4 메뉴 변환
- [x] 배치 5 세부 모달 가이드 변환

### 검증
- [x] 배치 2~5 smoke가 탭 전환까지 검증하도록 확장
- [x] 전체 guide smoke 재통과
- [ ] 대표 스크린샷 재생성

## 검증 기준
1. 씬 위에 설명 텍스트 박스가 직접 겹치지 않는다.
2. 하이라이트 번호와 우측 설명 번호가 일치한다.
3. `사용 흐름` 탭에서는 포인터 이동과 하이라이트가 동시에 보인다.
4. `기능 설명` 탭에서는 번호별 설명, 선행조건, 기대 결과를 읽을 수 있다.
5. 기존 페이지 이동, 진행률, 목차 네비게이션은 유지된다.
6. `npm run smoke:electron:guides`가 통과한다.

## 리스크
1. 전 씬의 콜아웃 구조를 다시 그려야 하므로 작업량이 크다.
2. 현재 CSS가 absolute positioning 중심이라 공통 primitive 전환 시 초기 조정 비용이 높다.
3. 데이터 모델 변경 시 `route-guides.tsx` 전 구간 수정이 필요하다.
4. 탭 전환에 따라 씬 상태가 달라지므로 smoke와 수동 QA를 같이 강화해야 한다.

## 대응
1. 배치 2를 샘플 리디자인으로 먼저 완료한 뒤 나머지 메뉴에 확장한다.
2. 구형 `.guide-scene-callout`와 신형 highlight 시스템을 일시 병행 가능하게 설계한다.
3. smoke에 탭/하이라이트 일치 검증을 추가해 회귀를 조기에 잡는다.

## 현재 결론
- 이 작업은 단순 스타일 패치가 아니라 가이드 엔진 구조 개편이다.
- 구현 순서는 `엔진/데이터 모델 -> 모달 레이아웃 -> 공통 highlight primitive -> 배치 2 -> 배치 3~5 -> smoke 확장`이 가장 안전하다.
- 우선 구현 시작점은 `GuideFlowModal.tsx`, `guide-types.ts`, `styles.css`, `route-guides.tsx`, 배치 2 씬 3종이다.
- 배치 2~5가 모두 새 구조로 전환됐고, 현재 기준 전체 guide smoke가 통과한다.
- `guide-smoke-helpers.cjs` 기준으로 `사용 흐름 / 기능 설명` 탭 전환, support stack 렌더, flow 복귀 상태까지 자동 검증한다.
