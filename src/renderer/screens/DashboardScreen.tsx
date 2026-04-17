import { useEffect, useMemo, useRef, useState } from "react";

import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import {
  resolveAllowanceRateCategoryCode,
  resolveAllowanceSummaryCategory
} from "@shared/domain/allowance-rate-matrix";
import type {
  DashboardChartExportInput
} from "@shared/bridge/contracts";
import type { EmployeeRecord, SiteRecord } from "@shared/domain/model";

import type { EChartPanelHandle } from "../components/EChartPanel";
import { useAppWorkflow } from "../contexts/app-workflow-context";
import { DashboardControlPanel } from "./dashboard/DashboardControlPanel";
import { DashboardEmptyState } from "./dashboard/DashboardEmptyState";
import { DashboardRankingTable } from "./dashboard/DashboardRankingTable";
import {
  DashboardMetricCard,
  DashboardRatioChart,
  DashboardSiteChart,
  DashboardTrendChart
} from "./dashboard/DashboardSummaryPanels";
import {
  createDashboardExportActions,
  resolveDashboardExportingFormat
} from "./dashboard/dashboard-export-actions";
import {
  buildDashboardControlPanelNotices,
  buildDashboardExportModels
} from "./dashboard/dashboard-export-selectors";
import {
  type DashboardBusinessCategory,
  type DashboardRecord,
  getDashboardFilterRange,
  isYearMonthInRange,
  matchesDashboardRecordFilters,
  resolveDashboardDemoFallback,
  selectDashboardDataset
} from "./dashboard/dashboard-records";
import {
  aggregateDashboardRecords,
  buildDashboardFilterSummary,
  buildDashboardMetrics,
  buildDashboardRatioItems,
  buildDashboardSiteChartItems,
  buildDashboardTopPerformersByCategory,
  buildDashboardTrendItems,
  buildPreviousDashboardRecords
} from "./dashboard/dashboard-selectors";
import {
  type DashboardFilterState,
  useDashboardFilterState
} from "./dashboard/useDashboardFilterState";

interface DashboardRankingTab {
  key: DashboardBusinessCategory;
  label: string;
}

interface DashboardSiteOption {
  id: string;
  label: string;
}

const ALL_OPTION = "all";

const rankingTabItems: DashboardRankingTab[] = [
  { key: "legalHoliday", label: "법정휴일" },
  { key: "substitute", label: "대체근무" },
  { key: "overtime", label: "연장근무" }
];

const enableDashboardDemoFallback = import.meta.env.DEV;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "데이터를 불러오는 중 오류가 발생했습니다.";

const normalizeTextKey = (value: string) => value.replace(/\s+/g, "").toLowerCase();

const createSyntheticSiteId = (siteName: string) => `site:${normalizeTextKey(siteName)}`;

const resolveBusinessCategory = (
  result: AllowanceCalculationResultRecord,
  rawCategory?: string
): DashboardBusinessCategory => {
  const businessCategoryCode =
    typeof result.snapshot.businessCategoryCode === "string"
      ? result.snapshot.businessCategoryCode
      : resolveAllowanceRateCategoryCode({
          rawCategory,
          isHoliday: result.snapshot.breakdown.holidayMinutes > 0
        });
  const summaryCategory = resolveAllowanceSummaryCategory(businessCategoryCode);

  if (summaryCategory === "legalHoliday") {
    return "legalHoliday";
  }

  if (summaryCategory === "substitute") {
    return "substitute";
  }

  return "overtime";
};

const getWorkCategoryLabel = (workType: AllowanceCalculationResultRecord["workType"]) => {
  if (workType === "holiday") {
    return "법정휴일근무";
  }

  if (workType === "substitute") {
    return "대체근무";
  }

  return "연장근무";
};


