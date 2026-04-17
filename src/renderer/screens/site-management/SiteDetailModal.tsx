type SiteDetailStatus = "active" | "inactive";

interface SiteDetailModalRow {
  pattern: {
    poolBreakMinutes?: number;
    poolEnabled?: boolean;
    poolEndTime?: string;
    poolStartTime?: string;
  } | null;
  site: {
    customerName?: string;
    name: string;
    siteCode: string;
    status: SiteDetailStatus;
  };
  teamStatusItems: Array<{ headcount: number; label: string }>;
  workType: string;
}

interface SiteDetailCycleDefinition {
  breakMinutes: number;
  dutyCode: string;
  label: string;
  timeRange: string;
}

interface SiteDetailCycleTeam {
  headcount: number;
  maxHeadcount?: number;
  teamIndex: number;
  teamLabel: string;
}

interface SiteDetailCycleCard {
  cycleKey: string;
  cycleLength: number;
  name: string;
  patternStartDate?: string;
  patternString: string;
  shiftCount: number;
  shiftDefinitions: SiteDetailCycleDefinition[];
  teams: SiteDetailCycleTeam[];
}

interface SiteDetailTeamIndex {
  index: number;
  teamLabel: string;
}

interface SiteDetailModalProps {
  deleteError: string | null;
  detailCycleCards: SiteDetailCycleCard[];
  detailRow: SiteDetailModalRow | null;
  detailTeamIndexes: SiteDetailTeamIndex[];
  detailTotalAssignedHeadcount: number;
  isDeletingSite: boolean;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onOpenSchedule: () => void;
}

export const SiteDetailModal = ({
  deleteError,
  detailCycleCards,
  detailRow,
  detailTeamIndexes,
  detailTotalAssignedHeadcount,
  isDeletingSite,
  onClose,
  onDelete,
  onEdit,
  onOpenSchedule
}: SiteDetailModalProps) => {
  if (!detailRow) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div aria-modal="true" className="modal-card site-detail-modal" role="dialog">
        <div className="section-heading compact-heading">
          <div className="modal-heading-copy">
            <h3>{detailRow.site.name}</h3>
            <p>저장된 근무지, Cycle 구성, 근무시간, 조별 Index와 현재 배정 현황입니다.</p>
          </div>
          <div className="button-row">
            <button
              className="danger-button compact-button"
              disabled={isDeletingSite}
              onClick={onDelete}
              type="button"
            >
              {isDeletingSite ? "삭제 중..." : "근무지 삭제"}
            </button>
            <button className="ghost-button compact-button" onClick={onOpenSchedule} type="button">
              근무표 배포
            </button>
            <button className="primary-button compact-button" onClick={onEdit} type="button">
              수정
            </button>
            <button className="ghost-button compact-button" onClick={onClose} type="button">
              닫기
            </button>
          </div>
        </div>
        {deleteError ? <p className="form-error-text">{deleteError}</p> : null}
        <div className="site-detail-summary-grid">
          <div className="site-detail-section">
            <span>근무지 코드</span>
            <strong>{detailRow.site.siteCode}</strong>
          </div>
          <div className="site-detail-section">
            <span>사이트 명</span>
            <strong>{detailRow.site.customerName || "-"}</strong>
          </div>
          <div className="site-detail-section">
            <span>운영 상태</span>
            <strong>{detailRow.site.status === "active" ? "운영중" : "중지"}</strong>
          </div>
          <div className="site-detail-section">
            <span>근무유형</span>
            <strong>{detailRow.workType}</strong>
          </div>
          <div className="site-detail-section">
            <span>전체 배정 인원</span>
            <strong>{detailTotalAssignedHeadcount}명</strong>
            <em>{detailCycleCards.length}개 Cycle 기준</em>
          </div>
          <div className="site-detail-section site-detail-team-summary-section">
            <span>현재 조별 배정 현황</span>
            <div className="site-detail-team-chip-row">
              {detailRow.teamStatusItems.map((item) => (
                <span className="site-team-chip" key={`detail-${item.label}`}>
                  <em>{item.label}</em>
                  <strong>{item.headcount}명</strong>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="site-detail-cycle-stack">
          {detailCycleCards.length > 0 ? (
            detailCycleCards.map((cycle) => (
              <section className="site-detail-cycle-card" key={cycle.cycleKey}>
                <div className="site-detail-cycle-head">
                  <div>
                    <strong>{cycle.name}</strong>
                    <p>{cycle.patternString}</p>
                  </div>
                  <div className="site-detail-cycle-meta">
                    <span>패턴 시작일 {cycle.patternStartDate}</span>
                    <span>
                      {cycle.shiftCount}교대 / {cycle.cycleLength}일 Cycle
                    </span>
                  </div>
                </div>
                <div className="site-detail-shift-grid">
                  {cycle.shiftDefinitions.length > 0 ? (
                    cycle.shiftDefinitions.map((definition) => (
                      <div className="site-detail-section" key={`${cycle.cycleKey}-${definition.dutyCode}`}>
                        <span>
                          {cycle.name} · {definition.label} 근무시간
                        </span>
                        <strong>{definition.timeRange}</strong>
                        <em>휴게 {definition.breakMinutes}분</em>
                      </div>
                    ))
                  ) : (
                    <div className="site-detail-section">
                      <span>{cycle.name}</span>
                      <strong>등록된 근무시간이 없습니다.</strong>
                    </div>
                  )}
                </div>
                <div className="site-detail-team-grid">
                  {cycle.teams.length > 0 ? (
                    cycle.teams.map((team) => (
                      <div className="site-detail-section" key={`${cycle.cycleKey}-${team.teamLabel}`}>
                        <span>
                          {cycle.name} · {team.teamLabel}
                        </span>
                        <strong>조별 Index {team.teamIndex}</strong>
                        <em>
                          현재 {team.headcount}명
                          {typeof team.maxHeadcount === "number"
                            ? ` / 정원 ${team.maxHeadcount}명`
                            : " / 정원 제한 없음"}
                        </em>
                      </div>
                    ))
                  ) : (
                    <div className="site-detail-section">
                      <span>{cycle.name}</span>
                      <strong>이 Cycle에 편성된 조가 없습니다.</strong>
                    </div>
                  )}
                </div>
              </section>
            ))
          ) : (
            <div className="site-detail-section">
              <span>패턴 상태</span>
              <strong>등록된 패턴이 없습니다.</strong>
            </div>
          )}
          {detailRow.pattern?.poolEnabled ? (
            <section className="site-detail-cycle-card pool">
              <div className="site-detail-cycle-head">
                <div>
                  <strong>Pool 운영</strong>
                  <p>Pool은 달력 패턴에 포함되지 않고 별도 근무시간만 산출합니다.</p>
                </div>
                <div className="site-detail-cycle-meta">
                  <span>
                    근무시간 {detailRow.pattern.poolStartTime ?? "-"} - {detailRow.pattern.poolEndTime ?? "-"}
                  </span>
                  <span>휴게 {detailRow.pattern.poolBreakMinutes ?? 0}분</span>
                </div>
              </div>
            </section>
          ) : null}
          {detailTeamIndexes.length > 0 ? (
            <div className="site-index-status-grid">
              {detailTeamIndexes.map((item) => (
                <div className="site-detail-section" key={`summary-${item.teamLabel}`}>
                  <span>{item.teamLabel} 전체 Index 요약</span>
                  <strong>{item.index}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
