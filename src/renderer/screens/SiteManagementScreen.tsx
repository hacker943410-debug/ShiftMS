import { useEffect, useMemo, useState } from "react";

type SiteView = "list" | "step1" | "step2";
type ShiftTone = "day" | "night" | "first" | "second" | "third";

interface SiteRow {
  id: string;
  siteName: string;
  patternString: string;
  teamCount: number;
  shiftCount: number;
  capacity: number;
  poolEnabled: boolean;
  breakTime: string;
  startDate: string;
  shiftTimes: string[];
  teamIndexes: number[];
}

const siteRows: SiteRow[] = [
  {
    id: "seoul-security",
    siteName: "서울 본사 보안팀",
    patternString: "주간-주간-야간-야간-휴무-휴무 / A,B,C,D조 순환",
    teamCount: 4,
    shiftCount: 2,
    capacity: 12,
    poolEnabled: true,
    breakTime: "60분",
    startDate: "2024-09-01",
    shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
    teamIndexes: [0, 2, 4, 1]
  },
  {
    id: "busan-control",
    siteName: "부산 센터 관제실",
    patternString: "1근-2근-3근-휴무 / A,B,C조 순환",
    teamCount: 3,
    shiftCount: 3,
    capacity: 9,
    poolEnabled: false,
    breakTime: "30분",
    startDate: "2024-10-01",
    shiftTimes: ["06:00 - 14:00", "14:00 - 22:00", "22:00 - 06:00"],
    teamIndexes: [0, 1, 2]
  },
  {
    id: "daegu-ops",
    siteName: "대구 지사 운영실",
    patternString: "주간-주간-야간-야간-휴무-휴무 / 조별 교차 순환 패턴",
    teamCount: 4,
    shiftCount: 2,
    capacity: 8,
    poolEnabled: true,
    breakTime: "45분",
    startDate: "2024-11-01",
    shiftTimes: ["08:00 - 20:00", "20:00 - 08:00"],
    teamIndexes: [1, 3, 5, 0]
  }
];

const assignmentPool = [
  { name: "김민수", meta: "야간팀 / 사원", state: "미배정" },
  { name: "이영희", meta: "물류팀 / 사원", state: "미배정" },
  { name: "박지성", meta: "현장팀 / 대리", state: "서울 본사 보안팀" },
  { name: "최현우", meta: "경인지사 / 주임", state: "부산 센터 관제실" },
  { name: "정소연", meta: "마케팅 / 사원", state: "미배정" }
];

const shiftToneOrder: ShiftTone[] = ["day", "night", "first", "second", "third"];
const presetTimeRanges = [
  "07:00 - 19:00",
  "19:00 - 07:00",
  "06:00 - 14:00",
  "14:00 - 22:00",
  "22:00 - 06:00",
  "09:00 - 17:00"
];

const clampCount = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
};

const getTeamLabels = (teamCount: number) =>
  Array.from({ length: teamCount }, (_, index) => `${String.fromCharCode(65 + index)}조`);

const getShiftLabels = (shiftCount: number) => {
  if (shiftCount === 1) {
    return ["단일"];
  }

  if (shiftCount === 2) {
    return ["주간", "야간"];
  }

  if (shiftCount === 3) {
    return ["1근", "2근", "3근"];
  }

  return Array.from({ length: shiftCount }, (_, index) => `${index + 1}교대`);
};

const getShiftTone = (index: number): ShiftTone => shiftToneOrder[index % shiftToneOrder.length] ?? "day";

const getShiftFieldTitle = (label: string) => `${label} 근무시간`;

const buildPatternString = (teamCount: number, shiftCount: number) => {
  const shiftLabels = getShiftLabels(shiftCount);
  const patternCycle =
    shiftCount === 2 ? [...shiftLabels, ...shiftLabels, "휴무", "휴무"] : [...shiftLabels, "휴무"];

  return `${patternCycle.join("-")} / ${teamCount}조 ${shiftCount}교대 순환`;
};

const normalizeList = <T,>(items: T[], targetLength: number, fallbackFactory: (index: number) => T) =>
  Array.from({ length: targetLength }, (_, index) => items[index] ?? fallbackFactory(index));

const buildDefaultShiftTimes = (shiftCount: number) =>
  normalizeList<string>([], shiftCount, (index) => presetTimeRanges[index] ?? presetTimeRanges[presetTimeRanges.length - 1]);

