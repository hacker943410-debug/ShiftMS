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
    field: "name" | "shiftCount" | "patternStartDate" | "breakMinutes" | "patternString",
    value: string
  ) => void;
  onCycleShiftBreakChange: (cycleKey: string, shiftIndex: number, value: string) => void;
  onCycleShiftTimeChange: (cycleKey: string, shiftIndex: number, value: string) => void;
  onCycleTeamIndexChange: (cycleKey: string, teamIndex: number, value: string) => void;
  onPoolBreakMinutesChange: (value: string) => void;
  onPoolTimeRangeChange: (value: string) => void;
  poolBreakMinutes: string;
  poolDailyHoursText: string;
  poolEnabled: boolean;
  poolTimeRange: string;
}

export const SitePatternAdvancedEditorPanel = ({
  cycles,
  getPatternStringNote,
  getPatternStringPlaceholder,
  onCycleFieldChange,
  onCycleShiftBreakChange,
  onCycleShiftTimeChange,
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
          <strong className="site-config-title">Pool 설정</strong>
          <span className="site-field-note">Pool은 근무시간만 산출하고 달력에는 반영하지 않습니다.</span>
        </div>
        <div className="site-topology-grid site-topology-grid-pool">
          <label className="field compact-site-field">
            <span>Pool 근무시간</span>
            <SiteTimeRangePicker
              fallbackValue="09:00 - 18:00"
              onChange={onPoolTimeRangeChange}
              value={poolTimeRange}
            />
          </label>
          <label className="field compact-site-field">
            <span>Pool 휴게시간(분)</span>
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
            <span>Pool 실근무시간</span>
            <strong>{poolDailyHoursText}시간</strong>
          </div>
        </div>
      </div>
    ) : null}

    <div className="site-cycle-editor-stack">
      {cycles.map((cycle) => (
        <div className="site-config-section site-cycle-config-section" key={cycle.cycleKey}>
          <div className="site-cycle-config-head">
            <div>
              <strong className="site-config-title">{cycle.name} 설정</strong>
              <p className="site-config-copy">
                {cycle.assignedTeamLabels.length > 0
                  ? `배정 조: ${cycle.assignedTeamLabels.join(", ")}`
                  : "배정된 조가 아직 없습니다."}
              </p>
            </div>
            <span className="site-stage-badge neutral">
              {cycle.shiftCount}교대 / {Math.max(cycle.cycleLabelCount, 1)}일
            </span>
          </div>
          <div className="site-cycle-config-layout is-balanced">
            <div className="site-cycle-config-main-panel">
              <div className="site-cycle-top-grid">
                <label className="field compact-site-field">
                  <span>Cycle 이름</span>
                  <input
                    onChange={(event) => {
                      onCycleFieldChange(cycle.cycleKey, "name", event.target.value);
                    }}
                    value={cycle.draft.name}
                  />
                </label>
                <label className="field compact-site-field">
                  <span>교대 수</span>
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
              <div className="site-pattern-string-card">
                <span>{cycle.name} 패턴 String</span>
                <input
                  onChange={(event) => {
                    onCycleFieldChange(cycle.cycleKey, "patternString", event.target.value);
                  }}
                  placeholder={getPatternStringPlaceholder(cycle.shiftCount)}
                  value={cycle.draft.patternString}
                />
                <em className="site-field-note">{getPatternStringNote(cycle.shiftCount)}</em>
              </div>
              <div className="site-time-grid">
                {cycle.shiftLabels.map((label, index) => (
                  <div className="field compact-site-field" key={`${cycle.cycleKey}-${label}`}>
                    <span>{label} 근무시간</span>
                    <SiteTimeRangePicker
                      fallbackValue={cycle.fallbackShiftTimes[index] ?? "09:00 - 17:00"}
                      onChange={(value) => {
                        onCycleShiftTimeChange(cycle.cycleKey, index, value);
                      }}
                      value={cycle.draft.shiftTimes[index] ?? ""}
                    />
                    <label className="site-shift-break-field">
                      <span>{label} 휴게(분)</span>
                      <input
                        min={0}
                        onChange={(event) => {
                          onCycleShiftBreakChange(cycle.cycleKey, index, event.target.value);
                        }}
                        placeholder={cycle.draft.breakMinutes}
                        type="number"
                        value={cycle.draft.shiftBreakMinutes[index] ?? ""}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div className="site-config-section site-cycle-index-panel compact">
              <strong className="site-config-title">조별 Index</strong>
              <p className="site-config-copy">
                현재 입력 범위: 0 ~ {Math.max(cycle.cycleLabelCount - 1, 0)}
              </p>
              <div className="site-index-grid">
                {cycle.teamIndexes.length > 0 ? (
                  cycle.teamIndexes.map((team) => (
                    <label className="site-index-row" key={`${cycle.cycleKey}-${team.teamLabel}`}>
                      <span className="site-index-row-label">{team.teamLabel} Index</span>
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
                    <strong>이 Cycle에 배정된 조가 없습니다.</strong>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  </>
);