export const DashboardScreen = () => {
  const { selectedMonth, selectedSiteId, setSelectedMonth, setSelectedSiteId } = useAppWorkflow();
  const {
    appliedFilters,
    applyDraftValueChange,
    draftFilters,
    setAppliedFilters,
    setDraftFilters
  } = useDashboardFilterState({
    allOptionValue: ALL_OPTION,
    selectedMonth,
    selectedSiteId,
    setSelectedMonth,
    setSelectedSiteId
  });
  const [activeRankingCategory, setActiveRankingCategory] =
    useState<DashboardBusinessCategory>("overtime");
  const [results, setResults] = useState<AllowanceCalculationResultRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [chartActionError, setChartActionError] = useState<string | null>(null);
  const [chartActionMessage, setChartActionMessage] = useState<string | null>(null);
  const [exportingActionKey, setExportingActionKey] = useState<string | null>(null);
  const trendChartRef = useRef<EChartPanelHandle | null>(null);
  const siteChartRef = useRef<EChartPanelHandle | null>(null);
  const ratioChartRef = useRef<EChartPanelHandle | null>(null);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const [resultsResult, sitesResult, employeesResult] = await Promise.all([
          window.appBridge.listCalculationResults(),
          window.appBridge.listSites(),
          window.appBridge.listEmployees()
        ]);

        if (!active) {
          return;
        }

        const messages = [
          resultsResult.ok ? null : resultsResult.message,
          sitesResult.ok ? null : sitesResult.message,
          employeesResult.ok ? null : employeesResult.message
        ].filter((message): message is string => Boolean(message));

        setResults(resultsResult.ok ? resultsResult.data : []);
        setSites(sitesResult.ok ? sitesResult.data : []);
        setEmployees(employeesResult.ok ? employeesResult.data : []);
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
  }, []);

  const realDashboardRecords = useMemo(() => {
    const siteByName = new Map<string, SiteRecord>();
    sites.forEach((site) => {
      siteByName.set(normalizeTextKey(site.name), site);
    });

    const employeeByCode = new Map(employees.map((employee) => [employee.employeeCode, employee]));

    return results.map((result) => {
      const matchedEmployee =
        (result.employeeCode ? employeeByCode.get(result.employeeCode) : undefined) ??
        employees.find((employee) => employee.name === result.employeeName);
      const siteName =
        result.siteName.trim() ||
        matchedEmployee?.currentSiteName?.trim() ||
        "미지정";
      const matchedSite =
        siteByName.get(normalizeTextKey(siteName)) ??
        (matchedEmployee?.currentSiteId
          ? sites.find((site) => site.id === matchedEmployee.currentSiteId)
          : undefined);
      const siteId = matchedSite?.id ?? createSyntheticSiteId(siteName);

      return {
        id: result.id,
        approvalId: result.snapshot.performanceApprovalId,
        employeeCode: result.employeeCode || (matchedEmployee?.employeeCode ?? ""),
        employeeName: result.employeeName,
        siteId,
        siteName: matchedSite?.name ?? siteName,
        workDate: result.workDate,
        year: result.workDate.slice(0, 4),
        yearMonth: result.workDate.slice(0, 7),
        businessCategory: resolveBusinessCategory(result, getWorkCategoryLabel(result.workType)),
        totalWorkMinutes: result.snapshot.breakdown.totalWorkMinutes,
        overtimeMinutes: result.snapshot.breakdown.overtimeMinutes,
        hourlyRate: result.hourlyRate,
        totalAllowanceAmount: result.snapshot.totalAllowanceAmount
      } satisfies DashboardRecord;
    });
  }, [employees, results, sites]);

  const { dashboardRecords, hasRealDashboardRecords, isUsingDemoData } = useMemo(
    () =>
      selectDashboardDataset({
        demoFallbackEnabled: enableDashboardDemoFallback,
        employees,
        realDashboardRecords,
        sites
      }),
    [employees, realDashboardRecords, sites]
  );

  const availableYears = useMemo(() => {
    const years = [...new Set(dashboardRecords.map((record) => record.year))].sort(
      (left, right) => Number(right) - Number(left)
    );

    return years.length > 0 ? years : [draftFilters.year];
  }, [dashboardRecords, draftFilters.year]);

  const siteOptions = useMemo(() => {
    const optionMap = new Map<string, DashboardSiteOption>();

    sites.forEach((site) => {
      optionMap.set(site.id, { id: site.id, label: site.name });
    });

    dashboardRecords.forEach((record) => {
      if (!optionMap.has(record.siteId)) {
        optionMap.set(record.siteId, { id: record.siteId, label: record.siteName });
      }
    });

    return [
      { id: ALL_OPTION, label: "전체" },
      ...[...optionMap.values()].sort((left, right) => left.label.localeCompare(right.label, "ko"))
    ];
  }, [dashboardRecords, sites]);

  const employeeOptions = useMemo(() => {
    const names = new Set<string>();
    const draftPeriodRange = getDashboardFilterRange(draftFilters);

    dashboardRecords.forEach((record) => {
      if (
        isYearMonthInRange(record.yearMonth, draftPeriodRange) &&
        (draftFilters.siteId === ALL_OPTION || record.siteId === draftFilters.siteId)
      ) {
        names.add(record.employeeName);
      }
    });

    return [ALL_OPTION, ...[...names].sort((left, right) => left.localeCompare(right, "ko"))];
  }, [dashboardRecords, draftFilters]);

  useEffect(() => {
    if (availableYears.length === 0) {
      return;
    }

    const latestYear = availableYears[0];

    setDraftFilters((current) => ({
      ...current,
      year: availableYears.includes(current.year) ? current.year : latestYear,
      siteId: siteOptions.some((option) => option.id === current.siteId) ? current.siteId : ALL_OPTION
    }));

    setAppliedFilters((current) => ({
      ...current,
      year: availableYears.includes(current.year) ? current.year : latestYear,
      siteId: siteOptions.some((option) => option.id === current.siteId) ? current.siteId : ALL_OPTION
    }));
  }, [availableYears, siteOptions]);

  useEffect(() => {
    if (employeeOptions.includes(draftFilters.employeeName)) {
      return;
    }

    setDraftFilters((current) => ({ ...current, employeeName: ALL_OPTION }));
    setAppliedFilters((current) => ({ ...current, employeeName: ALL_OPTION }));
  }, [draftFilters.employeeName, employeeOptions]);

  useEffect(() => {
    if (!isUsingDemoData) {
      return;
    }

    const demoFallback = resolveDashboardDemoFallback({
      allOptionValue: ALL_OPTION,
      appliedFilters,
      dashboardRecords
    });

    if (!demoFallback) {
      return;
    }

    setDraftFilters(demoFallback.nextFilters);
    setAppliedFilters(demoFallback.nextFilters);

    if (demoFallback.nextSelectedMonth) {
      setSelectedMonth(demoFallback.nextSelectedMonth);
    }
  }, [appliedFilters, dashboardRecords, isUsingDemoData, setSelectedMonth]);

  const filteredRecords = useMemo(
    () =>
      dashboardRecords.filter((record) =>
        matchesDashboardRecordFilters(record, appliedFilters, { allOptionValue: ALL_OPTION })
      ),
    [appliedFilters, dashboardRecords]
  );

  const previousPeriodRecords = useMemo(
    () =>
      buildPreviousDashboardRecords({
        allOptionValue: ALL_OPTION,
        appliedFilters,
        dashboardRecords
      }),
    [appliedFilters, dashboardRecords]
  );

  const currentAggregate = useMemo(
    () => aggregateDashboardRecords(filteredRecords),
    [filteredRecords]
  );
  const previousAggregate = useMemo(
    () => aggregateDashboardRecords(previousPeriodRecords),
    [previousPeriodRecords]
  );

  const metrics = useMemo(
    () => buildDashboardMetrics({ currentAggregate, previousAggregate }),
    [currentAggregate, previousAggregate]
  );

  const trendItems = useMemo(
    () =>
      buildDashboardTrendItems({
        allOptionValue: ALL_OPTION,
        appliedFilters,
        dashboardRecords
      }),
    [appliedFilters, dashboardRecords]
  );

  const siteChartItems = useMemo(
    () => buildDashboardSiteChartItems(filteredRecords),
    [filteredRecords]
  );

  const ratioItems = useMemo(
    () => buildDashboardRatioItems(currentAggregate),
    [currentAggregate]
  );

  const hasTrendData = useMemo(
    () =>
      trendItems.some(
        (item) =>
          item.overtimeAmount > 0 || item.substituteAmount > 0 || item.legalHolidayAmount > 0
      ),
    [trendItems]
  );
  const hasSiteChartData = siteChartItems.length > 0;
  const hasRatioData = ratioItems.some((item) => item.amount > 0);

  const topPerformersByCategory = useMemo(
    () => buildDashboardTopPerformersByCategory(filteredRecords),
    [filteredRecords]
  );
  const topPerformers = topPerformersByCategory[activeRankingCategory];
  const hasRankingData = rankingTabItems.some((tab) => topPerformersByCategory[tab.key].length > 0);
  const hasExportableDashboardData =
    hasTrendData || hasSiteChartData || hasRatioData || hasRankingData;

  const filterSummary = useMemo<DashboardChartExportInput["filters"]>(
    () =>
      buildDashboardFilterSummary({
        allOptionValue: ALL_OPTION,
        appliedFilters,
        hasRealDashboardRecords,
        isUsingDemoData,
        siteOptions
      }),
    [appliedFilters, hasRealDashboardRecords, isUsingDemoData, siteOptions]
  );

  const {
    rankingChartExportInput,
    rankingExportSection,
    ratioChartExportInput,
    siteChartExportInput,
    trendChartExportInput,
    trendChartTitle
  } = useMemo(
    () =>
      buildDashboardExportModels({
        allOptionValue: ALL_OPTION,
        appliedFilters,
        filterSummary,
        rankingTabs: rankingTabItems,
        ratioItems,
        siteChartItems,
        topPerformersByCategory,
        trendItems
      }),
    [
      appliedFilters,
      filterSummary,
      ratioItems,
      siteChartItems,
      topPerformersByCategory,
      trendItems
    ]
  );

  const getChartImageDataUrl = (chartKey: DashboardChartExportInput["chartKey"]) => {
    const chartRef =
      chartKey === "trend"
        ? trendChartRef
        : chartKey === "site"
          ? siteChartRef
          : chartKey === "ratio"
            ? ratioChartRef
            : null;

    return chartRef?.current?.getImageDataUrl({
      backgroundColor: "#ffffff",
      pixelRatio: 2,
      type: "png"
    }) ?? undefined;
  };
  const { handleExportChart, handleExportDashboardReport } = createDashboardExportActions({
    bridge: window.appBridge,
    filterSummary,
    getChartImageDataUrl,
    getErrorMessage,
    rankingExportSection,
    ratioChartExportInput,
    setChartActionError,
    setChartActionMessage,
    setExportingActionKey,
    siteChartExportInput,
    trendChartExportInput
  });

  const controlPanelNotices = buildDashboardControlPanelNotices({
    chartActionError,
    chartActionMessage,
    hasRealDashboardRecords,
    isLoading,
    isUsingDemoData,
    screenError
  });

  return (
    <div className="screen-stack dashboard-v2-shell">
      <DashboardControlPanel
        allOptionValue={ALL_OPTION}
        availableYears={availableYears}
        draftFilters={draftFilters}
        employeeOptions={employeeOptions}
        exportDisabled={!hasExportableDashboardData}
        exportingFormat={resolveDashboardExportingFormat(exportingActionKey, "all")}
        notices={controlPanelNotices}
        onEmployeeNameChange={(value) => {
          applyDraftValueChange("employeeName", value);
        }}
        onEndYearMonthChange={(value) => {
          applyDraftValueChange("endYearMonth", value);
        }}
        onExportDashboardReport={(format) => {
          void handleExportDashboardReport(format);
        }}
        onMonthChange={(value) => {
          applyDraftValueChange("month", value);
        }}
        onPeriodModeChange={(value) => {
          applyDraftValueChange("periodMode", value);
        }}
        onSiteIdChange={(value) => {
          applyDraftValueChange("siteId", value);
        }}
        onStartYearMonthChange={(value) => {
          applyDraftValueChange("startYearMonth", value);
        }}
        onYearChange={(value) => {
          applyDraftValueChange("year", value);
        }}
        siteOptions={siteOptions}
      />

      <section className="dashboard-v2-metric-grid">
          {metrics.map((metric) => (
            <DashboardMetricCard key={metric.label} metric={metric} />
          ))}
      </section>

      <section className="dashboard-v2-report-grid">
        <article className="surface-card dashboard-v2-card dashboard-v2-card--trend">
          {isLoading ? (
            <DashboardEmptyState message="대시보드 데이터를 불러오는 중입니다." />
          ) : !hasTrendData ? (
            <DashboardEmptyState message="선택한 조건에 해당하는 월별 수당 추이 데이터가 없습니다." />
          ) : (
            <DashboardTrendChart
              chartRef={trendChartRef}
              exportingFormat={resolveDashboardExportingFormat(exportingActionKey, "trend")}
              isExportDisabled={!hasTrendData}
              items={trendItems}
              title={trendChartTitle}
              onExport={(format) => {
                void handleExportChart(trendChartExportInput, format);
              }}
            />
          )}
        </article>

        <article className="surface-card dashboard-v2-card dashboard-v2-card--site">
          {siteChartItems.length > 0 ? (
            <DashboardSiteChart
              chartRef={siteChartRef}
              exportingFormat={resolveDashboardExportingFormat(exportingActionKey, "site")}
              isExportDisabled={!hasSiteChartData}
              items={siteChartItems}
              onExport={(format) => {
                void handleExportChart(siteChartExportInput, format);
              }}
            />
          ) : (
            <DashboardEmptyState message="선택한 조건에 해당하는 근무지별 수당 데이터가 없습니다." />
          )}
        </article>

        <div className="dashboard-v2-bottom-grid">
          <article className="surface-card dashboard-v2-card">
            <DashboardRankingTable
              activeCategory={activeRankingCategory}
              exportingFormat={resolveDashboardExportingFormat(exportingActionKey, "ranking")}
              isExportDisabled={!hasRankingData}
              items={topPerformers}
              onSelectCategory={setActiveRankingCategory}
              onExport={(format) => {
                void handleExportChart(rankingChartExportInput, format);
              }}
            />
          </article>

          <article className="surface-card dashboard-v2-card">
            {hasRatioData ? (
              <DashboardRatioChart
                chartRef={ratioChartRef}
                exportingFormat={resolveDashboardExportingFormat(exportingActionKey, "ratio")}
                isExportDisabled={!hasRatioData}
                items={ratioItems}
                onExport={(format) => {
                  void handleExportChart(ratioChartExportInput, format);
                }}
                totalAmount={currentAggregate.totalAllowanceAmount}
              />
            ) : (
              <DashboardEmptyState message="선택한 조건에 해당하는 수당 유형 비율 데이터가 없습니다." />
            )}
          </article>
        </div>
      </section>
    </div>
  );
};