const calculateHoursFromRange = (value: string) => {
  const parts = value.split("-");

  if (parts.length !== 2) {
    return "시간 입력";
  }

  const [startHour, startMinute] = parts[0].trim().split(":").map(Number);
  const [endHour, endMinute] = parts[1].trim().split(":").map(Number);

  if ([startHour, startMinute, endHour, endMinute].some((part) => Number.isNaN(part))) {
    return "시간 입력";
  }

  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;

  if (endTotal <= startTotal) {
    endTotal += 24 * 60;
  }

  return `${Math.round((endTotal - startTotal) / 60)}시간`;
};

const formatMonthLabel = (date: Date) =>
  `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, "0")}월`;

const getMonthRange = (startDate: string) => {
  const baseDate = new Date(startDate);

  return Array.from({ length: 3 }, (_, index) => {
    const currentDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + index, 1);

    return {
      key: `${currentDate.getFullYear()}-${currentDate.getMonth()}`,
      date: currentDate,
      label: formatMonthLabel(currentDate)
    };
  });
};

const buildSimulationCells = (
  monthDate: Date,
  startDate: string,
  teamLabels: string[],
  shiftLabels: string[]
) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDate = new Date(year, month, 1);
  const firstWeekday = firstDate.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + totalDays) / 7) * 7;
  const patternCycle =
    shiftLabels.length === 2
      ? [shiftLabels[0], shiftLabels[0], shiftLabels[1], shiftLabels[1], "휴무", "휴무"]
      : [...shiftLabels, "휴무"];
  const baseDate = new Date(startDate);
  const oneDay = 1000 * 60 * 60 * 24;

  return Array.from({ length: totalCells }, (_, index) => {
    const currentDate = new Date(year, month, index - firstWeekday + 1);
    const diffDays = Math.floor((currentDate.getTime() - baseDate.getTime()) / oneDay);
    const assignments = teamLabels.map((team, teamIndex) => {
      const cycleIndex =
        ((diffDays + teamIndex) % patternCycle.length + patternCycle.length) % patternCycle.length;
      const shiftLabel = patternCycle[cycleIndex];
      const shiftIndex = shiftLabels.indexOf(shiftLabel);

      return {
        team,
        shiftLabel,
        tone: shiftLabel === "휴무" ? "off" : getShiftTone(Math.max(shiftIndex, 0))
      };
    });

    return {
      key: `${year}-${month}-${index}`,
      dayLabel: String(currentDate.getDate()),
      isCurrentMonth: currentDate.getMonth() === month,
      assignments
    };
  });
};

const getSimulationSummary = (teamCount: number, shiftLabels: string[], shiftTimes: string[]) => {
  const averageShiftHours =
    shiftTimes.reduce((sum, timeRange) => {
      const hours = Number(calculateHoursFromRange(timeRange).replace("시간", ""));

      return sum + (Number.isNaN(hours) ? 0 : hours);
    }, 0) / Math.max(shiftTimes.length, 1);
  const weeklyHours = Math.round(teamCount * averageShiftHours * Math.max(shiftLabels.length, 1));
  const monthlyHours = weeklyHours * 4;

  return [
    { label: "총근로시간(주간)", value: `${weeklyHours}시간` },
    { label: "총근로시간(월간)", value: `${monthlyHours}시간` },
    { label: "법정휴일근로(주간)", value: `${Math.max(8, shiftLabels.length * 4)}시간` },
    { label: "법정휴일근로(월간)", value: `${Math.max(24, shiftLabels.length * 12)}시간` },
    ...shiftLabels.map((label, index) => ({
      label: `${label} 근무시간(월간)`,
      value: `${Math.round((monthlyHours / Math.max(shiftLabels.length, 1)) + index * 4)}시간`
    }))
  ];
};

const buildAssignedByTeams = (teamLabels: string[]) =>
  Object.fromEntries(
    teamLabels.map((team, index) => {
      if (index === 0) {
        return [team, ["강동현", "유재석"]];
      }

      if (index === 1) {
        return [team, ["오지훈"]];
      }

      return [team, []];
    })
  ) as Record<string, string[]>;

