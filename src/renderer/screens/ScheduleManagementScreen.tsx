import { useState } from "react";

const monthCalendars = {
  "10월": {
    matrix: [
      ["20", "30", "1", "2", "3", "4", "5"],
      ["6", "7", "8", "9", "10", "11", "12"],
      ["13", "14", "15", "16", "17", "18", "19"],
      ["20", "21", "22", "23", "24", "25", "26"],
      ["27", "28", "29", "30", "31", "1", "2"]
    ],
    labels: [
      ["", "", "A조", "B조", "C조", "D조", "주간"],
      ["휴무", "주간", "A조", "B조", "C조", "D조", "주간"],
      ["휴무", "주간", "A조", "B조", "C조", "D조", "주간"],
      ["휴무", "주간", "A조", "B조", "C조", "D조", "주간"],
      ["휴무", "주간", "A조", "B조", "", "", ""]
    ]
  },
  "11월": {
    matrix: [
      ["27", "28", "29", "30", "31", "1", "2"],
      ["3", "4", "5", "6", "7", "8", "9"],
      ["10", "11", "12", "13", "14", "15", "16"],
      ["17", "18", "19", "20", "21", "22", "23"],
      ["24", "25", "26", "27", "28", "29", "30"]
    ],
    labels: [
      ["", "", "", "", "", "A조", "주간"],
      ["휴무", "A조", "B조", "C조", "D조", "주간", "휴무"],
      ["A조", "B조", "C조", "D조", "주간", "휴무", "A조"],
      ["B조", "C조", "D조", "주간", "휴무", "A조", "B조"],
      ["C조", "D조", "주간", "휴무", "A조", "B조", "C조"]
    ]
  },
  "12월": {
    matrix: [
      ["1", "2", "3", "4", "5", "6", "7"],
      ["8", "9", "10", "11", "12", "13", "14"],
      ["15", "16", "17", "18", "19", "20", "21"],
      ["22", "23", "24", "25", "26", "27", "28"],
      ["29", "30", "31", "1", "2", "3", "4"]
    ],
    labels: [
      ["A조", "B조", "C조", "D조", "주간", "휴무", "A조"],
      ["B조", "C조", "D조", "주간", "휴무", "A조", "B조"],
      ["C조", "D조", "주간", "휴무", "A조", "B조", "C조"],
      ["D조", "주간", "휴무", "A조", "B조", "C조", "D조"],
      ["주간", "휴무", "A조", "", "", "", ""]
    ]
  }
};

const memberLists = ["김민수 (A조)", "이서윤 (B조)", "박준우 (C조)"];
const monthOrder = ["10월", "11월", "12월"] as const;

const weeklyRows = [
  ["김민수", "15.0", "0.0", "0.0"],
  ["김민수", "15.0", "0.0", "0.0"],
  ["이서윤", "15.0", "0.0", "0.0"],
  ["박준우", "18.0", "0.0", "0.0"],
  ["박준우", "15.0", "0.0", "0.0"]
];

const monthlyRows = [
  ["김민수", "119.0", "26.0", "0.0"],
  ["이서윤", "128.0", "13.0", "0.0"],
  ["박준우", "196.0", "22.0", "0.0"],
  ["김민수", "137.0", "10.0", "0.0"],
  ["사원명", "594.0", "37.0", "0.0"]
];

const summaryTitles = {
  "10월": { weekly: "10월 1주 요약", monthly: "10월 월간 합계" },
  "11월": { weekly: "11월 1주 요약", monthly: "11월 월간 합계" },
  "12월": { weekly: "12월 1주 요약", monthly: "12월 월간 합계" }
};

