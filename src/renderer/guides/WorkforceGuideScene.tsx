import { MotionPointer, MotionRipple } from "./motion-primitives";

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
}

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

const WorkforceListPanels = ({ variant }: WorkforceGuideSceneProps) => {
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
          <span className="guide-workforce-action-button">시급 일괄 업데이트</span>
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

      <article className="guide-workforce-filter-shell">
        <div className="guide-workforce-filter-grid">
          {filterItems.map((item) => (
            <div className="guide-workforce-filter-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
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
              <span className="guide-workforce-profile-button">{row[10]}</span>
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
          <div className="guide-workforce-create-grid">
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
            <div className="guide-workforce-input-card">
              <span>통상시급</span>
              <strong>13,600원</strong>
            </div>
            <div className="guide-workforce-input-card">
              <span>적용일</span>
              <strong>2026-04-01</strong>
            </div>
          </div>
          <div className="guide-workforce-modal-actions">
            <span className="guide-workforce-action-button">취소</span>
            <span className="guide-workforce-action-button primary">저장</span>
          </div>
        </div>
      ) : null}

      {showWageBulkModal ? (
        <div className="guide-workforce-bulk-modal">
          <div className="guide-workforce-modal-head">
            <strong>시급 일괄 업데이트</strong>
            <span>Excel 파일을 읽고 시급 이력을 반영합니다.</span>
          </div>
          <div className="guide-workforce-bulk-file-card">
            <div>
              <strong>파일 가져오기</strong>
              <span>wage-update-2026-04.xlsx</span>
            </div>
            <span className="guide-workforce-action-button">파일 가져오기</span>
          </div>
          <div className="guide-workforce-bulk-grid">
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
            <div className="guide-workforce-input-card">
              <span>적용 날짜</span>
              <strong>2026-04-01</strong>
            </div>
          </div>
          <div className="guide-workforce-bulk-summary-grid">
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
          </div>

          {showWageBulkPreview ? (
            <div className="guide-workforce-bulk-preview-stack">
              <article className="guide-workforce-bulk-preview-card">
                <div className="guide-workforce-section-head">
                  <div>
                    <strong>적용 전 → 적용 후</strong>
                    <span>대상자를 먼저 확인합니다.</span>
                  </div>
                  <span className="guide-workforce-action-button">미리보기</span>
                </div>
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

              <article className="guide-workforce-bulk-preview-card">
                <div className="guide-workforce-section-head">
                  <div>
                    <strong>제외 목록</strong>
                    <span>자동 반영되지 않는 행을 확인합니다.</span>
                  </div>
                </div>
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
            <span className="guide-workforce-action-button primary">시급 일괄 업데이트</span>
          </div>
        </div>
      ) : null}
    </>
  );
};

const WorkforceDetailPanels = () => (
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
      <article className="guide-workforce-detail-main">
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
      </article>

      <aside className="guide-workforce-detail-side">
        <div className="guide-workforce-history-card">
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
        </div>

        <div className="guide-workforce-history-card">
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
        </div>
      </aside>
    </div>
  </>
);

const WorkforceOverlay = ({ variant }: WorkforceGuideSceneProps) => {
  if (variant === "overview") {
    return (
      <>
        <div className="guide-scene-callout guide-scene-callout--workforce-overview-filter">
          <strong>1. 목록 범위 고정</strong>
          <span>근무지, 상태, 배정상태, 검색어를 먼저 정하면 아래 명부가 같은 조건으로 좁혀집니다.</span>
        </div>
        <div className="guide-scene-callout guide-scene-callout--workforce-overview-profile">
          <strong>2. 프로필 상세 확인</strong>
          <span>행 우측 프로필 보기로 상세 화면에 들어가 근무변경이력과 시급변경이력을 확인합니다.</span>
        </div>
        <div className="guide-scene-callout guide-scene-callout--workforce-overview-bulk">
          <strong>3. 시급 일괄 업데이트</strong>
          <span>상단 버튼으로 Excel 기반 시급 변경을 일괄 검증하고 반영합니다.</span>
        </div>
      </>
    );
  }

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

  if (variant === "filters") {
    return (
      <>
        <div className="guide-scene-callout guide-scene-callout--workforce-filter-flow">
          <strong>{"근무지 -> 상태 -> 배정상태 -> 검색"}</strong>
          <span>배정 검토는 근무지와 상태를 먼저 좁히고 마지막에 이름/사번 검색을 더하는 흐름이 가장 안정적입니다.</span>
        </div>
        <MotionPointer className="guide-motion-pointer--workforce-filters" />
        <MotionRipple className="guide-motion-ripple--workforce-filters" />
      </>
    );
  }

  if (variant === "create") {
    return (
      <>
        <div className="guide-scene-callout guide-scene-callout--workforce-create-flow">
          <strong>{"기본정보 입력 -> 시급 확정 -> 저장"}</strong>
          <span>신규 인력은 이름, 근무지, 최초 시급, 적용일을 같이 맞춰야 이후 이력이 자연스럽게 이어집니다.</span>
        </div>
        <MotionPointer className="guide-motion-pointer--workforce-create" />
        <MotionRipple className="guide-motion-ripple--workforce-create" />
      </>
    );
  }

  if (variant === "detail") {
    return (
      <>
        <div className="guide-scene-callout guide-scene-callout--workforce-detail-flow">
          <strong>프로필과 이력 대조</strong>
          <span>좌측 현재 값과 우측 타임라인을 함께 읽으면 현재 배정과 변경 근거를 빠르게 확인할 수 있습니다.</span>
        </div>
        <MotionPointer className="guide-motion-pointer--workforce-detail" />
      </>
    );
  }

  if (variant === "wage-bulk") {
    return (
      <>
        <div className="guide-scene-callout guide-scene-callout--workforce-bulk-flow">
          <strong>상단 버튼으로 일괄 반영 시작</strong>
          <span>시급 일괄 업데이트는 메뉴 상단 버튼으로 열고, 파일 검증 후 이력 반영까지 한 번에 처리합니다.</span>
        </div>
        <MotionPointer className="guide-motion-pointer--workforce-bulk" />
        <MotionRipple className="guide-motion-ripple--workforce-bulk" />
      </>
    );
  }

  if (variant === "wage-bulk-sheet") {
    return (
      <>
        <div className="guide-scene-callout guide-scene-callout--workforce-bulk-sheet-flow">
          <strong>{"파일 가져오기 -> 열 매핑"}</strong>
          <span>근무지명, 이름, 시급 열 문자를 먼저 맞춰야 미리보기 대상자가 정확하게 계산됩니다.</span>
        </div>
        <MotionPointer className="guide-motion-pointer--workforce-bulk-sheet" />
        <MotionRipple className="guide-motion-ripple--workforce-bulk-sheet" />
      </>
    );
  }

  return (
    <>
      <div className="guide-scene-callout guide-scene-callout--workforce-bulk-preview-flow">
        <strong>{"미리보기 -> 제외 확인 -> 일괄 반영"}</strong>
        <span>적용 가능 목록과 제외 사유를 먼저 읽은 뒤 시급 일괄 업데이트 버튼으로 반영합니다.</span>
      </div>
      <MotionPointer className="guide-motion-pointer--workforce-bulk-preview" />
      <MotionRipple className="guide-motion-ripple--workforce-bulk-preview" />
    </>
  );
};

export const WorkforceGuideScene = ({ variant }: WorkforceGuideSceneProps) => (
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
        {variant === "detail" ? <WorkforceDetailPanels /> : <WorkforceListPanels variant={variant} />}
        <WorkforceOverlay variant={variant} />
      </div>
    </div>
  </div>
);