export const SiteManagementScreen = () => {
  const [view, setView] = useState<SiteView>("list");
  const [selectedSiteId, setSelectedSiteId] = useState(siteRows[0]?.id ?? "");
  const [detailSiteId, setDetailSiteId] = useState<string | null>(null);
  const [draftTeamCount, setDraftTeamCount] = useState(siteRows[0]?.teamCount ?? 4);
  const [draftShiftCount, setDraftShiftCount] = useState(siteRows[0]?.shiftCount ?? 2);
  const [draftShiftTimes, setDraftShiftTimes] = useState<string[]>(siteRows[0]?.shiftTimes ?? []);
  const [draftTeamIndexes, setDraftTeamIndexes] = useState<number[]>(siteRows[0]?.teamIndexes ?? []);
  const [simulationMonthIndex, setSimulationMonthIndex] = useState(0);

  const selectedSite = useMemo(
    () => siteRows.find((site) => site.id === selectedSiteId) ?? siteRows[0]!,
    [selectedSiteId]
  );

  useEffect(() => {
    setDraftTeamCount(selectedSite.teamCount);
    setDraftShiftCount(selectedSite.shiftCount);
    setDraftShiftTimes(selectedSite.shiftTimes);
    setDraftTeamIndexes(selectedSite.teamIndexes);
    setSimulationMonthIndex(0);
  }, [selectedSite]);

  useEffect(() => {
    setDraftShiftTimes((current) =>
      normalizeList(current, draftShiftCount, (index) => buildDefaultShiftTimes(draftShiftCount)[index] ?? "")
    );
  }, [draftShiftCount]);

  useEffect(() => {
    setDraftTeamIndexes((current) => normalizeList(current, draftTeamCount, (index) => index));
  }, [draftTeamCount]);

  const teamLabels = useMemo(() => getTeamLabels(draftTeamCount), [draftTeamCount]);
  const shiftLabels = useMemo(() => getShiftLabels(draftShiftCount), [draftShiftCount]);
  const monthRange = useMemo(() => getMonthRange(selectedSite.startDate), [selectedSite.startDate]);
  const simulationMonth = monthRange[simulationMonthIndex] ?? monthRange[0];
  const simulationCells = useMemo(
    () => buildSimulationCells(simulationMonth.date, selectedSite.startDate, teamLabels, shiftLabels),
    [simulationMonth, selectedSite.startDate, teamLabels, shiftLabels]
  );
  const summaryItems = useMemo(
    () => getSimulationSummary(draftTeamCount, shiftLabels, draftShiftTimes),
    [draftShiftTimes, draftTeamCount, shiftLabels]
  );
  const assignedByTeams = useMemo(() => buildAssignedByTeams(teamLabels), [teamLabels]);
  const [activeTeam, setActiveTeam] = useState(teamLabels[0] ?? "");

  useEffect(() => {
    setActiveTeam(teamLabels[0] ?? "");
  }, [teamLabels]);

  const draftPatternString = useMemo(
    () => buildPatternString(draftTeamCount, draftShiftCount),
    [draftShiftCount, draftTeamCount]
  );

  const handleTeamCountChange = (value: string) => {
    setDraftTeamCount(clampCount(Number(value), 2, 8));
  };

  const handleShiftCountChange = (value: string) => {
    setDraftShiftCount(clampCount(Number(value), 2, 6));
  };

  const handleShiftTimeChange = (index: number, value: string) => {
    setDraftShiftTimes((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };

  const handleTeamIndexChange = (index: number, value: string) => {
    const numericValue = Number(value);

    setDraftTeamIndexes((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? (Number.isNaN(numericValue) ? 0 : numericValue) : item))
    );
  };

  const openRegistration = () => {
    setDetailSiteId(null);
    setView("step1");
  };

  if (view === "step2") {
    return (
      <div className="screen-stack">
        <section className="surface-card site-stage-header">
          <div className="stage-indicator-row">
            <span className="stage-chip done">1단계: 근무유형 설정</span>
            <span className="stage-chip active">2단계: 조직 구성</span>
          </div>
          <div>
            <h3>근무지 등록 - 2단계: 조직 구성</h3>
            <p>{draftTeamCount}조 {draftShiftCount}교대 기준으로 조 편성과 미배정 인원 배치를 검토합니다.</p>
          </div>
        </section>

        <section className="site-step-two-layout">
          <article className="surface-card assignment-pool-card">
            <div className="section-heading compact-heading">
              <h3>미배정 및 타 근무지 인원</h3>
              <span className="pill neutral">{assignmentPool.length}명</span>
            </div>
            <div className="filter-grid site-pool-filters">
              <label className="field">
                <span>검색</span>
                <input readOnly value="이름 검색" />
              </label>
              <label className="field">
                <span>대상</span>
                <input readOnly value="미배정 + 타 근무지" />
              </label>
              <label className="field">
                <span>근무지</span>
                <input readOnly value="전체 근무지" />
              </label>
            </div>
            <div className="pool-list">
              {assignmentPool.map((person) => (
                <div className="pool-item" key={`${person.name}-${person.state}`}>
                  <div className="pool-avatar">{person.name.slice(0, 1)}</div>
                  <div className="pool-copy">
                    <strong>{person.name}</strong>
                    <span>{person.meta}</span>
                    <em className={person.state === "미배정" ? "pool-state neutral" : "pool-state warning"}>
                      {person.state}
                    </em>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="surface-card assignment-board-card">
            <div className="tab-row team-tab-row">
              {teamLabels.map((team) => (
                <button
                  className={team === activeTeam ? "tab-button active" : "tab-button"}
                  key={team}
                  onClick={() => {
                    setActiveTeam(team);
                  }}
                  type="button"
                >
                  {team}
                </button>
              ))}
            </div>

            <div className="assignment-dropzone">
              <div className="assigned-card-row">
                {(assignedByTeams[activeTeam] ?? []).map((name) => (
                  <div className="assigned-member-card" key={name}>
                    <span className="assigned-avatar">{name.slice(0, 1)}</span>
                    <div>
                      <strong>{name}</strong>
                      <span>{selectedSite.siteName}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="assignment-empty">
                <strong>인원을 이곳으로 드래그하여 {activeTeam}에 배정하세요</strong>
              </div>
            </div>

            <div className="team-summary-row">
              {teamLabels.map((team) => (
                <div className="team-summary-card" key={team}>
                  <span>{team}</span>
                  <strong>
                    {(assignedByTeams[team] ?? []).length}/
                    {Math.max(1, Math.ceil(selectedSite.capacity / teamLabels.length))}명
                  </strong>
                </div>
              ))}
            </div>

            <div className="site-shift-summary-grid">
              {shiftLabels.map((label, index) => (
                <div className="site-shift-summary-card" key={label}>
                  <span>{getShiftFieldTitle(label)}</span>
                  <strong>{draftShiftTimes[index] ?? ""}</strong>
                  <em>{calculateHoursFromRange(draftShiftTimes[index] ?? "")}</em>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="surface-card footer-action-card">
          <div className="button-row spread">
            <button
              className="ghost-button"
              onClick={() => {
                setView("step1");
              }}
              type="button"
            >
              이전 단계
            </button>
            <div className="button-row">
              <button className="ghost-button" type="button">
                임시 저장
              </button>
              <button className="primary-button" type="button">
                완료
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (view === "step1") {
    return (
      <div className="screen-stack">
        <section className="surface-card site-stage-header">
          <div className="stage-indicator-row">
            <span className="stage-chip active">1단계: 패턴 등록</span>
            <span className="stage-chip">2단계: 조직 구성</span>
          </div>
          <div>
            <h3>근무지 등록 - 1단계: 패턴 등록</h3>
            <p>{selectedSite.siteName} 기준으로 조 수, 교대 수, 시뮬레이션 구성을 검토합니다.</p>
          </div>
        </section>

        <section className="site-step-one-layout">
          <article className="surface-card site-form-panel">
            <div className="site-form-header">
              <div>
                <h3>기본 정보 및 패턴 설정</h3>
                <p>N조 N교대 값을 직접 입력하면 근무시간과 조별 Index가 함께 조정됩니다.</p>
              </div>
            </div>

            <div className="site-config-section">
              <strong className="site-config-title">기본 정보</strong>
              <div className="site-count-grid">
                <label className="field compact-site-field">
                  <span>조 수</span>
                  <input
                    max={8}
                    min={2}
                    onChange={(event) => {
                      handleTeamCountChange(event.target.value);
                    }}
                    type="number"
                    value={draftTeamCount}
                  />
                </label>
                <label className="field compact-site-field">
                  <span>교대 수</span>
                  <input
                    max={6}
                    min={2}
                    onChange={(event) => {
                      handleShiftCountChange(event.target.value);
                    }}
                    type="number"
                    value={draftShiftCount}
                  />
                </label>
              </div>

              <div className="site-form-grid">
                <label className="field wide-site-field">
                  <span>근무지명</span>
                  <input readOnly value={selectedSite.siteName} />
                </label>
                <label className="field wide-site-field">
                  <span>패턴 String</span>
                  <input readOnly value={draftPatternString} />
                </label>
                <label className="field compact-site-field">
                  <span>근무유형</span>
                  <input readOnly value={`${draftTeamCount}조 ${draftShiftCount}교대`} />
                </label>
                <label className="field compact-site-field">
                  <span>근무 정원</span>
                  <input readOnly value={String(selectedSite.capacity)} />
                </label>
                <label className="field inline-toggle-field compact-site-field">
                  <span>Pool 근무 여부</span>
                  <span className="toggle-pill">{selectedSite.poolEnabled ? "사용" : "미사용"}</span>
                </label>
                <label className="field compact-site-field">
                  <span>휴게시간</span>
                  <input readOnly value={selectedSite.breakTime} />
                </label>
                <label className="field compact-site-field">
                  <span>패턴 시작일</span>
                  <input readOnly value={selectedSite.startDate} />
                </label>
              </div>
            </div>

            <div className="site-config-section">
              <strong className="site-config-title">근무시간 구성</strong>
              <div className="site-time-grid">
                {shiftLabels.map((label, index) => (
                  <label className="field compact-site-field" key={label}>
                    <span>{getShiftFieldTitle(label)}</span>
                    <input
                      onChange={(event) => {
                        handleShiftTimeChange(index, event.target.value);
                      }}
                      value={draftShiftTimes[index] ?? ""}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="site-config-section">
              <strong className="site-config-title">조별 Index</strong>
              <div className="site-index-grid">
                {teamLabels.map((team, index) => (
                  <label className="field compact-site-field" key={team}>
                    <span>{team} Index</span>
                    <input
                      onChange={(event) => {
                        handleTeamIndexChange(index, event.target.value);
                      }}
                      type="number"
                      value={draftTeamIndexes[index] ?? 0}
                    />
                  </label>
                ))}
              </div>
            </div>

            <button className="primary-button" type="button">
              시뮬레이션 실행
            </button>
          </article>

          <article className="surface-card simulation-panel">
            <div className="section-heading compact-heading">
              <div>
                <h3>근무 패턴 시뮬레이션 결과</h3>
                <p>{simulationMonth.label} 기준, 패턴 시작일부터 3개월까지 확인 가능합니다.</p>
              </div>
              <div className="legend-row">
                {shiftLabels.map((label, index) => (
                  <span className={`legend-item ${getShiftTone(index)}`} key={label}>
                    {label}
                  </span>
                ))}
                <span className="legend-item muted">휴무</span>
              </div>
            </div>

            <div className="simulation-navigation">
              <button
                className="ghost-button compact-button"
                disabled={simulationMonthIndex === 0}
                onClick={() => {
                  setSimulationMonthIndex((current) => Math.max(current - 1, 0));
                }}
                type="button"
              >
                이전
              </button>
              <strong className="simulation-month-label">{simulationMonth.label}</strong>
              <button
                className="ghost-button compact-button"
                disabled={simulationMonthIndex === monthRange.length - 1}
                onClick={() => {
                  setSimulationMonthIndex((current) => Math.min(current + 1, monthRange.length - 1));
                }}
                type="button"
              >
                다음
              </button>
            </div>

            <div className="site-calendar-grid">
              {simulationCells.map((cell) => (
                <div className={cell.isCurrentMonth ? "site-calendar-cell" : "site-calendar-cell muted"} key={cell.key}>
                  <strong>{cell.dayLabel}</strong>
                  {cell.isCurrentMonth
                    ? cell.assignments.map((assignment) => (
                        <span className={`shift-chip ${assignment.tone}`} key={`${cell.key}-${assignment.team}`}>
                          {assignment.team} {assignment.shiftLabel}
                        </span>
                      ))
                    : null}
                </div>
              ))}
            </div>

            <div className="site-summary-strip">
              {summaryItems.map((item) => (
                <div className="site-summary-box" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="surface-card footer-action-card">
          <div className="button-row spread">
            <button
              className="ghost-button"
              onClick={() => {
                setView("list");
              }}
              type="button"
            >
              뒤로가기
            </button>
            <div className="button-row">
              <button className="ghost-button" type="button">
                적용
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setView("step2");
                }}
                type="button"
              >
                다음 단계
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const detailSite = detailSiteId ? siteRows.find((site) => site.id === detailSiteId) ?? null : null;
  const detailTeamLabels = detailSite ? getTeamLabels(detailSite.teamCount) : [];
  const detailShiftLabels = detailSite ? getShiftLabels(detailSite.shiftCount) : [];

  return (
    <div className="screen-stack">
      <section className="surface-card site-list-shell">
        <div className="section-heading compact-heading">
          <div>
            <h3>근무지 관리</h3>
            <p>등록된 근무지와 패턴, 조별 Index 현황을 확인합니다.</p>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              openRegistration();
            }}
            type="button"
          >
            근무지 등록
          </button>
        </div>

        <div className="data-scroll">
          <table className="info-table site-list-table">
            <thead>
              <tr>
                <th>근무지명</th>
                <th>패턴 String</th>
                <th>근무유형</th>
                <th>근무정원</th>
                <th>Pool근무 여부</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {siteRows.map((site) => (
                <tr key={site.id}>
                  <td className="table-strong">{site.siteName}</td>
                  <td>
                    <div className="pattern-preview">
                      <span>{site.patternString}</span>
                    </div>
                  </td>
                  <td>{site.teamCount}조 {site.shiftCount}교대</td>
                  <td>{site.capacity}명</td>
                  <td>
                    <span className={site.poolEnabled ? "pill info" : "pill neutral"}>
                      {site.poolEnabled ? "사용" : "미사용"}
                    </span>
                  </td>
                  <td>
                    <button
                      aria-label={`${site.siteName} 상세 보기`}
                      className="icon-button"
                      onClick={() => {
                        setDetailSiteId(site.id);
                        setSelectedSiteId(site.id);
                      }}
                      title="상세 보기"
                      type="button"
                    >
                      상세
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detailSite ? (
        <div className="modal-overlay">
          <div className="modal-card site-detail-modal">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <h3>{detailSite.siteName}</h3>
                <p>근무유형에 따라 근무시간 현황과 조별 Index가 동적으로 구성됩니다.</p>
              </div>
              <button
                className="ghost-button compact-button"
                onClick={() => {
                  setDetailSiteId(null);
                }}
                type="button"
              >
                닫기
              </button>
            </div>

            <div className="site-detail-grid">
              <div className="site-detail-section">
                <span>근무지명</span>
                <strong>{detailSite.siteName}</strong>
              </div>
              <div className="site-detail-section">
                <span>패턴 String</span>
                <strong>{detailSite.patternString}</strong>
              </div>
              <div className="site-detail-section">
                <span>근무유형</span>
                <strong>{detailSite.teamCount}조 {detailSite.shiftCount}교대</strong>
              </div>
              <div className="site-detail-section">
                <span>근무정원</span>
                <strong>{detailSite.capacity}명</strong>
              </div>
              <div className="site-detail-section">
                <span>Pool근무 여부</span>
                <strong>{detailSite.poolEnabled ? "사용" : "미사용"}</strong>
              </div>
              <div className="site-detail-section">
                <span>휴게시간 / 패턴 시작일</span>
                <strong>
                  {detailSite.breakTime} / {detailSite.startDate}
                </strong>
              </div>
            </div>

            <div className="site-worktime-grid">
              {detailShiftLabels.map((label, index) => (
                <div className="site-detail-section" key={label}>
                  <span>{getShiftFieldTitle(label)}</span>
                  <strong>{detailSite.shiftTimes[index] ?? ""}</strong>
                  <em>{calculateHoursFromRange(detailSite.shiftTimes[index] ?? "")}</em>
                </div>
              ))}
            </div>

            <div className="site-index-status-grid">
              {detailTeamLabels.map((team, index) => (
                <div className="site-detail-section" key={team}>
                  <span>{team} Index</span>
                  <strong>{detailSite.teamIndexes[index] ?? 0}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
