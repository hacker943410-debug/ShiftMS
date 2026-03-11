const filterValues = [
  { label: "연도", value: "2024년" },
  { label: "월", value: "10월" },
  { label: "근무지", value: "서울 본사" },
  { label: "이름", value: "김진수" }
];

const timeCards = [
  { label: "대체근로시간", value: "32.5시간" },
  { label: "연장근로시간", value: "48.0시간" },
  { label: "야간근로시간", value: "55.5시간" },
  { label: "총근로시간", value: "168.0시간" }
];

const allowanceCards = [
  { label: "대체근로수당", value: "₩ 390,000" },
  { label: "연장근로수당", value: "₩ 864,000" },
  { label: "야간근로수당", value: "₩ 1,110,000" },
  { label: "총근로수당", value: "₩ 2,364,000" }
];

const monthlyBars = [
  { month: "1월", substitute: 48, overtime: 28, night: 40, total: 84 },
  { month: "2월", substitute: 42, overtime: 24, night: 36, total: 76 },
  { month: "3월", substitute: 46, overtime: 26, night: 42, total: 80 },
  { month: "4월", substitute: 52, overtime: 30, night: 44, total: 88 },
  { month: "5월", substitute: 50, overtime: 24, night: 38, total: 82 },
  { month: "6월", substitute: 54, overtime: 28, night: 42, total: 84 },
  { month: "8월", substitute: 52, overtime: 36, night: 46, total: 84 },
  { month: "9월", substitute: 68, overtime: 40, night: 48, total: 108 },
  { month: "10월", substitute: 44, overtime: 32, night: 40, total: 74 },
  { month: "11월", substitute: 70, overtime: 44, night: 48, total: 96 },
  { month: "12월", substitute: 76, overtime: 48, night: 50, total: 104 }
];

const donutItems = [
  { label: "야간", value: "33%" },
  { label: "연장", value: "29%" },
  { label: "대체", value: "19%" },
  { label: "기본", value: "19%" }
];

const linePoints = [6, 17, 13, 16, 30, 25, 14, 18, 24, 15, 16, 19, 14, 24, 20, 21, 23, 25, 30, 29, 34, 24, 36, 26, 27, 36, 28, 22];
const lineLabels = ["10/01", "10/03", "10/05", "10/07", "10/09", "10/11", "10/13", "10/15", "10/17", "10/19", "10/21", "10/23", "10/25", "10/27", "10/29", "10/31"];

const stackedAreas = [
  { month: "1월", base: 42, overtime: 36, night: 28 },
  { month: "2월", base: 34, overtime: 31, night: 22 },
  { month: "3월", base: 44, overtime: 35, night: 27 },
  { month: "4월", base: 52, overtime: 38, night: 30 },
  { month: "5월", base: 63, overtime: 44, night: 36 },
  { month: "6월", base: 46, overtime: 39, night: 26 }
];

