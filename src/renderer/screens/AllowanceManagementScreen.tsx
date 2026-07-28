import { useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import type { AllowanceDocumentExportRecord } from "@shared/domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type {
  AllowanceApprovalRecord,
  AllowanceCalculationStatus,
  AllowanceHistoryStatusFilter,
  AllowanceProposalApprovalRecord
} from "@shared/domain/allowance-workflow";
import { canPerformAction } from "@shared/domain/authorization";
import type { AllowanceRateVersion, EmployeeRecord } from "@shared/domain/model";
import type { AuthSession } from "@shared/domain/model";
import { formatCurrency, formatHourlyRateCurrency } from "@shared/lib/formatCurrency";
import { createTodayDateInputValue } from "@shared/lib/local-date";

import { FormSelect } from "../components/FormSelect";
import { GuideFlowModal } from "../components/GuideFlowModal";
import { useQuestionDialog } from "../components/QuestionDialog";
import { allowanceProposalGuide } from "../guides/route-guides";
import { AllowanceEarlyPayoutModal } from "./allowance-management/AllowanceEarlyPayoutModal";
import { createAllowanceManagementModalActions } from "./allowance-management/allowance-management-modal-actions";
import { useAppWorkflow } from "../contexts/app-workflow-context";
import { createAllowanceManagementReviewActions } from "./allowance-management/allowance-management-review-actions";
import { AllowanceHistoryPanel } from "./allowance-management/AllowanceHistoryPanel";
import { AllowanceHeroPanel } from "./allowance-management/AllowanceHeroPanel";
import { AllowanceOverviewChartsPanel } from "./allowance-management/AllowanceOverviewChartsPanel";
import { AllowanceOverviewResultsPanel } from "./allowance-management/AllowanceOverviewResultsPanel";
import { AllowanceProposalPreviewModal } from "./allowance-management/AllowanceProposalPreviewModal";
import { useAllowanceManagementModalState } from "./allowance-management/useAllowanceManagementModalState";
import { useAllowanceManagementViewState } from "./allowance-management/useAllowanceManagementViewState";
import {
  buildAvailableYears,
  buildExportableResults,
  buildHistoryEmployeeOptions,
  buildHistoryGroups,
  buildHistoryRows,
  buildHistorySiteOptions,
  buildLatestApprovalByCalculationId,
  buildLatestDocumentExportByCalculationId,
  buildLatestProposalApprovalByCalculationId,
  buildOverviewGroups,
  buildOverviewSiteOptions,
  buildProposalCandidateResults,
  buildSiteDistribution,
  buildVisibleHistoryRows,
  buildVisibleProposalApprovals,
  buildVisibleResults,
  buildVisibleStatusSummary,
  buildWorkTypeDistribution,
  countCalculatedEmployees,
  createEmployeeCurrentStatusResolver,
  getWorkTypeFilter,
  resolveDisplayedRateVersion,
  sumTotalAllowanceAmount,
  type AllowanceWorkType,
  type EmployeeCurrentStatusFilter,
  type WorkTypeFilter,
  workTypeLabel
} from "./allowance-management/allowance-management-selectors";

const allowanceStatusLabel: Record<AllowanceCalculationStatus, string> = {
  pending: "검토대기",
  approved: "승인",
  rejected: "반려",
  "proposal-approved": "품의승인"
};

