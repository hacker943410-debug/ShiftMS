import { GuideFocusHighlight } from "./motion-primitives";

type WorkforceGuideSceneVariant =
  | "overview"
  | "toc"
  | "filters"
  | "create"
  | "detail"
  | "wage-bulk"
  | "wage-bulk-toc"
  | "wage-bulk-sheet"
  | "wage-bulk-preview";

interface WorkforceGuideSceneProps {
  variant: WorkforceGuideSceneVariant;
  activeFocusIndex?: number;
}

const GuideMarker = ({ activeFocusIndex = 0, number }: { activeFocusIndex?: number; number: number }) => (
  <GuideFocusHighlight active={activeFocusIndex === number - 1} number={number} />
);

const menuTocItems = [
  { title: "목록 조회", description: "근무지, 상태, 배정상태, 검색어로 현재 인력을 빠르게 좁힙니다." },
  { title: "신규 인력 등록", description: "기본 인력 정보와 최초 시급, 배정 기준을 함께 저장합니다." },
  { title: "프로필 및 이력", description: "상세 화면에서 근무변경이력과 시급변경이력을 같이 확인합니다." },
  { title: "시급 일괄 업데이트", description: "Excel 파일을 읽어 대상자 검증 후 시급 이력을 한 번에 반영합니다." }
] as const;

const wageBulkTocItems = [
  { title: "파일 준비", description: "1행 헤더, 2행부터 데이터 구조로 표준 Excel 파일을 준비합니다." },
  { title: "열 매핑", description: "근무지명, 이름, 시급 열 문자를 정확히 지정합니다." },
  { title: "미리보기 검증", description: "적용 대상과 제외 대상을 먼저 확인한 뒤 반영 여부를 결정합니다." },
  { title: "일괄 반영", description: "적용일 기준으로 시급 이력을 생성하고 결과 메시지를 확인합니다." }
] as const;

const summaryPills = [
  { label: "재직 34명", tone: "info" },
  { label: "휴직 2명", tone: "neutral" },
  { label: "미배정 4명", tone: "warn" }
] as const;

const filterItems = [
  { label: "근무지", value: "전체" },
  { label: "현재상태", value: "재직" },
  { label: "배정상태", value: "배정중" },
  { label: "검색", value: "이름/사원번호 검색" }
] as const;

const employeeRows = [
  ["1", "E-2401", "정규직", "김현수", "보라매DC", "A조", "재직", "13,600원", "배정중", "2025-01-01 ~", "프로필 보기"],
  ["2", "E-2408", "계약직", "이민호", "신림CC", "B조", "재직", "14,200원", "배정중", "2025-03-01 ~", "프로필 보기"],
  ["3", "E-2412", "정규직", "박지수", "미배정", "미배정", "휴직", "12,800원", "미배정", "2025-06-01 ~", "프로필 보기"]
] as const;

const wageBulkReadyRows = [
  ["적용가능", "보라매DC", "김현수", "13,200원", "13,600원"],
  ["적용가능", "신림CC", "이민호", "13,900원", "14,200원"]
] as const;

const wageBulkSkippedRows = [["제외", "동탄센터", "최민서", "근무지/이름 불일치"]] as const;

const buildTableClass = (variant: WorkforceGuideSceneVariant) => {
  if (variant === "detail") {
    return "guide-workforce-scene-canvas guide-workforce-scene-canvas--detail";
  }

  return "guide-workforce-scene-canvas";
};

