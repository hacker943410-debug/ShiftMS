import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import type {
  EmployeeRecord,
  EmployeeSiteAssignment,
  ShiftPatternRecord,
  SiteRecord,
  WageRateRecord
} from "@shared/domain/model";

import { FormSelect } from "../components/FormSelect";
import { useAppWorkflow } from "../contexts/app-workflow-context";

type EmployeeStatusFilter = EmployeeRecord["status"] | "all";
type EmployeeAssignmentFilter = "all" | "assigned" | "unassigned" | "ended";

interface EmployeeFormState {
  employmentType: string;
  name: string;
  hireDate: string;
  hourlyRate: string;
  siteId: string;
  shiftGroup: string;
}

interface WageRateFormState {
  hourlyRate: string;
  effectiveFrom: string;
  reason: string;
}

const initialEmployeeFormState: EmployeeFormState = {
  employmentType: "정규",
  name: "",
  hireDate: "",
  hourlyRate: "",
  siteId: "",
  shiftGroup: ""
};

const employeeStatusLabel: Record<EmployeeRecord["status"], string> = {
  active: "재직",
  leave: "휴직",
  retired: "퇴사"
};

const employeeStatusTone: Record<EmployeeRecord["status"], "info" | "warn" | "neutral"> = {
  active: "info",
  leave: "warn",
  retired: "neutral"
};

const employeeAssignmentLabel: Record<EmployeeAssignmentFilter, string> = {
  all: "전체",
  assigned: "배정중",
  unassigned: "미배정",
  ended: "종료"
};

const createDateInputValue = () => new Date().toISOString().slice(0, 10);
const getTeamLabels = (teamCount: number) =>
  Array.from({ length: teamCount }, (_, index) => `${String.fromCharCode(65 + index)}조`);

const createAutoEmployeeCode = (employees: EmployeeRecord[], hireDate: string) => {
  const year = /^\d{4}-\d{2}-\d{2}$/.test(hireDate)
    ? hireDate.slice(0, 4)
    : String(new Date().getFullYear());
  const nextIndex = employees.reduce((highest, employee) => {
    const match = employee.employeeCode.match(/^(\d{4})(\d{3})$/);

    if (!match || match[1] !== year) {
      return highest;
    }

    return Math.max(highest, Number(match[2]));
  }, -1) + 1;

  return `${year}${String(Math.max(nextIndex, 0)).padStart(3, "0")}`;
};

const isDateInputValue = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

const shiftDateValue = (value: string, offsetDays: number) => {
  if (!isDateInputValue(value)) {
    return "";
  }

  const [year, month, day] = value.split("-").map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day));

  targetDate.setUTCDate(targetDate.getUTCDate() + offsetDays);

  return `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(targetDate.getUTCDate()).padStart(2, "0")}`;
};

const getNextWageEffectiveFrom = (activeWageRate?: WageRateRecord | null) => {
  const today = createDateInputValue();

  if (!activeWageRate?.effectiveFrom || !isDateInputValue(activeWageRate.effectiveFrom)) {
    return today;
  }

  const nextAllowedDate = shiftDateValue(activeWageRate.effectiveFrom, 1);

  return nextAllowedDate > today ? nextAllowedDate : today;
};

const createInitialWageRateFormState = (
  employee?: EmployeeRecord | null,
  activeWageRate?: WageRateRecord | null
): WageRateFormState => ({
  hourlyRate:
    typeof employee?.currentHourlyRate === "number" ? String(employee.currentHourlyRate) : "",
  effectiveFrom: getNextWageEffectiveFrom(activeWageRate),
  reason: ""
});

const formatDate = (value?: string) => {
  if (!value) {
    return "-";
  }

  return value.replace(/-/g, ".");
};

const formatCurrency = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return `${value.toLocaleString("ko-KR")}원`;
};

const getAvatarLabel = (name: string) => name.slice(0, 2).toUpperCase();

const getEmployeeAssignmentState = (employee: EmployeeRecord): EmployeeAssignmentFilter => {
  if (employee.currentSiteId) {
    return "assigned";
  }

  if (employee.status === "retired") {
    return "ended";
  }

  return "unassigned";
};

const getAssignmentStatusLabel = (employee: EmployeeRecord) =>
  employeeAssignmentLabel[getEmployeeAssignmentState(employee)];

