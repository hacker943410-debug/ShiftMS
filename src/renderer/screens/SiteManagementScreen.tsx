import { useDeferredValue, useEffect, useMemo, useState } from "react";

import type { ShiftPatternStepInput } from "@shared/bridge/contracts";
import type { EmployeeRecord, ShiftPatternRecord, SiteRecord } from "@shared/domain/model";

import { useAppWorkflow } from "../contexts/app-workflow-context";

type SiteView = "list" | "step1" | "step2";
type PoolScope = "all" | "unassigned" | "other-site";

interface SiteDraftState {
  siteId?: string;
  patternId?: string;
  siteCode: string;
  name: string;
  status: SiteRecord["status"];
  timezone: string;
  teamCount: string;
  shiftCount: string;
  patternStartDate: string;
  startIndexRule: string;
  breakMinutes: string;
  shiftTimes: string[];
}

interface ShiftDefinition {
  dutyCode: string;
  label: string;
  timeRange: string;
  breakMinutes: number;
}

interface SiteViewRow {
  site: SiteRecord;
  pattern: ShiftPatternRecord | null;
  patternString: string;
  workType: string;
  shiftDefinitions: ShiftDefinition[];
}

const presetTimeRanges = [
  "07:00 - 19:00",
  "19:00 - 07:00",
  "06:00 - 14:00",
  "14:00 - 22:00",
  "22:00 - 06:00",
  "09:00 - 17:00"
];

const startIndexRuleLabels: Record<string, string> = {
  "team-sequence": "조 순환 기준",
  "calendar-start": "캘린더 시작 기준",
  "manual-seed": "수동 시작 기준"
};

const createDateInputValue = () => new Date().toISOString().slice(0, 10);

const clampCount = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
};

const normalizeList = <T,>(
  items: T[],
  targetLength: number,
  fallbackFactory: (index: number) => T
) => Array.from({ length: targetLength }, (_, index) => items[index] ?? fallbackFactory(index));

const buildDefaultShiftTimes = (shiftCount: number) =>
  normalizeList<string>(
    [],
    shiftCount,
    (index) => presetTimeRanges[index] ?? presetTimeRanges[presetTimeRanges.length - 1]
  );

const createInitialDraft = (): SiteDraftState => ({
  siteCode: "",
  name: "",
  status: "active",
  timezone: "Asia/Seoul",
  teamCount: "4",
  shiftCount: "2",
  patternStartDate: createDateInputValue(),
  startIndexRule: "team-sequence",
  breakMinutes: "60",
  shiftTimes: buildDefaultShiftTimes(2)
});

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

const getTeamLabels = (teamCount: number) =>
  Array.from({ length: teamCount }, (_, index) => `${String.fromCharCode(65 + index)}조`);

const getShiftLabels = (shiftCount: number) => {
  if (shiftCount === 2) {
    return ["주간", "야간"];
  }

  if (shiftCount === 3) {
    return ["1근", "2근", "3근"];
  }

  return Array.from({ length: shiftCount }, (_, index) => `${index + 1}근`);
};

const splitTimeRange = (value: string) => {
  const parts = value.split("-").map((item) => item.trim());

  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    return null;
  }

  return {
    startTime: parts[0],
    endTime: parts[1]
  };
};

const getDutyLabel = (dutyCode: string, index: number) => {
  const normalizedCode = dutyCode.trim().toUpperCase();

  if (normalizedCode === "D") {
    return "주간";
  }

  if (normalizedCode === "N") {
    return "야간";
  }

  if (normalizedCode === "X" || normalizedCode === "OFF") {
    return "휴무";
  }

  return `${index + 1}근`;
};

