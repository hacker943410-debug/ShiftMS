# 가이드 시스템 작업 로그

> 이 문서는 메뉴별 가이드 시스템 구현 작업의 진행 이력을 기록합니다.  
> 다음 작업자(또는 다음 세션)가 파일 구조와 결정 이유를 정확히 파악할 수 있도록 상세하게 작성합니다.

---

## 프로젝트 기본 구조 (가이드 시스템 관점)

```
src/renderer/
├── components/
│   ├── GuideFlowModal.tsx        # 공통 가이드 플레이어 (엔진)
│   ├── GuideModal.tsx            # 레거시 단건 가이드 모달 (배치 4에서 이관 예정)
│   └── DashboardShell.tsx        # 상단 "가이드 보기" 버튼이 있는 셸 컴포넌트
│
└── guides/
    ├── motion-primitives.tsx     # ★ 공통 모션 primitive (MotionPointer, MotionRipple)
    ├── guide-types.ts            # ★ 가이드 데이터 타입 정의
    ├── route-guides.tsx          # ★ 메뉴별 가이드 데이터 레지스트리
    │
    ├── DashboardGuideScene.tsx   # 대시보드 씬 컴포넌트
    ├── PerformanceGuideScene.tsx # 실적 관리 씬 컴포넌트
    ├── AllowanceGuideScene.tsx   # 수당 관리 씬 컴포넌트
    ├── ScheduleGuideScene.tsx    # 근무표 배포 씬 컴포넌트  [배치 3 신규]
    ├── OperationsGuideScene.tsx  # 운영 관리 씬 컴포넌트    [배치 3 신규]
    └── AccessHistoryGuideScene.tsx # 활동 이력 씬 컴포넌트 [배치 3 신규]
```

---

## 데이터 흐름

```
DashboardShell (가이드 보기 버튼)
  └─ 현재 routeKey를 읽어 getRouteGuide(routeKey) 호출
       └─ route-guides.tsx 레지스트리에서 RouteGuideDefinition 반환
            └─ GuideFlowModal에 pages 배열 전달
                 └─ 각 page.figure에 씬 컴포넌트(JSX) 렌더링
                      └─ *GuideScene.tsx — MotionPointer/MotionRipple 사용
                           └─ motion-primitives.tsx (공통 파일)
```

---

## 세션별 작업 이력

---

### 2026-04-02 (배치 3 완료 세션)

**담당자:** Antigravity (AI 코딩 어시스턴트)  
**참조 계획서:** `docs/guide-system-rollout-plan.md`

---

#### 작업 1. `motion-primitives.tsx` 공통 파일 분리

**파일 경로:** `src/renderer/guides/motion-primitives.tsx`  
**유형:** 신규 생성

**문제 상황:**  
`DashboardGuideScene.tsx`, `PerformanceGuideScene.tsx`, `AllowanceGuideScene.tsx` 3개 파일 모두 로컬에 동일한 `MotionPointer`, `MotionRipple` 컴포넌트를 각자 정의하고 있었다. 배치 3에서 씬 파일 3개가 추가되면 중복이 6개로 늘어난다.

**결정 사항:**  
배치 3 구현 전에 먼저 공통 파일을 만들고, 기존 3개 파일의 로컬 정의를 제거한 뒤 import로 교체했다.

**변경된 파일:**
- `motion-primitives.tsx` — 신규 생성. `MotionPointer`, `MotionRipple` 내보내기.
- `DashboardGuideScene.tsx` — 상단에 `import { MotionPointer, MotionRipple } from "./motion-primitives"` 추가. 로컬 정의(약 20줄) 삭제.
- `PerformanceGuideScene.tsx` — 동일 처리.
- `AllowanceGuideScene.tsx` — 동일 처리.

**결과:** 씬 파일당 약 20줄 중복 제거. 향후 primitive 수정이 필요한 경우 `motion-primitives.tsx` 한 파일만 수정하면 된다.

---

#### 작업 2. `guide-types.ts` 타입 보강

**파일 경로:** `src/renderer/guides/guide-types.ts`  
**유형:** 수정

**문제 상황:**  
`GuidePageDefinition` 인터페이스에 `notes` 필드는 있었지만, 계획서에 명시된 **선행조건(preconditions)** 과 **기대 결과(outcome)** 필드가 없었다. `notes`에 모든 부가 정보를 넣으면 가이드 콘텐츠 작성자가 어떤 정보를 어디 넣어야 하는지 구분이 어려워진다.

