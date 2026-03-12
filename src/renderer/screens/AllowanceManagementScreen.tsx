import { Fragment, useState } from "react";

const siteDistribution = [
  { label: "서울 본사", amount: "₩52.4M", width: 88 },
  { label: "경기 지사", amount: "₩31.8M", width: 66 },
  { label: "부산 센터", amount: "₩18.2M", width: 42 }
];

const allowanceFormulasByYear = {
  "2024년": [
    "휴일근무: 기본근로시간 × 통상시급 × 1.5 / 연장근로시간 × 통상시급 × 2.0 / 야간근로시간 × 통상시급 × 2.5",
    "평일·휴일 대근: 기본근로시간 × 통상시급 × 1.0 / 연장근로시간 × 통상시급 × 1.5 / 야간근로시간 × 통상시급 × 2.0",
    "평일 연장: 기본근로시간 × 통상시급 × 1.0 / 연장근로시간 × 통상시급 × 1.5 / 야간근로시간 × 통상시급 × 2.0",
    "휴일 연장: 기본근로시간 × 통상시급 × 1.5 / 연장근로시간 × 통상시급 × 2.0 / 야간근로시간 × 통상시급 × 2.5"
  ]
};

const allowanceTableRows = [
  {
    siteName: "서울 본사",
    employeeName: "홍길동",
    type: "정기",
    date: "2024-10-25",
    hours: "40 / 40 / 0 / 0",
    hourlyRate: "10,000",
    expanded: false
  },
  {
    siteName: "경기 지사",
    employeeName: "김철수",
    type: "특근",
    date: "2024-10-26",
    hours: "10 / 8 / 2 / 0",
    hourlyRate: "12,000",
    expanded: true
  },
  {
    siteName: "부산 센터",
    employeeName: "이영희",
    type: "야간",
    date: "2024-10-27",
    hours: "8 / 0 / 0 / 8",
    hourlyRate: "11,000",
    expanded: false
  },
  {
    siteName: "서울 본사",
    employeeName: "박지성",
    type: "정기",
    date: "2024-10-25",
    hours: "40 / 40 / 0 / 0",
    hourlyRate: "15,000",
    expanded: false
  }
];

const getFormulaSummary = (
  type: string,
  selectedYear: keyof typeof allowanceFormulasByYear
) => {
  const formulas = allowanceFormulasByYear[selectedYear];

  if (type === "특근") {
    return formulas[0];
  }

  if (type === "야간") {
    return formulas[3];
  }

  return formulas[2];
};

