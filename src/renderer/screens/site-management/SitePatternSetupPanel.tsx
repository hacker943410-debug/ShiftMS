import type { DragEvent } from "react";

import { FormSelect } from "../../components/FormSelect";

interface SitePatternSetupCycleAssignment {
  cycleKey: string;
  name: string;
  patternString: string;
  teams: string[];
}

interface SitePatternSetupDraft {
  customerName: string;
  cycleCount: string;
  name: string;
  poolEnabled: boolean;
  siteCode: string;
  status: "active" | "inactive";
  teamCount: string;
}

interface SitePatternSetupPanelProps {
  customerNameOptions: string[];
  cycleAssignments: SitePatternSetupCycleAssignment[];
  cycleCount: number;
  draft: SitePatternSetupDraft;
  draggingTeamLabel: string | null;
  onAssignTeamToCycle: (teamLabel: string, cycleKey: string) => void;
  onClearDraggingTeam: () => void;
  onCycleCountChange: (value: string) => void;
  onCustomerNameChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onOpenPatternPresetModal: () => void;
  onPoolEnabledChange: (checked: boolean) => void;
  onStatusChange: (value: SitePatternSetupDraft["status"]) => void;
  onTeamCountChange: (value: string) => void;
  onStartDraggingTeam: (teamLabel: string) => void;
  patternPresetDisabled: boolean;
  teamCount: number;
}