**결정 사항:**  
두 필드를 선택(optional) 필드로 추가했다. 기존 가이드 데이터에는 영향 없음(하위 호환 유지).

```typescript
// 추가된 필드
preconditions?: string[];   // 이 기능 사용 전 완료돼야 하는 조건
outcome?: string;           // 이 흐름 완료 시 예상되는 결과 상태
```

**결과:** 배치 3 가이드 데이터에서 `preconditions`와 `outcome`을 실제로 사용한 페이지:
- `schedule-intro` — `preconditions: ["운영 관리 > 양식 탭에서 활성 양식이 최소 1개 이상 등록되어 있어야 합니다."]`
- `schedule-distribute` — `outcome: "지정된 경로에 Excel 근무표 파일이 저장되고 배포 이력이 기록됩니다."`
- `operations-db-update` — `preconditions`, `outcome` 모두 사용

---

#### 작업 3. `ScheduleGuideScene.tsx` 신규 생성 (배치 3 — 근무표 배포)

**파일 경로:** `src/renderer/guides/ScheduleGuideScene.tsx`  
**유형:** 신규 생성

**페이지 구성 (5페이지):**

| pageId | kind | navLabel | 핵심 씬 요소 |
|---|---|---|---|
| `schedule-intro` | intro | 메뉴 소개 | 달력 + 조별 배치 + 배포 버튼 오버뷰 callout |
| `schedule-toc` | toc | 목차 | 목차 카드 4개 |
| `schedule-month-site` | feature | 월·근무지 선택 | MotionPointer + MotionRipple on 필터 영역 |
| `schedule-distribute` | feature | 양식 선택·배포 | MotionPointer + MotionRipple on 배포 버튼 |
| `schedule-history` | feature | 배포 이력 | MotionPointer on 이력 테이블 |

**씬 패널 구성:**
- 상단: 연도/월/근무지 필터 바
- 좌측: 미니 달력 그리드 (7컬럼 × 최대 6행)
- 우측: 조별 배치 패널 (A/B/C조 색상별 카드)
- 하단: 양식 선택 + 경로 표시 + 배포 버튼
- 이력 테이블: 배포 일시, 근무지, 대상 월, 양식, 결과, 처리자

**특이 사항:**  
달력 그리드는 `calendarRows` 배열로 하드코딩. 실제 동적 달력이 아니고 시각적 설명용이므로 고정값으로 유지.

---

#### 작업 4. `OperationsGuideScene.tsx` 신규 생성 (배치 3 — 운영 관리)

**파일 경로:** `src/renderer/guides/OperationsGuideScene.tsx`  
**유형:** 신규 생성

**페이지 구성 (6페이지):**

| pageId | kind | navLabel | 핵심 씬 요소 |
|---|---|---|---|
| `operations-intro` | intro | 메뉴 소개 | 탭 목록 + "관리자 전용" 배지 |
| `operations-toc` | toc | 목차 | 목차 카드 5개 |
| `operations-holiday-rate` | feature | 공휴일·요율 | 탭0 선택, 공휴일 리스트 + 요율 카드 |
| `operations-user` | feature | 사용자 관리 | 탭2 선택, 사용자 테이블 |
| `operations-form` | feature | 양식 관리 | 탭3 선택, 양식 목록 |
| `operations-db-update` | feature | DB업데이트 | 탭4 선택, 경로 패널 + 실행 버튼 |

**설계 포인트:**  
운영 관리는 **탭 전환 구조**가 핵심이다. 씬 컴포넌트에서 `variant`별로 `getActiveTabIndex()`를 호출해 탭 강조 처리를 자동화했다. 각 variant는 해당 탭이 선택된 상태의 UI를 렌더링한다.

**adminOnly 관련:**  
씬 상단에 `"관리자 전용"` 배지를 항상 렌더링해 운영자가 이 메뉴의 성격을 인지하도록 했다. 가이드 텍스트 톤도 "관리자가 설정" 기준으로 작성.

---

#### 작업 5. `AccessHistoryGuideScene.tsx` 신규 생성 (배치 3 — 활동 이력)

**파일 경로:** `src/renderer/guides/AccessHistoryGuideScene.tsx`  
**유형:** 신규 생성

**페이지 구성 (4페이지):**

