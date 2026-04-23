import type { DragEvent } from "react";

import {
  formatEmployeeDisplayName,
  isBpEmploymentType
} from "../../../shared/domain/employment-type";
import { normalizeTeamLabel } from "../../../shared/domain/team-label";

import { DateField } from "../../components/DateField";
import { FormSelect } from "../../components/FormSelect";

type PoolScope = "all" | "unassigned" | "other-site";

interface SiteAssignmentEmployee {
  currentShiftGroup?: string;
  currentSiteName?: string;
  employeeCode: string;
  employmentType: string;
  id: string;
  name: string;
}

interface SiteAssignmentTeamColumn {
  assignedEmployees: SiteAssignmentEmployee[];
  capacityValue: string;
  displayLabel: string;
  isAtCapacity: boolean;
  isConfiguredTeam: boolean;
  isPoolGroup: boolean;
  label: string;
  maxHeadcount?: number;
}

interface SiteAssignmentShiftCard {
  breakMinutes: number;
  cycleName: string;
  key: string;
  label: string;
  timeRange: string;
}

interface SiteAssignmentStepViewProps {
  assignmentStartDate: string;
  assigningEmployeeId: string | null;
  canManageSiteRegistration: boolean;
  cycleShiftCards: SiteAssignmentShiftCard[];
  draggingEmployeeId: string | null;
  draggingEmployeeSourceTeam: string | null;
  errorMessage: string | null;
  filteredPoolEmployees: SiteAssignmentEmployee[];
  focusedTeamLabel?: string | null;
  isCompletingSite: boolean;
  isSavingDraft: boolean;
  onAssignEmployee: (employeeId: string, teamLabel: string) => Promise<void> | void;
  onAssignmentStartDateChange: (value: string) => void;
  onBack: () => void;
  onClearDraggingEmployee: () => void;
  onComplete: () => void;
  onDragAutoScroll: (event: DragEvent<HTMLElement>) => void;
  onOpenSchedule: () => void;
  onPoolKeywordChange: (value: string) => void;
  onPoolScopeChange: (scope: PoolScope) => void;
  onMoveEmployee: (
    employeeId: string,
    teamLabel: string,
    direction: "up" | "down"
  ) => Promise<void> | void;
  onSaveOrValidate: () => void;
  onStartDraggingEmployee: (employeeId: string, sourceTeam: string | null) => void;
  onTeamCapacityChange: (teamLabel: string, value: string) => void;
  onUnassignEmployee: (employeeId: string) => Promise<void> | void;
  poolEnabled: boolean;
  poolKeyword: string;
  poolScope: PoolScope;
  siteId?: string;
  siteName: string;
  stageLabel: string;
  teamColumns: SiteAssignmentTeamColumn[];
}

const resolveDraggedEmployeeId = (
  event: DragEvent<HTMLElement>,
  draggingEmployeeId: string | null
) => event.dataTransfer.getData("text/plain") || draggingEmployeeId;

const getEmployeeDisplayName = (employee: Pick<SiteAssignmentEmployee, "name" | "employmentType">) =>
  formatEmployeeDisplayName(employee);

