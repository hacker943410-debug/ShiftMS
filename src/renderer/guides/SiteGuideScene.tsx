import { GuideFocusHighlight } from "./motion-primitives";

type SiteGuideSceneVariant =
  | "overview"
  | "toc"
  | "list"
  | "step1"
  | "step2"
  | "detail"
  | "pattern-import"
  | "pattern-import-toc"
  | "pattern-import-sheet"
  | "pattern-import-preview";

interface SiteGuideSceneProps {
  variant: SiteGuideSceneVariant;
  activeFocusIndex?: number;
}

const GuideMarker = ({ activeFocusIndex = 0, number }: { activeFocusIndex?: number; number: number }) => (
  <GuideFocusHighlight active={activeFocusIndex === number - 1} number={number} />
);

const menuTocItems = [
  { title: "목록 확인", description: "저장된 근무지와 현재 Cycle, 상태, 조 현황을 먼저 확인합니다." },
  { title: "1단계 패턴 등록", description: "근무지 기본 정보, Cycle 구성, Pool 기준을 저장합니다." },
  { title: "2단계 조직 구성", description: "후보 인력을 드래그해 조별 배정을 완료합니다." },
  { title: "상세 보기", description: "저장된 근무지의 Cycle, 근무시간, 조 상태를 다시 검토합니다." },
  { title: "패턴 적용된 근무지 추가", description: "Excel 분석 결과를 1단계 draft에 자동 반영합니다." }
] as const;

const patternImportTocItems = [
  { title: "파일 선택", description: "표준 근무표 Excel 파일을 먼저 가져옵니다." },
  { title: "패턴 산출", description: "Cycle, offset, 정원 제안을 분석합니다." },
  { title: "미리보기 탭 검토", description: "분석 결과, 그룹별 상세, 불일치, 원본 데이터를 확인합니다." },
  { title: "1단계 이동", description: "검토 후 근무지 등록 1단계 draft로 결과를 넘깁니다." }
] as const;

const listSummary = [
  { label: "등록 근무지", value: "12개" },
  { label: "운영중 근무지", value: "10개" },
  { label: "Pool 운영", value: "4개" },
  { label: "배정 인원", value: "86명" }
] as const;

const siteRows = [
  ["보라매DC", "C-2401", "Cycle 2개", "6조 2교대", "총 18명", "운영중", "상세 보기"],
  ["신림CC", "C-2405", "Cycle 1개", "3조 교대", "총 9명", "운영중", "상세 보기"]
] as const;

const cycleCards = [
  { title: "Cycle A", pattern: "D,D,O,O,N,N,O,O", teams: "A조, B조" },
  { title: "Cycle B", pattern: "N,N,O,O,D,D,O,O", teams: "C조, D조" }
] as const;

const teamColumns = [
  { label: "A조", count: "3명" },
  { label: "B조", count: "3명" },
  { label: "C조", count: "3명" },
  { label: "Pool 근무", count: "2명" }
] as const;

const patternImportTabs = ["분석 결과", "그룹별 상세", "불일치 내역", "원본 데이터"] as const;