| pageId | kind | navLabel | 핵심 씬 요소 |
|---|---|---|---|
| `access-history-intro` | intro | 메뉴 소개 | 테이블 + 필터 + 요약 pill 오버뷰 callout |
| `access-history-toc` | toc | 목차 | 목차 카드 4개 |
| `access-history-filters` | feature | 필터 조합 | MotionPointer + MotionRipple on 필터 영역 |
| `access-history-interpret` | feature | 이력 해석 | MotionPointer on 이상 행동 행 |

**설계 포인트:**  
이력 테이블에서 "로그인 실패" 행은 `guide-access-table-row--alert` CSS 클래스를 붙여 강조 처리했다. 이는 가이드에서 이상 행동 식별 시나리오를 시각적으로 설명하기 위한 것이다.

**adminOnly 관련:**  
`"관리자 전용"` 배지와 읽기 전용 특성을 명시했다. 이력 해석 페이지에서 이상 행동 발견 시 "사용자 관리 탭에서 계정 상태를 확인한다"는 크로스 메뉴 안내를 포함했다.

---

#### 작업 6. `route-guides.tsx` 배치 3 가이드 등록

**파일 경로:** `src/renderer/guides/route-guides.tsx`  
**유형:** 수정

**변경 내용:**
1. 상단 import에 3개 씬 컴포넌트 추가:
   ```typescript
   import { AccessHistoryGuideScene } from "./AccessHistoryGuideScene";
   import { OperationsGuideScene } from "./OperationsGuideScene";
   import { ScheduleGuideScene } from "./ScheduleGuideScene";
   ```
2. 파일 하단에 `scheduleGuide`, `operationsGuide`, `accessHistoryGuide` 3개 상수 추가.
3. `routeGuideRegistry`에 3개 등록:
   ```typescript
   const routeGuideRegistry = {
     ...(기존),
     schedule: scheduleGuide,
     operations: operationsGuide,
     "access-history": accessHistoryGuide
   };
   ```

**routeKey 매핑 주의:**  
`access-history`는 하이픈이 포함된 키다. `route-config.ts`의 메뉴 key와 일치하는지 항상 확인해야 한다.

---

#### 작업 7. `guide-system-rollout-plan.md` Todo 업데이트

**파일 경로:** `docs/guide-system-rollout-plan.md`  
**유형:** 수정

**변경 내용:**
- 공통 엔진 섹션에 `motion-primitives.tsx` 분리, `preconditions`/`outcome` 필드 추가 완료 표시
- 배치 3 Todo 3개 모두 `[x]` 완료로 변경, 파일명과 날짜 기재
- 현재 결론에 2026-04-02 이력 추가, 다음 작업(배치 4) 명시

---

## 현재 구현 상태 (2026-04-02 기준)

| 메뉴 | routeKey | 배치 | 상태 | 씬 컴포넌트 | 페이지 수 |
|---|---|---|---|---|---|
| 대시보드 | `dashboard` | 배치 2 | ✅ | `DashboardGuideScene` | 5 |
| 실적 관리 | `performance` | 배치 2 | ✅ | `PerformanceGuideScene` | 5 |
| 수당 관리 | `allowance` | 배치 2 | ✅ | `AllowanceGuideScene` | 6 |
| 근무표 배포 | `schedule` | 배치 3 | ✅ | `ScheduleGuideScene` | 5 |
| 운영 관리 | `operations` | 배치 3 | ✅ | `OperationsGuideScene` | 6 |
| 활동 이력 | `access-history` | 배치 3 | ✅ | `AccessHistoryGuideScene` | 4 |
| 인력 관리 | `workforce` | 배치 4 | ⏳ | 미구현 | — |
| 근무지 관리 | `worksite` | 배치 4 | ⏳ | 미구현 | — |

---

## 다음 세션에서 해야 할 일 (배치 4)

### 우선 순위 1: 인력 관리, 근무지 관리 GuideScene 신규 생성
- `WorkforceGuideScene.tsx` — 인력 목록, 신규 등록, 시급 이력, 일괄 업데이트 흐름
- `WorksiteGuideScene.tsx` — 근무지 등록(1단계/2단계), 패턴 산출 흐름

### 우선 순위 2: 기존 `GuideModal` 이관
- `WorkforceManagementScreen.tsx`의 `"시급 일괄 업데이트"` 가이드 버튼이 현재 `GuideModal`을 사용
- 이관 후 `initialPageId` prop으로 해당 기능 페이지로 직접 진입하도록 처리

