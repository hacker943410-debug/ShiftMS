import {
  startTransition,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";

import type {
  LocalFileSelection,
  WorkforceWageBulkUpdateApplySummary,
  WorkforceWageBulkUpdatePreview,
  WorkforceWageBulkUpdateRowStatus
} from "@shared/bridge/contracts";
import type {
  EmployeeRecord,
  EmployeeSiteAssignment,
  ShiftPatternRecord,
  SiteRecord,
  WageRateRecord
} from "@shared/domain/model";
import {
  formatEmployeeDisplayName,
  isBpEmploymentType
} from "@shared/domain/employment-type";
import {
  employeeRankOptions,
  normalizeEmployeeRank
} from "@shared/domain/employee-rank";
import { formatHourlyRateCurrency } from "@shared/lib/formatCurrency";

import { DateField } from "../components/DateField";
import { FormSelect } from "../components/FormSelect";
import { GuideFlowModal } from "../components/GuideFlowModal";
import { showActionResultDialog } from "../components/action-result-dialog";
import { useQuestionDialog } from "../components/QuestionDialog";
import { useDialogDismiss } from "../components/useDialogDismiss";
import { useAppWorkflow } from "../contexts/app-workflow-context";
import { workforceWageBulkGuide } from "../guides/route-guides";
import {
  resolveWorkforceEmploymentTypeFormValue,
  workforceEmploymentTypeOptions
} from "./workforce/workforce-employment-type-options";
import {
  buildWorkforceListState,
  formatWorkforceEmploymentType,
  getWorkforceAssignmentState,
  type EmployeeAssignmentFilter,
  type EmployeeEmploymentFilter,
  type EmployeeStatusFilter,
  type WorkforcePageSize
} from "./workforce/workforce-list-selectors";
import { getAvailableShiftGroups } from "./workforce/workforce-shift-group-options";

interface EmployeeFormState {
  employeeCode: string;
  employmentType: string;
  rank: string;
  name: string;
  contact: string;
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

interface EmployeeDetailFormState {
  employmentType: string;
  rank: string;
  contact: string;
  status: EmployeeRecord["status"];
  retireDate: string;
}

interface WageBulkMappingState {
  siteNameColumn: string;
  employeeNameColumn: string;
  hourlyRateColumn: string;
}

const initialEmployeeFormState: EmployeeFormState = {
  employeeCode: "",
  employmentType: "정규",
  rank: "",
  name: "",
  contact: "",
  hireDate: "",
  hourlyRate: "",
  siteId: "",
  shiftGroup: ""
};

const initialEmployeeDetailFormState: EmployeeDetailFormState = {
  employmentType: "정규",
  rank: "",
  contact: "",
  status: "active",
  retireDate: ""
};

const initialWageBulkMappingState: WageBulkMappingState = {
  siteNameColumn: "B",
  employeeNameColumn: "C",
  hourlyRateColumn: "D"
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

const employeeEmploymentFilterLabel: Record<EmployeeEmploymentFilter, string> = {
  all: "전체",
  regular: "정규",
  contract: "계약",
  bp: "BP"
};

const wageBulkStatusTone: Record<WorkforceWageBulkUpdateRowStatus, "info" | "warn" | "neutral"> = {
  ready: "info",
  applied: "info",
  "missing-required-value": "warn",
  "invalid-hourly-rate": "warn",
  "employee-not-found": "warn",
  "ambiguous-employee": "warn",
  "employee-retired": "neutral",
  "same-rate": "neutral",
  "effective-date-conflict": "warn",
  "duplicate-entry": "neutral"
};

const createDateInputValue = () => new Date().toISOString().slice(0, 10);
const normalizeWageBulkColumnInput = (value: string) =>
  value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
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

const formatHourlyRate = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return formatHourlyRateCurrency(value);
};

const getAssignmentStatusPresentation = (employee: EmployeeRecord) => {
  const assignmentState = getWorkforceAssignmentState(employee);

  if (assignmentState !== "assigned") {
    return {
      detail: null,
      label: employeeAssignmentLabel[assignmentState]
    };
  }

  return {
    detail: `(${employee.currentSiteName ?? "근무지 미정"}, ${employee.currentShiftGroup ?? "조 미정"})`,
    label: "배정중"
  };
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

  return `${formatDate(wageRate.effectiveFrom)} 시급: ${formatHourlyRate(
    wageRate.hourlyRate
  )}${endLabel}${reasonLabel}`;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

export const WorkforceManagementScreen = () => {
  const { selectedSiteId: workflowSiteId, setSelectedSiteId: setWorkflowSiteId } =
    useAppWorkflow();
  const listSectionRef = useRef<HTMLElement | null>(null);
  const listHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const shouldRestoreListFocusRef = useRef(false);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [patterns, setPatterns] = useState<ShiftPatternRecord[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState<EmployeeStatusFilter>("all");
  const [selectedEmploymentFilter, setSelectedEmploymentFilter] =
    useState<EmployeeEmploymentFilter>("all");
  const [selectedAssignmentStatus, setSelectedAssignmentStatus] =
    useState<EmployeeAssignmentFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<WorkforcePageSize>(10);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employeeAssignments, setEmployeeAssignments] = useState<EmployeeSiteAssignment[]>([]);
  const [employeeWageRates, setEmployeeWageRates] = useState<WageRateRecord[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showWageBulkModal, setShowWageBulkModal] = useState(false);
  const { dialogRef: wageBulkDialogRef, onKeyDown: wageBulkOnKeyDown } = useDialogDismiss<HTMLDivElement>({
    isOpen: showWageBulkModal,
    onDismiss: () => {
      setShowWageBulkModal(false);
    }
  });
  const { dialogRef: createDialogRef, onKeyDown: createOnKeyDown } = useDialogDismiss<HTMLDivElement>({
    isOpen: showCreateModal,
    onDismiss: () => {
      setShowCreateModal(false);
    }
  });
  const [showWageBulkGuide, setShowWageBulkGuide] = useState(false);
  const [createForm, setCreateForm] = useState<EmployeeFormState>(initialEmployeeFormState);
  const [wageBulkFile, setWageBulkFile] = useState<LocalFileSelection | null>(null);
  const [wageBulkMapping, setWageBulkMapping] = useState<WageBulkMappingState>(
    initialWageBulkMappingState
  );
  const [wageBulkEffectiveFrom, setWageBulkEffectiveFrom] = useState(createDateInputValue());
  const [wageBulkPreview, setWageBulkPreview] = useState<WorkforceWageBulkUpdatePreview | null>(
    null
  );
  const [wageBulkApplySummary, setWageBulkApplySummary] =
    useState<WorkforceWageBulkUpdateApplySummary | null>(null);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingWageRate, setIsSavingWageRate] = useState(false);
  const [isPreviewingWageBulk, setIsPreviewingWageBulk] = useState(false);
  const [isApplyingWageBulk, setIsApplyingWageBulk] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [wageBulkError, setWageBulkError] = useState<string | null>(null);
  const [wageBulkSuccess, setWageBulkSuccess] = useState<string | null>(null);
  const [wageRateForm, setWageRateForm] = useState<WageRateFormState>(() =>
    createInitialWageRateFormState()
  );
  const [detailForm, setDetailForm] = useState<EmployeeDetailFormState>(
    initialEmployeeDetailFormState
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const { askQuestion, questionDialog } = useQuestionDialog();

  const deferredKeyword = useDeferredValue(keyword);
  const isBpCreateEmployee = isBpEmploymentType(createForm.employmentType);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId]
  );
  const availableCreateShiftGroups = useMemo(
    () => getAvailableShiftGroups(createForm.siteId, patterns, employees),
    [createForm.siteId, employees, patterns]
  );
  const workforceListState = useMemo(
    () =>
      buildWorkforceListState({
        employees,
        filters: {
          keyword: deferredKeyword,
          selectedAssignmentStatus,
          selectedEmploymentFilter,
          selectedSiteId,
          selectedStatus
        },
        page: currentPage,
        pageSize
      }),
    [
      currentPage,
      deferredKeyword,
      employees,
      pageSize,
      selectedAssignmentStatus,
      selectedEmploymentFilter,
      selectedSiteId,
      selectedStatus
    ]
  );
  const employeeEmploymentCounts = workforceListState.employmentCounts;
  const visibleEmployees = workforceListState.pageEmployees;
  const latestAssignment = employeeAssignments[0] ?? null;
  const activeAssignment =
    employeeAssignments.find((assignment) => assignment.status === "active") ?? null;
  const activeWageRate =
    employeeWageRates.find((wageRate) => !wageRate.effectiveTo) ?? null;
  const selectedEmployeeHireDate =
    selectedEmployee?.hireDate ?? activeAssignment?.startDate ?? latestAssignment?.startDate;
  const wageBulkRows = wageBulkApplySummary?.rows ?? wageBulkPreview?.rows ?? [];
  const wageBulkReadyRows = wageBulkRows.filter(
    (row) => row.status === "ready" || row.status === "applied"
  );
  const wageBulkSkippedRows = wageBulkRows.filter(
    (row) => row.status !== "ready" && row.status !== "applied"
  );
  const canApplyWageBulk = Boolean(wageBulkPreview && wageBulkPreview.readyCount > 0);

  useEffect(() => {
    const nextWorkflowSiteId = selectedSiteId === "all" ? "" : selectedSiteId;

    if (workflowSiteId !== nextWorkflowSiteId) {
      setWorkflowSiteId(nextWorkflowSiteId);
    }
  }, [selectedSiteId, setWorkflowSiteId, workflowSiteId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    keyword,
    pageSize,
    selectedAssignmentStatus,
    selectedEmploymentFilter,
    selectedSiteId,
    selectedStatus
  ]);

  useEffect(() => {
    if (currentPage !== workforceListState.safePage) {
      setCurrentPage(workforceListState.safePage);
    }
  }, [currentPage, workforceListState.safePage]);

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
    if (!isBpCreateEmployee) {
      return;
    }

    setCreateForm((current) =>
      current.employeeCode || current.hourlyRate
        ? {
            ...current,
            employeeCode: "",
            hourlyRate: ""
          }
        : current
    );
  }, [isBpCreateEmployee]);

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

  useEffect(() => {
    if (!selectedEmployee) {
      setDetailForm(initialEmployeeDetailFormState);
      return;
    }

    setDetailForm({
      employmentType: resolveWorkforceEmploymentTypeFormValue(selectedEmployee.employmentType),
      rank: selectedEmployee.rank ?? "",
      contact: selectedEmployee.contact ?? "",
      status: selectedEmployee.status,
      retireDate: selectedEmployee.retireDate ?? ""
    });
  }, [selectedEmployee]);

  useLayoutEffect(() => {
    if (showDetail || !shouldRestoreListFocusRef.current) {
      return;
    }

    shouldRestoreListFocusRef.current = false;
    requestAnimationFrame(() => {
      listHeadingRef.current?.focus({ preventScroll: true });
    });
  }, [showDetail]);

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

  const handleDetailInputChange = <K extends keyof EmployeeDetailFormState>(
    key: K,
    value: EmployeeDetailFormState[K]
  ) => {
    setDetailForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const handleDetailStatusChange = (status: EmployeeRecord["status"]) => {
    setDetailForm((current) => ({
      ...current,
      status,
      retireDate: status === "retired" ? current.retireDate || createDateInputValue() : current.retireDate
    }));
  };

  const handleOpenCreateModal = () => {
    setModalError(null);
    setCreateForm({
      ...initialEmployeeFormState,
      hireDate: createDateInputValue()
    });
    setShowCreateModal(true);
  };

  const handleOpenWageBulkModal = () => {
    setWageBulkError(null);
    setWageBulkSuccess(null);
    setWageBulkPreview(null);
    setWageBulkApplySummary(null);
    setWageBulkFile(null);
    setWageBulkMapping(initialWageBulkMappingState);
    setWageBulkEffectiveFrom(createDateInputValue());
    setShowWageBulkModal(true);
  };

  const handleOpenDeletedSiteEmployeeNotice = async () => {
    const rows = workforceListState.deletedSiteEmployeeRows;

    await askQuestion({
      title: "삭제된 근무지 배정 인력",
      message: `삭제된 근무지에 아직 배정된 인력 ${rows.length}명은 목록과 집계에서 제외했습니다.`,
      description: (
        <div className="modal-table-shell">
          <table className="info-table compact-info-table">
            <thead>
              <tr>
                <th>사원번호</th>
                <th>이름</th>
                <th>삭제된 근무지</th>
                <th>조이름</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.employeeCode}-${row.siteName}-${row.shiftGroup}`}>
                  <td>{row.employeeCode}</td>
                  <td>{row.employeeName}</td>
                  <td>{row.siteName}</td>
                  <td>{row.shiftGroup}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
      confirmLabel: "확인",
      hideCancel: true
    });
  };

  const handleWageBulkMappingChange = <K extends keyof WageBulkMappingState>(
    key: K,
    value: WageBulkMappingState[K]
  ) => {
    setWageBulkMapping((current) => ({
      ...current,
      [key]: normalizeWageBulkColumnInput(String(value))
    }));
  };

  const handleSelectWageBulkFile = async () => {
    setWageBulkError(null);

    try {
      const result = await window.appBridge.selectSpreadsheetFile({
        title: "시급 업데이트 Excel 파일 선택",
        buttonLabel: "가져오기"
      });

      if (!result.ok) {
        setWageBulkError(result.message);
        return;
      }

      setWageBulkFile(result.data);
      setWageBulkPreview(null);
      setWageBulkApplySummary(null);
      setWageBulkSuccess(null);
    } catch (error) {
      setWageBulkError(getErrorMessage(error));
    }
  };

  const handlePreviewWageBulkUpdate = async () => {
    if (!wageBulkFile) {
      setWageBulkError("시급 업데이트 Excel 파일을 먼저 가져와야 합니다.");
      return;
    }

    setWageBulkError(null);
    setWageBulkSuccess(null);
    setIsPreviewingWageBulk(true);

    try {
      const result = await window.appBridge.previewWorkforceWageBulkUpdate({
        filePath: wageBulkFile.filePath,
        effectiveFrom: wageBulkEffectiveFrom,
        mapping: wageBulkMapping
      });

      if (!result.ok) {
        setWageBulkError(result.message);
        return;
      }

      setWageBulkPreview(result.data);
      setWageBulkApplySummary(null);
    } catch (error) {
      setWageBulkError(getErrorMessage(error));
    } finally {
      setIsPreviewingWageBulk(false);
    }
  };

  const handleApplyWageBulkUpdate = async () => {
    if (!wageBulkFile) {
      setWageBulkError("시급 업데이트 Excel 파일을 먼저 가져와야 합니다.");
      return;
    }

    setWageBulkError(null);
    setWageBulkSuccess(null);
    setIsApplyingWageBulk(true);

    try {
      const result = await window.appBridge.applyWorkforceWageBulkUpdate({
        filePath: wageBulkFile.filePath,
        effectiveFrom: wageBulkEffectiveFrom,
        mapping: wageBulkMapping
      });

      if (!result.ok) {
        setWageBulkError(result.message);
        return;
      }

      setWageBulkApplySummary(result.data);
      setWageBulkPreview(null);
      setWageBulkSuccess(`${result.data.appliedCount}명의 시급 변경 이력을 반영했습니다.`);
      setRefreshKey((current) => current + 1);
      await showActionResultDialog(askQuestion, {
        title: "시급 일괄 적용 완료",
        message: `${result.data.appliedCount}명의 시급 변경 이력을 반영했습니다.`
      });
    } catch (error) {
      setWageBulkError(getErrorMessage(error));
    } finally {
      setIsApplyingWageBulk(false);
    }
  };

  const handleCreateEmployee = async () => {
    setModalError(null);

    if (
      createForm.name.trim().length === 0 ||
      createForm.hireDate.trim().length === 0 ||
      (!isBpCreateEmployee && createForm.employeeCode.trim().length === 0)
    ) {
      setModalError(
        isBpCreateEmployee
          ? "BP 인력은 이름과 입사일을 입력해야 합니다."
          : "사원번호, 이름, 입사일은 필수입니다."
      );
      return;
    }

    const hourlyRate =
      !isBpCreateEmployee && createForm.hourlyRate.trim().length > 0
        ? Number(createForm.hourlyRate)
        : undefined;

    if (hourlyRate !== undefined && (!Number.isFinite(hourlyRate) || hourlyRate <= 0)) {
      setModalError("통상시급은 0보다 큰 숫자로 입력해야 합니다.");
      return;
    }

    const shouldCreateInitialAssignment = Boolean(
      createForm.siteId && createForm.shiftGroup.trim()
    );
    setIsSaving(true);

    try {
      const result = await window.appBridge.saveEmployee({
        employeeCode: createForm.employeeCode.trim(),
        name: createForm.name.trim(),
        contact: createForm.contact.trim() || undefined,
        rank: normalizeEmployeeRank(createForm.rank),
        employmentType: resolveWorkforceEmploymentTypeFormValue(createForm.employmentType),
        status: "active",
        hireDate: createForm.hireDate,
        siteId: shouldCreateInitialAssignment ? createForm.siteId : undefined,
        shiftGroup: shouldCreateInitialAssignment ? createForm.shiftGroup.trim() : undefined,
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
      const employeeDisplayName = formatEmployeeDisplayName(result.data);
      await askQuestion({
        title: "등록 완료",
        message: shouldCreateInitialAssignment
          ? `${employeeDisplayName} 인력이 등록되었고 ${result.data.currentSiteName ?? "선택 근무지"} / ${
              result.data.currentShiftGroup ?? createForm.shiftGroup.trim()
            }로 초기 배정되었습니다.`
          : `${employeeDisplayName} 인력이 등록되었습니다. 근무지 배정은 아직 하지 않았습니다.`,
        confirmLabel: "확인",
        hideCancel: true
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

  const currentWageAutoEndDate = activeWageRate
    ? shiftDateValue(wageRateForm.effectiveFrom, -1)
    : "";
  const canDeleteSelectedEmployee = Boolean(
    selectedEmployee?.status === "retired" &&
      selectedEmployee.retireDate &&
      selectedEmployee.retireDate < createDateInputValue()
  );

  const handleSaveWageRate = async () => {
    if (!selectedEmployeeId || !selectedEmployee) {
      return;
    }
    const detailEmployee = selectedEmployee;

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
      await showActionResultDialog(askQuestion, {
        title: "시급 저장 완료",
        message: `${detailEmployee.name}님의 시급 기준을 저장했습니다.`,
        description: `적용일: ${wageRateForm.effectiveFrom}`
      });
    } catch (error) {
      setDetailError(getErrorMessage(error));
    } finally {
      setIsSavingWageRate(false);
    }
  };

  const handleSaveEmployeeDetail = async () => {
    if (!selectedEmployee) {
      return;
    }

    const normalizedEmploymentType = resolveWorkforceEmploymentTypeFormValue(
      detailForm.employmentType
    );

    if (normalizedEmploymentType.length === 0) {
      setDetailError("고용형태를 입력해야 합니다.");
      return;
    }

    if (detailForm.status === "retired" && !detailForm.retireDate) {
      setDetailError("퇴사 처리일을 입력해야 합니다.");
      return;
    }

    if (
      detailForm.status === "retired" &&
      selectedEmployee.hireDate &&
      detailForm.retireDate < selectedEmployee.hireDate
    ) {
      setDetailError("퇴사 처리일은 입사일보다 빠를 수 없습니다.");
      return;
    }

    setDetailError(null);
    setIsSaving(true);

    try {
      const retireDate = detailForm.status === "retired" ? detailForm.retireDate : undefined;

      const result = await window.appBridge.saveEmployee({
        id: selectedEmployee.id,
        employeeCode: selectedEmployee.employeeCode,
        name: selectedEmployee.name,
        contact: detailForm.contact.trim() || undefined,
        rank: normalizeEmployeeRank(detailForm.rank),
        employmentType: normalizedEmploymentType,
        status: detailForm.status,
        hireDate: selectedEmployee.hireDate,
        retireDate
      });

      if (!result.ok) {
        setDetailError(result.message);
        return;
      }

      setRefreshKey((current) => current + 1);
      await showActionResultDialog(askQuestion, {
        title: "기본 정보 저장 완료",
        message: `${selectedEmployee.name}님의 기본 정보를 저장했습니다.`,
        description:
          detailForm.status === "retired" && retireDate
            ? `상태: 퇴사\n퇴사 처리일: ${retireDate}`
            : `상태: ${detailForm.status === "active" ? "재직" : "휴직"}`
      });
    } catch (error) {
      setDetailError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseDetail = () => {
    shouldRestoreListFocusRef.current = true;
    setShowDetail(false);
  };

  const handleDeleteEmployee = async () => {
    if (!selectedEmployee || !canDeleteSelectedEmployee) {
      return;
    }

    const confirmation = await askQuestion({
      title: "인력 삭제 확인",
      message: `${selectedEmployee.name} 인력을 삭제하시겠습니까?`,
      description:
        "퇴사 처리일이 지난 인력만 삭제할 수 있으며, 인력 기본정보와 배정/시급 이력이 함께 제거됩니다.",
      confirmLabel: "삭제",
      cancelLabel: "취소",
      confirmVariant: "danger"
    });

    if (!confirmation.confirmed) {
      return;
    }

    setDetailError(null);
    setIsSaving(true);

    try {
      const result = await window.appBridge.deleteEmployee({
        employeeId: selectedEmployee.id
      });

      if (!result.ok) {
        setDetailError(result.message);
        return;
      }

      shouldRestoreListFocusRef.current = true;
      setShowDetail(false);
      setSelectedEmployeeId(null);
      setRefreshKey((current) => current + 1);
      await showActionResultDialog(askQuestion, {
        title: "인력 삭제 완료",
        message: `${selectedEmployee.name} 인력을 삭제했습니다.`
      });
    } catch (error) {
      setDetailError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseActiveAssignment = async () => {
    if (!selectedEmployee || !activeAssignment) {
      return;
    }

    const closeDate =
      activeAssignment.startDate > createDateInputValue()
        ? activeAssignment.startDate
        : createDateInputValue();
    const confirmation = await askQuestion({
      title: "배정 해지 확인",
      message: `${selectedEmployee.name}님의 현재 배정을 해지하시겠습니까?`,
      description: `${activeAssignment.siteName ?? activeAssignment.siteId} / ${
        activeAssignment.shiftGroup ?? "근무조 미지정"
      }\n해지일: ${closeDate}`,
      confirmLabel: "해지",
      cancelLabel: "취소",
      confirmVariant: "danger"
    });

    if (!confirmation.confirmed) {
      return;
    }

    setDetailError(null);
    setIsSaving(true);

    try {
      const result = await window.appBridge.closeEmployeeAssignment({
        assignmentId: activeAssignment.id,
        endDate: closeDate
      });

      if (!result.ok) {
        setDetailError(result.message);
        return;
      }

      setRefreshKey((current) => current + 1);
      await showActionResultDialog(askQuestion, {
        title: "배정 해지 완료",
        message: `${selectedEmployee.name}님의 현재 배정을 해지했습니다.`,
        description: `해지일: ${closeDate}`
      });
    } catch (error) {
      setDetailError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  if (showDetail) {
    return (
      <div className="screen-stack workforce-detail-screen">
        {questionDialog}
        <section className="detail-page-shell">
          <div className="detail-hero-panel">
            <div className="detail-hero-content">
              <div className="detail-hero-copy">
                <p className="detail-kicker">인력 상세 정보</p>
                <div className="detail-identity-row">
                  <div className="detail-identity-copy">
                    <strong>{selectedEmployee?.name ?? "선택된 인력 없음"}</strong>
                    <span>
                      {selectedEmployee?.employeeCode ?? "-"} ·{" "}
                      {selectedEmployee?.employmentType ?? "-"} · 직급{" "}
                      {selectedEmployee?.rank ?? "-"}
                    </span>
                  </div>
                  <span
                    className={`detail-status-badge detail-status-badge--${selectedEmployee?.status ?? "active"}`}
                  >
                    {selectedEmployee ? employeeStatusLabel[selectedEmployee.status] : "-"}
                  </span>
                </div>
                <div className="detail-hero-meta">
                  <span>근무지 {selectedEmployee?.currentSiteName ?? "미배정"}</span>
                  <span>근무조 {selectedEmployee?.currentShiftGroup ?? "미배정"}</span>
                  <span>직급 {selectedEmployee?.rank ?? "-"}</span>
                  <span>연락처 {selectedEmployee?.contact || "-"}</span>
                  <span>입사일 {formatDate(selectedEmployeeHireDate)}</span>
                  {selectedEmployee?.retireDate ? (
                    <span>퇴사 처리일 {formatDate(selectedEmployee.retireDate)}</span>
                  ) : null}
                </div>
              </div>

              <div className="detail-summary-grid">
                <div className="detail-summary-card">
                  <span>직급</span>
                  <strong>{selectedEmployee?.rank ?? "-"}</strong>
                </div>
                <div className="detail-summary-card">
                  <span>현재 근무지</span>
                  <strong>{selectedEmployee?.currentSiteName ?? "미배정"}</strong>
                </div>
                <div className="detail-summary-card">
                  <span>근무조명</span>
                  <strong>{selectedEmployee?.currentShiftGroup ?? "미배정"}</strong>
                </div>
                <div className="detail-summary-card">
                  <span>현재 시급</span>
                  <strong>
                    {formatHourlyRate(
                      activeWageRate?.hourlyRate ?? selectedEmployee?.currentHourlyRate
                    )}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <div className="detail-body-grid">
            <div className="detail-primary-column">
              <div className="detail-section-grid">
              <div className="detail-edit-section detail-edit-section--readonly">
                <div className="detail-section-copy">
                  <h3>
                    <svg className="detail-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect height="4" rx="1" width="8" x="8" y="3" />
                      <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
                    </svg>
                    근무 배정 정보
                  </h3>
                    <p>현재 배정 상태를 빠르게 확인할 수 있도록 핵심 정보만 묶어 보여줍니다.</p>
                </div>
                <div className="detail-readonly-grid">
                  <div className="detail-readonly-item">
                    <span>사원번호</span>
                    <strong>{selectedEmployee?.employeeCode ?? "-"}</strong>
                  </div>
                  <div className="detail-readonly-item">
                    <span>직급</span>
                    <strong>{selectedEmployee?.rank ?? "-"}</strong>
                  </div>
                  <div className="detail-readonly-item">
                    <span>근무지</span>
                    <strong>{selectedEmployee?.currentSiteName ?? "미배정"}</strong>
                  </div>
                  <div className="detail-readonly-item">
                    <span>근무조명</span>
                    <strong>{selectedEmployee?.currentShiftGroup ?? "미배정"}</strong>
                  </div>
                  <div className="detail-readonly-item">
                    <span>입사일</span>
                    <strong>{formatDate(selectedEmployeeHireDate)}</strong>
                  </div>
                  <div className="detail-readonly-item">
                    <span>연락처</span>
                    <strong>{selectedEmployee?.contact || "-"}</strong>
                  </div>
                </div>
                <div className="button-row detail-section-actions">
                  <button
                    className="ghost-button"
                    disabled={isSaving || isLoadingDetail || !activeAssignment}
                    onClick={() => {
                      void handleCloseActiveAssignment();
                    }}
                    type="button"
                  >
                    현재 배정 해지
                  </button>
                </div>
                {!activeAssignment ? (
                  <p className="field-hint">현재 활성 배정이 없으면 해지할 수 없습니다.</p>
                ) : null}
              </div>

              <div className="detail-edit-section">
                <div className="detail-section-copy">
                  <h3>
                    <svg className="detail-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                    </svg>
                    기본 정보 수정
                  </h3>
                  <p>고용형태, 직급, 재직 상태를 수정하면 인력 목록과 상세 정보에 바로 반영됩니다.</p>
                </div>
                <div className="detail-wage-form-grid">
                  <label className="field detail-compact-field">
                    <span>고용형태</span>
                    <FormSelect
                      className="workforce-select-shell"
                      selectClassName="workforce-modern-select"
                      onChange={(event) => {
                        handleDetailInputChange("employmentType", event.target.value);
                      }}
                      value={detailForm.employmentType}
                    >
                      {workforceEmploymentTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </FormSelect>
                  </label>
                  <label className="field detail-compact-field">
                    <span>직급</span>
                    <FormSelect
                      className="workforce-select-shell"
                      selectClassName="workforce-modern-select"
                      onChange={(event) => {
                        handleDetailInputChange("rank", event.target.value);
                      }}
                      value={detailForm.rank}
                    >
                      <option value="">미지정</option>
                      {employeeRankOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </FormSelect>
                  </label>
                  <label className="field detail-compact-field">
                    <span>연락처</span>
                    <input
                      onChange={(event) => {
                        handleDetailInputChange("contact", event.target.value);
                      }}
                      placeholder="연락처 입력"
                      value={detailForm.contact}
                    />
                  </label>
                  <label className="field detail-compact-field">
                    <span>상태</span>
                    <FormSelect
                      className="workforce-select-shell"
                      selectClassName="workforce-modern-select"
                      onChange={(event) => {
                        handleDetailStatusChange(event.target.value as EmployeeRecord["status"]);
                      }}
                      value={detailForm.status}
                    >
                      <option value="active">재직</option>
                      <option value="leave">휴직</option>
                      <option value="retired">퇴사</option>
                    </FormSelect>
                  </label>
                  <label className="field detail-compact-field">
                    <span>퇴사 처리일</span>
                    <DateField
                      onChange={(value) => {
                        handleDetailInputChange("retireDate", value);
                      }}
                      value={detailForm.retireDate}
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button
                    className="primary-button"
                    disabled={isSaving || isLoadingDetail}
                    onClick={handleSaveEmployeeDetail}
                    type="button"
                  >
                    {isSaving ? "저장 중..." : "기본 정보 저장"}
                  </button>
                  <button
                    className="danger-button"
                    disabled={isSaving || isLoadingDetail || !canDeleteSelectedEmployee}
                    onClick={() => {
                      void handleDeleteEmployee();
                    }}
                    type="button"
                  >
                    인력 삭제
                  </button>
                </div>
                {!canDeleteSelectedEmployee ? (
                  <p className="field-hint">퇴사 처리일이 지난 퇴사 인력만 삭제할 수 있습니다.</p>
                ) : null}
              </div>
              </div>

              <div className="detail-edit-section detail-edit-section--wage">
                <div className="detail-section-copy">
                  <h3>
                    <svg className="detail-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M7.5 9l1.8 6 2.7-5 2.7 5 1.8-6" />
                    </svg>
                    시급 변경
                  </h3>
                  <p>새 시급 적용일을 입력하면 현재 시급 종료일은 전날로 자동 계산됩니다.</p>
                </div>
                <div className="detail-wage-compare">
                  <div className="detail-wage-card detail-wage-card--current">
                    <span className="detail-wage-kicker">변경 전</span>
                    <div className="detail-wage-metric">
                      <span>현재 시급</span>
                      <strong>{formatHourlyRate(activeWageRate?.hourlyRate ?? selectedEmployee?.currentHourlyRate)}</strong>
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
                    <span>→</span>
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
                        <DateField
                          onChange={(value) => {
                            handleWageRateInputChange("effectiveFrom", value);
                          }}
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
                <div className="button-row detail-section-actions">
                  <button
                    className="primary-button"
                    disabled={isSavingWageRate || isLoadingDetail}
                    onClick={handleSaveWageRate}
                    type="button"
                  >
                    {isSavingWageRate ? "수정 중..." : "수정"}
                  </button>
                </div>
              </div>

              {detailError ? <p className="form-error-text">{detailError}</p> : null}
              <div className="detail-footer-bar">
                <div className="detail-tip-box">
                  <strong>입력 안내</strong>
                  <span>
                    이력은 삭제하지 않고 저장/종료만 지원합니다. 종료일은 시작일보다 빠를 수 없습니다.
                  </span>
                </div>
                <div className="button-row detail-footer-actions">
                  <button
                    className="ghost-button"
                    onClick={handleCloseDetail}
                    type="button"
                  >
                    뒤로가기
                  </button>
                </div>
              </div>
            </div>

            <aside className="detail-secondary-column">
              <div className="detail-history-box">
                <h3>
                  <svg className="detail-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 3v5h5" />
                    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                    <path d="M12 7.5v5l3 2" />
                  </svg>
                  근무변경이력
                </h3>
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
                <h3>
                  <svg className="detail-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <path d="M14 3v6h6" />
                    <path d="M8.5 13.5l1.3 4 2.2-4 2.2 4 1.3-4" />
                  </svg>
                  시급변경이력
                </h3>
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
            </aside>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="screen-stack">
      {questionDialog}
      <section className="surface-card workforce-header-card" ref={listSectionRef}>
        <div className="section-heading compact-heading">
          <div>
            <h3 ref={listHeadingRef} tabIndex={-1}>
              근무 인력 관리
            </h3>
            <p>사원 명부와 배정 상태를 실제 저장 데이터 기준으로 확인합니다.</p>
          </div>
          <div className="button-row">
            <button className="ghost-button" onClick={handleOpenWageBulkModal} type="button">
              시급 일괄 업데이트
            </button>
            <button className="primary-button" onClick={handleOpenCreateModal} type="button">
              신규 인력 등록
            </button>
          </div>
        </div>

        <div className="workforce-filter-toolbar">
          <div className="workforce-filter-group">
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
              <span>고용형태</span>
              <FormSelect
                className="workforce-select-shell"
                selectClassName="workforce-modern-select"
                onChange={(event) => {
                  setSelectedEmploymentFilter(event.target.value as EmployeeEmploymentFilter);
                }}
                value={selectedEmploymentFilter}
              >
                {(Object.keys(employeeEmploymentFilterLabel) as EmployeeEmploymentFilter[]).map(
                  (filterValue) => (
                    <option key={filterValue} value={filterValue}>
                      {employeeEmploymentFilterLabel[filterValue]}
                    </option>
                  )
                )}
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
          </div>
          <label className="field filter-field filter-field-search workforce-search-field">
            <span>이름/사원번호/연락처/직급/근무지명 검색</span>
            <input
              onChange={(event) => {
                setKeyword(event.target.value);
              }}
              placeholder="이름/사원번호/연락처/직급/근무지명 검색"
              value={keyword}
            />
          </label>
        </div>

        {workforceListState.deletedSiteEmployees.length > 0 ? (
          <div className="workforce-alert-banner">
            <span>
              삭제된 근무지 배정 인력 {workforceListState.deletedSiteEmployees.length}명은
              목록과 집계에서 제외했습니다.
            </span>
            <button
              className="ghost-button compact-button"
              onClick={() => {
                void handleOpenDeletedSiteEmployeeNotice();
              }}
              type="button"
            >
              대상 보기
            </button>
          </div>
        ) : null}

        {screenError ? <p className="form-error-text">{screenError}</p> : null}

        <div className="workforce-table-shell">
          <table className="info-table workforce-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>사원번호</th>
                <th>고용형태</th>
                <th>직급</th>
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
                  <td colSpan={12}>인력 목록을 불러오는 중입니다.</td>
                </tr>
              ) : visibleEmployees.length === 0 ? (
                <tr>
                  <td colSpan={12}>조회된 인력이 없습니다. 필터를 초기화하거나 검색 범위를 변경해 보세요.</td>
                </tr>
              ) : (
                visibleEmployees.map((employee, index) => {
                  const assignmentStatus = getAssignmentStatusPresentation(employee);

                  return (
                    <tr key={employee.id}>
                      <td>{workforceListState.startIndex + index + 1}</td>
                      <td>{employee.employeeCode}</td>
                      <td>{formatWorkforceEmploymentType(employee.employmentType)}</td>
                      <td>{employee.rank ?? "-"}</td>
                      <td className="table-strong workforce-name-cell">{employee.name}</td>
                      <td>{employee.currentSiteName ?? "미배정"}</td>
                      <td>{employee.currentShiftGroup ?? "미배정"}</td>
                      <td>
                        <span className={`pill ${employeeStatusTone[employee.status]}`}>
                          {employeeStatusLabel[employee.status]}
                        </span>
                      </td>
                      <td>{formatHourlyRate(employee.currentHourlyRate)}</td>
                      <td>
                        <div className="assignment-status-cell">
                          <strong>{assignmentStatus.label}</strong>
                          {assignmentStatus.detail ? (
                            <small>{assignmentStatus.detail}</small>
                          ) : null}
                        </div>
                      </td>
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
                          <span className="profile-name">{employee.name}</span>
                          <span className="profile-link-label">프로필 보기</span>
                          <span className="profile-actions icon-view" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination-row workforce-pagination-row">
          <button
            className="ghost-button compact-button"
            disabled={workforceListState.safePage <= 1}
            onClick={() => {
              setCurrentPage((page) => Math.max(page - 1, 1));
            }}
            type="button"
          >
            이전
          </button>
          <span>{`${workforceListState.safePage} / ${workforceListState.pageCount}`}</span>
          <button
            className="ghost-button compact-button"
            disabled={workforceListState.safePage >= workforceListState.pageCount}
            onClick={() => {
              setCurrentPage((page) => Math.min(page + 1, workforceListState.pageCount));
            }}
            type="button"
          >
            다음
          </button>
          <label className="field compact-select-field workforce-page-size-field">
            <span>페이지당</span>
            <FormSelect
              className="workforce-select-shell"
              selectClassName="workforce-modern-select"
              onChange={(event) => {
                setPageSize(Number(event.target.value) as WorkforcePageSize);
              }}
              value={String(pageSize)}
            >
              <option value="10">10명</option>
              <option value="20">20명</option>
              <option value="50">50명</option>
            </FormSelect>
          </label>
          <span>
            {workforceListState.filteredEmployees.length === 0
              ? "0명"
              : `${workforceListState.startIndex + 1}-${workforceListState.endIndex}명`}
            {` / 조회 ${workforceListState.filteredEmployees.length}명`}
          </span>
          <div className="workforce-count-chips">
            <span>{`전체 ${employeeEmploymentCounts.total}명`}</span>
            <span>{`정규 ${employeeEmploymentCounts.regular}명`}</span>
            <span>{`계약 ${employeeEmploymentCounts.contract}명`}</span>
            <span>{`BP ${employeeEmploymentCounts.bp}명`}</span>
          </div>
        </div>
      </section>

      {showWageBulkModal ? (
        <div className="modal-overlay">
          <div
            aria-labelledby="workforce-wage-bulk-modal-title"
            aria-modal="true"
            className="modal-card wage-bulk-modal"
            onKeyDown={wageBulkOnKeyDown}
            ref={wageBulkDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <h3 id="workforce-wage-bulk-modal-title">시급 일괄 업데이트</h3>
                <p>Excel 파일을 가져와 근무지명과 이름 기준으로 시급 변경 대상을 검증한 뒤 이력으로 반영합니다.</p>
              </div>
              <div className="button-row">
                <button
                  className="ghost-button compact-button"
                  onClick={() => {
                    setShowWageBulkGuide(true);
                  }}
                  type="button"
                >
                  가이드 보기
                </button>
              </div>
            </div>

            <div className="excel-import-panel">
              <div className="excel-import-file-card">
                <div>
                  <strong>시급 파일 Import</strong>
                  <p>{wageBulkFile ? wageBulkFile.fileName : "아직 선택된 파일이 없습니다."}</p>
                </div>
                <button
                  className="ghost-button compact-button"
                  onClick={() => {
                    void handleSelectWageBulkFile();
                  }}
                  type="button"
                >
                  파일 가져오기
                </button>
              </div>

              <div className="excel-import-grid">
                <label className="field compact-site-field">
                  <span>근무지명 열</span>
                  <input
                    autoCapitalize="characters"
                    maxLength={3}
                    onChange={(event) => {
                      handleWageBulkMappingChange("siteNameColumn", event.target.value);
                    }}
                    placeholder="예: B"
                    spellCheck={false}
                    value={wageBulkMapping.siteNameColumn}
                  />
                </label>
                <label className="field compact-site-field">
                  <span>이름 열</span>
                  <input
                    autoCapitalize="characters"
                    maxLength={3}
                    onChange={(event) => {
                      handleWageBulkMappingChange("employeeNameColumn", event.target.value);
                    }}
                    placeholder="예: C"
                    spellCheck={false}
                    value={wageBulkMapping.employeeNameColumn}
                  />
                </label>
                <label className="field compact-site-field">
                  <span>시급 열</span>
                  <input
                    autoCapitalize="characters"
                    maxLength={3}
                    onChange={(event) => {
                      handleWageBulkMappingChange("hourlyRateColumn", event.target.value);
                    }}
                    placeholder="예: D"
                    spellCheck={false}
                    value={wageBulkMapping.hourlyRateColumn}
                  />
                </label>
                <label className="field compact-site-field">
                  <span>적용 날짜</span>
                  <DateField
                    onChange={(value) => {
                      setWageBulkEffectiveFrom(value);
                    }}
                    value={wageBulkEffectiveFrom}
                  />
                </label>
              </div>

              <p className="site-field-note">
                열 표기는 A, B, C처럼 입력합니다. 시트는 첫 번째 탭 기준으로 읽고, 1행은 헤더, 2행부터 데이터를 검사합니다.
              </p>

              <div className="button-row">
                <button
                  className="ghost-button"
                  disabled={isPreviewingWageBulk || isApplyingWageBulk}
                  onClick={() => {
                    void handlePreviewWageBulkUpdate();
                  }}
                  type="button"
                >
                  {isPreviewingWageBulk ? "미리보기 생성 중..." : "미리보기"}
                </button>
              </div>
            </div>

            {wageBulkError ? <p className="form-error-text">{wageBulkError}</p> : null}
            {wageBulkSuccess ? <p className="form-success-text">{wageBulkSuccess}</p> : null}

            {wageBulkRows.length > 0 ? (
              <div className="excel-import-preview-stack">
                <div className="import-preview-summary-grid">
                  <article className="surface-card import-preview-summary-card emphasis wage-bulk-summary-total">
                    <span>파일 행 수</span>
                    <strong>{wageBulkRows.length}건</strong>
                    <em>{wageBulkFile?.fileName ?? "-"}</em>
                  </article>
                  <article className="surface-card import-preview-summary-card wage-bulk-summary-apply">
                    <span>{wageBulkApplySummary ? "적용 완료" : "적용 가능"}</span>
                    <strong>
                      {wageBulkApplySummary
                        ? `${wageBulkApplySummary.appliedCount}건`
                        : `${wageBulkPreview?.readyCount ?? 0}건`}
                    </strong>
                    <em>적용일 {wageBulkEffectiveFrom}</em>
                  </article>
                  <article className="surface-card import-preview-summary-card wage-bulk-summary-exclude">
                    <span>제외 대상</span>
                    <strong>{wageBulkSkippedRows.length}건</strong>
                    <em>검증 결과 기준</em>
                  </article>
                </div>

                <div className="excel-import-preview-section">
                  <div className="section-heading compact-heading">
                    <div>
                      <h3>{wageBulkApplySummary ? "적용 완료 목록" : "적용 전 → 적용 후"}</h3>
                      <p>현재 활성 시급과 가져온 시급을 비교한 결과입니다.</p>
                    </div>
                  </div>
                  <div className="data-scroll">
                    <table className="info-table">
                      <thead>
                        <tr>
                          <th>상태</th>
                          <th>근무지</th>
                          <th>이름</th>
                          <th>사원번호</th>
                          <th>적용 전</th>
                          <th>적용 후</th>
                          <th>현재 적용일</th>
                          <th>종료일(자동)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wageBulkReadyRows.length > 0 ? (
                          wageBulkReadyRows.map((row) => (
                            <tr key={`wage-bulk-ready-${row.rowNumber}`}>
                              <td>
                                <span className={`pill ${wageBulkStatusTone[row.status]}`}>
                                  {row.statusLabel}
                                </span>
                              </td>
                              <td>{row.siteName}</td>
                              <td>{row.employeeName}</td>
                              <td>{row.employeeCode ?? "-"}</td>
                              <td>{formatHourlyRate(row.currentHourlyRate)}</td>
                              <td>{formatHourlyRate(row.importedHourlyRate)}</td>
                              <td>{formatDate(row.currentEffectiveFrom)}</td>
                              <td>{formatDate(row.previousEffectiveTo)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8}>적용 가능한 행이 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="excel-import-preview-section">
                  <div className="section-heading compact-heading">
                    <div>
                      <h3>제외 목록</h3>
                      <p>근무지/이름 불일치, 시급 형식 오류, 중복 행 등으로 자동 반영되지 않은 항목입니다.</p>
                    </div>
                  </div>
                  <div className="data-scroll">
                    <table className="info-table">
                      <thead>
                        <tr>
                          <th>상태</th>
                          <th>근무지</th>
                          <th>이름</th>
                          <th>가져온 시급</th>
                          <th>사유</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wageBulkSkippedRows.length > 0 ? (
                          wageBulkSkippedRows.map((row) => (
                            <tr key={`wage-bulk-skipped-${row.rowNumber}`}>
                              <td>
                                <span className={`pill ${wageBulkStatusTone[row.status]}`}>
                                  {row.statusLabel}
                                </span>
                              </td>
                              <td>{row.siteName || "-"}</td>
                              <td>{row.employeeName || "-"}</td>
                              <td>{formatHourlyRate(row.importedHourlyRate)}</td>
                              <td>{row.note ?? "-"}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5}>제외된 행이 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="button-row">
              <button
                className="primary-button"
                disabled={!canApplyWageBulk || isApplyingWageBulk || isPreviewingWageBulk}
                onClick={() => {
                  void handleApplyWageBulkUpdate();
                }}
                type="button"
              >
                {isApplyingWageBulk ? "적용 중..." : "시급 일괄 업데이트"}
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  setShowWageBulkModal(false);
                }}
                type="button"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showWageBulkGuide ? (
        <GuideFlowModal
          guide={workforceWageBulkGuide}
          onClose={() => {
            setShowWageBulkGuide(false);
          }}
        />
      ) : null}

      {showCreateModal ? (
        <div className="modal-overlay">
          <div
            aria-labelledby="workforce-create-modal-title"
            aria-modal="true"
            className="modal-card"
            onKeyDown={createOnKeyDown}
            ref={createDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <h3 id="workforce-create-modal-title">신규 인력 등록</h3>
                <p>기본 인력 정보와 초기 배정/시급을 함께 저장합니다.</p>
              </div>
            </div>
            <div className="filter-grid two-up">
              <label className="field">
                <span>사원번호</span>
                <input
                  disabled={isBpCreateEmployee}
                  onChange={(event) => {
                    handleCreateInputChange("employeeCode", event.target.value);
                  }}
                  placeholder={isBpCreateEmployee ? "BP 선택 시 내부 코드 자동 생성" : "사원번호 입력"}
                  value={createForm.employeeCode}
                />
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
                  {workforceEmploymentTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </FormSelect>
              </label>
              <label className="field workforce-select-field">
                <span>직급</span>
                <FormSelect
                  className="workforce-select-shell"
                  selectClassName="workforce-modern-select"
                  onChange={(event) => {
                    handleCreateInputChange("rank", event.target.value);
                  }}
                  value={createForm.rank}
                >
                  <option value="">미지정</option>
                  {employeeRankOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
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
                <span>연락처</span>
                <input
                  onChange={(event) => {
                    handleCreateInputChange("contact", event.target.value);
                  }}
                  placeholder="연락처 입력"
                  value={createForm.contact}
                />
              </label>
              <label className="field">
                <span>입사일</span>
                <DateField
                  onChange={(value) => {
                    handleCreateInputChange("hireDate", value);
                  }}
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
              <div className="field-hint workforce-create-note">
                {isBpCreateEmployee
                  ? "BP 인력은 사원번호와 통상시급 없이 등록되며 내부 식별용 사번은 자동 생성됩니다. 근무지와 근무조명을 모두 선택한 경우에만 초기 배정이 생성됩니다."
                  : "근무지와 근무조명을 모두 선택한 경우에만 초기 배정이 생성됩니다."}
              </div>
              <label className="field">
                <span>상태</span>
                <input className="workforce-static-input" readOnly value="신규" />
              </label>
              <label className="field">
                <span>통상시급</span>
                <input
                  disabled={isBpCreateEmployee}
                  inputMode="numeric"
                  onChange={(event) => {
                    handleCreateInputChange("hourlyRate", event.target.value);
                  }}
                  placeholder={isBpCreateEmployee ? "BP 인력은 입력하지 않습니다." : "숫자 입력"}
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