const getWorkingDefinitions = (pattern: ShiftPatternRecord): ShiftDefinition[] => {
  const seenCodes = new Set<string>();

  return pattern.steps
    .slice()
    .sort((left, right) => left.stepIndex - right.stepIndex)
    .flatMap((step) => {
      const dutyCode = step.dutyCode.trim().toUpperCase();

      if (dutyCode === "X" || dutyCode === "OFF" || seenCodes.has(dutyCode)) {
        return [];
      }

      seenCodes.add(dutyCode);

      return [
        {
          dutyCode,
          label: getDutyLabel(dutyCode, seenCodes.size - 1),
          timeRange:
            step.startTime && step.endTime ? `${step.startTime} - ${step.endTime}` : "-",
          breakMinutes: step.breakMinutes
        }
      ];
    });
};

const buildPatternString = (pattern: ShiftPatternRecord) => {
  const definitions = getWorkingDefinitions(pattern);
  const labelByCode = new Map(definitions.map((definition) => [definition.dutyCode, definition.label]));

  const cycleLabels = pattern.steps
    .slice()
    .sort((left, right) => left.stepIndex - right.stepIndex)
    .map((step) => {
      const dutyCode = step.dutyCode.trim().toUpperCase();

      if (dutyCode === "X" || dutyCode === "OFF") {
        return "휴무";
      }

      return labelByCode.get(dutyCode) ?? dutyCode;
    });

  return `${cycleLabels.join("-")} / ${pattern.teamCount}조 ${definitions.length}교대 순환`;
};

const getPrimaryPattern = (patterns: ShiftPatternRecord[]) =>
  patterns.find((pattern) => pattern.status === "active") ?? patterns[0] ?? null;

const buildRows = (sites: SiteRecord[], patterns: ShiftPatternRecord[]): SiteViewRow[] =>
  sites.map((site) => {
    const pattern = getPrimaryPattern(patterns.filter((item) => item.siteId === site.id));
    const shiftDefinitions = pattern ? getWorkingDefinitions(pattern) : [];

    return {
      site,
      pattern,
      patternString: pattern ? buildPatternString(pattern) : "등록된 패턴이 없습니다.",
      workType:
        pattern && shiftDefinitions.length > 0
          ? `${pattern.teamCount}조 ${shiftDefinitions.length}교대`
          : "패턴 미등록",
      shiftDefinitions
    };
  });

const buildDraftFromRow = (row: SiteViewRow): SiteDraftState => {
  const shiftCount = row.shiftDefinitions.length > 0 ? row.shiftDefinitions.length : 2;

  return {
    siteId: row.site.id,
    patternId: row.pattern?.id,
    siteCode: row.site.siteCode,
    name: row.site.name,
    status: row.site.status,
    timezone: row.site.timezone,
    teamCount: String(row.pattern?.teamCount ?? 4),
    shiftCount: String(shiftCount),
    patternStartDate: row.pattern?.patternStartDate ?? createDateInputValue(),
    startIndexRule: row.pattern?.startIndexRule ?? "team-sequence",
    breakMinutes: String(row.shiftDefinitions[0]?.breakMinutes ?? 60),
    shiftTimes: normalizeList(
      row.shiftDefinitions.map((definition) => definition.timeRange),
      shiftCount,
      (index) => buildDefaultShiftTimes(shiftCount)[index] ?? ""
    )
  };
};

const buildShiftPatternSteps = (shiftCount: number, shiftTimes: string[], breakMinutes: number) => {
  const dutyCodes =
    shiftCount === 2
      ? ["D", "N"]
      : Array.from({ length: shiftCount }, (_, index) => String.fromCharCode(65 + index));
  const cycle: Array<number | "off"> =
    shiftCount === 2
      ? [0, 0, 1, 1, "off", "off"]
      : [...Array.from({ length: shiftCount }, (_, index) => index), "off"];

  return cycle.map((item, stepIndex) => {
    if (item === "off") {
      return {
        stepIndex,
        dutyCode: "X",
        breakMinutes: 0
      } satisfies ShiftPatternStepInput;
    }

    const shiftIndex = item;
    const parsed = splitTimeRange(shiftTimes[shiftIndex] ?? "");

    return {
      stepIndex,
      dutyCode: dutyCodes[shiftIndex] ?? `S${shiftIndex + 1}`,
      startTime: parsed?.startTime,
      endTime: parsed?.endTime,
      breakMinutes
    } satisfies ShiftPatternStepInput;
  });
};