const WorkforceListPanels = ({ activeFocusIndex = 0, variant }: WorkforceGuideSceneProps) => {
  const showCreateModal = variant === "create";
  const showWageBulkModal = variant === "wage-bulk" || variant === "wage-bulk-sheet" || variant === "wage-bulk-preview";
  const showWageBulkPreview = variant === "wage-bulk-preview";

  return (
    <>
      <div className="guide-workforce-hero">
        <div className="guide-workforce-topbar-copy">
          <strong>교대근무 및 수당 관리 시스템</strong>
          <span>인력 관리</span>
        </div>
        <div className="guide-workforce-toolbar-actions">
          <span className="guide-workforce-action-button guide-focus-target">
            시급 일괄 업데이트
            {variant === "overview" ? <GuideMarker activeFocusIndex={activeFocusIndex} number={3} /> : null}
          </span>
          <span className="guide-workforce-action-button primary">신규 인력 등록</span>
        </div>
      </div>

      <div className="guide-workforce-summary-row">
        {summaryPills.map((item) => (
          <span className={`guide-workforce-pill tone-${item.tone}`} key={item.label}>
            {item.label}
          </span>
        ))}
      </div>

      <article className="guide-workforce-filter-shell guide-focus-target">
        <div className="guide-workforce-filter-grid">
          {filterItems.map((item, index) => (
            <div
              className={
                variant === "filters" && (index === 0 || index === 1 || index === 3)
                  ? "guide-workforce-filter-card guide-focus-target"
                  : "guide-workforce-filter-card"
              }
              key={item.label}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              {variant === "filters" && index === 0 ? (
                <GuideMarker activeFocusIndex={activeFocusIndex} number={1} />
              ) : null}
              {variant === "filters" && index === 1 ? (
                <GuideMarker activeFocusIndex={activeFocusIndex} number={2} />
              ) : null}
              {variant === "filters" && index === 3 ? (
                <GuideMarker activeFocusIndex={activeFocusIndex} number={3} />
              ) : null}
            </div>
          ))}
        </div>
        {variant === "overview" ? <GuideMarker activeFocusIndex={activeFocusIndex} number={1} /> : null}
      </article>

      <article className="guide-workforce-table-card">
        <div className="guide-workforce-section-head">
          <div>
            <strong>근무 인력 목록</strong>
            <span>사원 명부와 현재 배정 상태를 한 번에 확인합니다.</span>
          </div>
          <span className="guide-workforce-pill tone-neutral">34명 조회</span>
        </div>
        <div className="guide-workforce-table">
          <div className="guide-workforce-table-header">
            <span>No.</span>
            <span>사원번호</span>
            <span>고용형태</span>
            <span>이름</span>
            <span>근무지</span>
            <span>조이름</span>
            <span>현재상태</span>
            <span>통상시급</span>
            <span>배정상태</span>
            <span>근무기간</span>
            <span>프로필</span>
          </div>
          {employeeRows.map((row, index) => (
            <div className={index === 0 ? "guide-workforce-table-row guide-workforce-table-row--focus" : "guide-workforce-table-row"} key={`${row[1]}-${row[3]}`}>
              <span>{row[0]}</span>
              <span>{row[1]}</span>
              <span>{row[2]}</span>
              <span className="guide-workforce-table-strong">{row[3]}</span>
              <span>{row[4]}</span>
              <span>{row[5]}</span>
              <span className={row[6] === "재직" ? "guide-workforce-pill tone-info" : "guide-workforce-pill tone-neutral"}>{row[6]}</span>
              <span>{row[7]}</span>
              <span>{row[8]}</span>
              <span>{row[9]}</span>
              <span className={index === 0 && variant === "overview" ? "guide-workforce-profile-button guide-focus-target" : "guide-workforce-profile-button"}>
                {row[10]}
                {index === 0 && variant === "overview" ? (
                  <GuideMarker activeFocusIndex={activeFocusIndex} number={2} />
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </article>

      {showCreateModal ? (
        <div className="guide-workforce-create-modal">
          <div className="guide-workforce-modal-head">
            <strong>신규 인력 등록</strong>
            <span>기본 정보와 최초 시급을 저장합니다.</span>
          </div>
          <div className="guide-workforce-create-grid guide-focus-target">
            <div className="guide-workforce-input-card">
              <span>사원번호</span>
              <strong>자동 생성</strong>
            </div>
            <div className="guide-workforce-input-card">
              <span>고용형태</span>
              <strong>정규직</strong>
            </div>
            <div className="guide-workforce-input-card">
              <span>이름</span>
              <strong>김현수</strong>
            </div>
            <div className="guide-workforce-input-card">
              <span>근무지</span>
              <strong>보라매DC</strong>
            </div>
            <div className="guide-workforce-input-card guide-focus-target">
              <span>통상시급</span>
              <strong>13,600원</strong>
              <GuideMarker activeFocusIndex={activeFocusIndex} number={2} />
            </div>
            <div className="guide-workforce-input-card">
              <span>적용일</span>
              <strong>2026-04-01</strong>
            </div>
            <GuideMarker activeFocusIndex={activeFocusIndex} number={1} />
          </div>
          <div className="guide-workforce-modal-actions">
            <span className="guide-workforce-action-button">취소</span>
            <span className="guide-workforce-action-button primary guide-focus-target">
              저장
              <GuideMarker activeFocusIndex={activeFocusIndex} number={3} />
            </span>
          </div>
        </div>
      ) : null}

      {showWageBulkModal ? (
        <div className="guide-workforce-bulk-modal">
          <div className="guide-workforce-modal-head">
            <strong>시급 일괄 업데이트</strong>
            <span>Excel 파일을 읽고 시급 이력을 반영합니다.</span>
          </div>
          <div className="guide-workforce-bulk-file-card guide-focus-target">
            <div>
              <strong>파일 가져오기</strong>
              <span>wage-update-2026-04.xlsx</span>
            </div>
            <span className="guide-workforce-action-button">파일 가져오기</span>
            {variant === "wage-bulk" || variant === "wage-bulk-sheet" ? (
              <GuideMarker activeFocusIndex={activeFocusIndex} number={1} />
            ) : null}
          </div>
          <div className="guide-workforce-bulk-grid guide-focus-target">
            <div className="guide-workforce-input-card">
              <span>근무지명 열</span>
              <strong>B</strong>
            </div>
            <div className="guide-workforce-input-card">
              <span>이름 열</span>
              <strong>C</strong>
            </div>
            <div className="guide-workforce-input-card">
              <span>시급 열</span>
              <strong>D</strong>
            </div>
            <div className={variant === "wage-bulk-sheet" ? "guide-workforce-input-card guide-focus-target" : "guide-workforce-input-card"}>
              <span>적용 날짜</span>
              <strong>2026-04-01</strong>
              {variant === "wage-bulk-sheet" ? (
                <GuideMarker activeFocusIndex={activeFocusIndex} number={3} />
              ) : null}
            </div>
            {variant === "wage-bulk" || variant === "wage-bulk-sheet" ? (
              <GuideMarker activeFocusIndex={activeFocusIndex} number={2} />
            ) : null}
          </div>
          <div className={variant === "wage-bulk" ? "guide-workforce-bulk-summary-grid guide-focus-target" : "guide-workforce-bulk-summary-grid"}>
            <div className="guide-workforce-summary-card emphasis">
              <span>파일 행 수</span>
              <strong>12건</strong>
            </div>
            <div className="guide-workforce-summary-card">
              <span>적용 가능</span>
              <strong>8건</strong>
            </div>
            <div className="guide-workforce-summary-card">
              <span>제외 대상</span>
              <strong>4건</strong>
            </div>
            {variant === "wage-bulk" ? <GuideMarker activeFocusIndex={activeFocusIndex} number={3} /> : null}
          </div>

          {variant === "wage-bulk-preview" ? (
            <div className="guide-workforce-preview-action-note guide-focus-target">
              <strong>최종 반영 단계</strong>
              <span>검토가 끝나면 하단 반영 버튼으로 새 시급 이력을 생성합니다.</span>
              <GuideMarker activeFocusIndex={activeFocusIndex} number={3} />
            </div>
          ) : null}

          {showWageBulkPreview ? (
            <div className="guide-workforce-bulk-preview-stack">
              <article className="guide-workforce-bulk-preview-card guide-focus-target">
                <div className="guide-workforce-section-head">
                  <div>
                    <strong>적용 전 → 적용 후</strong>
                    <span>대상자를 먼저 확인합니다.</span>
                  </div>
                  <span className="guide-workforce-action-button">미리보기</span>
                </div>
                <GuideMarker activeFocusIndex={activeFocusIndex} number={1} />
                <div className="guide-workforce-bulk-table">
                  <div className="guide-workforce-bulk-table-header">
                    <span>상태</span>
                    <span>근무지</span>
                    <span>이름</span>
                    <span>적용 전</span>
                    <span>적용 후</span>
                  </div>
                  {wageBulkReadyRows.map((row) => (
                    <div className="guide-workforce-bulk-table-row" key={`${row[1]}-${row[2]}`}>
                      <span className="guide-workforce-pill tone-info">{row[0]}</span>
                      <span>{row[1]}</span>
                      <span>{row[2]}</span>
                      <span>{row[3]}</span>
                      <span>{row[4]}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="guide-workforce-bulk-preview-card guide-focus-target">
                <div className="guide-workforce-section-head">
                  <div>
                    <strong>제외 목록</strong>
                    <span>자동 반영되지 않는 행을 확인합니다.</span>
                  </div>
                </div>
                <GuideMarker activeFocusIndex={activeFocusIndex} number={2} />
                <div className="guide-workforce-bulk-table">
                  <div className="guide-workforce-bulk-table-header guide-workforce-bulk-table-header--skip">
                    <span>상태</span>
                    <span>근무지</span>
                    <span>이름</span>
                    <span>사유</span>
                  </div>
                  {wageBulkSkippedRows.map((row) => (
                    <div className="guide-workforce-bulk-table-row guide-workforce-bulk-table-row--skip" key={`${row[1]}-${row[2]}`}>
                      <span className="guide-workforce-pill tone-warn">{row[0]}</span>
                      <span>{row[1]}</span>
                      <span>{row[2]}</span>
                      <span>{row[3]}</span>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          ) : null}

          <div className="guide-workforce-modal-actions">
            <span className="guide-workforce-action-button">닫기</span>
            <span className="guide-workforce-action-button primary guide-focus-target">
              시급 일괄 업데이트
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
};

const WorkforceDetailPanels = ({ activeFocusIndex = 0 }: Pick<WorkforceGuideSceneProps, "activeFocusIndex">) => (
  <>
    <div className="guide-workforce-hero">
      <div className="guide-workforce-topbar-copy">
        <strong>교대근무 및 수당 관리 시스템</strong>
        <span>인력 관리 / 프로필 상세</span>
      </div>
      <div className="guide-workforce-toolbar-actions">
        <span className="guide-workforce-action-button">뒤로가기</span>
      </div>
    </div>

    <div className="guide-workforce-detail-layout">
      <article className="guide-workforce-detail-main guide-focus-target">
        <div className="guide-workforce-detail-hero">
          <div className="guide-workforce-avatar">김</div>
          <div>
            <strong>김현수</strong>
            <span>E-2401 / 정규직 / 보라매DC A조</span>
          </div>
        </div>

        <div className="guide-workforce-detail-summary-grid">
          <div className="guide-workforce-input-card">
            <span>현재 시급</span>
            <strong>13,600원</strong>
          </div>
          <div className="guide-workforce-input-card">
            <span>현재 상태</span>
            <strong>재직</strong>
          </div>
          <div className="guide-workforce-input-card">
            <span>근무기간</span>
            <strong>2025-01-01 ~</strong>
          </div>
        </div>

        <div className="guide-workforce-detail-form-grid">
          <div className="guide-workforce-input-card">
            <span>근무지</span>
            <strong>보라매DC</strong>
          </div>
          <div className="guide-workforce-input-card">
            <span>조이름</span>
            <strong>A조</strong>
          </div>
          <div className="guide-workforce-input-card">
            <span>시급 적용일</span>
            <strong>2026-04-01</strong>
          </div>
          <div className="guide-workforce-input-card">
            <span>비고</span>
            <strong>야간조 우선 배정</strong>
          </div>
        </div>
        <GuideMarker activeFocusIndex={activeFocusIndex} number={1} />
      </article>

      <aside className="guide-workforce-detail-side">
        <div className="guide-workforce-history-card guide-focus-target">
          <strong>근무변경이력</strong>
          <div className="guide-workforce-timeline-list">
            <div className="guide-workforce-timeline-item">
              <span className="guide-workforce-timeline-dot" />
              <p>2026-03-01 보라매DC A조 배정</p>
            </div>
            <div className="guide-workforce-timeline-item">
              <span className="guide-workforce-timeline-dot" />
              <p>2025-12-01 신림CC B조 종료</p>
            </div>
          </div>
          <GuideMarker activeFocusIndex={activeFocusIndex} number={2} />
        </div>

        <div className="guide-workforce-history-card guide-focus-target">
          <strong>시급변경이력</strong>
          <div className="guide-workforce-timeline-list">
            <div className="guide-workforce-timeline-item">
              <span className="guide-workforce-timeline-dot" />
              <p>2026-04-01 13,200원 → 13,600원</p>
            </div>
            <div className="guide-workforce-timeline-item">
              <span className="guide-workforce-timeline-dot" />
              <p>2025-10-01 12,800원 → 13,200원</p>
            </div>
          </div>
          <GuideMarker activeFocusIndex={activeFocusIndex} number={3} />
        </div>
      </aside>
    </div>
  </>
);

const WorkforceOverlay = ({ variant }: WorkforceGuideSceneProps) => {
  if (variant === "toc") {
    return (
      <div className="guide-workforce-toc-overlay">
        {menuTocItems.map((item, index) => (
          <div className="guide-workforce-toc-card" key={item.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "wage-bulk-toc") {
    return (
      <div className="guide-workforce-toc-overlay">
        {wageBulkTocItems.map((item, index) => (
          <div className="guide-workforce-toc-card" key={item.title}>
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

export const WorkforceGuideScene = ({ activeFocusIndex = 0, variant }: WorkforceGuideSceneProps) => (
  <div className={`guide-workforce-scene guide-workforce-scene--${variant}`}>
    <div className="guide-scene-browser">
      <div className="guide-scene-browser-bar">
        <div className="guide-scene-browser-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="guide-scene-browser-url">shift-mgmt / workforce</div>
      </div>

      <div className={buildTableClass(variant)}>
        {variant === "detail" ? (
          <WorkforceDetailPanels activeFocusIndex={activeFocusIndex} />
        ) : (
          <WorkforceListPanels activeFocusIndex={activeFocusIndex} variant={variant} />
        )}
        <WorkforceOverlay variant={variant} />
      </div>
    </div>
  </div>
);
