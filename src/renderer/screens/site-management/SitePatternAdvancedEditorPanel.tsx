import { useState } from "react";

import { DateField } from "../../components/DateField";
import { SiteTimeRangePicker } from "./SiteTimeRangePicker";

interface SitePatternAdvancedTeamIndex {
  teamIndex: number;
  teamLabel: string;
  value: number;
}

interface SitePatternAdvancedCycleDraft {
  breakMinutes: string;
  name: string;
  patternStartDate: string;
  patternString: string;
  shiftCount: string;
  shiftBreakMinutes: string[];
  shiftTimes: string[];
  holidayTimeMode: "unified" | "split";
  weekdayPublicHolidayAsHoliday: boolean;
  holidayShiftTimes: string[];
  holidayShiftBreakMinutes: string[];
}

interface SitePatternAdvancedCycle {
  assignedTeamLabels: string[];
  cycleKey: string;
  cycleLabelCount: number;
  draft: SitePatternAdvancedCycleDraft;
  fallbackShiftTimes: string[];
  name: string;
  shiftCount: number;
  shiftLabels: string[];
  teamIndexes: SitePatternAdvancedTeamIndex[];
}

interface SitePatternAdvancedEditorPanelProps {
  cycles: SitePatternAdvancedCycle[];
  getPatternStringNote: (shiftCount: number) => string;
  getPatternStringPlaceholder: (shiftCount: number) => string;
  onCycleFieldChange: (
    cycleKey: string,
    field:
      | "name"
      | "shiftCount"
      | "patternStartDate"
      | "breakMinutes"
      | "patternString"
      | "holidayTimeMode",
    value: string
  ) => void;
  onCycleShiftBreakChange: (cycleKey: string, shiftIndex: number, value: string) => void;
  onCycleShiftTimeChange: (cycleKey: string, shiftIndex: number, value: string) => void;
  onCycleHolidayToggle: (cycleKey: string, checked: boolean) => void;
  onCycleHolidayShiftTimeChange: (cycleKey: string, shiftIndex: number, value: string) => void;
  onCycleHolidayShiftBreakChange: (cycleKey: string, shiftIndex: number, value: string) => void;
  onCycleTeamIndexChange: (cycleKey: string, teamIndex: number, value: string) => void;
  onPoolBreakMinutesChange: (value: string) => void;
  onPoolTimeRangeChange: (value: string) => void;
  poolBreakMinutes: string;
  poolDailyHoursText: string;
  poolEnabled: boolean;
  poolTimeRange: string;
}

interface CycleShiftGridProps {
  cycle: SitePatternAdvancedCycle;
  onCycleShiftTimeChange: (cycleKey: string, shiftIndex: number, value: string) => void;
  onCycleShiftBreakChange: (cycleKey: string, shiftIndex: number, value: string) => void;
  onCycleHolidayShiftTimeChange: (cycleKey: string, shiftIndex: number, value: string) => void;
  onCycleHolidayShiftBreakChange: (cycleKey: string, shiftIndex: number, value: string) => void;
}

