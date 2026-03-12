import { useState } from "react";

type WorkTypeLabel = "주간" | "야간" | "1근" | "2근" | "3근";
type WorkTypeTone = "day" | "night" | "first" | "second" | "third";
type ScheduleMode = "twoShift" | "threeShift";

interface ScheduleSummaryRow {
  employeeName: string;
  baseHours: string;
  overtimeHours: string;
  nightHours: string;
  legalHolidayHours: string;
}

interface WorkLegendItem {
  label: WorkTypeLabel;
  tone: WorkTypeTone;
}

interface CalendarAssignment {
  name: string;
  workType: WorkTypeLabel;
  tone: WorkTypeTone;
}

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

const monthOrder = ["10월", "11월", "12월"] as const;
const activeScheduleMode: ScheduleMode = "twoShift";
const workTypeLegendByMode: Record<ScheduleMode, WorkLegendItem[]> = {
  twoShift: [
    { label: "주간", tone: "day" },
    { label: "야간", tone: "night" }
  ],
  threeShift: [
    { label: "1근", tone: "first" },
    { label: "2근", tone: "second" },
    { label: "3근", tone: "third" }
  ]
};
const workAssignmentsByMode: Record<
  ScheduleMode,
  (weekIndex: number, dayIndex: number) => CalendarAssignment[]
> = {
  twoShift: (weekIndex, dayIndex) => {
    const dayRoster = ["김민수", "한지우", "이서윤", "오세린"];
    const nightRoster = ["박준우", "임도윤", "장서현", "최민재"];

    return [
      {
        name: dayRoster[(weekIndex + dayIndex) % dayRoster.length]!,
        workType: "주간",
        tone: "day"
      },
      {
        name: dayRoster[(weekIndex + dayIndex + 1) % dayRoster.length]!,
        workType: "주간",
        tone: "day"
      },
      {
        name: nightRoster[(weekIndex + dayIndex) % nightRoster.length]!,
        workType: "야간",
        tone: "night"
      }
    ];
  },
  threeShift: (weekIndex, dayIndex) => {
    const firstRoster = ["김민수", "한지우", "이서윤"];
    const secondRoster = ["박준우", "임도윤", "장서현"];
    const thirdRoster = ["문도현", "오세린", "최민재"];

    return [
      {
        name: firstRoster[(weekIndex + dayIndex) % firstRoster.length]!,
        workType: "1근",
        tone: "first"
      },
      {
        name: secondRoster[(weekIndex + dayIndex) % secondRoster.length]!,
        workType: "2근",
        tone: "second"
      },
      {
        name: thirdRoster[(weekIndex + dayIndex) % thirdRoster.length]!,
        workType: "3근",
        tone: "third"
      }
    ];
  }
};
const workTypeLegend = workTypeLegendByMode[activeScheduleMode];

const weeklyRows: ScheduleSummaryRow[] = [
  {
    employeeName: "김민수",
    baseHours: "15.0",
    overtimeHours: "0.0",
    nightHours: "0.0",
    legalHolidayHours: "0.0"
  },
  {
    employeeName: "한지우",
    baseHours: "15.0",
    overtimeHours: "1.0",
    nightHours: "0.0",
    legalHolidayHours: "0.0"
  },
  {
    employeeName: "이서윤",
    baseHours: "15.0",
    overtimeHours: "0.0",
    nightHours: "0.0",
    legalHolidayHours: "8.0"
  },
  {
    employeeName: "박준우",
    baseHours: "18.0",
    overtimeHours: "0.0",
    nightHours: "2.0",
    legalHolidayHours: "0.0"
  },
  {
    employeeName: "임도윤",
    baseHours: "15.0",
    overtimeHours: "0.0",
    nightHours: "4.0",
    legalHolidayHours: "0.0"
  }
];

const monthlyRows: ScheduleSummaryRow[] = [
  {
    employeeName: "김민수",
    baseHours: "119.0",
    overtimeHours: "26.0",
    nightHours: "0.0",
    legalHolidayHours: "8.0"
  },
  {
    employeeName: "이서윤",
    baseHours: "128.0",
    overtimeHours: "13.0",
    nightHours: "0.0",
    legalHolidayHours: "16.0"
  },
  {
    employeeName: "박준우",
    baseHours: "196.0",
    overtimeHours: "22.0",
    nightHours: "18.0",
    legalHolidayHours: "8.0"
  },
  {
    employeeName: "임도윤",
    baseHours: "137.0",
    overtimeHours: "10.0",
    nightHours: "42.0",
    legalHolidayHours: "0.0"
  },
  {
    employeeName: "직원 합계",
    baseHours: "594.0",
    overtimeHours: "71.0",
    nightHours: "60.0",
    legalHolidayHours: "32.0"
  }
];