export const SiteAssignmentStepView = ({
  assignmentStartDate,
  assigningEmployeeId,
  canManageSiteRegistration,
  cycleShiftCards,
  draggingEmployeeId,
  draggingEmployeeSourceTeam,
  errorMessage,
  filteredPoolEmployees,
  focusedTeamLabel,
  isCompletingSite,
  isSavingDraft,
  onAssignEmployee,
  onAssignmentStartDateChange,
  onBack,
  onClearDraggingEmployee,
  onComplete,
  onDragAutoScroll,
  onOpenSchedule,
  onPoolKeywordChange,
  onPoolScopeChange,
  onMoveEmployee,
  onSaveOrValidate,
  onStartDraggingEmployee,
  onTeamCapacityChange,
  onUnassignEmployee,
  poolEnabled,
  poolKeyword,
  poolScope,
  siteId,
  siteName,
  stageLabel,
  teamColumns
}: SiteAssignmentStepViewProps) => {
  const assignedEmployeeCount = teamColumns.reduce(
    (sum, column) => sum + column.assignedEmployees.length,
    0
  );
  const configuredCapacityCount = teamColumns.filter(
    (column) => typeof column.maxHeadcount === "number"
  ).length;

  return (
    <>
      <section className="surface-card site-stage-header">
        <div className="stage-indicator-row">
          <span className="stage-chip done">1단계: 패턴 등록</span>
          <span className="stage-chip active">2단계: 조직 구성</span>
        </div>
        <div>
          <h3>{stageLabel} - 2단계: 조직 구성</h3>
          <p>{siteName || "신규 근무지"}에 실제 인력을 배정하고 조별 현황을 확인합니다.</p>
        </div>
      </section>

      {errorMessage ? <p className="form-error-text">{errorMessage}</p> : null}

      <section className="site-step-summary-grid">
        <article className="surface-card site-step-summary-card emphasis">
          <span>배정 후보</span>
          <strong>{filteredPoolEmployees.length}명</strong>
          <em>현재 드래그 가능한 인력 수</em>
        </article>
        <article className="surface-card site-step-summary-card">
          <span>배정 그룹</span>
          <strong>{teamColumns.length}개</strong>
          <em>{poolEnabled ? "Pool 포함 구성" : "Cycle 배정 그룹 기준"}</em>
        </article>
        <article className="surface-card site-step-summary-card">
          <span>현재 보드 인원</span>
          <strong>{assignedEmployeeCount}명</strong>
          <em>배정 보드에 보이는 총 인원</em>
        </article>
        <article className="surface-card site-step-summary-card">
          <span>정원 설정</span>
          <strong>{configuredCapacityCount}개 조</strong>
          <em>적용 일자 {assignmentStartDate || "-"}</em>
        </article>
      </section>

      <section className="site-step-two-layout">
        <article className="surface-card assignment-pool-card">
          <div className="section-heading compact-heading">
            <h3>배정 후보 인력</h3>
            <span className="pill neutral">{filteredPoolEmployees.length}명</span>
          </div>
          <div className="site-pool-filters">
            <label className="field">
              <span>검색</span>
              <input
                onChange={(event) => {
                  onPoolKeywordChange(event.target.value);
                }}
                placeholder="이름/사번 검색"
                value={poolKeyword}
              />
            </label>
            <label className="field">
              <span>대상</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  onPoolScopeChange(event.target.value as PoolScope);
                }}
                selectClassName="top-filter-select"
                value={poolScope}
              >
                <option value="all">전체</option>
                <option value="unassigned">미배정</option>
                <option value="other-site">타 근무지</option>
              </FormSelect>
            </label>
            <label className="field">
              <span>적용 일자</span>
              <DateField
                onChange={(value) => {
                  onAssignmentStartDateChange(value);
                }}
                value={assignmentStartDate}
              />
            </label>
          </div>
          <div className="assignment-date-card">
            <strong>드래그로 조 배정</strong>
            <span>
              후보 인력 카드나 배정된 인력 카드를 원하는 조 컬럼으로 옮기면 적용 일자 확인 후
              반영됩니다.
            </span>
            <em>현재 적용 일자 {assignmentStartDate || "-"}</em>
            <em>배정된 인력 카드를 다시 이 후보 영역으로 드롭하면 배정이 해제됩니다.</em>
            {poolEnabled ? <em>Pool 적용 시 `Pool 근무` 컬럼으로도 드래그 배정할 수 있습니다.</em> : null}
            {!siteId ? <em>신규 등록은 완료 버튼을 눌러야 근무지와 배정 정보가 함께 저장됩니다.</em> : null}
          </div>
          <div
            className={
              draggingEmployeeSourceTeam
                ? "pool-list assignment-release-zone active"
                : "pool-list assignment-release-zone"
            }
            onDragOver={(event) => {
              onDragAutoScroll(event);

              if (!draggingEmployeeSourceTeam) {
                return;
              }

              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              if (!draggingEmployeeSourceTeam) {
                onClearDraggingEmployee();
                return;
              }

              event.preventDefault();
              const employeeId = resolveDraggedEmployeeId(event, draggingEmployeeId);

              if (!employeeId) {
                onClearDraggingEmployee();
                return;
              }

              void onUnassignEmployee(employeeId);
            }}
          >
            <div className="assignment-release-copy">
              <strong>배정 해제 드롭 영역</strong>
              <span>배정된 카드를 여기로 드롭하면 근무지 배정이 해제되고 후보 목록으로 돌아옵니다.</span>
            </div>
            {filteredPoolEmployees.length > 0 ? (
              filteredPoolEmployees.map((employee) => (
                (() => {
                  const employeeDisplayName = getEmployeeDisplayName(employee);
                  const isBpEmployee = isBpEmploymentType(employee.employmentType);

                  return (
                    <div
                      className={
                        draggingEmployeeId === employee.id
                          ? "pool-item draggable dragging"
                          : "pool-item draggable"
                      }
                      draggable
                      key={employee.id}
                      onDragEnd={() => {
                        onClearDraggingEmployee();
                      }}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", employee.id);
                        onStartDraggingEmployee(employee.id, null);
                      }}
                    >
                      <div className="pool-avatar">{employee.name.slice(0, 1)}</div>
                      <div className="pool-copy">
                        <strong>{employeeDisplayName}</strong>
                        <span>
                          {isBpEmployee
                            ? `BP 외부인력 / ${employee.employmentType}`
                            : `${employee.employeeCode} / ${employee.employmentType}`}
                        </span>
                        <em
                          className={
                            employee.currentSiteName ? "pool-state warning" : "pool-state neutral"
                          }
                        >
                          {employee.currentSiteName
                            ? `${employee.currentSiteName} / ${
                                normalizeTeamLabel(employee.currentShiftGroup) ?? "미지정"
                              }`
                            : "미배정"}
                        </em>
                        <div className="assignment-drag-hint">
                          <span>드래그해서 조 배정</span>
                          {assigningEmployeeId === employee.id ? <em>배정 중...</em> : null}
                        </div>
                      </div>
                    </div>
                  );
                })()
              ))
            ) : (
              <div className="site-empty-state">
                <strong>표시할 인력이 없습니다.</strong>
              </div>
            )}
          </div>
        </article>

        <article className="surface-card assignment-board-card" onDragOver={onDragAutoScroll}>
          <div className="assignment-board-header">
            <div>
              <h3>조별 배정 보드</h3>
              <p>조별 정원을 입력한 뒤 인력 카드를 드래그해 배정합니다. 정원이 비어 있으면 제한 없이 배정됩니다.</p>
            </div>
            <div className="assignment-board-meta">
              <strong>{teamColumns.length}개 그룹</strong>
              <span>
                {siteId
                  ? "정원 변경 후 첫 배정 시 패턴 설정이 함께 저장됩니다."
                  : "신규 등록 단계에서는 조배정이 화면에만 반영되고 완료 시 한 번에 저장됩니다."}
              </span>
            </div>
          </div>
          <div className="assignment-board-columns">
            {teamColumns.map((column) => (
              <div
                className={
                  draggingEmployeeId
                    ? column.isAtCapacity
                      ? focusedTeamLabel === column.label
                        ? "assignment-column active full focused"
                        : "assignment-column active full"
                      : focusedTeamLabel === column.label
                        ? "assignment-column active focused"
                        : "assignment-column active"
                    : focusedTeamLabel === column.label
                      ? "assignment-column focused"
                      : "assignment-column"
                }
                key={column.label}
                data-team-label={column.label}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const employeeId = resolveDraggedEmployeeId(event, draggingEmployeeId);

                  if (!employeeId) {
                    onClearDraggingEmployee();
                    return;
                  }

                  void onAssignEmployee(employeeId, column.label);
                }}
              >
                <div className="assignment-column-head">
                  <div className="assignment-column-title">
                    <strong>{column.displayLabel}</strong>
                    <span>
                      {column.assignedEmployees.length}명
                      {typeof column.maxHeadcount === "number"
                        ? ` / 정원 ${column.maxHeadcount}명`
                        : " / 제한 없음"}
                    </span>
                  </div>
                  {column.isConfiguredTeam ? (
                    <label className="field compact-site-field assignment-capacity-field">
                      <span>정원 최대</span>
                      <input
                        min={1}
                        onChange={(event) => {
                          onTeamCapacityChange(column.label, event.target.value);
                        }}
                        placeholder="미입력 시 제한 없음"
                        type="number"
                        value={column.capacityValue}
                      />
                    </label>
                  ) : (
                    <div className="assignment-column-note">
                      {column.isPoolGroup ? "Pool 근무 별도 운영" : "기존 배정 그룹"}
                    </div>
                  )}
                </div>
                <div className="assignment-column-dropzone">
                  {column.assignedEmployees.length > 0 ? (
                    <div className="assigned-card-row assigned-card-row-column">
                      {column.assignedEmployees.map((employee, index) => (
                        (() => {
                          const employeeDisplayName = getEmployeeDisplayName(employee);
                          const isBpEmployee = isBpEmploymentType(employee.employmentType);

                          return (
                            <div
                              className={
                                draggingEmployeeId === employee.id
                                  ? "assigned-member-card draggable dragging"
                                  : "assigned-member-card draggable"
                              }
                              draggable
                              key={employee.id}
                              onDragEnd={() => {
                                onClearDraggingEmployee();
                              }}
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", employee.id);
                                onStartDraggingEmployee(employee.id, column.label);
                              }}
                            >
                              <span className="assigned-avatar">{employee.name.slice(0, 1)}</span>
                              <div>
                                <strong>{employeeDisplayName}</strong>
                                <span>{isBpEmployee ? "BP 외부인력" : employee.employeeCode}</span>
                                <em className="assignment-card-meta">
                                  {index + 1}번 자리 / {employee.employmentType}
                                  {draggingEmployeeSourceTeam === column.label ? " / 이동 중" : ""}
                                </em>
                              </div>
                              <div className="assignment-reorder-controls">
                                <button
                                  aria-label={`${employeeDisplayName} 순서를 위로 이동`}
                                  className="assignment-reorder-button"
                                  disabled={assigningEmployeeId === employee.id || index === 0}
                                  draggable={false}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void onMoveEmployee(employee.id, column.label, "up");
                                  }}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                  }}
                                  type="button"
                                >
                                  ↑
                                </button>
                                <button
                                  aria-label={`${employeeDisplayName} 순서를 아래로 이동`}
                                  className="assignment-reorder-button"
                                  disabled={
                                    assigningEmployeeId === employee.id ||
                                    index === column.assignedEmployees.length - 1
                                  }
                                  draggable={false}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void onMoveEmployee(employee.id, column.label, "down");
                                  }}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                  }}
                                  type="button"
                                >
                                  ↓
                                </button>
                              </div>
                            </div>
                          );
                        })()
                      ))}
                    </div>
                  ) : (
                    <div className="assignment-column-empty">
                      <strong>
                        {column.isPoolGroup
                          ? "Pool 근무 인력이 없습니다."
                          : `${column.displayLabel}에 배정된 인력이 없습니다.`}
                      </strong>
                      <span>좌측 후보 인력 카드를 이 영역으로 드롭하세요.</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="site-shift-summary-grid">
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
        </article>
      </section>

      <section className="surface-card footer-action-card">
        <div className="button-row spread">
          <button className="ghost-button" onClick={onBack} type="button">
            이전 단계
          </button>
          {canManageSiteRegistration ? (
            <div className="button-row">
              <button
                className="ghost-button"
                disabled={isSavingDraft || isCompletingSite}
                onClick={onSaveOrValidate}
                type="button"
              >
                {siteId ? "패턴 다시 저장" : "입력 다시 검토"}
              </button>
              <button
                className="ghost-button"
                disabled={!siteId || isSavingDraft || isCompletingSite}
                onClick={onOpenSchedule}
                type="button"
              >
                근무표로 이동
              </button>
              <button
                className="primary-button"
                disabled={isSavingDraft || isCompletingSite}
                onClick={onComplete}
                type="button"
              >
                완료
              </button>
            </div>
          ) : (
            <span className="site-field-note">
              기준정보 수정 권한이 필요합니다.
            </span>
          )}
        </div>
      </section>
    </>
  );
};