### routeKey 확인 필요
- 인력 관리, 근무지 관리의 실제 routeKey는 `route-config.ts`에서 확인할 것
- `route-guides.tsx`에 등록 시 key가 일치해야 함

---

## 알아두면 좋은 것들

### GuideFlowModal 동작 방식
- `pages` 배열의 각 항목은 `GuidePageDefinition` 타입
- `figure` 필드에 JSX 노드를 직접 담는 구조 (ReactNode)
- `kind: "intro"` → 소개 레이아웃, `kind: "toc"` → 목차 레이아웃, `kind: "feature"` → 기능 설명 레이아웃
- `initialPageId` prop으로 특정 페이지로 바로 진입 가능 (기능별 세부 가이드 진입에 사용)

### CSS 클래스 네이밍 규칙
- 씬 루트: `guide-{메뉴}-scene`
- 씬 variant 수정자: `guide-{메뉴}-scene--{variant}`
- 모션 포인터 위치: `guide-motion-pointer--{메뉴}-{variant}`
- 모션 리플 위치: `guide-motion-ripple--{메뉴}-{variant}`
- 공통 callout: `guide-scene-callout guide-scene-callout--{메뉴}-{variant}-{설명}`

### adminOnly 메뉴 가이드 작성 원칙
- 씬 상단에 `"관리자 전용"` 배지 항상 표시
- 가이드 텍스트 톤: "관리자가 설정한다", "관리자 계정으로만 접근" 등 명시
- 크로스 메뉴 안내 가능: "사용자 관리 탭에서..." 등 다른 탭/메뉴로 연결되는 설명 포함

### preconditions, outcome 필드 사용 지침
- `preconditions`: 이 페이지 기능을 수행하기 *전에* 완료돼야 하는 상태. 다른 메뉴 선행작업이 필요한 경우 명시.
- `outcome`: 이 흐름을 완료했을 때 *시스템 상태*를 설명. 파일 생성, 상태 변경, 이력 기록 등.
- `notes`: 위 두 필드로 분류하기 어려운 일반적인 주의사항.

---

## 2026-04-02 마감 정리

### 오늘 완료한 작업
- 배치 4, 배치 5까지 포함해 전 메뉴 및 세부 모달 가이드를 `GuideFlowModal` 공통 엔진 기준으로 연결했다.
- 가이드 구조를 `콜아웃 박스 중심`에서 `번호형 하이라이트 + 우측 설명 패널` 구조로 재편했다.
- 우측 설명 패널은 `사용 흐름`, `기능 설명` 두 탭으로 분리했고, `detailItems`, `preconditions`, `outcome`, `notes`가 실제 렌더링되도록 정리했다.
- `GuideFlowModal`, `guide-types`, `route-guides`, `motion-primitives`, 각 `*GuideScene.tsx`를 기준으로 메뉴별 figure 상태 전달과 focus index 매핑을 통일했다.
- `artifacts/scripts/electron-guide-batch2-smoke.cjs` ~ `electron-guide-batch5-smoke.cjs`, `electron-guide-all-smoke.cjs`, `guide-smoke-helpers.cjs`를 기준으로 가이드 전용 smoke 체계를 만들었다.
- smoke에 `사용 흐름 / 기능 설명` 탭 전환 검증, 활성 하이라이트 가시 영역 검증을 추가했다.
- smoke를 붙이며 드러난 `실적 관리 승인 이력`, `근무표 배포 배포 이력`, `운영 관리 공휴일·요율`, `운영 관리 DB업데이트` 장면의 위치를 추가 보정했다.

### 오늘 기준 검증 상태
- `npm run build` 통과
- `npm run smoke:electron:guide-batch2` 통과
- `npm run smoke:electron:guide-batch3` 통과
- `npm run smoke:electron:guide-batch4` 통과
- `npm run smoke:electron:guide-batch5` 통과
- `npm run smoke:electron:guides` 통과

### 내일 이어서 할 작업
- 사용자 검수 기준으로 메뉴별 미세 위치 조정을 계속 진행한다.
- 대표 가이드 스크린샷을 다시 생성해 현재 구조 기준 산출물을 정리한다.
- 가이드 재배치 이후 필요한 문구/설명 정리를 한 번 더 검토한다.