export const SitePatternSetupPanel = ({
  customerNameOptions,
  cycleAssignments,
  cycleCount,
  draft,
  draggingTeamLabel,
  onAssignTeamToCycle,
  onClearDraggingTeam,
  onCycleCountChange,
  onCustomerNameChange,
  onNameChange,
  onOpenPatternPresetModal,
  onPoolEnabledChange,
  onStatusChange,
  onTeamCountChange,
  onStartDraggingTeam,
  patternPresetDisabled,
  teamCount
}: SitePatternSetupPanelProps) => (
  <>
    <div className="site-form-header">
      <div>
        <h3>기본 정보 및 패턴 설정</h3>
        <p>Cycle 단위로 패턴을 나누고, 각 조가 어느 Cycle을 따르는지 배정한 뒤 우측 달력으로 확인합니다.</p>
      </div>
      <div className="site-form-header-actions">
        <button
          className="ghost-button compact-button"
          disabled={patternPresetDisabled}
          onClick={onOpenPatternPresetModal}
          type="button"
        >
          패턴 및 설정정보 불러오기
        </button>
        <div className="site-form-badge-row">
          <span className="site-stage-badge">{draft.siteCode || "자동 코드"}</span>
          <span className="site-stage-badge neutral">
            {teamCount}조 / {cycleCount}개 Cycle
          </span>
          {draft.poolEnabled ? <span className="site-stage-badge neutral">Pool 적용</span> : null}
        </div>
      </div>
    </div>

    <div className="site-form-overview-grid">
      <div className="site-config-section">
        <div className="site-section-header-inline">
          <strong className="site-config-title">기본 정보</strong>
          <span className="site-field-note">코드와 상태는 근무지 기본값으로 사용됩니다.</span>
        </div>
        <div className="site-registration-grid site-registration-grid-stacked">
          <label className="field compact-site-field site-code-field">
            <span>근무지 코드</span>
            <input readOnly value={draft.siteCode} />
            <em className="site-field-note">신규 등록 시 자동 부여</em>
          </label>
          <label className="field compact-site-field site-name-field">
            <span>근무지명</span>
            <input
              onChange={(event) => {
                onNameChange(event.target.value);
              }}
              value={draft.name}
            />
          </label>
          <label className="field compact-site-field site-customer-field">
            <span>사이트 명</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                onCustomerNameChange(event.target.value);
              }}
              selectClassName="top-filter-select"
              value={draft.customerName}
            >
              <option value="">선택 안 함</option>
              {customerNameOptions.map((siteName) => (
                <option key={siteName} value={siteName}>
                  {siteName}
                </option>
              ))}
            </FormSelect>
            <em className="site-field-note">운영 관리의 사이트 명 관리에서 선택값을 수정합니다.</em>
          </label>
          <label className="field compact-site-field site-status-field">
            <span>상태</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                onStatusChange(event.target.value as SitePatternSetupDraft["status"]);
              }}
              selectClassName="top-filter-select"
              value={draft.status}
            >
              <option value="active">운영중</option>
              <option value="inactive">중지</option>
            </FormSelect>
          </label>
        </div>
      </div>

      <div className="site-config-section">
        <div className="site-section-header-inline">
          <strong className="site-config-title">운영 구조</strong>
          <span className="site-field-note">Pool은 달력, 패턴 회전, 근무표 생성 대상에서 제외됩니다.</span>
        </div>
        <div className="site-topology-grid site-topology-grid-primary">
          <label className="field compact-site-field">
            <span>조 수</span>
            <input
              max={8}
              min={2}
              onChange={(event) => {
                onTeamCountChange(event.target.value);
              }}
              type="number"
              value={draft.teamCount}
            />
          </label>
          <label className="field compact-site-field">
            <span>Cycle 수</span>
            <input
              max={4}
              min={1}
              onChange={(event) => {
                onCycleCountChange(event.target.value);
              }}
              type="number"
              value={draft.cycleCount}
            />
          </label>
          <div className="site-worktype-card compact">
            <span>근무유형</span>
            <strong>
              {teamCount}조 / {cycleCount}개 Cycle
            </strong>
          </div>
        </div>
        <label className="field site-toggle-field">
          <span>Pool 적용 유무</span>
          <span className="site-checkbox-row">
            <input
              checked={draft.poolEnabled}
              onChange={(event) => {
                onPoolEnabledChange(event.target.checked);
              }}
              type="checkbox"
            />
            <strong>{draft.poolEnabled ? "적용" : "미적용"}</strong>
            <em className="site-field-note">Pool은 별도 시간만 관리하고 패턴 String에는 포함하지 않습니다.</em>
          </span>
        </label>
      </div>
    </div>

    <div className="site-config-section">
      <strong className="site-config-title">Cycle 배정</strong>
      <p className="site-config-copy">
        각 조 칩을 원하는 Cycle 카드로 드래그해 배정합니다. 조는 하나의 Cycle에만 속할 수 있습니다.
      </p>
      <div className="site-cycle-assignment-grid">
        {cycleAssignments.map((cycle) => (
          <div
            className={
              draggingTeamLabel ? "site-cycle-assignment-card active" : "site-cycle-assignment-card"
            }
            key={cycle.cycleKey}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();

              if (!draggingTeamLabel) {
                return;
              }

              onAssignTeamToCycle(draggingTeamLabel, cycle.cycleKey);
              onClearDraggingTeam();
            }}
          >
            <div className="site-cycle-assignment-head">
              <div>
                <strong>{cycle.name}</strong>
                <span>{cycle.teams.length}개 조 배정</span>
              </div>
              <em>{cycle.patternString || "패턴 대기"}</em>
            </div>
            <div className="site-cycle-team-list">
              {cycle.teams.length > 0 ? (
                cycle.teams.map((teamLabel) => (
                  <button
                    className={
                      draggingTeamLabel === teamLabel
                        ? "site-cycle-team-chip dragging"
                        : "site-cycle-team-chip"
                    }
                    draggable
                    key={`${cycle.cycleKey}-${teamLabel}`}
                    onDragEnd={() => {
                      onClearDraggingTeam();
                    }}
                    onDragStart={() => {
                      onStartDraggingTeam(teamLabel);
                    }}
                    type="button"
                  >
                    {teamLabel}
                  </button>
                ))
              ) : (
                <span className="site-cycle-assignment-empty">배정된 조 없음</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  </>
);