const summaryTitles = {
  "10월": { weekly: "10월 1주 요약", monthly: "10월 월간 합계" },
  "11월": { weekly: "11월 1주 요약", monthly: "11월 월간 합계" },
  "12월": { weekly: "12월 1주 요약", monthly: "12월 월간 합계" }
};

const getAssignmentsForDay = (isRestDay: boolean, weekIndex: number, dayIndex: number) => {
  if (isRestDay) {
    return [];
  }

  return workAssignmentsByMode[activeScheduleMode](weekIndex, dayIndex);
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
          <label className="field filter-field filter-field-xs">
            <span>연도</span>
            <input readOnly value="2024년" />
          </label>
          <label className="field filter-field filter-field-xs">
            <span>월</span>
            <input readOnly value={selectedMonth} />
          </label>
          <label className="field filter-field filter-field-md">
            <span>근무지</span>
            <input readOnly value="서울 본사" />
          </label>
        </div>
      </section>

      <section className="schedule-layout">
        <article className="surface-card schedule-calendar-panel">
          <div className="schedule-calendar-toolbar">
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
            <div className="legend-row schedule-legend-row">
              {workTypeLegend.map((shift) => (
                <span className={`legend-item ${shift.tone}`} key={shift.label}>
                  {shift.label}
                </span>
              ))}
            </div>
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
              week.map((day, dayIndex) => {
                const label = selectedCalendar.labels[weekIndex][dayIndex];
                const isRestDay = dayIndex === 0 || dayIndex === 6 || label === "휴무";
                const assignments = getAssignmentsForDay(isRestDay, weekIndex, dayIndex);

                return (
                  <div
                    className={isRestDay ? "desktop-calendar-cell rest" : "desktop-calendar-cell"}
                    key={`${weekIndex}-${dayIndex}`}
                  >
                    <div className="desktop-calendar-top">
                      <strong>{day}</strong>
                    </div>
                    <div
                      className={
                        assignments.length > 0
                          ? "desktop-calendar-members"
                          : "desktop-calendar-members empty"
                      }
                    >
                      {assignments.map((assignment) => (
                        <span
                          className={`desktop-member-chip ${assignment.tone}`}
                          key={`${day}-${assignment.name}-${assignment.workType}`}
                        >
                          {assignment.name} · {assignment.workType}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </article>

        <aside className="schedule-summary-side">
          <article className="surface-card schedule-table-card">
            <div className="section-heading compact-heading">
              <h3>{selectedSummaryTitle.weekly}</h3>
            </div>
            <div className="data-scroll">
              <table className="info-table compact-table">
                <thead>
                  <tr>
                    <th>사원명</th>
                    <th>기본근로시간</th>
                    <th>연장근로시간</th>
                    <th>야간근로시간</th>
                    <th>법정휴일근로시간</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyRows.map((row, index) => (
                    <tr key={`${row.employeeName}-${index}`}>
                      <td>{row.employeeName}</td>
                      <td>{row.baseHours}</td>
                      <td>{row.overtimeHours}</td>
                      <td>{row.nightHours}</td>
                      <td>{row.legalHolidayHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="surface-card schedule-table-card">
            <div className="section-heading compact-heading">
              <h3>{selectedSummaryTitle.monthly}</h3>
            </div>
            <div className="data-scroll">
              <table className="info-table compact-table">
                <thead>
                  <tr>
                    <th>사원명</th>
                    <th>기본근로시간</th>
                    <th>연장근로시간</th>
                    <th>야간근로시간</th>
                    <th>법정휴일근로시간</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.map((row, index) => (
                    <tr key={`${row.employeeName}-${index}`}>
                      <td>{row.employeeName}</td>
                      <td>{row.baseHours}</td>
                      <td>{row.overtimeHours}</td>
                      <td>{row.nightHours}</td>
                      <td>{row.legalHolidayHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