const buildPatternCode = (steps: ShiftPatternStepInput[]) => steps.map((step) => step.dutyCode).join("");

export const SiteManagementScreen = () => {
  const { selectedSiteId: workflowSiteId, setSelectedSiteId: setWorkflowSiteId, openRoute } =
    useAppWorkflow();
  const [view, setView] = useState<SiteView>("list");
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [patterns, setPatterns] = useState<ShiftPatternRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [detailSiteId, setDetailSiteId] = useState<string | null>(null);
  const [lastAutoOpenedWorkflowSiteId, setLastAutoOpenedWorkflowSiteId] = useState<string | null>(
    null
  );
  const [draft, setDraft] = useState<SiteDraftState>(() => createInitialDraft());
  const [activeTeam, setActiveTeam] = useState("");
  const [poolKeyword, setPoolKeyword] = useState("");
  const [poolScope, setPoolScope] = useState<PoolScope>("all");
  const [assignmentStartDate, setAssignmentStartDate] = useState(createDateInputValue());
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [assigningEmployeeId, setAssigningEmployeeId] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [stepTwoError, setStepTwoError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const deferredPoolKeyword = useDeferredValue(poolKeyword);
  const rows = useMemo(() => buildRows(sites, patterns), [patterns, sites]);
  const detailRow = detailSiteId ? rows.find((row) => row.site.id === detailSiteId) ?? null : null;
  const teamCount = clampCount(Number(draft.teamCount), 2, 8);
  const shiftCount = clampCount(Number(draft.shiftCount), 2, 6);
  const teamLabels = useMemo(() => getTeamLabels(teamCount), [teamCount]);
  const shiftLabels = useMemo(() => getShiftLabels(shiftCount), [shiftCount]);
  const patternPreview = useMemo(() => {
    const steps = buildShiftPatternSteps(shiftCount, draft.shiftTimes, Number(draft.breakMinutes) || 0);

    return {
      patternString: `${steps
        .map((step, index) => (step.dutyCode === "X" ? "휴무" : getDutyLabel(step.dutyCode, index)))
        .join("-")} / ${teamCount}조 ${shiftCount}교대 순환`,
      shiftCards: shiftLabels.map((label, index) => ({
        label,
        timeRange: draft.shiftTimes[index] ?? "",
        breakMinutes: Number(draft.breakMinutes) || 0
      }))
    };
  }, [draft.breakMinutes, draft.shiftTimes, shiftCount, shiftLabels, teamCount]);

  const activeTeamLabels = useMemo(() => {
    const extraGroups = employees
      .filter((employee) => employee.currentSiteId === draft.siteId && employee.currentShiftGroup)
      .map((employee) => employee.currentShiftGroup as string)
      .filter((group) => !teamLabels.includes(group));

    return extraGroups.length > 0 ? [...teamLabels, ...extraGroups] : teamLabels;
  }, [draft.siteId, employees, teamLabels]);

  const assignedByTeam = useMemo(() => {
    const grouped = new Map<string, EmployeeRecord[]>();

    activeTeamLabels.forEach((label) => {
      grouped.set(label, []);
    });

    employees
      .filter((employee) => employee.currentSiteId === draft.siteId)
      .forEach((employee) => {
        const key = employee.currentShiftGroup ?? activeTeamLabels[0] ?? "미지정";
        const current = grouped.get(key) ?? [];
        current.push(employee);
        grouped.set(key, current);
      });

    return grouped;
  }, [activeTeamLabels, draft.siteId, employees]);

  const filteredPoolEmployees = useMemo(
    () =>
      employees
        .filter((employee) => employee.currentSiteId !== draft.siteId)
        .filter((employee) => {
          if (poolScope === "unassigned") {
            return !employee.currentSiteId;
          }

          if (poolScope === "other-site") {
            return Boolean(employee.currentSiteId);
          }

          return true;
        })
        .filter((employee) => {
          const keyword = deferredPoolKeyword.trim().toLowerCase();

          if (!keyword) {
            return true;
          }

          return (
            employee.name.toLowerCase().includes(keyword) ||
            employee.employeeCode.toLowerCase().includes(keyword)
          );
        }),
    [deferredPoolKeyword, draft.siteId, employees, poolScope]
  );

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const [siteResult, patternResult, employeeResult] = await Promise.all([
          window.appBridge.listSites(),
          window.appBridge.listShiftPatterns(),
          window.appBridge.listEmployees()
        ]);

        if (!active) {
          return;
        }

        if (siteResult.ok) {
          setSites(siteResult.data);
        } else {
          setScreenError(siteResult.message);
        }

        if (patternResult.ok) {
          setPatterns(patternResult.data);
        } else {
          setScreenError(patternResult.message);
        }

        if (employeeResult.ok) {
          setEmployees(employeeResult.data);
        } else {
          setScreenError(employeeResult.message);
        }
      } catch (error) {
        if (active) {
          setScreenError(getErrorMessage(error));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      teamCount: String(teamCount),
      shiftCount: String(shiftCount),
      shiftTimes: normalizeList(current.shiftTimes, shiftCount, (index) => {
        const defaults = buildDefaultShiftTimes(shiftCount);
        return defaults[index] ?? "";
      })
    }));
  }, [shiftCount, teamCount]);

  useEffect(() => {
    setActiveTeam(activeTeamLabels[0] ?? "");
  }, [activeTeamLabels]);

  useEffect(() => {
    if (
      view !== "list" ||
      !workflowSiteId ||
      workflowSiteId === lastAutoOpenedWorkflowSiteId ||
      !rows.some((row) => row.site.id === workflowSiteId)
    ) {
      return;
    }

    setDetailSiteId(workflowSiteId);
    setLastAutoOpenedWorkflowSiteId(workflowSiteId);
  }, [lastAutoOpenedWorkflowSiteId, rows, view, workflowSiteId]);

  const handleDraftChange = <K extends keyof SiteDraftState>(key: K, value: SiteDraftState[K]) => {
    setDraft((current) => ({
      ...current,
      [key]: value
    }));
  };

  const openRegistration = (siteId?: string) => {
    setDetailSiteId(null);
    setFormError(null);
    setStepTwoError(null);

    if (!siteId) {
      setDraft(createInitialDraft());
      setView("step1");
      return;
    }

    const targetRow = rows.find((row) => row.site.id === siteId);

    if (!targetRow) {
      return;
    }

    setWorkflowSiteId(targetRow.site.id);
    setDraft(buildDraftFromRow(targetRow));
    setView("step1");
  };

  const persistDraft = async () => {
    setFormError(null);

    if (!draft.siteCode.trim() || !draft.name.trim()) {
      setFormError("근무지 코드와 근무지명은 필수입니다.");
      return false;
    }

    if (!draft.patternStartDate) {
      setFormError("패턴 시작일을 입력해야 합니다.");
      return false;
    }

    const breakMinutes = Number(draft.breakMinutes);

    if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
      setFormError("휴게시간은 0 이상의 정수로 입력해야 합니다.");
      return false;
    }

    if (draft.shiftTimes.some((timeRange) => !splitTimeRange(timeRange))) {
      setFormError("모든 근무시간은 `HH:MM - HH:MM` 형식으로 입력해야 합니다.");
      return false;
    }

    setIsSavingDraft(true);

    try {
      const siteResult = await window.appBridge.saveSite({
        id: draft.siteId,
        siteCode: draft.siteCode.trim(),
        name: draft.name.trim(),
        status: draft.status,
        timezone: draft.timezone.trim() || "Asia/Seoul"
      });

      if (!siteResult.ok) {
        setFormError(siteResult.message);
        return false;
      }

      const steps = buildShiftPatternSteps(shiftCount, draft.shiftTimes, breakMinutes);
      const patternResult = await window.appBridge.saveShiftPattern({
        id: draft.patternId,
        siteId: siteResult.data.id,
        name: `${siteResult.data.name} ${teamCount}조 ${shiftCount}교대`,
        teamCount,
        patternCode: buildPatternCode(steps),
        startIndexRule: draft.startIndexRule,
        patternStartDate: draft.patternStartDate,
        status: "active",
        steps
      });

      if (!patternResult.ok) {
        setFormError(patternResult.message);
        return false;
      }

      setDraft((current) => ({
        ...current,
        siteId: siteResult.data.id,
        patternId: patternResult.data.id,
        siteCode: siteResult.data.siteCode,
        name: siteResult.data.name,
        status: siteResult.data.status,
        timezone: siteResult.data.timezone
      }));
      setWorkflowSiteId(siteResult.data.id);
      setAssignmentStartDate(draft.patternStartDate);
      setRefreshKey((current) => current + 1);

      return true;
    } catch (error) {
      setFormError(getErrorMessage(error));
      return false;
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleAssignEmployee = async (employee: EmployeeRecord, targetTeam: string) => {
    if (!draft.siteId) {
      setStepTwoError("근무지 저장 후 인력 배정을 진행할 수 있습니다.");
      return;
    }

    if (!assignmentStartDate) {
      setStepTwoError("배정 적용일을 입력해야 합니다.");
      return;
    }

    setStepTwoError(null);
    setAssigningEmployeeId(employee.id);

    try {
      const result = await window.appBridge.saveEmployeeAssignment({
        employeeId: employee.id,
        siteId: draft.siteId,
        shiftGroup: targetTeam,
        teamName: targetTeam,
        startDate: assignmentStartDate
      });

      if (!result.ok) {
        setStepTwoError(result.message);
        return;
      }

      setRefreshKey((current) => current + 1);
    } catch (error) {
      setStepTwoError(getErrorMessage(error));
    } finally {
      setAssigningEmployeeId(null);
    }
  };

  if (view === "step2") {
    const activeEmployees = assignedByTeam.get(activeTeam) ?? [];

    return (
      <div className="screen-stack">
        <section className="surface-card site-stage-header">
          <div className="stage-indicator-row">
            <span className="stage-chip done">1단계: 패턴 등록</span>
            <span className="stage-chip active">2단계: 조직 구성</span>
          </div>
          <div>
            <h3>근무지 등록 - 2단계: 조직 구성</h3>
            <p>{draft.name || "신규 근무지"}에 실제 인력을 배정하고 조별 현황을 확인합니다.</p>
          </div>
        </section>

        {stepTwoError ? <p className="form-error-text">{stepTwoError}</p> : null}

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
                    setPoolKeyword(event.target.value);
                  }}
                  placeholder="이름/사번 검색"
                  value={poolKeyword}
                />
              </label>
              <label className="field">
                <span>대상</span>
                <select
                  onChange={(event) => {
                    setPoolScope(event.target.value as PoolScope);
                  }}
                  value={poolScope}
                >
                  <option value="all">전체</option>
                  <option value="unassigned">미배정</option>
                  <option value="other-site">타 근무지</option>
                </select>
              </label>
              <label className="field">
                <span>배정 적용일</span>
                <input
                  onChange={(event) => {
                    setAssignmentStartDate(event.target.value);
                  }}
                  type="date"
                  value={assignmentStartDate}
                />
              </label>
            </div>
            <div className="pool-list">
              {filteredPoolEmployees.length > 0 ? (
                filteredPoolEmployees.map((employee) => (
                  <div className="pool-item" key={employee.id}>
                    <div className="pool-avatar">{employee.name.slice(0, 1)}</div>
                    <div className="pool-copy">
                      <strong>{employee.name}</strong>
                      <span>
                        {employee.employeeCode} / {employee.employmentType}
                      </span>
                      <em
                        className={
                          employee.currentSiteName ? "pool-state warning" : "pool-state neutral"
                        }
                      >
                        {employee.currentSiteName
                          ? `${employee.currentSiteName} / ${employee.currentShiftGroup ?? "미지정"}`
                          : "미배정"}
                      </em>
                      <div className="pool-item-actions">
                        <button
                          className="primary-button compact-button"
                          disabled={!activeTeam || assigningEmployeeId === employee.id}
                          onClick={() => {
                            void handleAssignEmployee(employee, activeTeam);
                          }}
                          type="button"
                        >
                          {assigningEmployeeId === employee.id ? "배정 중..." : `${activeTeam} 배정`}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="site-empty-state">
                  <strong>표시할 인력이 없습니다.</strong>
                </div>
              )}
            </div>
          </article>

          <article className="surface-card assignment-board-card">
            <div className="tab-row team-tab-row">
              {activeTeamLabels.map((label) => (
                <button
                  className={label === activeTeam ? "tab-button active" : "tab-button"}
                  key={label}
                  onClick={() => {
                    setActiveTeam(label);
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="assignment-dropzone">
              {activeEmployees.length > 0 ? (
                <div className="assigned-card-row">
                  {activeEmployees.map((employee) => (
                    <div className="assigned-member-card" key={employee.id}>
                      <span className="assigned-avatar">{employee.name.slice(0, 1)}</span>
                      <div>
                        <strong>{employee.name}</strong>
                        <span>{employee.employeeCode}</span>
                        <div className="assigned-member-actions">
                          {teamLabels
                            .filter((label) => label !== activeTeam)
                            .map((label) => (
                              <button
                                className="ghost-button compact-button"
                                disabled={assigningEmployeeId === employee.id}
                                key={`${employee.id}-${label}`}
                                onClick={() => {
                                  void handleAssignEmployee(employee, label);
                                }}
                                type="button"
                              >
                                {label} 이동
                              </button>
                            ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="assignment-empty">
                  <strong>{activeTeam}에 배정된 인력이 없습니다.</strong>
                </div>
              )}
            </div>

            <div className="team-summary-row">
              {activeTeamLabels.map((label) => (
                <div className="team-summary-card" key={label}>
                  <span>{label}</span>
                  <strong>{assignedByTeam.get(label)?.length ?? 0}명</strong>
                </div>
              ))}
            </div>

            <div className="site-shift-summary-grid">
              {patternPreview.shiftCards.map((card) => (
                <div className="site-shift-summary-card" key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.timeRange}</strong>
                  <em>휴게 {card.breakMinutes}분</em>
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
              <button
                className="ghost-button"
                onClick={() => {
                  void persistDraft();
                }}
                type="button"
              >
                패턴 다시 저장
              </button>
              <button
                className="ghost-button"
                disabled={!draft.siteId}
                onClick={() => {
                  if (!draft.siteId) {
                    return;
                  }

                  setWorkflowSiteId(draft.siteId);
                  openRoute("schedule", { selectedSiteId: draft.siteId });
                }}
                type="button"
              >
                근무표로 이동
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setView("list");
                }}
                type="button"
              >
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
            <p>근무지 기본 정보와 교대 패턴을 실제 저장소에 등록합니다.</p>
          </div>
        </section>

        {formError ? <p className="form-error-text">{formError}</p> : null}

        <section className="site-step-one-layout">
          <article className="surface-card site-form-panel">
            <div className="site-config-section">
              <strong className="site-config-title">기본 정보</strong>
              <div className="site-form-grid">
                <label className="field">
                  <span>근무지 코드</span>
                  <input
                    onChange={(event) => {
                      handleDraftChange("siteCode", event.target.value);
                    }}
                    value={draft.siteCode}
                  />
                </label>
                <label className="field">
                  <span>근무지명</span>
                  <input
                    onChange={(event) => {
                      handleDraftChange("name", event.target.value);
                    }}
                    value={draft.name}
                  />
                </label>
                <label className="field">
                  <span>상태</span>
                  <select
                    onChange={(event) => {
                      handleDraftChange("status", event.target.value as SiteRecord["status"]);
                    }}
                    value={draft.status}
                  >
                    <option value="active">운영중</option>
                    <option value="inactive">중지</option>
                  </select>
                </label>
                <label className="field">
                  <span>시간대</span>
                  <input
                    onChange={(event) => {
                      handleDraftChange("timezone", event.target.value);
                    }}
                    value={draft.timezone}
                  />
                </label>
              </div>
            </div>

            <div className="site-config-section">
              <strong className="site-config-title">패턴 설정</strong>
              <div className="site-count-grid">
                <label className="field compact-site-field">
                  <span>조 수</span>
                  <input
                    max={8}
                    min={2}
                    onChange={(event) => {
                      handleDraftChange("teamCount", event.target.value);
                    }}
                    type="number"
                    value={draft.teamCount}
                  />
                </label>
                <label className="field compact-site-field">
                  <span>교대 수</span>
                  <input
                    max={6}
                    min={2}
                    onChange={(event) => {
                      handleDraftChange("shiftCount", event.target.value);
                    }}
                    type="number"
                    value={draft.shiftCount}
                  />
                </label>
              </div>
              <div className="site-form-grid">
                <label className="field">
                  <span>패턴 시작일</span>
                  <input
                    onChange={(event) => {
                      handleDraftChange("patternStartDate", event.target.value);
                    }}
                    type="date"
                    value={draft.patternStartDate}
                  />
                </label>
                <label className="field">
                  <span>패턴 시작 기준</span>
                  <select
                    onChange={(event) => {
                      handleDraftChange("startIndexRule", event.target.value);
                    }}
                    value={draft.startIndexRule}
                  >
                    {Object.entries(startIndexRuleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>휴게시간(분)</span>
                  <input
                    min={0}
                    onChange={(event) => {
                      handleDraftChange("breakMinutes", event.target.value);
                    }}
                    type="number"
                    value={draft.breakMinutes}
                  />
                </label>
              </div>
              <div className="site-time-grid">
                {shiftLabels.map((label, index) => (
                  <label className="field compact-site-field" key={label}>
                    <span>{label}</span>
                    <input
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          shiftTimes: current.shiftTimes.map((item, itemIndex) =>
                            itemIndex === index ? event.target.value : item
                          )
                        }));
                      }}
                      value={draft.shiftTimes[index] ?? ""}
                    />
                  </label>
                ))}
              </div>
            </div>
          </article>

          <article className="surface-card simulation-panel">
            <div className="section-heading compact-heading">
              <div>
                <h3>패턴 미리보기</h3>
                <p>현재 입력값 기준 저장될 패턴 요약입니다.</p>
              </div>
            </div>
            <div className="site-detail-grid">
              <div className="site-detail-section">
                <span>근무유형</span>
                <strong>{teamCount}조 {shiftCount}교대</strong>
              </div>
              <div className="site-detail-section">
                <span>패턴 String</span>
                <strong>{patternPreview.patternString}</strong>
              </div>
              <div className="site-detail-section">
                <span>패턴 시작일</span>
                <strong>{draft.patternStartDate}</strong>
              </div>
              <div className="site-detail-section">
                <span>시작 기준</span>
                <strong>{startIndexRuleLabels[draft.startIndexRule] ?? "-"}</strong>
              </div>
            </div>
            <div className="site-shift-summary-grid">
              {patternPreview.shiftCards.map((card) => (
                <div className="site-shift-summary-card" key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.timeRange}</strong>
                  <em>휴게 {card.breakMinutes}분</em>
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
              <button
                className="ghost-button"
                disabled={isSavingDraft}
                onClick={() => {
                  void persistDraft();
                }}
                type="button"
              >
                적용
              </button>
              <button
                className="primary-button"
                disabled={isSavingDraft}
                onClick={() => {
                  void (async () => {
                    const saved = await persistDraft();

                    if (saved) {
                      setView("step2");
                    }
                  })();
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

  return (
    <div className="screen-stack">
      <section className="surface-card site-list-shell">
        <div className="section-heading compact-heading">
          <div>
            <h3>근무지 관리</h3>
            <p>저장된 근무지와 활성 패턴, 현재 인력 배치 상태를 확인합니다.</p>
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

        {screenError ? <p className="form-error-text">{screenError}</p> : null}

        <div className="data-scroll">
          <table className="info-table site-list-table">
            <thead>
              <tr>
                <th>근무지명</th>
                <th>패턴 String</th>
                <th>근무유형</th>
                <th>시간대</th>
                <th>상태</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6}>근무지 정보를 불러오는 중입니다.</td>
                </tr>
              ) : rows.length > 0 ? (
                rows.map((row) => (
                  <tr key={row.site.id}>
                    <td className="table-strong">{row.site.name}</td>
                    <td>
                      <div className="pattern-preview">
                        <span>{row.patternString}</span>
                      </div>
                    </td>
                    <td>{row.workType}</td>
                    <td>{row.site.timezone}</td>
                    <td>
                      <span className={row.site.status === "active" ? "pill info" : "pill neutral"}>
                        {row.site.status === "active" ? "운영중" : "중지"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        onClick={() => {
                          setWorkflowSiteId(row.site.id);
                          setDetailSiteId(row.site.id);
                        }}
                        type="button"
                      >
                        상세
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>등록된 근무지가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detailRow ? (
        <div className="modal-overlay">
          <div className="modal-card site-detail-modal">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <h3>{detailRow.site.name}</h3>
                <p>저장된 근무지와 활성 패턴 정보입니다.</p>
              </div>
              <div className="button-row">
                <button
                  className="ghost-button compact-button"
                  onClick={() => {
                    setWorkflowSiteId(detailRow.site.id);
                    openRoute("schedule", { selectedSiteId: detailRow.site.id });
                  }}
                  type="button"
                >
                  근무표 배포
                </button>
                <button
                  className="primary-button compact-button"
                  onClick={() => {
                    openRegistration(detailRow.site.id);
                  }}
                  type="button"
                >
                  수정
                </button>
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
            </div>
            <div className="site-detail-grid">
              <div className="site-detail-section">
                <span>근무지명</span>
                <strong>{detailRow.site.name}</strong>
              </div>
              <div className="site-detail-section">
                <span>근무지 코드</span>
                <strong>{detailRow.site.siteCode}</strong>
              </div>
              <div className="site-detail-section">
                <span>근무유형</span>
                <strong>{detailRow.workType}</strong>
              </div>
              <div className="site-detail-section">
                <span>시간대 / 상태</span>
                <strong>
                  {detailRow.site.timezone} / {detailRow.site.status === "active" ? "운영중" : "중지"}
                </strong>
              </div>
              <div className="site-detail-section">
                <span>패턴 시작일</span>
                <strong>{detailRow.pattern?.patternStartDate ?? "-"}</strong>
              </div>
              <div className="site-detail-section">
                <span>시작 기준</span>
                <strong>{startIndexRuleLabels[detailRow.pattern?.startIndexRule ?? ""] ?? "-"}</strong>
              </div>
            </div>
            <div className="site-worktime-grid">
              {detailRow.shiftDefinitions.length > 0 ? (
                detailRow.shiftDefinitions.map((definition) => (
                  <div className="site-detail-section" key={definition.dutyCode}>
                    <span>{definition.label}</span>
                    <strong>{definition.timeRange}</strong>
                    <em>휴게 {definition.breakMinutes}분</em>
                  </div>
                ))
              ) : (
                <div className="site-detail-section">
                  <span>패턴 상태</span>
                  <strong>등록된 패턴이 없습니다.</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