const SiteListPanels = ({ activeFocusIndex = 0, variant }: SiteGuideSceneProps) => {
  const showPatternImportModal =
    variant === "pattern-import" || variant === "pattern-import-sheet" || variant === "pattern-import-preview";

  return (
    <>
      <div className="guide-site-hero">
        <div className="guide-site-topbar-copy">
          <strong>교대근무 및 수당 관리 시스템</strong>
          <span>근무지 관리</span>
        </div>
        <div className="guide-site-toolbar-actions">
          <span className="guide-site-action-button guide-focus-target">
            패턴 적용된 근무지 추가
            {variant === "overview" ? <GuideMarker activeFocusIndex={activeFocusIndex} number={3} /> : null}
          </span>
          <span className="guide-site-action-button primary guide-focus-target">
            근무지 등록
            {variant === "overview" ? <GuideMarker activeFocusIndex={activeFocusIndex} number={2} /> : null}
          </span>
        </div>
      </div>

      <div className="guide-site-summary-grid">
        {listSummary.map((item, index) => (
          <div className={index === 0 ? "guide-site-summary-card emphasis" : "guide-site-summary-card"} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <article className="guide-site-table-card">
        <div className="guide-site-section-head">
          <div>
            <strong>근무지 목록</strong>
            <span>Cycle, 운영 구조, 조 현황, 상태를 같이 확인합니다.</span>
          </div>
          <span className="guide-site-pill tone-info">운영중 10개</span>
        </div>
        <div className="guide-site-table">
          <div className="guide-site-table-header">
            <span>근무지</span>
            <span>코드</span>
            <span>Cycle · 패턴</span>
            <span>운영 구조</span>
            <span>조 현황</span>
            <span>상태</span>
            <span>액션</span>
          </div>
          {siteRows.map((row, index) => (
            <div className={index === 0 ? "guide-site-table-row guide-site-table-row--focus" : "guide-site-table-row"} key={`${row[0]}-${row[1]}`}>
              <span
                className={
                  index === 0 && (variant === "list" || variant === "overview")
                    ? "guide-site-table-strong guide-focus-target"
                    : "guide-site-table-strong"
                }
              >
                {row[0]}
                {index === 0 && (variant === "list" || variant === "overview") ? (
                  <GuideMarker activeFocusIndex={activeFocusIndex} number={1} />
                ) : null}
              </span>
              <span>{row[1]}</span>
              <span className={index === 0 && variant === "list" ? "guide-focus-target" : undefined}>
                {row[2]}
                {index === 0 && variant === "list" ? (
                  <GuideMarker activeFocusIndex={activeFocusIndex} number={2} />
                ) : null}
              </span>
              <span>{row[3]}</span>
              <span>{row[4]}</span>
              <span className="guide-site-pill tone-info">{row[5]}</span>
              <span className={index === 0 && variant === "list" ? "guide-site-action-button compact guide-focus-target" : "guide-site-action-button compact"}>
                {row[6]}
                {index === 0 && variant === "list" ? (
                  <GuideMarker activeFocusIndex={activeFocusIndex} number={3} />
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </article>

      {showPatternImportModal ? (
        <div className="guide-site-import-modal">
          <div className="guide-site-modal-head">
            <strong>패턴 적용된 근무지 추가</strong>
            <span>표준 근무표 Excel 파일에서 Cycle과 offset을 산출합니다.</span>
          </div>
          <div className="guide-site-import-file-card guide-focus-target">
            <div>
              <strong>근무표 파일 Import</strong>
              <span>schedule-pattern-2026-04.xlsx</span>
            </div>
            <div className="guide-site-inline-actions">
              <span className="guide-site-action-button guide-focus-target">
                파일 가져오기
                {variant === "pattern-import-sheet" ? (
                  <GuideMarker activeFocusIndex={activeFocusIndex} number={1} />
                ) : null}
              </span>
              <span className="guide-site-action-button guide-focus-target">
                패턴 산출
                {variant === "pattern-import-sheet" ? (
                  <GuideMarker activeFocusIndex={activeFocusIndex} number={2} />
                ) : null}
              </span>
            </div>
            {variant === "pattern-import" ? <GuideMarker activeFocusIndex={activeFocusIndex} number={1} /> : null}
          </div>

          {variant !== "pattern-import-sheet" ? (
            <>
              <div className="guide-site-import-summary-grid">
                <div className="guide-site-summary-card emphasis">
                  <span>분석 기간</span>
                  <strong>2026-04-01 ~ 2026-04-30</strong>
                </div>
                <div className="guide-site-summary-card">
                  <span>분석 대상</span>
                  <strong>18명</strong>
                </div>
                <div className="guide-site-summary-card">
                  <span>발견 Cycle</span>
                  <strong>2개</strong>
                </div>
              </div>
              <div className="guide-site-inline-marker guide-focus-target">
                <div className="guide-site-import-tab-row">
                  {patternImportTabs.map((tab, index) => (
                    <span className={index === 0 ? "guide-site-tab active" : "guide-site-tab"} key={tab}>
                      {tab}
                    </span>
                  ))}
                </div>
                {variant === "pattern-import" || variant === "pattern-import-preview" ? (
                  <GuideMarker activeFocusIndex={activeFocusIndex} number={2} />
                ) : null}
              </div>
            </>
          ) : null}

          {variant === "pattern-import-preview" ? (
            <article className="guide-site-import-preview-card guide-focus-target">
              <div className="guide-site-section-head">
                <div>
                  <strong>패턴 산출 결과 미리보기</strong>
                  <span>Cycle, offset, 정원 제안을 확인합니다.</span>
                </div>
                <span className="guide-site-action-button">텍스트 복사</span>
              </div>
              <div className="guide-site-import-result-grid">
                <div className="guide-site-import-result-item">
                  <strong>Cycle A</strong>
                  <span>D,D,O,O,N,N,O,O</span>
                  <em>A조, B조 / offset 0</em>
                </div>
                <div className="guide-site-import-result-item">
                  <strong>Cycle B</strong>
                  <span>N,N,O,O,D,D,O,O</span>
                  <em>C조, D조 / offset 2</em>
                </div>
              </div>
              <GuideMarker activeFocusIndex={activeFocusIndex} number={1} />
            </article>
          ) : null}

          {variant === "pattern-import-sheet" ? (
            <div className="guide-site-validation-note guide-focus-target">
              <strong>형식 점검</strong>
              <span>파일 구조가 맞지 않으면 이 영역에 오류와 경고가 표시됩니다.</span>
              <GuideMarker activeFocusIndex={activeFocusIndex} number={3} />
            </div>
          ) : null}

          <div className="guide-site-modal-actions">
            <span className="guide-site-action-button">닫기</span>
            <span className="guide-site-action-button primary guide-focus-target">
              근무지 등록(1단계 이동)
              {variant === "pattern-import" || variant === "pattern-import-preview" ? (
                <GuideMarker activeFocusIndex={activeFocusIndex} number={3} />
              ) : null}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
};

const SiteStepOnePanels = ({ activeFocusIndex = 0 }: Pick<SiteGuideSceneProps, "activeFocusIndex">) => (
  <>
    <div className="guide-site-stage-header">
      <div className="guide-site-stage-row">
        <span className="guide-site-stage-chip active">1단계: 패턴 등록</span>
        <span className="guide-site-stage-chip">2단계: 조직 구성</span>
      </div>
      <div className="guide-site-topbar-copy">
        <strong>근무지 등록 - 1단계 패턴 등록</strong>
        <span>기본 정보, Cycle 구성, Pool 기준을 저장합니다.</span>
      </div>
    </div>

    <div className="guide-site-step-one-grid">
      <article className="guide-site-form-card">
        <div className="guide-site-section-head">
          <div>
            <strong>기본 정보 및 패턴 설정</strong>
            <span>Cycle과 조 배정을 먼저 정의합니다.</span>
          </div>
          <span className="guide-site-action-button">패턴 및 설정정보 불러오기</span>
        </div>
        <div className="guide-site-form-grid guide-focus-target">
          <div className="guide-site-input-card">
            <span>근무지명</span>
            <strong>보라매DC</strong>
          </div>
          <div className="guide-site-input-card">
            <span>상태</span>
            <strong>운영중</strong>
          </div>
          <div className="guide-site-input-card">
            <span>조 수</span>
            <strong>6조</strong>
          </div>
          <div className="guide-site-input-card">
            <span>Cycle 수</span>
            <strong>2개</strong>
          </div>
          <GuideMarker activeFocusIndex={activeFocusIndex} number={1} />
        </div>
        <div className="guide-site-cycle-grid guide-focus-target">
          {cycleCards.map((card) => (
            <div className="guide-site-cycle-card" key={card.title}>
              <strong>{card.title}</strong>
              <span>{card.pattern}</span>
              <em>{card.teams}</em>
            </div>
          ))}
          <GuideMarker activeFocusIndex={activeFocusIndex} number={2} />
        </div>
      </article>

      <article className="guide-site-simulation-card guide-focus-target">
        <div className="guide-site-section-head">
          <div>
            <strong>월간 달력 시뮬레이션</strong>
            <span>패턴 시작일과 조별 Index로 달력 배치를 검토합니다.</span>
          </div>
          <span className="guide-site-pill tone-neutral">2026년 4월</span>
        </div>
        <div className="guide-site-calendar-grid">
          {Array.from({ length: 14 }, (_, index) => (
            <div className={index === 6 ? "guide-site-calendar-cell current" : "guide-site-calendar-cell"} key={`calendar-${index + 1}`}>
              <strong>{index + 1}</strong>
              <span>{index % 2 === 0 ? "A조 D" : "B조 N"}</span>
            </div>
          ))}
        </div>
        <GuideMarker activeFocusIndex={activeFocusIndex} number={3} />
      </article>
    </div>
  </>
);

const SiteStepTwoPanels = ({ activeFocusIndex = 0 }: Pick<SiteGuideSceneProps, "activeFocusIndex">) => (
  <>
    <div className="guide-site-stage-header">
      <div className="guide-site-stage-row">
        <span className="guide-site-stage-chip done">1단계: 패턴 등록</span>
        <span className="guide-site-stage-chip active">2단계: 조직 구성</span>
      </div>
      <div className="guide-site-topbar-copy">
        <strong>근무지 등록 - 2단계 조직 구성</strong>
        <span>후보 인력을 드래그해 조별 배정을 완료합니다.</span>
      </div>
    </div>

    <div className="guide-site-step-two-grid">
      <article className="guide-site-pool-card">
        <div className="guide-site-section-head">
          <div>
            <strong>배정 후보 인력</strong>
            <span>검색과 적용 일자를 먼저 정합니다.</span>
          </div>
          <span className="guide-site-pill tone-neutral">12명</span>
        </div>
        <div className="guide-site-form-grid guide-site-form-grid--three guide-focus-target">
          <div className="guide-site-input-card">
            <span>검색</span>
            <strong>이름/사번 검색</strong>
          </div>
          <div className="guide-site-input-card">
            <span>대상</span>
            <strong>전체</strong>
          </div>
          <div className="guide-site-input-card">
            <span>적용 일자</span>
            <strong>2026-04-01</strong>
          </div>
          <GuideMarker activeFocusIndex={activeFocusIndex} number={1} />
        </div>
        <div className="guide-site-candidate-list">
          {["김현수", "이민호", "박지수"].map((name) => (
            <div className="guide-site-candidate-card" key={name}>
              <span className="guide-site-candidate-avatar">{name.slice(0, 1)}</span>
              <div>
                <strong>{name}</strong>
                <span>드래그해서 조 배정</span>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="guide-site-board-card">
        <div className="guide-site-section-head">
          <div>
            <strong>조별 배정 보드</strong>
            <span>정원 입력 후 인력 카드를 조 컬럼으로 배정합니다.</span>
          </div>
          <span className="guide-site-pill tone-info">4개 그룹</span>
        </div>
        <div className="guide-site-board-columns guide-focus-target">
          {teamColumns.map((column) => (
            <div className="guide-site-board-column" key={column.label}>
              <div className="guide-site-board-column-head">
                <strong>{column.label}</strong>
                <span>{column.count}</span>
              </div>
              <div className="guide-site-board-member">
                <span>김현수</span>
              </div>
              <div className="guide-site-board-member">
                <span>이민호</span>
              </div>
            </div>
          ))}
          <GuideMarker activeFocusIndex={activeFocusIndex} number={2} />
        </div>
        <div className="guide-site-board-actions">
          <span className="guide-site-action-button">이전 단계</span>
          <span className="guide-site-action-button primary guide-focus-target">
            조직 구성 완료
            <GuideMarker activeFocusIndex={activeFocusIndex} number={3} />
          </span>
        </div>
      </article>
    </div>
  </>
);

const SiteDetailPanels = ({ activeFocusIndex = 0 }: Pick<SiteGuideSceneProps, "activeFocusIndex">) => (
  <>
    <div className="guide-site-hero">
      <div className="guide-site-topbar-copy">
        <strong>교대근무 및 수당 관리 시스템</strong>
        <span>근무지 관리 / 상세 보기</span>
      </div>
      <div className="guide-site-toolbar-actions">
        <span className="guide-site-action-button danger">근무지 삭제</span>
        <span className="guide-site-action-button guide-focus-target">
          근무표로 이동
          <GuideMarker activeFocusIndex={activeFocusIndex} number={3} />
        </span>
      </div>
    </div>

    <div className="guide-site-detail-grid">
      <article className="guide-site-detail-card">
        <div className="guide-site-section-head">
          <div>
            <strong>보라매DC</strong>
            <span>C-2401 / 6조 2교대</span>
          </div>
          <span className="guide-site-pill tone-info">운영중</span>
        </div>
        <div className="guide-site-detail-summary-grid guide-focus-target">
          <div className="guide-site-input-card">
            <span>Cycle 수</span>
            <strong>2개</strong>
          </div>
          <div className="guide-site-input-card">
            <span>Pool 운영</span>
            <strong>적용</strong>
          </div>
          <div className="guide-site-input-card">
            <span>배정 인원</span>
            <strong>18명</strong>
          </div>
          <GuideMarker activeFocusIndex={activeFocusIndex} number={1} />
        </div>
        <div className="guide-site-cycle-grid">
          {cycleCards.map((card) => (
            <div className="guide-site-cycle-card" key={`detail-${card.title}`}>
              <strong>{card.title}</strong>
              <span>{card.pattern}</span>
              <em>{card.teams}</em>
            </div>
          ))}
        </div>
      </article>

      <article className="guide-site-detail-card guide-focus-target">
        <div className="guide-site-section-head">
          <div>
            <strong>조 현황 및 근무시간</strong>
            <span>조별 인원과 시간대를 다시 검토합니다.</span>
          </div>
        </div>
        <div className="guide-site-board-columns guide-site-board-columns--detail">
          {teamColumns.map((column) => (
            <div className="guide-site-board-column" key={`detail-${column.label}`}>
              <div className="guide-site-board-column-head">
                <strong>{column.label}</strong>
                <span>{column.count}</span>
              </div>
              <div className="guide-site-board-member">
                <span>09:00 - 18:00</span>
              </div>
            </div>
          ))}
        </div>
        <GuideMarker activeFocusIndex={activeFocusIndex} number={2} />
      </article>
    </div>
  </>
);

const SiteOverlay = ({ variant }: SiteGuideSceneProps) => {
  if (variant === "toc") {
    return (
      <div className="guide-site-toc-overlay">
        {menuTocItems.map((item, index) => (
          <div className="guide-site-toc-card" key={item.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "pattern-import-toc") {
    return (
      <div className="guide-site-toc-overlay">
        {patternImportTocItems.map((item, index) => (
          <div className="guide-site-toc-card" key={item.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </div>
        ))}
      </div>
    );
  }

  return null;
};

export const SiteGuideScene = ({ activeFocusIndex = 0, variant }: SiteGuideSceneProps) => (
  <div className={`guide-site-scene guide-site-scene--${variant}`}>
    <div className="guide-scene-browser">
      <div className="guide-scene-browser-bar">
        <div className="guide-scene-browser-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="guide-scene-browser-url">shift-mgmt / sites</div>
      </div>

      <div className="guide-site-scene-canvas">
        {variant === "step1" ? <SiteStepOnePanels activeFocusIndex={activeFocusIndex} /> : null}
        {variant === "step2" ? <SiteStepTwoPanels activeFocusIndex={activeFocusIndex} /> : null}
        {variant === "detail" ? <SiteDetailPanels activeFocusIndex={activeFocusIndex} /> : null}
        {variant !== "step1" && variant !== "step2" && variant !== "detail" ? (
          <SiteListPanels activeFocusIndex={activeFocusIndex} variant={variant} />
        ) : null}
        <SiteOverlay variant={variant} />
      </div>
    </div>
  </div>
);