export const ScheduleManagementScreen = () => {
  const [monthIndex, setMonthIndex] = useState(0);
  const selectedMonth = monthOrder[monthIndex];
  const selectedCalendar = monthCalendars[selectedMonth];
  const selectedSummaryTitle = summaryTitles[selectedMonth];

  return (
    <div className="screen-stack schedule-screen">
      <section className="surface-card schedule-filter-shell">
        <div className="filter-grid schedule-filter-grid">
          <label className="field">
            <span>연도</span>
            <input readOnly value="2024년" />
          </label>
          <label className="field">
            <span>월</span>
            <input readOnly value={selectedMonth} />
          </label>
          <label className="field">
            <span>근무지</span>
            <input readOnly value="서울 본사" />
          </label>
        </div>
      </section>

      <section className="schedule-layout">
        <article className="surface-card schedule-calendar-panel">
          <div className="calendar-navigation">
            <button
              className="ghost-button compact-button"
              disabled={monthIndex === 0}
              onClick={() => {
                setMonthIndex((current) => Math.max(0, current - 1));
              }}
              type="button"
            >
              ←
            </button>
            <strong>{selectedMonth}</strong>
            <button
              className="ghost-button compact-button"
              disabled={monthIndex === monthOrder.length - 1}
              onClick={() => {
                setMonthIndex((current) => Math.min(monthOrder.length - 1, current + 1));
              }}
              type="button"
            >
              →
            </button>
          </div>
          <div className="desktop-calendar-head">
            <span>일</span>
            <span>월</span>
            <span>화</span>
            <span>수</span>
            <span>목</span>
            <span>금</span>
            <span>토</span>
          </div>
          <div className="desktop-calendar-grid">
            {selectedCalendar.matrix.flatMap((week, weekIndex) =>
              week.map((day, dayIndex) => (
                <div className="desktop-calendar-cell" key={`${weekIndex}-${dayIndex}`}>
                  <div className="desktop-calendar-top">
                    <strong>{day}</strong>
                    {selectedCalendar.labels[weekIndex][dayIndex] ? (
                      <span className="desktop-shift-badge">{selectedCalendar.labels[weekIndex][dayIndex]}</span>
                    ) : null}
                  </div>
                  <div className="desktop-calendar-members">
                    {day === "20" || day === "6" || day === "13" || day === "27" || day === "5" || day === "12" || day === "19" || day === "26" || selectedCalendar.labels[weekIndex][dayIndex] === "휴무" ? (
                      <span className="desktop-rest-label">휴무</span>
                    ) : (
                      memberLists.map((member) => (
                        <span className="desktop-member-chip" key={`${day}-${member}`}>
                          {member}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <aside className="schedule-summary-side">
          <article className="surface-card schedule-table-card">
            <div className="section-heading compact-heading">
              <h3>{selectedSummaryTitle.weekly}</h3>
            </div>
            <table className="info-table compact-table">
              <thead>
                <tr>
                  <th>사원명</th>
                  <th>기본근로시간</th>
                  <th>연장근로시간</th>
                  <th>야간근로시간</th>
                </tr>
              </thead>
              <tbody>
                {weeklyRows.map((row, index) => (
                  <tr key={`${row[0]}-${index}`}>
                    {row.map((item) => (
                      <td key={`${item}-${index}`}>{item}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          <article className="surface-card schedule-table-card">
            <div className="section-heading compact-heading">
              <h3>{selectedSummaryTitle.monthly}</h3>
            </div>
            <table className="info-table compact-table">
              <thead>
                <tr>
                  <th>사원명</th>
                  <th>기본근로시간</th>
                  <th>연장근로시간</th>
                  <th>야간근로시간</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.map((row, index) => (
                  <tr key={`${row[0]}-${index}`}>
                    {row.map((item) => (
                      <td key={`${item}-${index}`}>{item}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </aside>
      </section>

      <section className="surface-card schedule-path-panel">
        <div className="schedule-path-row">
          <strong>배포경로 설정</strong>
          <input readOnly value={"C:\\Users\\Admin\\Documents\\Schedules\\2024_10_Schedule.pdf"} />
          <button className="ghost-button compact-button" type="button">
            ...
          </button>
          <button className="primary-button" type="button">
            배포
          </button>
          <button className="ghost-button" type="button">
            뒤로가기
          </button>
        </div>
      </section>
    </div>
  );
};