export const AllowanceManagementScreen = () => {
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const selectedYear: keyof typeof allowanceFormulasByYear = "2024년";

  return (
    <div className="screen-stack allowance-screen">
      <section className="surface-card allowance-header-card">
        <div className="button-row spread allowance-top-row">
          <div className="button-row">
            <button className="ghost-button compact-button" type="button">
              뒤로가기
            </button>
            <h3>수당 관리</h3>
          </div>
          <div className="button-row">
            <button className="primary-button compact-button" type="button">
              품의 신청
            </button>
            <button className="ghost-button compact-button" type="button">
              엑셀 내보내기
            </button>
          </div>
        </div>

        <div className="filter-grid allowance-filter-grid">
          <label className="field filter-field filter-field-sm">
            <span>필터</span>
            <input readOnly value={selectedYear} />
          </label>
          <label className="field filter-field filter-field-xs">
            <span>월</span>
            <input readOnly value="10월" />
          </label>
          <label className="field filter-field filter-field-md">
            <span>사업장</span>
            <input readOnly value="전체 사업장" />
          </label>
          <button className="ghost-button align-end" type="button">
            초기화
          </button>
        </div>

        <div className="allowance-formula-strip">
          {allowanceFormulasByYear[selectedYear].map((formula) => (
            <div className="formula-item" key={formula}>
              <strong>{formula.split(":")[0]}</strong>
              <span>{formula.split(": ")[1]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={isChartExpanded ? "allowance-layout expanded-left" : "allowance-layout"}>
        <aside className="allowance-left-column">
          <article className="surface-card">
            <div className="section-heading compact-heading">
              <h3>사업장별 수당 분포</h3>
              <div className="button-row allowance-mode-row">
                <button
                  className={
                    isChartExpanded
                      ? "tab-chip active allowance-mode-button mode-chart"
                      : "tab-chip allowance-mode-button mode-chart"
                  }
                  onClick={() => {
                    setIsChartExpanded(true);
                  }}
                  type="button"
                >
                  <span aria-hidden="true" className="mode-icon" />
                  분석 우선
                </button>
                <button
                  className={
                    isChartExpanded
                      ? "tab-chip allowance-mode-button mode-detail"
                      : "tab-chip active allowance-mode-button mode-detail"
                  }
                  onClick={() => {
                    setIsChartExpanded(false);
                  }}
                  type="button"
                >
                  <span aria-hidden="true" className="mode-icon" />
                  상세 우선
                </button>
                <span>단위: 백만원</span>
              </div>
            </div>
            <div className="progress-list">
              {siteDistribution.map((item) => (
                <div className="progress-row interactive-progress-row" key={item.label}>
                  <div className="progress-copy">
                    <strong>{item.label}</strong>
                    <span>{item.amount}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${item.width}%` }} />
                  </div>
                  <div className="chart-tooltip inline-tooltip">
                    <strong>{item.label}</strong>
                    <span>지급수당 {item.amount}</span>
                    <span>점유율 {item.width}%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="allowance-total-box">
              <span>전체 수당 합계</span>
              <strong>₩102,450,000</strong>
              <em>+5.2%</em>
            </div>
          </article>

          <article className="surface-card">
            <div className="section-heading compact-heading">
              <h3>수당 유형별 비중</h3>
            </div>
            <div className="donut-emphasis">
              <div className="donut-chart">
                <div className="donut-hole central">
                  <strong>75%</strong>
                  <span>기본급 비중</span>
                </div>
              </div>
            </div>
            <div className="donut-copy-list vertical">
              <div className="donut-copy interactive-progress-row">
                <span className="legend-dot idx-1" />
                <strong>기본 수당 (75%)</strong>
                <div className="chart-tooltip inline-tooltip">
                  <strong>기본 수당</strong>
                  <span>구성 비율 75%</span>
                </div>
              </div>
              <div className="donut-copy interactive-progress-row">
                <span className="legend-dot idx-2" />
                <strong>연장/야간 (20%)</strong>
                <div className="chart-tooltip inline-tooltip">
                  <strong>연장/야간</strong>
                  <span>구성 비율 20%</span>
                </div>
              </div>
              <div className="donut-copy interactive-progress-row">
                <span className="legend-dot idx-4" />
                <strong>기타 수당 (5%)</strong>
                <div className="chart-tooltip inline-tooltip">
                  <strong>기타 수당</strong>
                  <span>구성 비율 5%</span>
                </div>
              </div>
            </div>
          </article>
        </aside>

        <article className="surface-card allowance-table-card">
          <div className="section-heading compact-heading">
            <h3>상세 수당 내역</h3>
            <label className="field allowance-search-field">
              <span>검색</span>
              <input readOnly value="직원명 검색" />
            </label>
          </div>
          <div className="data-scroll">
            <table className="info-table">
              <thead>
                <tr>
                  <th />
                  <th>사업장</th>
                  <th>성명</th>
                  <th>유형</th>
                  <th>날짜</th>
                  <th>총 / 기본 / 연장 / 야간</th>
                  <th>시급</th>
                </tr>
              </thead>
              <tbody>
                {allowanceTableRows.map((row) => (
                  <Fragment key={`${row.employeeName}-${row.date}`}>
                    <tr>
                      <td>{row.expanded ? "⌃" : "⌄"}</td>
                      <td>{row.siteName}</td>
                      <td className="table-strong">{row.employeeName}</td>
                      <td>
                        <span className={`pill ${row.type === "특근" ? "warn" : row.type === "야간" ? "info" : "neutral"}`}>
                          {row.type}
                        </span>
                      </td>
                      <td>{row.date}</td>
                      <td>{row.hours}</td>
                      <td>{row.hourlyRate}</td>
                    </tr>
                    {row.expanded ? (
                      <tr className="allowance-expanded-row">
                        <td />
                        <td colSpan={6}>
                          <div className="allowance-expanded-card">
                            <div>
                              <strong>상세 산출 근거</strong>
                              <p>기본 8h * 12,000원 = 96,000원</p>
                              <p>연장 2h * 12,000원 * 1.5 = 36,000원</p>
                              <p>{getFormulaSummary(row.type, selectedYear)}</p>
                            </div>
                            <div>
                              <strong>근무 시간</strong>
                              <p>출근: 09:00 / 퇴근: 20:00</p>
                              <p>휴게시간 제외 완료</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination-row right">
            <span>‹</span>
            <strong>1</strong>
            <span>2</span>
            <span>3</span>
            <span>›</span>
          </div>
        </article>
      </section>
    </div>
  );
};