const getAvailableShiftGroups = (
  siteId: string,
  patterns: ShiftPatternRecord[],
  employees: EmployeeRecord[]
) => {
  if (!siteId) {
    return [];
  }

  const targetPattern = [...patterns]
    .filter((pattern) => pattern.siteId === siteId && pattern.status === "active")
    .sort((left, right) =>
      (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt)
    )[0];

  if (!targetPattern) {
    return [];
  }

  const occupiedGroups = new Set(
    employees
      .filter((employee) => employee.currentSiteId === siteId && employee.currentShiftGroup)
      .map((employee) => employee.currentShiftGroup as string)
  );

  return getTeamLabels(targetPattern.teamCount).filter((group) => !occupiedGroups.has(group));
};

const getWorkPeriodLabel = (hireDate?: string, retireDate?: string) => {
  if (!hireDate) {
    return "-";
  }

  const startedAt = new Date(hireDate);
  const endedAt = retireDate ? new Date(retireDate) : new Date();

  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime()) || endedAt < startedAt) {
    return "-";
  }

  let totalMonths =
    (endedAt.getFullYear() - startedAt.getFullYear()) * 12 +
    (endedAt.getMonth() - startedAt.getMonth());

  if (endedAt.getDate() < startedAt.getDate()) {
    totalMonths -= 1;
  }

  if (totalMonths < 0) {
    totalMonths = 0;
  }

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  if (years === 0 && months === 0) {
    return "1개월 미만";
  }

  if (years === 0) {
    return `${months}개월`;
  }

  if (months === 0) {
    return `${years}년`;
  }

  return `${years}년 ${months}개월`;
};

const formatAssignmentHistory = (assignment: EmployeeSiteAssignment) => {
  const endLabel = assignment.endDate ? ` / 종료 ${formatDate(assignment.endDate)}` : "";
  const shiftLabel = assignment.shiftGroup ? `, 근무조명: ${assignment.shiftGroup}` : "";

  return `${formatDate(assignment.startDate)} 근무지: ${
    assignment.siteName ?? assignment.siteId
  }${shiftLabel}${endLabel}`;
};

