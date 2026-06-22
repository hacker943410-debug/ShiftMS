interface SitePatternSimulationShiftCard {
  breakMinutes: number;
  cycleName: string;
  key: string;
  label: string;
  timeRange: string;
  toneClassName: string;
}

interface SitePatternSimulationAssignmentSummary {
  cycleKey: string;
  cycleName: string;
  patternString: string;
  teams: string[];
}

interface SitePatternSimulationAssignment {
  dutyLabel: string;
  key: string;
  teamLabel: string;
  toneClassName: string;
}

interface SitePatternSimulationCell {
  assignments: SitePatternSimulationAssignment[];
  date: string;
  dayLabel: string;
  holidayClassName: string;
  holidayName?: string;
  isCurrentMonth: boolean;
  isHoliday: boolean;
  isToday: boolean;
  key: string;
}

interface SitePatternSimulationMetricItem {
  label: string;
  note?: string;
  value: string;
}

interface SitePatternSimulationMetricGroup {
  cycleKey: string;
  cycleName: string;
  items: SitePatternSimulationMetricItem[];
}

interface SitePatternSimulationPanelProps {
  assignmentSummaries: SitePatternSimulationAssignmentSummary[];
  canMoveNextMonth: boolean;
  canMovePreviousMonth: boolean;
  cycleShiftCards: SitePatternSimulationShiftCard[];
  invalidCycleMessages: string[];
  metricGroups: SitePatternSimulationMetricGroup[];
  onMoveNextMonth: () => void;
  onMovePreviousMonth: () => void;
  poolSummary:
    | {
        breakMinutes: string;
        dailyHoursText: string;
        timeRange: string;
      }
    | null;
  simulationAnchorDate: string;
  simulationCells: SitePatternSimulationCell[];
  simulationMonthLabel: string;
}

export const SitePatternSimulationPanel = ({
  assignmentSummaries,
  canMoveNextMonth,
  canMovePreviousMonth,
  cycleShiftCards,
  invalidCycleMessages,
  metricGroups,
  onMoveNextMonth,
  onMovePreviousMonth,
  poolSummary,
  simulationAnchorDate,
  simulationCells,
  simulationMonthLabel
}: SitePatternSimulationPanelProps) => (
  <article className="surface-card simulation-panel site-simulation-panel site-simulation-panel-expanded">
    <div className="site-simulation-header">
      <div>
        <h3>
          <span className="material-symbols-outlined section-glyph" aria-hidden="true">
            calendar_month
          </span>
          월간 달력 시뮬레이션
        </h3>
        <p>묶음별 패턴 시작일과 패턴 시작 위치 기준으로 이번 달 순환 배치를 미리 확인합니다.</p>
      </div>
      <div className="site-simulation-headline">
        <strong>{simulationMonthLabel}</strong>
        <span>기준일 {simulationAnchorDate}</span>
      </div>
    </div>
    <div className="site-cycle-legend-grid">
      {assignmentSummaries.map((summary) => (
        <div className="site-cycle-legend-card" key={`legend-${summary.cycleKey}`}>
          <strong>{summary.cycleName}</strong>
          <span>{summary.patternString}</span>
          <em>{summary.teams.length > 0 ? `${summary.teams.join(", ")} 배정` : "배정 조 없음"}</em>
        </div>
      ))}
    </div>
    {invalidCycleMessages.length > 0 ? (
      <div className="site-cycle-error-stack">
        {invalidCycleMessages.map((message) => (
          <p className="form-error-text" key={message}>
            근무 패턴 오류: {message}
          </p>
        ))}
      </div>
    ) : null}
    {poolSummary ? (
      <div className="site-pool-summary-card">
        <strong>별도 근무 운영</strong>
        <span>{poolSummary.timeRange}</span>
        <em>
          휴게 {poolSummary.breakMinutes}분 / 일 {poolSummary.dailyHoursText}시간
        </em>
      </div>
    ) : null}
    <div className="simulation-navigation">
      <button
        className="ghost-button compact-button"
        disabled={!canMovePreviousMonth}
        onClick={onMovePreviousMonth}
        type="button"
      >
        이전
      </button>
      <strong className="simulation-month-label">{simulationMonthLabel}</strong>
      <button
        className="ghost-button compact-button"
        disabled={!canMoveNextMonth}
        onClick={onMoveNextMonth}
        type="button"
      >
        다음
      </button>
    </div>
    <div className="legend-row site-legend-row">
      {cycleShiftCards.map((card) => (
        <span className={`legend-item ${card.toneClassName}`} key={`legend-item-${card.key}`}>
          {card.cycleName} · {card.label}
        </span>
      ))}
      <span className="legend-item muted">휴무</span>
    </div>
    <div className="site-calendar-head">
      {["일", "월", "화", "수", "목", "금", "토"].map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
    <div className="site-calendar-grid">
      {simulationCells.map((cell) => (
        <div
          className={
            ["site-calendar-cell", cell.isCurrentMonth ? "" : "muted", cell.isToday ? "current" : "", cell.isHoliday ? "holiday" : ""]
              .filter(Boolean)
              .join(" ")
          }
          key={cell.key}
        >
          <div className="site-calendar-top">
            <strong className={cell.isHoliday ? "site-calendar-date holiday" : "site-calendar-date"}>
              {cell.dayLabel}
            </strong>
            {cell.isToday ? <span className="site-calendar-today">오늘</span> : null}
          </div>
          {cell.holidayName ? (
            <span
              className={`site-calendar-holiday ${cell.holidayClassName}`}
              title={`${cell.date} · ${cell.holidayName}`}
            >
              {cell.holidayName}
            </span>
          ) : null}
          <div className="site-calendar-assignment-list">
            {cell.assignments.map((assignment) => (
              <span className={`shift-chip ${assignment.toneClassName}`} key={assignment.key}>
                {assignment.teamLabel} {assignment.dutyLabel}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
    <div className="site-shift-summary-grid site-shift-summary-grid-slim">
      {cycleShiftCards.map((card) => (
        <div className="site-shift-summary-card" key={card.key}>
          <span>
            {card.cycleName} · {card.label}
          </span>
          <strong>{card.timeRange}</strong>
          <em>휴게 {card.breakMinutes}분</em>
        </div>
      ))}
    </div>
    <div className="site-cycle-metric-stack">
      {metricGroups.map((metricGroup) => (
        <div className="site-cycle-metric-card" key={metricGroup.cycleKey}>
          <div className="site-cycle-metric-head">
            <strong>{metricGroup.cycleName}</strong>
            <span>1인 기준</span>
          </div>
          <div className="site-summary-strip site-summary-strip-wide">
            {metricGroup.items.map((item) => (
              <div className="site-summary-box" key={`${metricGroup.cycleKey}-${item.label}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                {item.note ? <em>{item.note}</em> : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </article>
);