export const DashboardScreen = () => (
  <div className="screen-stack dashboard-screen">
    <section className="dashboard-filter-card">
      <div className="filter-grid dashboard-filter-grid">
        {filterValues.map((item) => (
          <label className="field" key={item.label}>
            <span>{item.label}</span>
            <input readOnly value={item.value} />
          </label>
        ))}
        <button className="primary-button dashboard-query-button" type="button">
          조회
        </button>
      </div>
    </section>

    <section className="metric-row-label">
      <strong>근로시간 요약</strong>
    </section>
    <section className="dashboard-card-grid">
      {timeCards.map((card) => (
        <article className="dashboard-kpi-card" key={card.label}>
          <div className="dashboard-kpi-icon time" />
          <div>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </div>
        </article>
      ))}
    </section>

    <section className="metric-row-label">
      <strong>수당 지급 요약</strong>
    </section>
    <section className="dashboard-card-grid">
      {allowanceCards.map((card) => (
        <article className="dashboard-kpi-card" key={card.label}>
          <div className="dashboard-kpi-icon money" />
          <div>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </div>
        </article>
      ))}
    </section>

    <section className="dashboard-chart-grid">
      <article className="surface-card chart-panel">
        <div className="section-heading compact-heading">
          <h3>월별 근무유형 트렌드</h3>
        </div>
        <div className="legend-row">
          <span className="legend-item blue">대체</span>
          <span className="legend-item orange">연장</span>
          <span className="legend-item cyan">야간</span>
          <span className="legend-item purple">총</span>
        </div>
        <div className="multi-bar-chart">
          {monthlyBars.map((bar) => (
            <div className="multi-bar-month" key={bar.month}>
              <div className="multi-bar-track">
                <span className="multi-bar substitute" style={{ height: `${bar.substitute}px` }} />
                <span className="multi-bar overtime" style={{ height: `${bar.overtime}px` }} />
                <span className="multi-bar night" style={{ height: `${bar.night}px` }} />
                <span className="multi-bar total" style={{ height: `${bar.total}px` }} />
              </div>
              <div className="chart-tooltip">
                <strong>{bar.month}</strong>
                <span>대체 {bar.substitute}</span>
                <span>연장 {bar.overtime}</span>
                <span>야간 {bar.night}</span>
                <span>총 {bar.total}</span>
              </div>
              <span>{bar.month}</span>
              <em className="chart-value-label">{bar.total}</em>
            </div>
          ))}
        </div>
      </article>

      <article className="surface-card chart-panel">
        <div className="section-heading compact-heading">
          <h3>근무 유형 분포</h3>
        </div>
        <div className="donut-layout">
          <div className="donut-chart">
            <div className="donut-hole central donut-center-copy">
              <strong>168h</strong>
              <span>총 근무시간</span>
            </div>
          </div>
          <div className="donut-copy-list">
            {donutItems.map((item, index) => (
              <div className="donut-copy interactive-progress-row" key={item.label}>
                <span className={`legend-dot idx-${index + 1}`} />
                <strong>{item.label}</strong>
                <span>{item.value}</span>
                <div className="chart-tooltip inline-tooltip">
                  <strong>{item.label}</strong>
                  <span>비중 {item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </article>

      <article className="surface-card chart-panel">
        <div className="section-heading compact-heading">
          <h3>연장근로 시간 변동 추이</h3>
        </div>
        <div className="line-chart">
          <div className="legend-row">
            <span className="legend-item blue">연장근로시간</span>
          </div>
          <div className="line-axis-column">
            <span>40</span>
            <span>30</span>
            <span>20</span>
            <span>10</span>
            <span>0</span>
          </div>
          {linePoints.map((point, index) => (
            <div className="line-point-column" key={`${point}-${index}`}>
              <span className="line-point" style={{ bottom: `${point * 2}px` }} />
              <div className="line-tooltip">{point}h</div>
            </div>
          ))}
          <svg className="line-svg" preserveAspectRatio="none" viewBox="0 0 100 100">
            <polyline
              fill="none"
              points={linePoints
                .map((point, index) => `${(index / (linePoints.length - 1)) * 100},${100 - point * 2}`)
                .join(" ")}
              stroke="#2f6fdb"
              strokeWidth="2"
            />
          </svg>
        </div>
        <div className="line-label-row">
          {lineLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </article>

      <article className="surface-card chart-panel">
        <div className="section-heading compact-heading">
          <h3>수당 항목별 비중 분석</h3>
        </div>
        <div className="stack-area-chart">
          {stackedAreas.map((item) => (
            <div className="stack-area-column" key={item.month}>
              <div className="stack-area-track">
                <span className="stack-segment stack-night" style={{ height: `${item.night}px` }} />
                <span className="stack-segment stack-overtime" style={{ height: `${item.overtime}px` }} />
                <span className="stack-segment stack-base" style={{ height: `${item.base}px` }} />
              </div>
              <div className="chart-tooltip">
                <strong>{item.month}</strong>
                <span>기본 {item.base}</span>
                <span>연장 {item.overtime}</span>
                <span>야간 {item.night}</span>
              </div>
              <span>{item.month}</span>
              <em className="chart-value-label">{item.base + item.overtime + item.night}</em>
            </div>
          ))}
        </div>
      </article>
    </section>
  </div>
);
