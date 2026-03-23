import {
  Fragment,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";

import type { AllowanceDocumentExportRecord } from "@shared/domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import { selectActiveAllowanceRateVersion } from "@shared/domain/allowance-rate-service";
import type { AllowanceRateVersion } from "@shared/domain/model";
import type { PerformanceEntryRecord } from "@shared/domain/performance-file";
import { formatCurrency } from "@shared/lib/formatCurrency";

import { DateField } from "../components/DateField";
import { FormSelect } from "../components/FormSelect";

type AllowanceViewMode = "overview" | "history";
type WorkTypeFilter = "all" | "substitute" | "overtime" | "holiday";

interface AllowanceHistoryRow {
  rowId: string;
  exportId: string;
  exportedAt: string;
  outputFormat: AllowanceDocumentExportRecord["outputFormat"];
  calculation: AllowanceCalculationResultRecord;
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

const createCurrentDate = () => new Date().toISOString().slice(0, 10);
const createCurrentYear = () => createCurrentDate().slice(0, 4);

const workTypeLabel: Record<Exclude<WorkTypeFilter, "all">, string> = {
  substitute: "대체근무",
  overtime: "연장근무",
  holiday: "법정근무"
};

const workTypePillClassName: Record<Exclude<WorkTypeFilter, "all">, string> = {
  substitute: "performance-section-pill substitute",
  overtime: "performance-section-pill overtime",
  holiday: "performance-section-pill legal-holiday"
};

const workTypeColor: Record<Exclude<WorkTypeFilter, "all">, string> = {
  substitute: "#5b88ff",
  overtime: "#ffb648",
  holiday: "#ff7f94"
};

const workTypeOrder: Record<Exclude<WorkTypeFilter, "all">, number> = {
  substitute: 0,
  overtime: 1,
  holiday: 2
};

const orderedWorkTypes: Array<Exclude<WorkTypeFilter, "all">> = [
  "substitute",
  "overtime",
  "holiday"
];

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

const allowanceLineLabel = {
  base: "기본",
  overtime: "연장",
  night: "야간"
} as const;

const allowanceLineOrder = {
  base: 0,
  overtime: 1,
  night: 2
} as const;

const formatMultiplierLabel = (value: number) =>
  Number.isInteger(value) ? `${value}.0배` : `${value.toFixed(1)}배`;

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

const AllowanceEvidencePanel = ({
  result,
  exportedAt,
  outputFormat
}: {
  result: AllowanceCalculationResultRecord;
  exportedAt?: string;
  outputFormat?: AllowanceDocumentExportRecord["outputFormat"];
}) => {
  const payoutStatus = result.earlyPayoutDate
    ? `선지급 ${formatDate(result.earlyPayoutDate)}`
    : exportedAt
      ? `지급 반영 · ${outputFormat === "pdf" ? "PDF" : "Excel"}`
      : "미지급";

  return (
    <div className="allowance-evidence-panel">
      <div className="allowance-evidence-top">
        <div className="allowance-evidence-identity">
          <span className="allowance-evidence-kicker">수당 산출 상세</span>
          <strong className="allowance-evidence-title">
            {result.snapshot.businessCategoryLabel}
          </strong>
          <p className="allowance-evidence-subtitle">
            {result.employeeName} · {result.siteName} · {formatDate(result.workDate)} · 산출 파일{" "}
            {result.fileName}
          </p>
        </div>
        <div className="allowance-evidence-total-card">
          <span>총 수당</span>
          <strong>{formatCurrency(result.snapshot.totalAllowanceAmount)}</strong>
          <em>{`적용 요율 ${result.rateVersionLabel} · ${payoutStatus}`}</em>
        </div>
      </div>

      <div className="allowance-evidence-facts">
        <article className="allowance-evidence-fact">
          <span>시급</span>
          <strong>{formatCurrency(result.hourlyRate)}</strong>
        </article>
        <article className="allowance-evidence-fact">
          <span>총 근무</span>
          <strong>{formatHours(result.snapshot.breakdown.totalWorkMinutes)}</strong>
        </article>
        <article className="allowance-evidence-fact">
          <span>적용 요율</span>
          <strong>{result.rateVersionLabel}</strong>
        </article>
        <article className="allowance-evidence-fact">
          <span>지급 상태</span>
          <strong>{result.earlyPayoutDate ? "선지급" : exportedAt ? "지급 반영" : "미지급"}</strong>
        </article>
      </div>

      <div className="allowance-evidence-ledger">
        <div className="allowance-evidence-ledger-head">
          <span>구분</span>
          <span>시간</span>
          <span>적용 요율</span>
          <span>금액</span>
        </div>
        {[...result.snapshot.lines]
          .sort(
            (left, right) =>
              allowanceLineOrder[left.allowanceCode] - allowanceLineOrder[right.allowanceCode]
          )
          .map((line) => (
            <div className="allowance-evidence-ledger-row" key={`${result.id}:${line.allowanceCode}`}>
              <span className="allowance-evidence-ledger-kind">
                {allowanceLineLabel[line.allowanceCode]}
              </span>
              <span className="allowance-evidence-ledger-minutes">
                {formatHours(line.workMinutes)}
              </span>
              <span className="allowance-evidence-ledger-rate">
                {formatMultiplierLabel(line.multiplier)}
              </span>
              <span className="allowance-evidence-ledger-amount">
                {formatCurrency(line.amount)}
              </span>
            </div>
          ))}
        <div className="allowance-evidence-ledger-row total">
          <span className="allowance-evidence-ledger-kind">총 금액</span>
          <span className="allowance-evidence-ledger-minutes">
            {formatHours(result.snapshot.breakdown.totalWorkMinutes)}
          </span>
          <span className="allowance-evidence-ledger-rate">-</span>
          <span className="allowance-evidence-ledger-amount">
            {formatCurrency(result.snapshot.totalAllowanceAmount)}
          </span>
        </div>
      </div>
    </div>
  );
};

const getWorkTypeFilter = (
  record: Pick<AllowanceCalculationResultRecord, "workType">
): Exclude<WorkTypeFilter, "all"> =>
  record.workType === "substitute"
    ? "substitute"
    : record.workType === "holiday"
      ? "holiday"
      : "overtime";

const getBreakdownSummary = (result: AllowanceCalculationResultRecord) => {
  const { breakdown } = result.snapshot;

  return `${formatHours(breakdown.totalWorkMinutes)} / ${formatHours(
    breakdown.baseWorkMinutes
  )} / ${formatHours(breakdown.overtimeMinutes)} / ${formatHours(breakdown.nightMinutes)}`;
};

const sortCalculationResults = (rows: AllowanceCalculationResultRecord[]) =>
  [...rows].sort(
    (left, right) =>
      workTypeOrder[getWorkTypeFilter(left)] - workTypeOrder[getWorkTypeFilter(right)] ||
      left.workDate.localeCompare(right.workDate) ||
      left.employeeName.localeCompare(right.employeeName, "ko")
  );

const sortHistoryRows = (rows: AllowanceHistoryRow[]) =>
  [...rows].sort(
    (left, right) =>
      workTypeOrder[getWorkTypeFilter(left.calculation)] -
        workTypeOrder[getWorkTypeFilter(right.calculation)] ||
      left.calculation.workDate.localeCompare(right.calculation.workDate) ||
      left.calculation.employeeName.localeCompare(right.calculation.employeeName, "ko") ||
      right.exportedAt.localeCompare(left.exportedAt)
  );

const resolveDisplayedRateVersion = (input: {
  versions: AllowanceRateVersion[];
  selectedYear: string;
  selectedMonth: string;
  visibleResults: AllowanceCalculationResultRecord[];
}) => {
  const versionById = new Map(input.versions.map((version) => [version.id, version]));
  const usage = new Map<string, number>();

  input.visibleResults.forEach((result) => {
    usage.set(result.rateVersionId, (usage.get(result.rateVersionId) ?? 0) + 1);
  });

  const topVersionId = [...usage.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (topVersionId && versionById.has(topVersionId)) {
    return versionById.get(topVersionId) ?? null;
  }

  const filteredVersions =
    input.selectedYear === "all"
      ? input.versions
      : input.versions.filter((version) => String(version.year) === input.selectedYear);

  if (filteredVersions.length === 0) {
    return null;
  }

  return (
    selectActiveAllowanceRateVersion({
      targetDate: input.selectedMonth
        ? `${input.selectedYear === "all" ? createCurrentYear() : input.selectedYear}-${input.selectedMonth}-01`
        : createCurrentDate(),
      versions: filteredVersions
    }) ?? filteredVersions[0] ?? null
  );
};

const AllowanceEmptyState = ({ message }: { message: string }) => (
  <div className="allowance-empty-state">
    <strong>{message}</strong>
  </div>
);

export const AllowanceManagementScreen = () => {
  const [results, setResults] = useState<AllowanceCalculationResultRecord[]>([]);
  const [calculationHistory, setCalculationHistory] = useState<AllowanceCalculationResultRecord[]>([]);
  const [approvedTargets, setApprovedTargets] = useState<PerformanceEntryRecord[]>([]);
  const [rateVersions, setRateVersions] = useState<AllowanceRateVersion[]>([]);
  const [documentExports, setDocumentExports] = useState<AllowanceDocumentExportRecord[]>([]);
  const [viewMode, setViewMode] = useState<AllowanceViewMode>("overview");
  const [overviewYear, setOverviewYear] = useState("all");
  const [overviewMonth, setOverviewMonth] = useState("");
  const [overviewSite, setOverviewSite] = useState("all");
  const [overviewKeyword, setOverviewKeyword] = useState("");
  const [historyYear, setHistoryYear] = useState("all");
  const [historyMonth, setHistoryMonth] = useState("");
  const [historySite, setHistorySite] = useState("all");
  const [historyWorkType, setHistoryWorkType] = useState<WorkTypeFilter>("all");
  const [historyEmployee, setHistoryEmployee] = useState("all");
  const [expandedOverviewSites, setExpandedOverviewSites] = useState<string[]>([]);
  const [expandedHistorySites, setExpandedHistorySites] = useState<string[]>([]);
  const [expandedOverviewDetails, setExpandedOverviewDetails] = useState<string[]>([]);
  const [expandedHistoryDetails, setExpandedHistoryDetails] = useState<string[]>([]);
  const [hoveredDistributionSite, setHoveredDistributionSite] = useState<string | null>(null);
  const [activeDonutType, setActiveDonutType] = useState<Exclude<WorkTypeFilter, "all"> | null>(null);
  const [earlyPayoutEditor, setEarlyPayoutEditor] = useState<{
    calculationId: string;
    employeeName: string;
    siteName: string;
    value: string;
    existingValue?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const deferredOverviewKeyword = useDeferredValue(overviewKeyword);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const [resultsResult, historyResult, targetsResult, rateVersionsResult, exportsResult] =
          await Promise.all([
            window.appBridge.listCalculationResults(),
            window.appBridge.listCalculationHistory(),
            window.appBridge.listApprovedTargets(),
            window.appBridge.listAllowanceRateVersions(),
            window.appBridge.listAllowanceDocumentExports()
          ]);

        if (!active) {
          return;
        }

        setResults(resultsResult.ok ? resultsResult.data : []);
        setCalculationHistory(historyResult.ok ? historyResult.data : []);
        setApprovedTargets(targetsResult.ok ? targetsResult.data : []);
        setRateVersions(rateVersionsResult.ok ? rateVersionsResult.data : []);
        setDocumentExports(exportsResult.ok ? exportsResult.data : []);

        const messages = [
          resultsResult.ok ? null : resultsResult.message,
          historyResult.ok ? null : historyResult.message,
          targetsResult.ok ? null : targetsResult.message,
          rateVersionsResult.ok ? null : rateVersionsResult.message,
          exportsResult.ok ? null : exportsResult.message
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

  const availableYears = useMemo(() => {
    const years = new Set<string>([createCurrentYear()]);
    [...results, ...calculationHistory].forEach((item) => {
      years.add(item.workDate.slice(0, 4));
    });
    return [...years].sort((left, right) => Number(right) - Number(left));
  }, [calculationHistory, results]);

  const calculatedEntryIds = useMemo(() => new Set(results.map((result) => result.entryId)), [results]);

  const overviewSiteOptions = useMemo(() => {
    const filtered = results.filter((result) => {
      if (overviewYear !== "all" && result.workDate.slice(0, 4) !== overviewYear) {
        return false;
      }
      if (overviewMonth && result.workDate.slice(5, 7) !== overviewMonth) {
        return false;
      }
      return true;
    });

    return [...new Set(filtered.map((result) => result.siteName))].sort((left, right) =>
      left.localeCompare(right, "ko")
    );
  }, [overviewMonth, overviewYear, results]);

  const visibleResults = useMemo(
    () =>
      sortCalculationResults(
        results.filter((result) => {
          if (overviewYear !== "all" && result.workDate.slice(0, 4) !== overviewYear) {
            return false;
          }
          if (overviewMonth && result.workDate.slice(5, 7) !== overviewMonth) {
            return false;
          }
          if (overviewSite !== "all" && result.siteName !== overviewSite) {
            return false;
          }

          const normalizedKeyword = deferredOverviewKeyword.trim().toLowerCase();
          if (!normalizedKeyword) {
            return true;
          }

          return (
            result.employeeName.toLowerCase().includes(normalizedKeyword) ||
            result.siteName.toLowerCase().includes(normalizedKeyword) ||
            result.fileName.toLowerCase().includes(normalizedKeyword)
          );
        })
      ),
    [deferredOverviewKeyword, overviewMonth, overviewSite, overviewYear, results]
  );

  const visiblePendingTargets = useMemo(
    () =>
      approvedTargets.filter((target) => {
        if (calculatedEntryIds.has(target.id)) {
          return false;
        }
        if (overviewYear !== "all" && target.workDate.slice(0, 4) !== overviewYear) {
          return false;
        }
        if (overviewMonth && target.workDate.slice(5, 7) !== overviewMonth) {
          return false;
        }
        if (overviewSite !== "all" && target.siteName !== overviewSite) {
          return false;
        }

        const normalizedKeyword = deferredOverviewKeyword.trim().toLowerCase();
        if (!normalizedKeyword) {
          return true;
        }

        return (
          target.employeeName.toLowerCase().includes(normalizedKeyword) ||
          target.siteName.toLowerCase().includes(normalizedKeyword)
        );
      }),
    [approvedTargets, calculatedEntryIds, deferredOverviewKeyword, overviewMonth, overviewSite, overviewYear]
  );

  const displayedRateVersion = useMemo(
    () =>
      resolveDisplayedRateVersion({
        versions: rateVersions,
        selectedYear: overviewYear,
        selectedMonth: overviewMonth,
        visibleResults
      }),
    [overviewMonth, overviewYear, rateVersions, visibleResults]
  );

  const totalAllowanceAmount = useMemo(
    () => visibleResults.reduce((sum, result) => sum + result.snapshot.totalAllowanceAmount, 0),
    [visibleResults]
  );

  const calculatedEmployeeCount = useMemo(
    () => new Set(visibleResults.map((result) => result.employeeCode || result.employeeName)).size,
    [visibleResults]
  );

  const siteDistribution = useMemo(() => {
    const grouped = new Map<
      string,
      { amount: number; totalWorkMinutes: number; employees: Set<string> }
    >();
    visibleResults.forEach((result) => {
      const current = grouped.get(result.siteName) ?? {
        amount: 0,
        totalWorkMinutes: 0,
        employees: new Set<string>()
      };
      current.amount += result.snapshot.totalAllowanceAmount;
      current.totalWorkMinutes += result.snapshot.breakdown.totalWorkMinutes;
      current.employees.add(result.employeeCode || result.employeeName);
      grouped.set(result.siteName, current);
    });
    const rows = [...grouped.entries()]
      .map(([siteName, summary]) => ({
        siteName,
        amount: summary.amount,
        totalWorkMinutes: summary.totalWorkMinutes,
        employeeCount: summary.employees.size
      }))
      .sort((left, right) => right.amount - left.amount);
    const maxAmount = rows[0]?.amount ?? 1;
    return rows.map((row) => ({
      ...row,
      ratio: row.amount / maxAmount
    }));
  }, [visibleResults]);

  const workTypeDistribution = useMemo(() => {
    const totals = {
      substitute: {
        amount: 0,
        minutes: 0
      },
      overtime: {
        amount: 0,
        minutes: 0
      },
      holiday: {
        amount: 0,
        minutes: 0
      }
    };

    visibleResults.forEach((result) => {
      const type = getWorkTypeFilter(result);
      totals[type].amount += result.snapshot.totalAllowanceAmount;
      totals[type].minutes += result.snapshot.breakdown.totalWorkMinutes;
    });

    const grandTotalAmount =
      totals.substitute.amount + totals.overtime.amount + totals.holiday.amount;
    const segments = orderedWorkTypes.map((type) => ({
      type,
      label: workTypeLabel[type],
      color: workTypeColor[type],
      amount: totals[type].amount,
      minutes: totals[type].minutes,
      percentage:
        grandTotalAmount > 0 ? Math.round((totals[type].amount / grandTotalAmount) * 100) : 0
    }));
    const dominant = [...segments].sort((left, right) => right.amount - left.amount)[0];

    return {
      segments,
      totals,
      grandTotalAmount,
      dominantType: dominant?.type ?? "overtime",
      dominantRatio: dominant?.percentage ?? 0
    };
  }, [visibleResults]);

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

  const overviewGroups = useMemo(() => {
    const grouped = new Map<string, AllowanceCalculationResultRecord[]>();
    visibleResults.forEach((result) => {
      const current = grouped.get(result.siteName) ?? [];
      current.push(result);
      grouped.set(result.siteName, current);
    });

    return [...grouped.entries()]
      .map(([siteName, rows]) => ({
        siteName,
        rows: sortCalculationResults(rows),
        totalAllowanceAmount: rows.reduce((sum, row) => sum + row.snapshot.totalAllowanceAmount, 0),
        totalWorkMinutes: rows.reduce((sum, row) => sum + row.snapshot.breakdown.totalWorkMinutes, 0),
        baseWorkMinutes: rows.reduce((sum, row) => sum + row.snapshot.breakdown.baseWorkMinutes, 0),
        overtimeMinutes: rows.reduce((sum, row) => sum + row.snapshot.breakdown.overtimeMinutes, 0),
        nightMinutes: rows.reduce((sum, row) => sum + row.snapshot.breakdown.nightMinutes, 0)
      }))
      .sort((left, right) => right.totalAllowanceAmount - left.totalAllowanceAmount);
  }, [visibleResults]);

  const historyRows = useMemo(() => {
    const calculationById = new Map(calculationHistory.map((row) => [row.id, row]));
    return documentExports.flatMap((record) =>
      record.calculationIds.flatMap((calculationId) => {
        const calculation = calculationById.get(calculationId);
        return calculation
          ? [
              {
                rowId: `${record.id}:${calculationId}`,
                exportId: record.id,
                exportedAt: record.exportedAt,
                outputFormat: record.outputFormat,
                calculation
              } satisfies AllowanceHistoryRow
            ]
          : [];
      })
    );
  }, [calculationHistory, documentExports]);

  const historySiteOptions = useMemo(() => {
    const filtered = historyRows.filter((row) => {
      if (historyYear !== "all" && row.calculation.workDate.slice(0, 4) !== historyYear) {
        return false;
      }
      if (historyMonth && row.calculation.workDate.slice(5, 7) !== historyMonth) {
        return false;
      }
      return true;
    });

    return [...new Set(filtered.map((row) => row.calculation.siteName))].sort((left, right) =>
      left.localeCompare(right, "ko")
    );
  }, [historyMonth, historyRows, historyYear]);

  const historyEmployeeOptions = useMemo(() => {
    const filtered = historyRows.filter((row) => {
      if (historyYear !== "all" && row.calculation.workDate.slice(0, 4) !== historyYear) {
        return false;
      }
      if (historyMonth && row.calculation.workDate.slice(5, 7) !== historyMonth) {
        return false;
      }
      if (historySite !== "all" && row.calculation.siteName !== historySite) {
        return false;
      }
      if (historyWorkType !== "all" && getWorkTypeFilter(row.calculation) !== historyWorkType) {
        return false;
      }
      return true;
    });

    return [...new Set(filtered.map((row) => row.calculation.employeeName))].sort((left, right) =>
      left.localeCompare(right, "ko")
    );
  }, [historyMonth, historyRows, historySite, historyWorkType, historyYear]);

  const visibleHistoryRows = useMemo(
    () =>
      sortHistoryRows(
        historyRows.filter((row) => {
          if (historyYear !== "all" && row.calculation.workDate.slice(0, 4) !== historyYear) {
            return false;
          }
          if (historyMonth && row.calculation.workDate.slice(5, 7) !== historyMonth) {
            return false;
          }
          if (historySite !== "all" && row.calculation.siteName !== historySite) {
            return false;
          }
          if (historyWorkType !== "all" && getWorkTypeFilter(row.calculation) !== historyWorkType) {
            return false;
          }
          if (historyEmployee !== "all" && row.calculation.employeeName !== historyEmployee) {
            return false;
          }
          return true;
        })
      ),
    [historyEmployee, historyMonth, historyRows, historySite, historyWorkType, historyYear]
  );

  const historyGroups = useMemo(() => {
    const grouped = new Map<string, AllowanceHistoryRow[]>();
    visibleHistoryRows.forEach((row) => {
      const current = grouped.get(row.calculation.siteName) ?? [];
      current.push(row);
      grouped.set(row.calculation.siteName, current);
    });

    return [...grouped.entries()]
      .map(([siteName, rows]) => ({
        siteName,
        rows: sortHistoryRows(rows),
        totalAllowanceAmount: rows.reduce((sum, row) => sum + row.calculation.snapshot.totalAllowanceAmount, 0),
        totalWorkMinutes: rows.reduce((sum, row) => sum + row.calculation.snapshot.breakdown.totalWorkMinutes, 0),
        baseWorkMinutes: rows.reduce((sum, row) => sum + row.calculation.snapshot.breakdown.baseWorkMinutes, 0),
        overtimeMinutes: rows.reduce((sum, row) => sum + row.calculation.snapshot.breakdown.overtimeMinutes, 0),
        nightMinutes: rows.reduce((sum, row) => sum + row.calculation.snapshot.breakdown.nightMinutes, 0)
      }))
      .sort((left, right) => right.totalAllowanceAmount - left.totalAllowanceAmount);
  }, [visibleHistoryRows]);

  const toggleExpandedSite = (target: "overview" | "history", siteName: string) => {
    const update = (current: string[]) =>
      current.includes(siteName)
        ? current.filter((item) => item !== siteName)
        : [...current, siteName];

    if (target === "overview") {
      setExpandedOverviewSites(update);
      return;
    }

    setExpandedHistorySites(update);
  };

  const toggleExpandedDetail = (target: "overview" | "history", rowId: string) => {
    const update = (current: string[]) =>
      current.includes(rowId) ? current.filter((item) => item !== rowId) : [...current, rowId];

    if (target === "overview") {
      setExpandedOverviewDetails(update);
      return;
    }

    setExpandedHistoryDetails(update);
  };

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

  const openEarlyPayoutEditor = (result: AllowanceCalculationResultRecord) => {
    setEarlyPayoutEditor({
      calculationId: result.id,
      employeeName: result.employeeName,
      siteName: result.siteName,
      value: result.earlyPayoutDate ?? createCurrentDate(),
      existingValue: result.earlyPayoutDate
    });
  };

  const handleSaveEarlyPayout = async () => {
    if (!earlyPayoutEditor?.value) {
      setActionError("선지급 날짜를 선택해 주세요.");
      return;
    }

    const shouldSave = window.confirm(
      `${earlyPayoutEditor.employeeName} 실적을 ${formatDate(earlyPayoutEditor.value)} 기준으로 선지급 처리할까요?`
    );

    if (!shouldSave) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingKey(`early-payout:${earlyPayoutEditor.calculationId}`);

    try {
      const result = await window.appBridge.setCalculationEarlyPayout({
        calculationId: earlyPayoutEditor.calculationId,
        earlyPayoutDate: earlyPayoutEditor.value
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage(
        `${earlyPayoutEditor.employeeName} 실적에 선지급 ${formatDate(earlyPayoutEditor.value)}을 반영했습니다.`
      );
      setEarlyPayoutEditor(null);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingKey(null);
    }
  };

  const handleClearEarlyPayout = async () => {
    if (!earlyPayoutEditor) {
      return;
    }

    const shouldClear = window.confirm(
      `${earlyPayoutEditor.employeeName} 실적의 선지급 설정을 취소할까요?`
    );

    if (!shouldClear) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingKey(`early-payout:${earlyPayoutEditor.calculationId}`);

    try {
      const result = await window.appBridge.setCalculationEarlyPayout({
        calculationId: earlyPayoutEditor.calculationId,
        earlyPayoutDate: null
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage(`${earlyPayoutEditor.employeeName} 실적의 선지급 상태를 취소했습니다.`);
      setEarlyPayoutEditor(null);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingKey(null);
    }
  };

  const handleRunVisiblePending = async () => {
    if (visiblePendingTargets.length === 0) {
      setActionError("산출할 승인 완료 항목이 없습니다.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingKey("__bulk__");

    try {
      let successCount = 0;
      const failedMessages: string[] = [];

      for (const target of visiblePendingTargets) {
        const result = await window.appBridge.runApprovedCalculation({ entryId: target.id });

        if (!result.ok) {
          failedMessages.push(`${target.employeeName}: ${result.message}`);
          continue;
        }

        successCount += 1;
      }

      setActionMessage(successCount > 0 ? `${successCount}건의 승인 실적을 수당 산출했습니다.` : null);
      setActionError(failedMessages.length > 0 ? failedMessages.join(" / ") : null);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingKey(null);
    }
  };

  const handleExportDocuments = async (outputFormat: AllowanceDocumentExportRecord["outputFormat"]) => {
    if (visibleResults.length === 0) {
      setActionError("출력할 수당 계산 결과가 없습니다.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingKey(`export:${outputFormat}`);

    try {
      const result = await window.appBridge.exportAllowanceDocuments({
        calculationIds: visibleResults.map((item) => item.id),
        outputFormat
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage(
        `${result.data.workMonth} ${
          outputFormat === "pdf" ? "PDF" : "Excel"
        } 문서 출력이 완료되었습니다. 품의서/별첨1/별첨2 지정 경로에 저장했습니다.`
      );
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingKey(null);
    }
  };

  return (
    <div className="screen-stack allowance-screen allowance-shell">
      <section className="surface-card allowance-hero-card">
        <div className="button-row spread allowance-hero-row">
          <div className="allowance-title-block">
            <div>
              <h3>수당 관리</h3>
              <p>산출 결과, 문서 출력, 지급 이력을 하나의 흐름으로 정리합니다.</p>
            </div>
          </div>

          <div className="button-row allowance-action-row">
            <button
              className="primary-button compact-button allowance-export-button"
              disabled={visibleResults.length === 0 || isProcessing}
              onClick={() => {
                void handleExportDocuments("pdf");
              }}
              type="button"
            >
              <span className="allowance-export-icon pdf">PDF</span>
              {processingKey === "export:pdf" ? "PDF 출력 중..." : "PDF 출력"}
            </button>
            <button
              className="ghost-button compact-button allowance-export-button"
              disabled={visibleResults.length === 0 || isProcessing}
              onClick={() => {
                void handleExportDocuments("xlsx");
              }}
              type="button"
            >
              <span className="allowance-export-icon excel">XLS</span>
              {processingKey === "export:xlsx" ? "Excel 출력 중..." : "Excel 출력"}
            </button>
            <button
              className="ghost-button compact-button"
              disabled={visiblePendingTargets.length === 0 || isProcessing}
              onClick={() => {
                void handleRunVisiblePending();
              }}
              type="button"
            >
              {processingKey === "__bulk__" ? "산출 중..." : "미산출 일괄 계산"}
            </button>
          </div>
        </div>

        <div className="allowance-view-tabs">
          <button
            className={viewMode === "overview" ? "allowance-view-tab active" : "allowance-view-tab"}
            onClick={() => {
              setViewMode("overview");
            }}
            type="button"
          >
            수당 산출 현황
          </button>
          <button
            className={viewMode === "history" ? "allowance-view-tab active" : "allowance-view-tab"}
            onClick={() => {
              setViewMode("history");
            }}
            type="button"
          >
            수당 지급 이력
          </button>
        </div>

        {viewMode === "overview" ? (
          <div className="allowance-toolbar">
            <label className="field filter-field allowance-filter-year">
              <span>연도</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setOverviewYear(event.target.value);
                }}
                selectClassName="top-filter-select"
                value={overviewYear}
              >
                <option value="all">전체</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}년
                  </option>
                ))}
              </FormSelect>
            </label>
            <label className="field filter-field allowance-filter-month">
              <span>월</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setOverviewMonth(event.target.value);
                }}
                selectClassName="top-filter-select"
                value={overviewMonth}
              >
                <option value="">전체</option>
                {Array.from({ length: 12 }, (_, index) => {
                  const month = String(index + 1).padStart(2, "0");
                  return (
                    <option key={month} value={month}>
                      {Number(month)}월
                    </option>
                  );
                })}
              </FormSelect>
            </label>
            <label className="field filter-field allowance-filter-site allowance-site-select">
              <span>근무지</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setOverviewSite(event.target.value);
                }}
                selectClassName="top-filter-select"
                value={overviewSite}
              >
                <option value="all">전체 근무지</option>
                {overviewSiteOptions.map((siteName) => (
                  <option key={siteName} value={siteName}>
                    {siteName}
                  </option>
                ))}
              </FormSelect>
            </label>
            <button
              className="ghost-button allowance-reset-button"
              onClick={() => {
                setOverviewYear("all");
                setOverviewMonth("");
                setOverviewSite("all");
                setOverviewKeyword("");
                setRefreshKey((current) => current + 1);
              }}
              type="button"
            >
              초기화
            </button>
          </div>
        ) : (
          <div className="allowance-toolbar allowance-toolbar-history">
            <label className="field filter-field allowance-filter-site allowance-site-select">
              <span>근무지</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setHistorySite(event.target.value);
                }}
                selectClassName="top-filter-select"
                value={historySite}
              >
                <option value="all">전체</option>
                {historySiteOptions.map((siteName) => (
                  <option key={siteName} value={siteName}>
                    {siteName}
                  </option>
                ))}
              </FormSelect>
            </label>
            <label className="field filter-field allowance-filter-year">
              <span>연도</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setHistoryYear(event.target.value);
                }}
                selectClassName="top-filter-select"
                value={historyYear}
              >
                <option value="all">전체</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}년
                  </option>
                ))}
              </FormSelect>
            </label>
            <label className="field filter-field allowance-filter-month">
              <span>월</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setHistoryMonth(event.target.value);
                }}
                selectClassName="top-filter-select"
                value={historyMonth}
              >
                <option value="">전체</option>
                {Array.from({ length: 12 }, (_, index) => {
                  const month = String(index + 1).padStart(2, "0");
                  return (
                    <option key={month} value={month}>
                      {Number(month)}월
                    </option>
                  );
                })}
              </FormSelect>
            </label>
            <label className="field filter-field allowance-filter-work-type">
              <span>근로유형</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setHistoryWorkType(event.target.value as WorkTypeFilter);
                }}
                selectClassName="top-filter-select"
                value={historyWorkType}
              >
                <option value="all">전체</option>
                <option value="substitute">대체근무</option>
                <option value="overtime">연장근무</option>
                <option value="holiday">법정근무</option>
              </FormSelect>
            </label>
            <label className="field filter-field allowance-filter-employee allowance-site-select">
              <span>직원명</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setHistoryEmployee(event.target.value);
                }}
                selectClassName="top-filter-select"
                value={historyEmployee}
              >
                <option value="all">전체</option>
                {historyEmployeeOptions.map((employeeName) => (
                  <option key={employeeName} value={employeeName}>
                    {employeeName}
                  </option>
                ))}
              </FormSelect>
            </label>
            <button
              className="ghost-button allowance-reset-button"
              onClick={() => {
                setHistorySite("all");
                setHistoryYear("all");
                setHistoryMonth("");
                setHistoryWorkType("all");
                setHistoryEmployee("all");
              }}
              type="button"
            >
              초기화
            </button>
          </div>
        )}

        <div className="allowance-hero-meta">
          <span className="pill neutral">산출 {results.length}건</span>
          <span className="pill info">대상 인원 {calculatedEmployeeCount}명</span>
          <span className="pill warn">미산출 {visiblePendingTargets.length}건</span>
          <span className="pill neutral">
            적용 요율 {displayedRateVersion ? displayedRateVersion.versionLabel : "없음"}
          </span>
        </div>

        {screenError ? <p className="form-error-text">{screenError}</p> : null}
        {actionError ? <p className="form-error-text">{actionError}</p> : null}
        {actionMessage ? <p className="form-success-text">{actionMessage}</p> : null}
      </section>

      {viewMode === "overview" ? (
        <section className="allowance-layout allowance-layout-modern">
          <aside className="allowance-left-column allowance-left-column-modern">
            <article className="surface-card allowance-visual-card">
              <div className="section-heading compact-heading">
                <div>
                  <h3>사업장별 수당 분포</h3>
                  <p>단위: 원</p>
                </div>
              </div>

              {siteDistribution.length > 0 ? (
                <div className="allowance-distribution-list">
                  {siteDistribution.map((row) => (
                    <div
                      className="allowance-distribution-item"
                      key={row.siteName}
                      onMouseEnter={() => {
                        setHoveredDistributionSite(row.siteName);
                      }}
                      onMouseLeave={() => {
                        setHoveredDistributionSite((current) =>
                          current === row.siteName ? null : current
                        );
                      }}
                    >
                      <div className="allowance-distribution-copy">
                        <strong>{row.siteName}</strong>
                        <span>{formatCurrency(row.amount)}</span>
                      </div>
                      <div className="allowance-distribution-track">
                        <div
                          className="allowance-distribution-bar"
                          style={{ width: `${Math.max(row.ratio * 100, 8)}%` }}
                        />
                      </div>
                      <div
                        className={
                          hoveredDistributionSite === row.siteName
                            ? "allowance-distribution-detail visible"
                            : "allowance-distribution-detail"
                        }
                      >
                        <span>{formatHours(row.totalWorkMinutes)}</span>
                        <span>{row.employeeCount}명</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <AllowanceEmptyState message={isLoading ? "수당 결과를 불러오는 중입니다." : "표시할 산출 결과가 없습니다."} />
              )}

              <div className="allowance-total-box">
                <span>전체 수당 합계</span>
                <strong>{formatCurrency(totalAllowanceAmount)}</strong>
                <em>{visibleResults.length}건 산출</em>
              </div>
            </article>

            <article className="surface-card allowance-visual-card">
              <div className="section-heading compact-heading">
                <div>
                  <h3>수당 유형별 비중</h3>
                  <p>근로유형별 지급액 기준</p>
                </div>
              </div>

              {workTypeDistribution.grandTotalAmount > 0 ? (
                <>
                  <div
                    className="allowance-donut-chart"
                    onMouseLeave={() => {
                      setActiveDonutType(null);
                    }}
                    onMouseMove={handleDonutPointerMove}
                    style={{
                      background: `conic-gradient(
                        ${workTypeColor.substitute} 0deg ${
                        (workTypeDistribution.totals.substitute.amount /
                          workTypeDistribution.grandTotalAmount) *
                        360
                      }deg,
                        ${workTypeColor.overtime} ${
                        (workTypeDistribution.totals.substitute.amount /
                          workTypeDistribution.grandTotalAmount) *
                        360
                      }deg ${
                        ((workTypeDistribution.totals.substitute.amount +
                          workTypeDistribution.totals.overtime.amount) /
                          workTypeDistribution.grandTotalAmount) *
                        360
                      }deg,
                        ${workTypeColor.holiday} ${
                        ((workTypeDistribution.totals.substitute.amount +
                          workTypeDistribution.totals.overtime.amount) /
                          workTypeDistribution.grandTotalAmount) *
                        360
                      }deg 360deg
                      )`
                    }}
                  >
                    <div className="allowance-donut-center">
                      <strong>
                        {activeDonutType && activeDonutSegment
                          ? formatHours(activeDonutSegment.minutes)
                          : `${workTypeDistribution.dominantRatio}%`}
                      </strong>
                      <span>
                        {activeDonutType && activeDonutSegment
                          ? `${activeDonutSegment.label} · ${activeDonutSegment.percentage}%`
                          : "최대 비중"}
                      </span>
                      {activeDonutType && activeDonutSegment ? (
                        <em>{formatCurrency(activeDonutSegment.amount)}</em>
                      ) : null}
                    </div>
                  </div>
                  <div className="allowance-legend-row">
                    {workTypeDistribution.segments.map((segment) => (
                      <span
                        className="allowance-legend-item"
                        key={segment.type}
                        onMouseEnter={() => {
                          setActiveDonutType(segment.type);
                        }}
                        onMouseLeave={() => {
                          setActiveDonutType(null);
                        }}
                      >
                        <i style={{ background: segment.color }} />
                        {segment.label} {segment.percentage}%
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <AllowanceEmptyState message="비중을 표시할 수당 결과가 없습니다." />
              )}
            </article>
          </aside>

          <article className="surface-card allowance-table-card allowance-table-card-modern">
            <div className="section-heading compact-heading">
              <div>
                <h3>상세 수당 내역</h3>
                <p>근무지별 합계와 상세 행을 접어 보며 확인합니다.</p>
              </div>
              <label className="field allowance-inline-search">
                <span>직원명 검색</span>
                <input
                  onChange={(event) => {
                    setOverviewKeyword(event.target.value);
                  }}
                  placeholder="직원명 / 근무지 / 파일명"
                  value={overviewKeyword}
                />
              </label>
            </div>

            <div className="data-scroll">
              <table className="info-table compact-table allowance-results-table allowance-grouped-table">
                <thead>
                  <tr>
                    <th>관리</th>
                    <th>근무지</th>
                    <th>이름</th>
                    <th>상태</th>
                    <th>근로유형</th>
                    <th>근무일자</th>
                    <th>총 / 기본 / 연장 / 야간</th>
                    <th>시급</th>
                    <th>총 수당</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={9}>수당 계산 결과를 불러오는 중입니다.</td>
                    </tr>
                  ) : overviewGroups.length > 0 ? (
                    overviewGroups.map((group) => {
                      const isExpanded = expandedOverviewSites.includes(group.siteName);
                      return (
                        <Fragment key={`${group.siteName}-overview`}>
                          <tr className="allowance-summary-row-item" key={`${group.siteName}-summary`}>
                            <td className="allowance-manage-cell">
                              <button
                                className={isExpanded ? "allowance-expand-button active" : "allowance-expand-button"}
                                onClick={() => {
                                  toggleExpandedSite("overview", group.siteName);
                                }}
                                type="button"
                              >
                                {isExpanded ? "⌃" : "⌄"}
                              </button>
                            </td>
                            <td className="table-strong">{group.siteName}</td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                            <td>{`${formatHours(group.totalWorkMinutes)} / ${formatHours(
                              group.baseWorkMinutes
                            )} / ${formatHours(group.overtimeMinutes)} / ${formatHours(group.nightMinutes)}`}</td>
                            <td>-</td>
                            <td>{formatCurrency(group.totalAllowanceAmount)}</td>
                          </tr>
                          {isExpanded
                            ? group.rows.map((result) => {
                                const type = getWorkTypeFilter(result);
                                const isDetailExpanded = expandedOverviewDetails.includes(result.id);
                                return (
                                  <Fragment key={result.id}>
                                    <tr className="allowance-detail-row-item">
                                      <td className="allowance-manage-cell">
                                        <div className="allowance-row-actions">
                                          <button
                                            className={
                                              isDetailExpanded
                                                ? "allowance-row-action-button active"
                                                : "allowance-row-action-button"
                                            }
                                            onClick={() => {
                                              toggleExpandedDetail("overview", result.id);
                                            }}
                                            title="수당 산출 근거 보기"
                                            type="button"
                                          >
                                            <AllowanceDetailIcon />
                                          </button>
                                          <button
                                            className={
                                              result.earlyPayoutDate
                                                ? "allowance-row-action-button prepaid active"
                                                : "allowance-row-action-button prepaid"
                                            }
                                            onClick={() => {
                                              openEarlyPayoutEditor(result);
                                            }}
                                            title="퇴직자 선지급 설정"
                                            type="button"
                                          >
                                            <AllowanceEarlyPayoutIcon />
                                          </button>
                                        </div>
                                      </td>
                                      <td>{result.siteName}</td>
                                      <td>{result.employeeName}</td>
                                      <td>
                                        {result.earlyPayoutDate ? (
                                          <span className="allowance-status-pill prepaid">선지급</span>
                                        ) : (
                                          "-"
                                        )}
                                      </td>
                                      <td>
                                        <span className={workTypePillClassName[type]}>
                                          {workTypeLabel[type]}
                                        </span>
                                      </td>
                                      <td>{formatDate(result.workDate)}</td>
                                      <td>{getBreakdownSummary(result)}</td>
                                      <td>{formatCurrency(result.hourlyRate)}</td>
                                      <td>{formatCurrency(result.snapshot.totalAllowanceAmount)}</td>
                                    </tr>
                                    {isDetailExpanded ? (
                                      <tr className="allowance-evidence-row">
                                        <td colSpan={9}>
                                          <AllowanceEvidencePanel result={result} />
                                        </td>
                                      </tr>
                                    ) : null}
                                  </Fragment>
                                );
                              })
                            : null}
                        </Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9}>조건에 맞는 수당 산출 결과가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : (
        <section className="surface-card allowance-history-card">
          <div className="section-heading compact-heading">
            <div>
              <h3>수당 지급 이력</h3>
              <p>지급 문서로 출력된 이력을 근무지 기준으로 정리합니다.</p>
            </div>
            <div className="button-row allowance-table-meta">
              <span className="pill neutral">{visibleHistoryRows.length}건</span>
            </div>
          </div>

          <div className="data-scroll">
            <table className="info-table compact-table allowance-results-table allowance-grouped-table">
              <thead>
                <tr>
                  <th>관리</th>
                  <th>근무지</th>
                  <th>이름</th>
                  <th>상태</th>
                  <th>근로유형</th>
                  <th>근무일자</th>
                  <th>총 / 기본 / 연장 / 야간</th>
                  <th>시급</th>
                  <th>총 수당</th>
                  <th>지급 이력</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10}>지급 이력을 불러오는 중입니다.</td>
                  </tr>
                ) : historyGroups.length > 0 ? (
                  historyGroups.map((group) => {
                    const isExpanded = expandedHistorySites.includes(group.siteName);
                    return (
                      <Fragment key={`${group.siteName}-history`}>
                        <tr className="allowance-summary-row-item" key={`${group.siteName}-history-summary`}>
                          <td className="allowance-manage-cell">
                            <button
                              className={isExpanded ? "allowance-expand-button active" : "allowance-expand-button"}
                              onClick={() => {
                                toggleExpandedSite("history", group.siteName);
                              }}
                              type="button"
                            >
                              {isExpanded ? "⌃" : "⌄"}
                            </button>
                          </td>
                          <td className="table-strong">{group.siteName}</td>
                          <td>-</td>
                          <td>-</td>
                          <td>-</td>
                          <td>-</td>
                          <td>{`${formatHours(group.totalWorkMinutes)} / ${formatHours(
                            group.baseWorkMinutes
                          )} / ${formatHours(group.overtimeMinutes)} / ${formatHours(group.nightMinutes)}`}</td>
                          <td>-</td>
                          <td>{formatCurrency(group.totalAllowanceAmount)}</td>
                          <td>-</td>
                        </tr>
                        {isExpanded
                          ? group.rows.map((row) => {
                              const type = getWorkTypeFilter(row.calculation);
                              const isDetailExpanded = expandedHistoryDetails.includes(row.rowId);
                              return (
                                <Fragment key={row.rowId}>
                                  <tr className="allowance-detail-row-item">
                                    <td className="allowance-manage-cell">
                                      <div className="allowance-row-actions">
                                        <button
                                          className={
                                            isDetailExpanded
                                              ? "allowance-row-action-button active"
                                              : "allowance-row-action-button"
                                          }
                                          onClick={() => {
                                            toggleExpandedDetail("history", row.rowId);
                                          }}
                                          title="수당 산출 근거 보기"
                                          type="button"
                                        >
                                          <AllowanceDetailIcon />
                                        </button>
                                      </div>
                                    </td>
                                    <td>{row.calculation.siteName}</td>
                                    <td>{row.calculation.employeeName}</td>
                                    <td>
                                      {row.calculation.earlyPayoutDate ? (
                                        <span className="allowance-status-pill prepaid">선지급</span>
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                    <td>
                                      <span className={workTypePillClassName[type]}>
                                        {workTypeLabel[type]}
                                      </span>
                                    </td>
                                    <td>{formatDate(row.calculation.workDate)}</td>
                                    <td>{getBreakdownSummary(row.calculation)}</td>
                                    <td>{formatCurrency(row.calculation.hourlyRate)}</td>
                                    <td>{formatCurrency(row.calculation.snapshot.totalAllowanceAmount)}</td>
                                    <td>
                                      <div className="allowance-history-meta">
                                        <span>{formatDateTime(row.exportedAt)}</span>
                                        <i className={`allowance-export-icon ${row.outputFormat === "pdf" ? "pdf" : "excel"}`}>
                                          {row.outputFormat === "pdf" ? "PDF" : "XLS"}
                                        </i>
                                      </div>
                                    </td>
                                  </tr>
                                  {isDetailExpanded ? (
                                    <tr className="allowance-evidence-row">
                                      <td colSpan={10}>
                                        <AllowanceEvidencePanel
                                          exportedAt={row.exportedAt}
                                          outputFormat={row.outputFormat}
                                          result={row.calculation}
                                        />
                                      </td>
                                    </tr>
                                  ) : null}
                                </Fragment>
                              );
                            })
                          : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10}>조건에 맞는 지급 이력이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {earlyPayoutEditor ? (
        <div className="modal-overlay">
          <section aria-modal="true" className="modal-card allowance-early-payout-modal" role="dialog">
            <div className="surface-card-header">
              <div className="modal-heading-copy">
                <strong>퇴직자 선지급 설정</strong>
                <p>
                  {earlyPayoutEditor.employeeName} / {earlyPayoutEditor.siteName}
                </p>
              </div>
            </div>

            <div className="allowance-early-payout-body">
              <div className="allowance-early-payout-status">
                <span>선지급 상태</span>
                <strong
                  className={`allowance-status-pill ${earlyPayoutEditor.existingValue ? "prepaid" : "pending"}`}
                >
                  {earlyPayoutEditor.existingValue ? "선지급 승인" : "선지급 미승인"}
                </strong>
              </div>
              <label className="field">
                <span>선지급 날짜</span>
                <DateField
                  disabled={Boolean(earlyPayoutEditor.existingValue)}
                  onChange={(value) => {
                    setEarlyPayoutEditor((current) =>
                      current
                        ? {
                            ...current,
                            value
                          }
                        : current
                    );
                  }}
                  value={earlyPayoutEditor.value}
                />
              </label>
              <p className="allowance-early-payout-note">
                선지급 실적은 품의서 3번 항목으로 분리되고, 일반 지급 합계에서는 제외됩니다.
              </p>
            </div>

            <div className="surface-card-footer allowance-early-payout-actions">
              {earlyPayoutEditor.existingValue ? (
                <button
                  className="danger-button"
                  disabled={isProcessing}
                  onClick={() => {
                    void handleClearEarlyPayout();
                  }}
                  type="button"
                >
                  {processingKey === `early-payout:${earlyPayoutEditor.calculationId}`
                    ? "취소 중..."
                    : "선지급 취소"}
                </button>
              ) : null}
              <button
                className="ghost-button"
                disabled={isProcessing}
                onClick={() => {
                  setEarlyPayoutEditor(null);
                }}
                type="button"
              >
                취소
              </button>
              <button
                className="primary-button"
                disabled={isProcessing || Boolean(earlyPayoutEditor.existingValue)}
                onClick={() => {
                  void handleSaveEarlyPayout();
                }}
                type="button"
              >
                {processingKey === `early-payout:${earlyPayoutEditor.calculationId}`
                  ? "저장 중..."
                  : earlyPayoutEditor.existingValue
                    ? "선지급 승인"
                    : "선지급"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};