const allowanceStatusClassName: Record<AllowanceCalculationStatus, string> = {
  pending: "allowance-status-pill pending",
  approved: "allowance-status-pill approved",
  rejected: "allowance-status-pill rejected",
  "proposal-approved": "allowance-status-pill proposal-approved"
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

const buildBackupCompletionDescription = (input: {
  baseDescription: string;
  warningMessages: string[];
}) => {
  if (input.warningMessages.length === 0) {
    return input.baseDescription;
  }

  return `${input.baseDescription} 확인이 필요한 항목: ${input.warningMessages.join(" / ")}`;
};

const formatDocumentOutputFormatLabel = (outputFormat: AllowanceDocumentExportRecord["outputFormat"]) =>
  outputFormat === "pdf" ? "PDF" : "Excel";

const buildDocumentExportCompletionDescription = (record: AllowanceDocumentExportRecord) => (
  <>
    <span>품의서/별첨1/별첨2 파일을 지정 경로에 저장했습니다.</span>
    <br />
    <span>{`품의서: ${record.proposalPath}`}</span>
    <br />
    <span>{`별첨1: ${record.attachment1Path}`}</span>
    <br />
    <span>{`별첨2: ${record.attachment2Path}`}</span>
  </>
);

const proposalApprovalBackupFailurePrefix = "품의 문서는 출력했지만 자동 백업을 완료하지 못했습니다.";
const proposalApprovalDatabaseFailurePrefix =
  "품의 문서 출력과 백업은 완료되었지만 DB 반영에 실패했습니다.";

const buildProposalApprovalFailureDescription = (message: string) => {
  if (message.includes(proposalApprovalDatabaseFailurePrefix)) {
    return `${message} 출력 경로와 백업 폴더를 확인한 뒤 같은 승인 대상으로 다시 시도해 주세요.`;
  }

  if (message.includes(proposalApprovalBackupFailurePrefix)) {
    return `${message} 문서 출력은 완료되었을 수 있으니 출력 경로를 먼저 확인해 주세요.`;
  }

  return message;
};

const createCurrentDate = createTodayDateInputValue;
const createCurrentYear = () => createCurrentDate().slice(0, 4);

const workTypePillClassName: Record<AllowanceWorkType, string> = {
  substitute: "performance-section-pill substitute",
  overtime: "performance-section-pill overtime",
  holiday: "performance-section-pill legal-holiday"
};

const formatDate = (value?: string) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate()
  ).padStart(2, "0")}`;
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${formatDate(value)} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
};

const formatHours = (minutes: number) => `${Number((minutes / 60).toFixed(2))}h`;

const formatAllowanceHourlyRate = (value: number) =>
  value > 0 ? formatHourlyRateCurrency(value) : "시급미반영";

const AllowanceDetailIcon = () => (
  <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 20 20" width="14">
    <path
      d="M10 4.5c4.1 0 7.3 3 8.5 5.5-1.2 2.5-4.4 5.5-8.5 5.5S2.7 12.5 1.5 10C2.7 7.5 5.9 4.5 10 4.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const AllowanceEarlyPayoutIcon = () => (
  <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 20 20" width="14">
    <rect
      height="12"
      rx="2.4"
      stroke="currentColor"
      strokeWidth="1.5"
      width="15"
      x="2.5"
      y="4.5"
    />
    <path d="M6 2.8v3.4M14 2.8v3.4M2.5 8.4h15" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6.4 12h7.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
  </svg>
);

const getBreakdownSummary = (result: AllowanceCalculationResultRecord) => {
  const { breakdown } = result.snapshot;

  return `${formatHours(breakdown.totalWorkMinutes)} / ${formatHours(
    breakdown.baseWorkMinutes
  )} / ${formatHours(breakdown.overtimeMinutes)} / ${formatHours(breakdown.nightMinutes)}`;
};

interface AllowanceManagementScreenProps {
  session: AuthSession;
}

export const AllowanceManagementScreen = ({
  session
}: AllowanceManagementScreenProps) => {
  const [results, setResults] = useState<AllowanceCalculationResultRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [rateVersions, setRateVersions] = useState<AllowanceRateVersion[]>([]);
  const [documentExports, setDocumentExports] = useState<AllowanceDocumentExportRecord[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<AllowanceApprovalRecord[]>([]);
  const [proposalApprovals, setProposalApprovals] = useState<AllowanceProposalApprovalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const { showGuidance } = useAppWorkflow();
  const [screenError, setScreenError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const overviewKeywordInputRef = useRef<HTMLInputElement | null>(null);
  const { askQuestion, questionDialog } = useQuestionDialog();
  const canManageAllowanceApprovals = canPerformAction(
    session.role,
    "allowance-approval"
  );
  const {
    activeDonutType,
    expandedHistoryDetails,
    expandedHistorySites,
    expandedOverviewDetails,
    expandedOverviewSites,
    historyCurrentStatus,
    historyEmployee,
    historyMonth,
    historySite,
    historyStatus,
    historyWorkType,
    historyYear,
    hoveredDistributionSite,
    overviewKeyword,
    overviewLayoutMode,
    overviewMonth,
    overviewSite,
    overviewYear,
    resetHistoryFilters,
    resetOverviewFilters,
    setActiveDonutType,
    setHistoryCurrentStatus,
    setHistoryEmployee,
    setHistoryMonth,
    setHistorySite,
    setHistoryStatus,
    setHistoryWorkType,
    setHistoryYear,
    setHoveredDistributionSite,
    setOverviewKeyword,
    setOverviewMonth,
    setOverviewSite,
    setOverviewYear,
    setViewMode,
    toggleExpandedDetail,
    toggleExpandedSite,
    toggleOverviewLayoutMode,
    viewMode
  } = useAllowanceManagementViewState();
  const {
    closeEarlyPayoutEditor,
    closeProposalGuide,
    closeProposalPreview,
    earlyPayoutEditor,
    openDraftProposalPreview,
    openEarlyPayoutEditor,
    openHistoryProposalPreview,
    openProposalGuide,
    proposalComment,
    proposalGuideInitialPageId,
    proposalPreviewModal,
    setProposalComment,
    updateEarlyPayoutValue
  } = useAllowanceManagementModalState();

  const deferredOverviewKeyword = useDeferredValue(overviewKeyword);

  const focusOverviewKeywordInput = () => {
    const focusInput = () => {
      overviewKeywordInputRef.current?.focus({ preventScroll: true });
    };

    window.requestAnimationFrame(focusInput);
    window.setTimeout(focusInput, 0);
    window.setTimeout(focusInput, 50);
  };

  const showProposalApprovalFailureDialog = async (message: string) => {
    await askQuestion({
      title: "품의 승인 재확인 필요",
      message: "품의 승인을 완료하지 못했습니다.",
      description: buildProposalApprovalFailureDescription(message),
      confirmLabel: "확인",
      hideCancel: true
    });
  };

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const [
          resultsResult,
          employeesResult,
          rateVersionsResult,
          exportsResult,
          approvalHistoryResult,
          proposalApprovalsResult
        ] = await Promise.all([
          window.appBridge.listCalculationResults(),
          window.appBridge.listEmployees(),
          window.appBridge.listAllowanceRateVersions(),
          window.appBridge.listAllowanceDocumentExports(),
          window.appBridge.listAllowanceApprovalHistory(),
          window.appBridge.listAllowanceProposalApprovals()
        ]);

        if (!active) {
          return;
        }

        setResults(resultsResult.ok ? resultsResult.data : []);
        setEmployees(employeesResult.ok ? employeesResult.data : []);
        setRateVersions(rateVersionsResult.ok ? rateVersionsResult.data : []);
        setDocumentExports(exportsResult.ok ? exportsResult.data : []);
        setApprovalHistory(approvalHistoryResult.ok ? approvalHistoryResult.data : []);
        setProposalApprovals(proposalApprovalsResult.ok ? proposalApprovalsResult.data : []);

        const messages = [
          resultsResult.ok ? null : resultsResult.message,
          employeesResult.ok ? null : employeesResult.message,
          rateVersionsResult.ok ? null : rateVersionsResult.message,
          exportsResult.ok ? null : exportsResult.message,
          approvalHistoryResult.ok ? null : approvalHistoryResult.message,
          proposalApprovalsResult.ok ? null : proposalApprovalsResult.message
        ].filter((message): message is string => Boolean(message));

        setScreenError(messages.length > 0 ? messages.join(" / ") : null);
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

  const availableYears = useMemo(() => buildAvailableYears(results, createCurrentYear()), [results]);

  const resolveEmployeeCurrentStatus = useMemo(
    () => createEmployeeCurrentStatusResolver(employees),
    [employees]
  );

  const overviewSiteOptions = useMemo(
    () =>
      buildOverviewSiteOptions({
        results,
        selectedYear: overviewYear,
        selectedMonth: overviewMonth
      }),
    [overviewMonth, overviewYear, results]
  );

  const visibleResults = useMemo(
    () =>
      buildVisibleResults({
        results,
        selectedYear: overviewYear,
        selectedMonth: overviewMonth,
        selectedSite: overviewSite,
        keyword: deferredOverviewKeyword
      }),
    [deferredOverviewKeyword, overviewMonth, overviewSite, overviewYear, results]
  );

  const displayedRateVersion = useMemo(
    () =>
      resolveDisplayedRateVersion({
        versions: rateVersions,
        selectedYear: overviewYear,
        selectedMonth: overviewMonth,
        visibleResults,
        fallbackDate: createCurrentDate(),
        fallbackYear: createCurrentYear()
      }),
    [overviewMonth, overviewYear, rateVersions, visibleResults]
  );

  const visibleStatusSummary = useMemo(
    () => buildVisibleStatusSummary(visibleResults),
    [visibleResults]
  );

  const exportableResults = useMemo(
    () => buildExportableResults(visibleResults),
    [visibleResults]
  );

  const proposalCandidateResults = useMemo(
    () => buildProposalCandidateResults(visibleResults),
    [visibleResults]
  );

  const totalAllowanceAmount = useMemo(
    () => sumTotalAllowanceAmount(visibleResults),
    [visibleResults]
  );

  const calculatedEmployeeCount = useMemo(
    () => countCalculatedEmployees(visibleResults),
    [visibleResults]
  );

  const siteDistribution = useMemo(() => buildSiteDistribution(visibleResults), [visibleResults]);

  const workTypeDistribution = useMemo(
    () => buildWorkTypeDistribution(visibleResults),
    [visibleResults]
  );

  const activeDonutSegment = useMemo(() => {
    if (workTypeDistribution.grandTotalAmount <= 0) {
      return null;
    }

    return (
      workTypeDistribution.segments.find(
        (segment) => segment.type === (activeDonutType ?? workTypeDistribution.dominantType)
      ) ?? null
    );
  }, [activeDonutType, workTypeDistribution]);
  const isOverviewDistributionExpanded = overviewLayoutMode === "distribution-expanded";
  const isOverviewDetailExpanded = overviewLayoutMode === "detail-expanded";
  const showOverviewCharts = !isOverviewDetailExpanded;
  const overviewLayoutClassName = [
    "allowance-layout",
    "allowance-layout-modern",
    isOverviewDistributionExpanded ? "allowance-layout-distribution-expanded" : "",
    isOverviewDetailExpanded ? "allowance-layout-detail-expanded" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const overviewGroups = useMemo(() => buildOverviewGroups(visibleResults), [visibleResults]);

  const latestDocumentExportByCalculationId = useMemo(
    () => buildLatestDocumentExportByCalculationId(documentExports),
    [documentExports]
  );

  const latestApprovalByCalculationId = useMemo(
    () => buildLatestApprovalByCalculationId(approvalHistory),
    [approvalHistory]
  );

  const latestProposalApprovalByCalculationId = useMemo(
    () => buildLatestProposalApprovalByCalculationId(proposalApprovals),
    [proposalApprovals]
  );

  const historyRows = useMemo(
    () =>
      buildHistoryRows({
        results,
        latestDocumentExportByCalculationId,
        latestApprovalByCalculationId,
        latestProposalApprovalByCalculationId
      }),
    [
      latestApprovalByCalculationId,
      latestDocumentExportByCalculationId,
      latestProposalApprovalByCalculationId,
      results
    ]
  );

  const historySiteOptions = useMemo(
    () =>
      buildHistorySiteOptions({
        historyRows,
        selectedYear: historyYear,
        selectedMonth: historyMonth,
        selectedStatus: historyStatus
      }),
    [historyMonth, historyRows, historyStatus, historyYear]
  );

  const historyEmployeeOptions = useMemo(
    () =>
      buildHistoryEmployeeOptions({
        historyRows,
        selectedYear: historyYear,
        selectedMonth: historyMonth,
        selectedSite: historySite,
        selectedWorkType: historyWorkType,
        selectedCurrentStatus: historyCurrentStatus,
        selectedStatus: historyStatus,
        resolveEmployeeCurrentStatus
      }),
    [
      historyCurrentStatus,
      historyMonth,
      historyRows,
      historySite,
      historyStatus,
      historyWorkType,
      historyYear,
      resolveEmployeeCurrentStatus
    ]
  );

  const visibleHistoryRows = useMemo(
    () =>
      buildVisibleHistoryRows({
        historyRows,
        selectedYear: historyYear,
        selectedMonth: historyMonth,
        selectedSite: historySite,
        selectedWorkType: historyWorkType,
        selectedCurrentStatus: historyCurrentStatus,
        selectedStatus: historyStatus,
        selectedEmployee: historyEmployee,
        resolveEmployeeCurrentStatus
      }),
    [
      historyCurrentStatus,
      historyEmployee,
      historyMonth,
      historyRows,
      historySite,
      historyStatus,
      historyWorkType,
      historyYear,
      resolveEmployeeCurrentStatus
    ]
  );

  const historyGroups = useMemo(() => buildHistoryGroups(visibleHistoryRows), [visibleHistoryRows]);

  const visibleProposalApprovals = useMemo(
    () =>
      buildVisibleProposalApprovals({
        proposalApprovals,
        selectedYear: historyYear,
        selectedMonth: historyMonth,
        selectedSite: historySite,
        selectedEmployee: historyEmployee,
        selectedWorkType: historyWorkType,
        selectedCurrentStatus: historyCurrentStatus,
        selectedStatus: historyStatus,
        resolveEmployeeCurrentStatus
      }),
    [
      historyCurrentStatus,
      historyEmployee,
      historyMonth,
      historySite,
      historyStatus,
      historyWorkType,
      historyYear,
      proposalApprovals,
      resolveEmployeeCurrentStatus
    ]
  );
  const {
    handleApproveProposal,
    handleClearEarlyPayout,
    handleOpenProposalPreview,
    handleSaveEarlyPayout
  } = createAllowanceManagementModalActions({
    askQuestion,
    bridge: window.appBridge,
    buildBackupCompletionDescription,
    closeEarlyPayoutEditor,
    closeProposalPreview,
    earlyPayoutEditor,
    formatDateValue: formatDate,
    getErrorMessage,
    incrementRefreshKey: () => {
      setRefreshKey((current) => current + 1);
    },
    openDraftProposalPreview,
    proposalCandidateResults,
    proposalComment,
    proposalPreviewModal,
    setActionError,
    setActionMessage,
    setIsProcessing,
    setProcessingKey,
    showProposalApprovalFailureDialog
  });
  const { handleExportDocuments, handleReviewCalculations } =
    createAllowanceManagementReviewActions({
      askQuestion,
      bridge: window.appBridge,
      buildDocumentExportCompletionDescription,
      exportableResults,
      focusOverviewKeywordInput,
      formatDocumentOutputFormatLabel,
      getErrorMessage,
      incrementRefreshKey: () => {
        setRefreshKey((current) => current + 1);
      },
      results,
      setActionError,
      setActionMessage,
      setIsProcessing,
      setProcessingKey,
      showGuidance
    });

  const handleDonutPointerMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (workTypeDistribution.grandTotalAmount <= 0) {
      setActiveDonutType(null);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const offsetX = event.clientX - centerX;
    const offsetY = event.clientY - centerY;
    const distance = Math.sqrt(offsetX ** 2 + offsetY ** 2);
    const outerRadius = bounds.width / 2;
    const innerRadius = outerRadius * 0.66;

    if (distance > outerRadius || distance < innerRadius) {
      setActiveDonutType(null);
      return;
    }

    const angle = ((Math.atan2(offsetY, offsetX) * 180) / Math.PI + 450) % 360;
    let currentAngle = 0;

    for (const segment of workTypeDistribution.segments) {
      const segmentAngle =
        workTypeDistribution.grandTotalAmount > 0
          ? (segment.amount / workTypeDistribution.grandTotalAmount) * 360
          : 0;

      if (angle >= currentAngle && angle < currentAngle + segmentAngle) {
        setActiveDonutType(segment.type);
        return;
      }

      currentAngle += segmentAngle;
    }

    setActiveDonutType(null);
  };

  return (
    <div className="screen-stack allowance-screen allowance-shell">
      <AllowanceHeroPanel
        actionError={actionError}
        actionMessage={actionMessage}
        availableYears={availableYears}
        canManageAllowanceApprovals={canManageAllowanceApprovals}
        calculatedEmployeeCount={calculatedEmployeeCount}
        displayedRateVersionLabel={displayedRateVersion ? displayedRateVersion.versionLabel : "없음"}
        documentExportsCount={documentExports.length}
        exportableResultsCount={exportableResults.length}
        historyCurrentStatus={historyCurrentStatus}
        historyEmployee={historyEmployee}
        historyEmployeeOptions={historyEmployeeOptions}
        historyMonth={historyMonth}
        historySite={historySite}
        historySiteOptions={historySiteOptions}
        historyStatus={historyStatus}
        historyWorkType={historyWorkType}
        historyYear={historyYear}
        isProcessing={isProcessing}
        onExportDocuments={(format) => {
          void handleExportDocuments(format);
        }}
        onHistoryCurrentStatusChange={setHistoryCurrentStatus}
        onHistoryEmployeeChange={setHistoryEmployee}
        onHistoryMonthChange={setHistoryMonth}
        onHistoryReset={() => {
          resetHistoryFilters();
        }}
        onHistorySiteChange={setHistorySite}
        onHistoryStatusChange={setHistoryStatus}
        onHistoryWorkTypeChange={setHistoryWorkType}
        onHistoryYearChange={setHistoryYear}
        onOpenProposalGuide={() => {
          openProposalGuide("allowance-proposal-guide-intro");
        }}
        onOpenProposalPreview={() => {
          void handleOpenProposalPreview();
        }}
        onOverviewMonthChange={setOverviewMonth}
        onOverviewReset={() => {
          resetOverviewFilters();
          setRefreshKey((current) => current + 1);
        }}
        onOverviewSiteChange={setOverviewSite}
        onOverviewYearChange={setOverviewYear}
        onViewModeChange={setViewMode}
        overviewMonth={overviewMonth}
        overviewSite={overviewSite}
        overviewSiteOptions={overviewSiteOptions}
        overviewYear={overviewYear}
        processingKey={processingKey}
        proposalApprovalsCount={proposalApprovals.length}
        proposalCandidateResultsCount={proposalCandidateResults.length}
        resultsCount={results.length}
        screenError={screenError}
        viewMode={viewMode}
        visibleStatusSummary={visibleStatusSummary}
      />

      {viewMode === "overview" ? (
        <section className={overviewLayoutClassName}>
          {showOverviewCharts ? (
            <AllowanceOverviewChartsPanel
              activeDonutSegment={activeDonutSegment}
              activeDonutType={activeDonutType}
              formatCurrencyValue={formatCurrency}
              hoveredDistributionSite={hoveredDistributionSite}
              isLoading={isLoading}
              isOverviewDistributionExpanded={isOverviewDistributionExpanded}
              onActiveDonutTypeChange={setActiveDonutType}
              onDistributionHoverChange={setHoveredDistributionSite}
              onDonutPointerMove={handleDonutPointerMove}
              onToggleDistributionExpanded={() => {
                toggleOverviewLayoutMode("distribution-expanded");
              }}
              siteDistribution={siteDistribution}
              totalAllowanceAmount={totalAllowanceAmount}
              visibleResultsCount={visibleResults.length}
              workTypeDistribution={workTypeDistribution}
            />
          ) : null}

          <AllowanceOverviewResultsPanel
            allowanceStatusClassNameByCode={allowanceStatusClassName}
            canManageAllowanceApprovals={canManageAllowanceApprovals}
            detailIcon={<AllowanceDetailIcon />}
            earlyPayoutIcon={<AllowanceEarlyPayoutIcon />}
            expandedDetailIds={expandedOverviewDetails}
            expandedSiteNames={expandedOverviewSites}
            formatCurrencyValue={formatCurrency}
            formatHourlyRateValue={formatAllowanceHourlyRate}
            formatDateTimeValue={formatDateTime}
            formatDateValue={formatDate}
            formatHoursValue={formatHours}
            getBreakdownSummaryValue={getBreakdownSummary}
            getWorkTypeValue={getWorkTypeFilter}
            isLoading={isLoading}
            isOverviewDetailExpanded={isOverviewDetailExpanded}
            isOverviewDistributionExpanded={isOverviewDistributionExpanded}
            isProcessing={isProcessing}
            latestApprovalByCalculationId={latestApprovalByCalculationId}
            latestProposalApprovalByCalculationId={latestProposalApprovalByCalculationId}
            onOpenEarlyPayoutEditor={(result) => {
              openEarlyPayoutEditor(result, createCurrentDate());
            }}
            onOverviewKeywordChange={setOverviewKeyword}
            onReviewCalculations={(request) => handleReviewCalculations(request)}
            onToggleExpandedDetail={(rowId) => {
              toggleExpandedDetail("overview", rowId);
            }}
            onToggleExpandedSite={(siteName) => {
              toggleExpandedSite("overview", siteName);
            }}
            onToggleOverviewLayoutMode={() => {
              toggleOverviewLayoutMode("detail-expanded");
            }}
            overviewGroups={overviewGroups}
            overviewKeyword={overviewKeyword}
            overviewKeywordInputRef={overviewKeywordInputRef}
            processingKey={processingKey}
            statusLabelByCode={allowanceStatusLabel}
            workTypeLabelByType={workTypeLabel}
            workTypePillClassNameByType={workTypePillClassName}
          />
        </section>
      ) : (
        <AllowanceHistoryPanel
          allowanceStatusClassNameByCode={allowanceStatusClassName}
          detailIcon={<AllowanceDetailIcon />}
          expandedDetailIds={expandedHistoryDetails}
          expandedSiteNames={expandedHistorySites}
          formatCurrencyValue={formatCurrency}
          formatHourlyRateValue={formatAllowanceHourlyRate}
          formatDateTimeValue={formatDateTime}
          formatDateValue={formatDate}
          formatHoursValue={formatHours}
          getBreakdownSummaryValue={getBreakdownSummary}
          getWorkTypeValue={getWorkTypeFilter}
          historyGroups={historyGroups}
          isLoading={isLoading}
          onOpenProposalApprovalRecord={(record) => {
            openHistoryProposalPreview(record);
          }}
          onToggleExpandedDetail={(rowId) => {
            toggleExpandedDetail("history", rowId);
          }}
          onToggleExpandedSite={(siteName) => {
            toggleExpandedSite("history", siteName);
          }}
          proposalApprovals={visibleProposalApprovals}
          statusLabelByCode={allowanceStatusLabel}
          workTypeLabelByType={workTypeLabel}
          workTypePillClassNameByType={workTypePillClassName}
        />
      )}

      {questionDialog}

      {proposalPreviewModal ? (
        <AllowanceProposalPreviewModal
          canApproveProposal={canManageAllowanceApprovals}
          formatCurrencyValue={formatCurrency}
          formatDateTimeValue={formatDateTime}
          formatDateValue={formatDate}
          formatHoursValue={formatHours}
          getWorkTypeValue={getWorkTypeFilter}
          isProcessing={isProcessing}
          modal={proposalPreviewModal}
          onApprove={() => {
            void handleApproveProposal();
          }}
          onClose={closeProposalPreview}
          onCommentChange={setProposalComment}
          onOpenGuide={() => {
            openProposalGuide(
              proposalPreviewModal.mode === "draft"
                ? "allowance-proposal-guide-preview"
                : "allowance-proposal-guide-finalize"
            );
          }}
          processingKey={processingKey}
          proposalComment={proposalComment}
          workTypeLabelByType={workTypeLabel}
        />
      ) : null}

      {proposalGuideInitialPageId ? (
        <GuideFlowModal
          guide={allowanceProposalGuide}
          initialPageId={proposalGuideInitialPageId}
          onClose={closeProposalGuide}
        />
      ) : null}

      {earlyPayoutEditor ? (
        <AllowanceEarlyPayoutModal
          editor={earlyPayoutEditor}
          isProcessing={isProcessing}
          onClear={() => {
            void handleClearEarlyPayout();
          }}
          onClose={closeEarlyPayoutEditor}
          onSave={() => {
            void handleSaveEarlyPayout();
          }}
          onValueChange={updateEarlyPayoutValue}
          processingKey={processingKey}
        />
      ) : null}
    </div>
  );
};