const formatWageHistory = (wageRate: WageRateRecord) => {
  const endLabel = wageRate.effectiveTo ? ` / 종료 ${formatDate(wageRate.effectiveTo)}` : "";
  const reasonLabel = wageRate.reason ? ` / 사유: ${wageRate.reason}` : "";

  return `${formatDate(wageRate.effectiveFrom)} 시급: ${formatCurrency(
    wageRate.hourlyRate
  )}${endLabel}${reasonLabel}`;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

export const WorkforceManagementScreen = () => {
  const { selectedSiteId: workflowSiteId, setSelectedSiteId: setWorkflowSiteId, openRoute } =
    useAppWorkflow();
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [patterns, setPatterns] = useState<ShiftPatternRecord[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState(workflowSiteId || "all");
  const [selectedStatus, setSelectedStatus] = useState<EmployeeStatusFilter>("active");
  const [selectedAssignmentStatus, setSelectedAssignmentStatus] =
    useState<EmployeeAssignmentFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employeeAssignments, setEmployeeAssignments] = useState<EmployeeSiteAssignment[]>([]);
  const [employeeWageRates, setEmployeeWageRates] = useState<WageRateRecord[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<EmployeeFormState>(initialEmployeeFormState);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingWageRate, setIsSavingWageRate] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [wageRateForm, setWageRateForm] = useState<WageRateFormState>(() =>
    createInitialWageRateFormState()
  );
  const [refreshKey, setRefreshKey] = useState(0);

  const deferredKeyword = useDeferredValue(keyword);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId]
  );
  const autoEmployeeCode = useMemo(
    () => createAutoEmployeeCode(employees, createForm.hireDate),
    [createForm.hireDate, employees]
  );
  const availableCreateShiftGroups = useMemo(
    () => getAvailableShiftGroups(createForm.siteId, patterns, employees),
    [createForm.siteId, employees, patterns]
  );
  const visibleEmployees = useMemo(() => {
    const normalizedKeyword = deferredKeyword.trim().toLowerCase();

    return employees
      .filter((employee) => selectedSiteId === "all" || employee.currentSiteId === selectedSiteId)
      .filter((employee) => selectedStatus === "all" || employee.status === selectedStatus)
      .filter(
        (employee) =>
          selectedAssignmentStatus === "all" ||
          getEmployeeAssignmentState(employee) === selectedAssignmentStatus
      )
      .filter((employee) => {
        if (!normalizedKeyword) {
          return true;
        }

        return (
          employee.name.toLowerCase().includes(normalizedKeyword) ||
          employee.employeeCode.toLowerCase().includes(normalizedKeyword)
        );
      });
  }, [deferredKeyword, employees, selectedAssignmentStatus, selectedSiteId, selectedStatus]);
  const latestAssignment = employeeAssignments[0] ?? null;
  const activeAssignment =
    employeeAssignments.find((assignment) => assignment.status === "active") ?? null;
  const activeWageRate =
    employeeWageRates.find((wageRate) => !wageRate.effectiveTo) ?? null;

  useEffect(() => {
    if (!workflowSiteId) {
      return;
    }

    setSelectedSiteId((current) => (current === "all" ? workflowSiteId : current));
  }, [workflowSiteId]);

  useEffect(() => {
    if (selectedSiteId !== "all" && workflowSiteId !== selectedSiteId) {
      setWorkflowSiteId(selectedSiteId);
    }
  }, [selectedSiteId, setWorkflowSiteId, workflowSiteId]);

  useEffect(() => {
    let active = true;

    const loadSites = async () => {
      try {
        const [siteResult, patternResult] = await Promise.all([
          window.appBridge.listSites(),
          window.appBridge.listShiftPatterns()
        ]);

        if (!active) {
          return;
        }

        if (!siteResult.ok) {
          setScreenError(siteResult.message);
        } else {
          setSites(siteResult.data);
        }

        if (!patternResult.ok) {
          setScreenError(patternResult.message);
        } else {
          setPatterns(patternResult.data);
        }
      } catch (error) {
        if (!active) {
          return;
        }

        setScreenError(getErrorMessage(error));
      }
    };

    void loadSites();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadEmployees = async () => {
      setIsLoadingEmployees(true);
      setScreenError(null);

      try {
        const result = await window.appBridge.listEmployees();

        if (!active) {
          return;
        }

        if (!result.ok) {
          setEmployees([]);
          setScreenError(result.message);
          setIsLoadingEmployees(false);
          return;
        }

        startTransition(() => {
          setEmployees(result.data);
        });

        if (
          selectedEmployeeId &&
          !result.data.some((employee) => employee.id === selectedEmployeeId)
        ) {
          setSelectedEmployeeId(null);
          setShowDetail(false);
        }
      } catch (error) {
        if (!active) {
          return;
        }

        setEmployees([]);
        setScreenError(getErrorMessage(error));
      } finally {
        if (active) {
          setIsLoadingEmployees(false);
        }
      }
    };

    void loadEmployees();

    return () => {
      active = false;
    };
  }, [refreshKey, selectedEmployeeId]);

  useEffect(() => {
    if (!createForm.siteId) {
      if (createForm.shiftGroup) {
        handleCreateInputChange("shiftGroup", "");
      }
      return;
    }

    if (
      createForm.shiftGroup &&
      !availableCreateShiftGroups.includes(createForm.shiftGroup)
    ) {
      handleCreateInputChange("shiftGroup", "");
    }
  }, [availableCreateShiftGroups, createForm.shiftGroup, createForm.siteId]);

  useEffect(() => {
    if (!showDetail || !selectedEmployeeId) {
      setEmployeeAssignments([]);
      setEmployeeWageRates([]);
      setDetailError(null);
      return;
    }

    let active = true;

    const loadDetail = async () => {
      setIsLoadingDetail(true);
      setDetailError(null);

      try {
        const [assignmentResult, wageRateResult] = await Promise.all([
          window.appBridge.listEmployeeAssignments(selectedEmployeeId),
          window.appBridge.listEmployeeWageRates(selectedEmployeeId)
        ]);

        if (!active) {
          return;
        }

        if (!assignmentResult.ok) {
          setDetailError(assignmentResult.message);
        } else {
          setEmployeeAssignments(assignmentResult.data);
        }

        if (!wageRateResult.ok) {
          setDetailError(wageRateResult.message);
        } else {
          setEmployeeWageRates(wageRateResult.data);
        }
      } catch (error) {
        if (!active) {
          return;
        }

        setDetailError(getErrorMessage(error));
      } finally {
        if (active) {
          setIsLoadingDetail(false);
        }
      }
    };

    void loadDetail();

    return () => {
      active = false;
    };
  }, [refreshKey, selectedEmployeeId, showDetail]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      return;
    }

    setWageRateForm(createInitialWageRateFormState(selectedEmployee, activeWageRate));
  }, [activeWageRate?.effectiveFrom, selectedEmployee?.currentHourlyRate, selectedEmployeeId]);

  const handleCreateInputChange = <K extends keyof EmployeeFormState>(
    key: K,
    value: EmployeeFormState[K]
  ) => {
    setCreateForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const handleWageRateInputChange = <K extends keyof WageRateFormState>(
    key: K,
    value: WageRateFormState[K]
  ) => {
    setWageRateForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const handleOpenCreateModal = () => {
    setModalError(null);
    setCreateForm({
      ...initialEmployeeFormState,
      hireDate: createDateInputValue(),
      siteId: selectedSiteId !== "all" ? selectedSiteId : ""
    });
    setShowCreateModal(true);
  };

  const handleCreateEmployee = async () => {
    setModalError(null);

    if (
      createForm.name.trim().length === 0 ||
      createForm.hireDate.trim().length === 0
    ) {
      setModalError("이름과 입사일은 필수입니다.");
      return;
    }

    const hourlyRate =
      createForm.hourlyRate.trim().length > 0 ? Number(createForm.hourlyRate) : undefined;

    if (hourlyRate !== undefined && (!Number.isFinite(hourlyRate) || hourlyRate <= 0)) {
      setModalError("통상시급은 0보다 큰 숫자로 입력해야 합니다.");
      return;
    }

    setIsSaving(true);

    try {
      const result = await window.appBridge.saveEmployee({
        employeeCode: autoEmployeeCode,
        name: createForm.name.trim(),
        employmentType: createForm.employmentType.trim(),
        status: "active",
        hireDate: createForm.hireDate,
        siteId: createForm.siteId || undefined,
        shiftGroup: createForm.shiftGroup.trim() || undefined,
        hourlyRate
      });

      if (!result.ok) {
        setModalError(result.message);
        return;
      }

      setShowCreateModal(false);
      setCreateForm(initialEmployeeFormState);
      setRefreshKey((current) => current + 1);
      if (result.data.currentSiteId) {
        setWorkflowSiteId(result.data.currentSiteId);
      }
      startTransition(() => {
        setSelectedEmployeeId(result.data.id);
      });
    } catch (error) {
      setModalError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenDetail = (employeeId: string) => {
    setDetailError(null);
    const employee = employees.find((item) => item.id === employeeId);

    if (employee?.currentSiteId) {
      setWorkflowSiteId(employee.currentSiteId);
    }
    startTransition(() => {
      setSelectedEmployeeId(employeeId);
      setShowDetail(true);
    });
  };

  const assignmentStartDate = activeAssignment?.startDate ?? latestAssignment?.startDate;
  const currentWageAutoEndDate = activeWageRate
    ? shiftDateValue(wageRateForm.effectiveFrom, -1)
    : "";

  const handleSaveWageRate = async () => {
    if (!selectedEmployeeId) {
      return;
    }

    setDetailError(null);

    if (!wageRateForm.effectiveFrom) {
      setDetailError("시급 적용일을 입력해야 합니다.");
      return;
    }

    if (
      activeWageRate?.effectiveFrom &&
      wageRateForm.effectiveFrom <= activeWageRate.effectiveFrom
    ) {
      setDetailError("시급 적용일은 현재 시급 적용일 이후 날짜로 입력해야 합니다.");
      return;
    }

    const hourlyRate = Number(wageRateForm.hourlyRate);

    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      setDetailError("통상시급은 0보다 큰 숫자로 입력해야 합니다.");
      return;
    }

    setIsSavingWageRate(true);

    try {
      const result = await window.appBridge.saveEmployeeWageRate({
        employeeId: selectedEmployeeId,
        hourlyRate,
        effectiveFrom: wageRateForm.effectiveFrom,
        reason: wageRateForm.reason.trim() || undefined
      });

      if (!result.ok) {
        setDetailError(result.message);
        return;
      }

      setRefreshKey((current) => current + 1);
    } catch (error) {
      setDetailError(getErrorMessage(error));
    } finally {
      setIsSavingWageRate(false);
    }
  };

  const handleOpenSiteManagement = () => {
    openRoute("sites", { selectedSiteId: "" });
  };

  const handleOpenScheduleManagement = () => {
    openRoute("schedule", { selectedSiteId: selectedEmployee?.currentSiteId ?? "" });
  };

  if (showDetail) {
    return (
      <div className="screen-stack workforce-detail-screen">
        <section className="detail-page-shell">
          <div className="detail-backdrop-panel">
            <div className="detail-backdrop-copy">
              <p>인력 상세 정보</p>
              <strong>{selectedEmployee?.name ?? "선택된 인력 없음"}</strong>
              <span>
                {selectedEmployee?.currentSiteName ?? "미배정"} /{" "}
                {selectedEmployee?.currentShiftGroup ?? "미배정"}
              </span>
            </div>
          </div>

          <div className="detail-info-column">
            <div className="detail-info-card">
              <div className="detail-static-item">
                <span>사원번호</span>
                <strong>{selectedEmployee?.employeeCode ?? "-"}</strong>
              </div>
              <div className="detail-static-item">
                <span>이름</span>
                <strong>{selectedEmployee?.name ?? "-"}</strong>
              </div>
              <div className="detail-static-item">
                <span>고용형태</span>
                <strong>{selectedEmployee?.employmentType ?? "-"}</strong>
              </div>
              <div className="detail-static-item">
                <span>입사일</span>
                <strong>{formatDate(selectedEmployee?.hireDate)}</strong>
              </div>
              <div className="detail-static-item">
                <span>직무적용일</span>
                <strong>{formatDate(latestAssignment?.startDate)}</strong>
              </div>
              <div className="detail-static-item">
                <span>근무지</span>
                <strong>{selectedEmployee?.currentSiteName ?? "미배정"}</strong>
              </div>
              <div className="detail-static-item">
                <span>근무조명</span>
                <strong>{selectedEmployee?.currentShiftGroup ?? "미배정"}</strong>
              </div>
              <div className="detail-static-item">
                <span>상태</span>
                <strong>
                  {selectedEmployee ? employeeStatusLabel[selectedEmployee.status] : "-"}
                </strong>
              </div>
            </div>
            <div className="detail-nav-grid">
              <button
                className="detail-nav-button detail-nav-button--site"
                onClick={handleOpenSiteManagement}
                type="button"
              >
                <div className="detail-nav-head">
                  <span aria-hidden="true" className="detail-nav-icon">
                    S
                  </span>
                  <span className="detail-nav-kicker">연결 메뉴</span>
                </div>
                <div className="detail-nav-title-row">
                  <strong>근무지 관리</strong>
                  <span aria-hidden="true" className="detail-nav-arrow-mark">
                    →
                  </span>
                </div>
                <span>
                  근무지 설정과 배정 기준은 별도 메뉴에서 확인하고 수정합니다.
                </span>
              </button>
              <button
                className="detail-nav-button detail-nav-button--schedule"
                onClick={handleOpenScheduleManagement}
                type="button"
              >
                <div className="detail-nav-head">
                  <span aria-hidden="true" className="detail-nav-icon">
                    P
                  </span>
                  <span className="detail-nav-kicker">연결 메뉴</span>
                </div>
                <div className="detail-nav-title-row">
                  <strong>근무표 배포</strong>
                  <span aria-hidden="true" className="detail-nav-arrow-mark">
                    →
                  </span>
                </div>
                <span>
                  현재 배정 기준으로 근무표 편성 화면으로 이동합니다.
                </span>
              </button>
            </div>
          </div>

          <div className="detail-edit-column">
            <div className="detail-edit-card">
              <div className="detail-edit-section detail-edit-section--readonly">
                <div className="detail-section-copy">
                  <h3>근무 배정 정보</h3>
                  <p>근무지와 근무조 변경은 근무지 관리의 근무지 수정 메뉴에서 진행합니다.</p>
                </div>
                <div className="detail-readonly-grid">
                  <div className="detail-readonly-item">
                    <span>근무지</span>
                    <strong>{selectedEmployee?.currentSiteName ?? "미배정"}</strong>
                  </div>
                  <div className="detail-readonly-item">
                    <span>근무조명</span>
                    <strong>{selectedEmployee?.currentShiftGroup ?? "미배정"}</strong>
                  </div>
                  <div className="detail-readonly-item">
                    <span>배정 적용일</span>
                    <strong>{formatDate(assignmentStartDate)}</strong>
                  </div>
                </div>
              </div>

              <div className="detail-edit-section detail-edit-section--wage">
                <div className="detail-section-copy">
                  <h3>시급 변경</h3>
                  <p>새 시급 적용일을 입력하면 현재 시급 종료일은 전날로 자동 계산됩니다.</p>
                </div>
                <div className="detail-wage-compare">
                  <div className="detail-wage-card detail-wage-card--current">
                    <span className="detail-wage-kicker">변경 전</span>
                    <div className="detail-wage-metric">
                      <span>현재 시급</span>
                      <strong>{formatCurrency(activeWageRate?.hourlyRate ?? selectedEmployee?.currentHourlyRate)}</strong>
                    </div>
                    <div className="detail-wage-metric">
                      <span>현재 적용일</span>
                      <strong>{formatDate(activeWageRate?.effectiveFrom)}</strong>
                    </div>
                    <div className="detail-wage-metric">
                      <span>종료일(자동)</span>
                      <strong>{currentWageAutoEndDate ? formatDate(currentWageAutoEndDate) : "-"}</strong>
                    </div>
                  </div>

                  <div aria-hidden="true" className="detail-wage-arrow">
                    <span>↓</span>
                  </div>

                  <div className="detail-wage-card detail-wage-card--next">
                    <span className="detail-wage-kicker">변경 후</span>
                    <div className="detail-wage-form-grid">
                      <label className="field detail-compact-field">
                        <span>통상시급</span>
                        <input
                          inputMode="numeric"
                          onChange={(event) => {
                            handleWageRateInputChange("hourlyRate", event.target.value);
                          }}
                          placeholder="숫자 입력"
                          value={wageRateForm.hourlyRate}
                        />
                      </label>
                      <label className="field detail-compact-field">
                        <span>시급 적용일</span>
                        <input
                          onChange={(event) => {
                            handleWageRateInputChange("effectiveFrom", event.target.value);
                          }}
                          type="date"
                          value={wageRateForm.effectiveFrom}
                        />
                      </label>
                      <label className="field detail-compact-field detail-compact-field--wide">
                        <span>변경 사유</span>
                        <input
                          onChange={(event) => {
                            handleWageRateInputChange("reason", event.target.value);
                          }}
                          placeholder="예: 정기 인상"
                          value={wageRateForm.reason}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {detailError ? <p className="form-error-text">{detailError}</p> : null}
              <div className="detail-tip-box">
                <strong>입력 안내</strong>
                <span>이력은 삭제하지 않고 저장/종료만 지원합니다. 종료일은 시작일보다 빠를 수 없습니다.</span>
              </div>
              <div className="button-row detail-footer-actions">
                <button
                  className="primary-button"
                  disabled={isSavingWageRate || isLoadingDetail}
                  onClick={handleSaveWageRate}
                  type="button"
                >
                  {isSavingWageRate ? "수정 중..." : "수정"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setShowDetail(false);
                  }}
                  type="button"
                >
                  뒤로가기
                </button>
              </div>
            </div>
          </div>

          <div className="detail-history-column">
            <div className="detail-history-box">
              <h3>근무변경이력</h3>
              <div className="timeline-list">
                {isLoadingDetail ? (
                  <div className="timeline-item">
                    <span className="timeline-dot" />
                    <p>근무변경이력을 불러오는 중입니다.</p>
                  </div>
                ) : employeeAssignments.length > 0 ? (
                  employeeAssignments.map((assignment) => (
                    <div className="timeline-item" key={assignment.id}>
                      <span className="timeline-dot" />
                      <p>{formatAssignmentHistory(assignment)}</p>
                    </div>
                  ))
                ) : (
                  <div className="timeline-item">
                    <span className="timeline-dot" />
                    <p>등록된 근무변경이력이 없습니다.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="detail-history-box">
              <h3>시급변경이력</h3>
              <div className="timeline-list">
                {isLoadingDetail ? (
                  <div className="timeline-item">
                    <span className="timeline-dot" />
                    <p>시급변경이력을 불러오는 중입니다.</p>
                  </div>
                ) : employeeWageRates.length > 0 ? (
                  employeeWageRates.map((wageRate) => (
                    <div className="timeline-item" key={wageRate.id}>
                      <span className="timeline-dot" />
                      <p>{formatWageHistory(wageRate)}</p>
                    </div>
                  ))
                ) : (
                  <div className="timeline-item">
                    <span className="timeline-dot" />
                    <p>등록된 시급변경이력이 없습니다.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="screen-stack">
      <section className="surface-card workforce-header-card">
        <div className="section-heading compact-heading">
          <div>
            <h3>근무 인력 관리</h3>
            <p>사원 명부와 배정 상태를 실제 저장 데이터 기준으로 확인합니다.</p>
          </div>
          <div className="button-row">
            {selectedSiteId !== "all" ? (
              <>
                <button
                  className="ghost-button"
                  onClick={() => {
                    openRoute("sites", { selectedSiteId });
                  }}
                  type="button"
                >
                  선택 근무지 보기
                </button>
                <button
                  className="ghost-button"
                  onClick={() => {
                    openRoute("schedule", { selectedSiteId });
                  }}
                  type="button"
                >
                  선택 근무표 보기
                </button>
              </>
            ) : null}
            <button className="primary-button" onClick={handleOpenCreateModal} type="button">
              신규 인력 등록
            </button>
          </div>
        </div>

        <div className="filter-grid workforce-filter-grid">
          <label className="field filter-field filter-field-md workforce-select-field">
            <span>근무지</span>
            <FormSelect
              className="workforce-select-shell"
              selectClassName="workforce-modern-select"
              onChange={(event) => {
                setSelectedSiteId(event.target.value);
              }}
              value={selectedSiteId}
            >
              <option value="all">전체</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </FormSelect>
          </label>
          <label className="field filter-field filter-field-md workforce-select-field">
            <span>현재상태</span>
            <FormSelect
              className="workforce-select-shell"
              selectClassName="workforce-modern-select"
              onChange={(event) => {
                setSelectedStatus(event.target.value as EmployeeStatusFilter);
              }}
              value={selectedStatus}
            >
              <option value="all">전체</option>
              <option value="active">재직</option>
              <option value="leave">휴직</option>
              <option value="retired">퇴사</option>
            </FormSelect>
          </label>
          <label className="field filter-field filter-field-md workforce-select-field">
            <span>배정상태</span>
            <FormSelect
              className="workforce-select-shell"
              selectClassName="workforce-modern-select"
              onChange={(event) => {
                setSelectedAssignmentStatus(event.target.value as EmployeeAssignmentFilter);
              }}
              value={selectedAssignmentStatus}
            >
              <option value="all">전체</option>
              <option value="assigned">배정중</option>
              <option value="unassigned">미배정</option>
              <option value="ended">종료</option>
            </FormSelect>
          </label>
          <label className="field filter-field filter-field-search workforce-search-field">
            <span>검색</span>
            <input
              onChange={(event) => {
                setKeyword(event.target.value);
              }}
              placeholder="이름/사원번호 검색"
              value={keyword}
            />
          </label>
        </div>

        {screenError ? <p className="form-error-text">{screenError}</p> : null}

        <div className="data-scroll">
          <table className="info-table workforce-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>사원번호</th>
                <th>고용형태</th>
                <th>이름</th>
                <th>근무지</th>
                <th>조이름</th>
                <th>현재상태</th>
                <th>통상시급</th>
                <th>배정상태</th>
                <th>근무기간</th>
                <th>프로필</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingEmployees ? (
                <tr>
                  <td colSpan={11}>인력 목록을 불러오는 중입니다.</td>
                </tr>
              ) : visibleEmployees.length === 0 ? (
                <tr>
                  <td colSpan={11}>조회된 인력이 없습니다.</td>
                </tr>
              ) : (
                visibleEmployees.map((employee, index) => (
                  <tr key={employee.id}>
                    <td>{index + 1}</td>
                    <td>{employee.employeeCode}</td>
                    <td>{employee.employmentType}</td>
                    <td className="table-strong">{employee.name}</td>
                    <td>{employee.currentSiteName ?? "미배정"}</td>
                    <td>{employee.currentShiftGroup ?? "미배정"}</td>
                    <td>
                      <span className={`pill ${employeeStatusTone[employee.status]}`}>
                        {employeeStatusLabel[employee.status]}
                      </span>
                    </td>
                    <td>{formatCurrency(employee.currentHourlyRate)}</td>
                    <td>{getAssignmentStatusLabel(employee)}</td>
                    <td>{getWorkPeriodLabel(employee.hireDate, employee.retireDate)}</td>
                    <td>
                      <button
                        aria-label={`${employee.name} 상세 보기`}
                        className="profile-trigger"
                        onClick={() => {
                          handleOpenDetail(employee.id);
                        }}
                        title={`${employee.name} 상세 보기`}
                        type="button"
                      >
                        <span className="profile-avatar">{getAvatarLabel(employee.name)}</span>
                        <span className="profile-name">{employee.name}</span>
                        <span className="profile-link-label">프로필 보기</span>
                        <span className="profile-actions icon-view" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination-row">
          <strong>{visibleEmployees.length}</strong>
          <span>명 조회</span>
        </div>
      </section>

      {showCreateModal ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <h3>신규 인력 등록</h3>
                <p>기본 인력 정보와 초기 배정/시급을 함께 저장합니다.</p>
              </div>
            </div>
            <div className="filter-grid two-up">
              <label className="field">
                <span>사원번호</span>
                <input className="workforce-static-input" readOnly value={autoEmployeeCode} />
              </label>
              <label className="field workforce-select-field">
                <span>고용형태</span>
                <FormSelect
                  className="workforce-select-shell"
                  selectClassName="workforce-modern-select"
                  onChange={(event) => {
                    handleCreateInputChange("employmentType", event.target.value);
                  }}
                  value={createForm.employmentType}
                >
                  <option value="정규">정규</option>
                  <option value="계약">계약</option>
                  <option value="파견">파견</option>
                </FormSelect>
              </label>
              <label className="field">
                <span>이름</span>
                <input
                  onChange={(event) => {
                    handleCreateInputChange("name", event.target.value);
                  }}
                  placeholder="이름 입력"
                  value={createForm.name}
                />
              </label>
              <label className="field">
                <span>입사일</span>
                <input
                  onChange={(event) => {
                    handleCreateInputChange("hireDate", event.target.value);
                  }}
                  type="date"
                  value={createForm.hireDate}
                />
              </label>
              <label className="field workforce-select-field">
                <span>근무지</span>
                <FormSelect
                  className="workforce-select-shell"
                  selectClassName="workforce-modern-select"
                  onChange={(event) => {
                    handleCreateInputChange("siteId", event.target.value);
                  }}
                  value={createForm.siteId}
                >
                  <option value="">미배정</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </FormSelect>
              </label>
              <label className="field workforce-select-field">
                <span>근무조명</span>
                <FormSelect
                  className="workforce-select-shell"
                  selectClassName="workforce-modern-select"
                  onChange={(event) => {
                    handleCreateInputChange("shiftGroup", event.target.value);
                  }}
                  value={createForm.shiftGroup}
                >
                  <option value="">
                    {!createForm.siteId
                      ? "근무지 선택 전"
                      : availableCreateShiftGroups.length === 0
                        ? "선택 가능한 근무조 없음"
                        : "근무조 선택"}
                  </option>
                  {availableCreateShiftGroups.map((shiftGroup) => (
                    <option key={shiftGroup} value={shiftGroup}>
                      {shiftGroup}
                    </option>
                  ))}
                </FormSelect>
              </label>
              <label className="field">
                <span>상태</span>
                <input className="workforce-static-input" readOnly value="신규" />
              </label>
              <label className="field">
                <span>통상시급</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => {
                    handleCreateInputChange("hourlyRate", event.target.value);
                  }}
                  placeholder="숫자 입력"
                  value={createForm.hourlyRate}
                />
              </label>
            </div>
            {modalError ? <p className="form-error-text">{modalError}</p> : null}
            <div className="button-row">
              <button className="primary-button" onClick={handleCreateEmployee} type="button">
                {isSaving ? "저장 중..." : "저장"}
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  setShowCreateModal(false);
                }}
                type="button"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