// 평·휴 분리 시 평일/휴일 시간칸을 아래로 2배 쌓지 않고, [평일 | 휴일] 탭으로 한 자리에서 전환한다.
const CycleShiftGrid = ({
  cycle,
  onCycleShiftTimeChange,
  onCycleShiftBreakChange,
  onCycleHolidayShiftTimeChange,
  onCycleHolidayShiftBreakChange,
}: CycleShiftGridProps) => {
  const isSplit = cycle.draft.holidayTimeMode === "split";
  const [dayView, setDayView] = useState<"weekday" | "holiday">("weekday");
  const isHolidayView = isSplit && dayView === "holiday";

  return (
    <div className="site-time-grid-section">
      {isSplit ? (
        <div className="site-daytype-tabs" role="tablist" aria-label="평일·휴일 근무시간 전환">
          <button
            aria-selected={!isHolidayView}
            className={!isHolidayView ? "site-daytype-tab is-active" : "site-daytype-tab"}
            onClick={() => {
              setDayView("weekday");
            }}
            role="tab"
            type="button"
          >
            평일
          </button>
          <button
            aria-selected={isHolidayView}
            className={isHolidayView ? "site-daytype-tab is-active" : "site-daytype-tab"}
            onClick={() => {
              setDayView("holiday");
            }}
            role="tab"
            type="button"
          >
            휴일
          </button>
        </div>
      ) : null}
      <div className="site-time-grid">
        {cycle.shiftLabels.map((label, index) => {
          const timeValue = isHolidayView
            ? cycle.draft.holidayShiftTimes[index] ?? ""
            : cycle.draft.shiftTimes[index] ?? "";
          const breakValue = isHolidayView
            ? cycle.draft.holidayShiftBreakMinutes[index] ?? ""
            : cycle.draft.shiftBreakMinutes[index] ?? "";
          const timeFallback = isHolidayView
            ? cycle.draft.shiftTimes[index] ||
              cycle.fallbackShiftTimes[index] ||
              "09:00 - 17:00"
            : cycle.fallbackShiftTimes[index] ?? "09:00 - 17:00";
          const breakPlaceholder = isHolidayView
            ? cycle.draft.shiftBreakMinutes[index] || cycle.draft.breakMinutes
            : cycle.draft.breakMinutes;

          return (
            <div className="field compact-site-field" key={`${cycle.cycleKey}-${label}`}>
              <span>
                {label} 근무시간{isSplit ? (isHolidayView ? " · 휴일" : " · 평일") : ""}
              </span>
              <SiteTimeRangePicker
                fallbackValue={timeFallback}
                onChange={(value) => {
                  if (isHolidayView) {
                    onCycleHolidayShiftTimeChange(cycle.cycleKey, index, value);
                  } else {
                    onCycleShiftTimeChange(cycle.cycleKey, index, value);
                  }
                }}
                value={timeValue}
              />
              <label className="site-shift-break-field">
                <span>
                  {isSplit
                    ? isHolidayView
                      ? "휴일 휴게(분)"
                      : "평일 휴게(분)"
                    : `${label} 휴게(분)`}
                </span>
                <input
                  min={0}
                  onChange={(event) => {
                    if (isHolidayView) {
                      onCycleHolidayShiftBreakChange(cycle.cycleKey, index, event.target.value);
                    } else {
                      onCycleShiftBreakChange(cycle.cycleKey, index, event.target.value);
                    }
                  }}
                  placeholder={breakPlaceholder}
                  type="number"
                  value={breakValue}
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const SitePatternAdvancedEditorPanel = ({
  cycles,
  getPatternStringNote,
  getPatternStringPlaceholder,
  onCycleFieldChange,
  onCycleShiftBreakChange,
  onCycleShiftTimeChange,
  onCycleHolidayToggle,
  onCycleHolidayShiftTimeChange,
  onCycleHolidayShiftBreakChange,
  onCycleTeamIndexChange,
  onPoolBreakMinutesChange,
  onPoolTimeRangeChange,
  poolBreakMinutes,
  poolDailyHoursText,
  poolEnabled,
  poolTimeRange
}: SitePatternAdvancedEditorPanelProps) => (
  <>
    {poolEnabled ? (
      <div className="site-config-section">
        <div className="site-section-header-inline">
          <strong className="site-config-title">별도 근무 설정</strong>
          <span className="site-field-note">별도 근무는 근무시간만 산출하고 달력에는 반영하지 않습니다.</span>
        </div>
        <div className="site-topology-grid site-topology-grid-pool">
          <label className="field compact-site-field">
            <span>별도 근무시간</span>
            <SiteTimeRangePicker
              fallbackValue="09:00 - 18:00"
              onChange={onPoolTimeRangeChange}
              value={poolTimeRange}
            />
          </label>
          <label className="field compact-site-field">
            <span>별도 근무 휴게시간(분)</span>
            <input
              min={0}
              onChange={(event) => {
                onPoolBreakMinutesChange(event.target.value);
              }}
              type="number"
              value={poolBreakMinutes}
            />
          </label>
          <div className="site-worktype-card compact">
            <span>별도 근무 실근무시간</span>
            <strong>{poolDailyHoursText}시간</strong>
          </div>
        </div>
      </div>
    ) : null}

    <div className="site-cycle-editor-stack">
      {cycles.map((cycle) => (
        <details
          className="site-config-section site-cycle-config-section"
          key={cycle.cycleKey}
        >
          <summary className="site-cycle-config-head site-cycle-config-summary">
            <div className="site-cycle-config-summary-main">
              <strong className="site-config-title">{cycle.name} 설정</strong>
              <p className="site-config-copy">
                {cycle.assignedTeamLabels.length > 0
                  ? `배정 조: ${cycle.assignedTeamLabels.join(", ")}`
                  : "배정된 조가 아직 없습니다."}
              </p>
              <p className="site-cycle-config-summary-times">
                {cycle.shiftLabels
                  .map(
                    (label, index) =>
                      `${label} ${
                        cycle.draft.shiftTimes[index] ||
                        cycle.fallbackShiftTimes[index] ||
                        "-"
                      }`,
                  )
                  .join(" · ")}
              </p>
            </div>
            <span className="site-stage-badge neutral">
              {cycle.shiftCount}교대 / {Math.max(cycle.cycleLabelCount, 1)}일
            </span>
            <span className="site-cycle-config-chevron" aria-hidden="true">
              ⌄
            </span>
          </summary>
          <div className="site-cycle-config-layout is-balanced">
            <div className="site-cycle-config-main-panel">
              <div className="site-cycle-top-grid">
                <label className="field compact-site-field">
                  <span>근무 묶음 이름</span>
                  <input
                    onChange={(event) => {
                      onCycleFieldChange(cycle.cycleKey, "name", event.target.value);
                    }}
                    value={cycle.draft.name}
                  />
                </label>
                <label className="field compact-site-field">
                  <span>하루 교대 횟수</span>
                  <input
                    max={6}
                    min={1}
                    onChange={(event) => {
                      onCycleFieldChange(cycle.cycleKey, "shiftCount", event.target.value);
                    }}
                    type="number"
                    value={cycle.draft.shiftCount}
                  />
                </label>
                <label className="field compact-site-field">
                  <span>패턴 시작일</span>
                  <DateField
                    onChange={(value) => {
                      onCycleFieldChange(cycle.cycleKey, "patternStartDate", value);
                    }}
                    value={cycle.draft.patternStartDate}
                  />
                </label>
                <label className="field compact-site-field">
                  <span>휴게시간 기본값(분)</span>
                  <input
                    min={0}
                    onChange={(event) => {
                      onCycleFieldChange(cycle.cycleKey, "breakMinutes", event.target.value);
                    }}
                    type="number"
                    value={cycle.draft.breakMinutes}
                  />
                  <em className="site-field-note">
                    새 근무조의 기본 휴게시간입니다. 근무조별로 다르면 아래에서 각각 조정하세요.
                  </em>
                </label>
              </div>
              <div className="site-daytype-card">
                <div className="site-daytype-toggle-row">
                  <span className="site-daytype-label">시간 구분</span>
                  <div className="site-daytype-options">
                    <label className="site-daytype-option">
                      <input
                        checked={cycle.draft.holidayTimeMode !== "split"}
                        name={`daytype-${cycle.cycleKey}`}
                        onChange={() => {
                          onCycleFieldChange(cycle.cycleKey, "holidayTimeMode", "unified");
                        }}
                        type="radio"
                      />
                      <span>전체</span>
                    </label>
                    <label className="site-daytype-option">
                      <input
                        checked={cycle.draft.holidayTimeMode === "split"}
                        name={`daytype-${cycle.cycleKey}`}
                        onChange={() => {
                          onCycleFieldChange(cycle.cycleKey, "holidayTimeMode", "split");
                        }}
                        type="radio"
                      />
                      <span>평일·휴일 구분</span>
                    </label>
                  </div>
                </div>
                {cycle.draft.holidayTimeMode === "split" ? (
                  <label className="site-daytype-public-holiday">
                    <input
                      checked={cycle.draft.weekdayPublicHolidayAsHoliday}
                      onChange={(event) => {
                        onCycleHolidayToggle(cycle.cycleKey, event.target.checked);
                      }}
                      type="checkbox"
                    />
                    <span>평일에 낀 공휴일도 휴일 시간으로 계산</span>
                  </label>
                ) : (
                  <em className="site-field-note">
                    휴일(토·일·공휴일)에 평일과 다른 근무시간을 쓰려면 &apos;평일·휴일 구분&apos;을 선택하세요.
                  </em>
                )}
              </div>
              <div className="site-pattern-string-card">
                <span>{cycle.name} 근무 패턴</span>
                <input
                  onChange={(event) => {
                    onCycleFieldChange(cycle.cycleKey, "patternString", event.target.value);
                  }}
                  placeholder={getPatternStringPlaceholder(cycle.shiftCount)}
                  value={cycle.draft.patternString}
                />
                <em className="site-field-note">{getPatternStringNote(cycle.shiftCount)}</em>
              </div>
              <CycleShiftGrid
                cycle={cycle}
                onCycleHolidayShiftBreakChange={onCycleHolidayShiftBreakChange}
                onCycleHolidayShiftTimeChange={onCycleHolidayShiftTimeChange}
                onCycleShiftBreakChange={onCycleShiftBreakChange}
                onCycleShiftTimeChange={onCycleShiftTimeChange}
              />
            </div>
            <div className="site-config-section site-cycle-index-panel compact">
              <strong className="site-config-title">패턴 시작 위치</strong>
              <p className="site-config-copy">
                현재 입력 범위: 0 ~ {Math.max(cycle.cycleLabelCount - 1, 0)}
              </p>
              <div className="site-index-grid">
                {cycle.teamIndexes.length > 0 ? (
                  cycle.teamIndexes.map((team) => (
                    <label className="site-index-row" key={`${cycle.cycleKey}-${team.teamLabel}`}>
                      <span className="site-index-row-label">{team.teamLabel} 시작 위치</span>
                      <input
                        max={Math.max(cycle.cycleLabelCount - 1, 0)}
                        min={0}
                        onChange={(event) => {
                          onCycleTeamIndexChange(cycle.cycleKey, team.teamIndex, event.target.value);
                        }}
                        type="number"
                        value={team.value}
                      />
                    </label>
                  ))
                ) : (
                  <div className="site-empty-state">
                    <strong>이 묶음에 배정된 조가 없습니다.</strong>
                  </div>
                )}
              </div>
            </div>
          </div>
        </details>
      ))}
    </div>
  </>
);
