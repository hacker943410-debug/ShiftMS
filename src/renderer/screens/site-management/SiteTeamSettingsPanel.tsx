import { FormSelect } from "../../components/FormSelect";
import { teamWorkTypeLabels, teamWorkTypeValues } from "@shared/domain/team-work-type";

import { UNASSIGNED_CYCLE_KEY, type SiteTeamSettingDraft } from "./site-team-settings";

interface SiteTeamSettingsCycleOption {
  cycleKey: string;
  name: string;
}

interface SiteTeamSettingsPanelProps {
  cycleOptions: SiteTeamSettingsCycleOption[];
  onTeamCycleChange: (teamIndex: number, cycleKey: string) => void;
  onTeamDisplayNameChange: (teamIndex: number, value: string) => void;
  onTeamIsActiveChange: (teamIndex: number, checked: boolean) => void;
  onTeamMove: (teamIndex: number, direction: -1 | 1) => void;
  onTeamWorkTypeChange: (teamIndex: number, value: string) => void;
  teamCycleAssignments: string[];
  teamSettings: SiteTeamSettingDraft[];
}

export const SiteTeamSettingsPanel = ({
  cycleOptions,
  onTeamCycleChange,
  onTeamDisplayNameChange,
  onTeamIsActiveChange,
  onTeamMove,
  onTeamWorkTypeChange,
  teamCycleAssignments,
  teamSettings
}: SiteTeamSettingsPanelProps) => (
  <div className="site-config-section">
    <div className="site-section-header-inline">
      <strong className="site-config-title">조 관리</strong>
      <span className="site-field-note">
        조 수를 바꾸면 목록이 함께 늘거나 줄어듭니다. 여기서 정한 순서대로 달력과 근무표에 표시됩니다.
      </span>
    </div>
    <p className="site-config-copy">
      Pool과 주간고정조는 대체 근무에 들어가도 대체수당을 주지 않습니다. Pool은 근무 묶음을 &quot;배정 안
      함&quot;으로 두면 근무표에 나오지 않습니다. 사용을 끈 조는 달력과 근무표에서 빠집니다.
    </p>

    <div className="site-team-settings-list">
      {teamSettings.map((team, teamIndex) => {
        const assignedCycleKey = teamCycleAssignments[teamIndex] ?? UNASSIGNED_CYCLE_KEY;
        const canUnassign = team.workType === "POOL";

        return (
          <div
            className={team.isActive ? "site-team-settings-row" : "site-team-settings-row is-off"}
            key={team.teamLabel}
          >
            <div className="site-team-settings-order">
              <span className="site-team-settings-badge">{team.teamLabel}</span>
              <div className="site-team-settings-order-buttons">
                <button
                  aria-label={`${team.teamLabel} 위로 이동`}
                  className="icon-button compact-button"
                  disabled={teamIndex === 0}
                  onClick={() => {
                    onTeamMove(teamIndex, -1);
                  }}
                  type="button"
                >
                  <span className="material-symbols-outlined msi-sm" aria-hidden="true">
                    keyboard_arrow_up
                  </span>
                </button>
                <button
                  aria-label={`${team.teamLabel} 아래로 이동`}
                  className="icon-button compact-button"
                  disabled={teamIndex === teamSettings.length - 1}
                  onClick={() => {
                    onTeamMove(teamIndex, 1);
                  }}
                  type="button"
                >
                  <span className="material-symbols-outlined msi-sm" aria-hidden="true">
                    keyboard_arrow_down
                  </span>
                </button>
              </div>
            </div>

            <label className="field compact-site-field">
              <span>조 이름</span>
              <input
                onChange={(event) => {
                  onTeamDisplayNameChange(teamIndex, event.target.value);
                }}
                placeholder={team.teamLabel}
                value={team.displayName}
              />
            </label>

            <label className="field compact-site-field">
              <span>근무유형</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  onTeamWorkTypeChange(teamIndex, event.target.value);
                }}
                selectClassName="top-filter-select"
                value={team.workType}
              >
                {teamWorkTypeValues.map((workType) => (
                  <option key={workType} value={workType}>
                    {teamWorkTypeLabels[workType]}
                  </option>
                ))}
              </FormSelect>
            </label>

            <label className="field compact-site-field">
              <span>근무 묶음</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  onTeamCycleChange(teamIndex, event.target.value);
                }}
                selectClassName="top-filter-select"
                value={
                  cycleOptions.some((cycle) => cycle.cycleKey === assignedCycleKey)
                    ? assignedCycleKey
                    : UNASSIGNED_CYCLE_KEY
                }
              >
                {canUnassign ? <option value={UNASSIGNED_CYCLE_KEY}>배정 안 함</option> : null}
                {cycleOptions.map((cycle) => (
                  <option key={cycle.cycleKey} value={cycle.cycleKey}>
                    {cycle.name}
                  </option>
                ))}
              </FormSelect>
            </label>

            <label className="field site-toggle-field compact-site-field">
              <span>사용</span>
              <span className="site-checkbox-row">
                <input
                  checked={team.isActive}
                  onChange={(event) => {
                    onTeamIsActiveChange(teamIndex, event.target.checked);
                  }}
                  type="checkbox"
                />
                <strong>{team.isActive ? "사용" : "사용 안 함"}</strong>
              </span>
            </label>
          </div>
        );
      })}
    </div>
  </div>
);
