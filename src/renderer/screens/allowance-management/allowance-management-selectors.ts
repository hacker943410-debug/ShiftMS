import type { AllowanceDocumentExportRecord } from "@shared/domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type {
  AllowanceApprovalRecord,
  AllowanceCalculationStatus,
  AllowanceHistoryStatusFilter,
  AllowanceProposalApprovalRecord,
  AllowanceProposalPreviewRow
} from "@shared/domain/allowance-workflow";
import type { AllowanceRateVersion, EmployeeRecord } from "@shared/domain/model";
import { selectActiveAllowanceRateVersion } from "../../../shared/domain/allowance-rate-service";

export type WorkTypeFilter = "all" | "substitute" | "overtime" | "holiday";
export type AllowanceWorkType = Exclude<WorkTypeFilter, "all">;
export type EmployeeCurrentStatusFilter = EmployeeRecord["status"] | "all";

export interface AllowanceHistoryRow {
  rowId: string;
  calculation: AllowanceCalculationResultRecord;
  registeredAt: string;
  latestExportedAt?: string;
  latestOutputFormat?: AllowanceDocumentExportRecord["outputFormat"];
  latestReviewedAt?: string;
  latestReviewedByName?: string;
  latestReviewComment?: string;
  proposalApproval?: AllowanceProposalApprovalRecord;
}

export interface AllowanceOverviewGroup {
  approvedCount: number;
  baseWorkMinutes: number;
  latestWorkDate: string;
  nightMinutes: number;
  overtimeMinutes: number;
  pendingCount: number;
  proposalApprovedCount: number;
  rejectedCount: number;
  rows: AllowanceCalculationResultRecord[];
  siteName: string;
  totalAllowanceAmount: number;
  totalWorkMinutes: number;
}

export interface AllowanceHistoryGroup {
  baseWorkMinutes: number;
  nightMinutes: number;
  overtimeMinutes: number;
  rows: AllowanceHistoryRow[];
  siteName: string;
  totalAllowanceAmount: number;
  totalWorkMinutes: number;
}

export interface SiteDistributionRow {
  amount: number;
  employeeCount: number;
  ratio: number;
  siteName: string;
  totalWorkMinutes: number;
}

export interface WorkTypeSegment {
  amount: number;
  color: string;
  label: string;
  minutes: number;
  percentage: number;
  type: AllowanceWorkType;
}

export interface WorkTypeDistribution {
  dominantRatio: number;
  dominantType: AllowanceWorkType;
  grandTotalAmount: number;
  segments: WorkTypeSegment[];
  totals: Record<AllowanceWorkType, { amount: number; minutes: number }>;
}

export const workTypeLabel: Record<AllowanceWorkType, string> = {
  substitute: "대체근무",
  overtime: "연장근무",
  holiday: "휴일근무"
};

export const workTypeColor: Record<AllowanceWorkType, string> = {
  substitute: "#5b88ff",
  overtime: "#ffb648",
  holiday: "#ff7f94"
};

const workTypeOrder: Record<AllowanceWorkType, number> = {
  substitute: 0,
  overtime: 1,
  holiday: 2
};

const orderedWorkTypes: AllowanceWorkType[] = ["substitute", "overtime", "holiday"];

const matchesYearMonth = (workDate: string, selectedYear: string, selectedMonth: string) => {
  if (selectedYear !== "all" && workDate.slice(0, 4) !== selectedYear) {
    return false;
  }

  if (selectedMonth && workDate.slice(5, 7) !== selectedMonth) {
    return false;
  }

  return true;
};

export const getWorkTypeFilter = (
  record: Pick<AllowanceCalculationResultRecord, "workType"> | Pick<AllowanceProposalPreviewRow, "workType">
): AllowanceWorkType =>
  record.workType === "substitute"
    ? "substitute"
    : record.workType === "holiday"
      ? "holiday"
      : "overtime";

export const sortCalculationResults = (rows: AllowanceCalculationResultRecord[]) =>
  [...rows].sort(
    (left, right) =>
      right.workDate.localeCompare(left.workDate) ||
      workTypeOrder[getWorkTypeFilter(left)] - workTypeOrder[getWorkTypeFilter(right)] ||
      left.employeeName.localeCompare(right.employeeName, "ko")
  );

export const sortHistoryRows = (rows: AllowanceHistoryRow[]) =>
  [...rows].sort(
    (left, right) =>
      right.registeredAt.localeCompare(left.registeredAt) ||
      right.calculation.workDate.localeCompare(left.calculation.workDate) ||
      workTypeOrder[getWorkTypeFilter(left.calculation)] -
        workTypeOrder[getWorkTypeFilter(right.calculation)] ||
      left.calculation.employeeName.localeCompare(right.calculation.employeeName, "ko") ||
      left.calculation.siteName.localeCompare(right.calculation.siteName, "ko")
  );

export const createEmployeeCurrentStatusResolver = (employees: EmployeeRecord[]) => {
  const employeeStatusByCode = new Map(employees.map((employee) => [employee.employeeCode, employee.status]));
  const employeeStatusByName = new Map(employees.map((employee) => [employee.name, employee.status]));

  return (record: Pick<AllowanceCalculationResultRecord, "employeeCode" | "employeeName">) =>
    employeeStatusByCode.get(record.employeeCode) ?? employeeStatusByName.get(record.employeeName);
};

export const buildAvailableYears = (
  results: AllowanceCalculationResultRecord[],
  fallbackYear: string
) => {
  const years = new Set<string>([fallbackYear]);
  results.forEach((item) => {
    years.add(item.workDate.slice(0, 4));
  });

  return [...years].sort((left, right) => Number(right) - Number(left));
};

export const buildOverviewSiteOptions = (input: {
  results: AllowanceCalculationResultRecord[];
  selectedYear: string;
  selectedMonth: string;
}) =>
  [
    ...new Set(
      input.results
        .filter((result) => matchesYearMonth(result.workDate, input.selectedYear, input.selectedMonth))
        .map((result) => result.siteName)
    )
  ].sort((left, right) => left.localeCompare(right, "ko"));

export const buildVisibleResults = (input: {
  results: AllowanceCalculationResultRecord[];
  selectedYear: string;
  selectedMonth: string;
  selectedSite: string;
  keyword: string;
}) => {
  const normalizedKeyword = input.keyword.trim().toLowerCase();

  return sortCalculationResults(
    input.results.filter((result) => {
      if (!matchesYearMonth(result.workDate, input.selectedYear, input.selectedMonth)) {
        return false;
      }

      if (input.selectedSite !== "all" && result.siteName !== input.selectedSite) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return (
        result.employeeName.toLowerCase().includes(normalizedKeyword) ||
        result.siteName.toLowerCase().includes(normalizedKeyword) ||
        result.fileName.toLowerCase().includes(normalizedKeyword)
      );
    })
  );
};

export const resolveDisplayedRateVersion = (input: {
  versions: AllowanceRateVersion[];
  selectedYear: string;
  selectedMonth: string;
  visibleResults: AllowanceCalculationResultRecord[];
  fallbackDate: string;
  fallbackYear: string;
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
        ? `${input.selectedYear === "all" ? input.fallbackYear : input.selectedYear}-${input.selectedMonth}-01`
        : input.fallbackDate,
      versions: filteredVersions
    }) ?? filteredVersions[0] ?? null
  );
};

export const buildVisibleStatusSummary = (visibleResults: AllowanceCalculationResultRecord[]) =>
  visibleResults.reduce(
    (summary, result) => {
      summary[result.status] += 1;
      return summary;
    },
    {
      pending: 0,
      approved: 0,
      rejected: 0,
      "proposal-approved": 0
    } satisfies Record<AllowanceCalculationStatus, number>
  );

export const buildExportableResults = (visibleResults: AllowanceCalculationResultRecord[]) =>
  visibleResults.filter((result) => result.status === "approved" || result.status === "proposal-approved");

export const buildProposalCandidateResults = (visibleResults: AllowanceCalculationResultRecord[]) =>
  visibleResults.filter((result) => result.status === "approved");

export const sumTotalAllowanceAmount = (visibleResults: AllowanceCalculationResultRecord[]) =>
  visibleResults.reduce((sum, result) => sum + result.snapshot.totalAllowanceAmount, 0);

export const countCalculatedEmployees = (visibleResults: AllowanceCalculationResultRecord[]) =>
  new Set(visibleResults.map((result) => result.employeeCode || result.employeeName)).size;

export const buildSiteDistribution = (visibleResults: AllowanceCalculationResultRecord[]) => {
  const grouped = new Map<string, { amount: number; totalWorkMinutes: number; employees: Set<string> }>();

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
};

export const buildWorkTypeDistribution = (visibleResults: AllowanceCalculationResultRecord[]): WorkTypeDistribution => {
  const totals: WorkTypeDistribution["totals"] = {
    substitute: { amount: 0, minutes: 0 },
    overtime: { amount: 0, minutes: 0 },
    holiday: { amount: 0, minutes: 0 }
  };

  visibleResults.forEach((result) => {
    const type = getWorkTypeFilter(result);
    totals[type].amount += result.snapshot.totalAllowanceAmount;
    totals[type].minutes += result.snapshot.breakdown.totalWorkMinutes;
  });

  const grandTotalAmount = totals.substitute.amount + totals.overtime.amount + totals.holiday.amount;
  const segments = orderedWorkTypes.map((type) => ({
    type,
    label: workTypeLabel[type],
    color: workTypeColor[type],
    amount: totals[type].amount,
    minutes: totals[type].minutes,
    percentage: grandTotalAmount > 0 ? Math.round((totals[type].amount / grandTotalAmount) * 100) : 0
  }));
  const dominant = [...segments].sort((left, right) => right.amount - left.amount)[0];

  return {
    segments,
    totals,
    grandTotalAmount,
    dominantType: dominant?.type ?? "overtime",
    dominantRatio: dominant?.percentage ?? 0
  };
};

export const buildOverviewGroups = (visibleResults: AllowanceCalculationResultRecord[]): AllowanceOverviewGroup[] => {
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
      latestWorkDate: rows.reduce((latest, row) => (row.workDate > latest ? row.workDate : latest), ""),
      totalAllowanceAmount: rows.reduce((sum, row) => sum + row.snapshot.totalAllowanceAmount, 0),
      totalWorkMinutes: rows.reduce((sum, row) => sum + row.snapshot.breakdown.totalWorkMinutes, 0),
      baseWorkMinutes: rows.reduce((sum, row) => sum + row.snapshot.breakdown.baseWorkMinutes, 0),
      overtimeMinutes: rows.reduce((sum, row) => sum + row.snapshot.breakdown.overtimeMinutes, 0),
      nightMinutes: rows.reduce((sum, row) => sum + row.snapshot.breakdown.nightMinutes, 0),
      pendingCount: rows.filter((row) => row.status === "pending").length,
      approvedCount: rows.filter((row) => row.status === "approved").length,
      rejectedCount: rows.filter((row) => row.status === "rejected").length,
      proposalApprovedCount: rows.filter((row) => row.status === "proposal-approved").length
    }))
    .sort(
      (left, right) =>
        right.latestWorkDate.localeCompare(left.latestWorkDate) ||
        right.totalAllowanceAmount - left.totalAllowanceAmount ||
        left.siteName.localeCompare(right.siteName, "ko")
    );
};

export const buildLatestDocumentExportByCalculationId = (documentExports: AllowanceDocumentExportRecord[]) => {
  const exportByCalculationId = new Map<string, AllowanceDocumentExportRecord>();

  [...documentExports]
    .sort((left, right) => right.exportedAt.localeCompare(left.exportedAt) || right.id.localeCompare(left.id))
    .forEach((record) => {
      record.calculationIds.forEach((calculationId) => {
        if (!exportByCalculationId.has(calculationId)) {
          exportByCalculationId.set(calculationId, record);
        }
      });
    });

  return exportByCalculationId;
};

export const buildLatestApprovalByCalculationId = (approvalHistory: AllowanceApprovalRecord[]) => {
  const recordByCalculationId = new Map<string, AllowanceApprovalRecord>();

  [...approvalHistory]
    .sort((left, right) => right.processedAt.localeCompare(left.processedAt) || right.id.localeCompare(left.id))
    .forEach((record) => {
      if (!recordByCalculationId.has(record.calculationId)) {
        recordByCalculationId.set(record.calculationId, record);
      }
    });

  return recordByCalculationId;
};

export const buildLatestProposalApprovalByCalculationId = (
  proposalApprovals: AllowanceProposalApprovalRecord[]
) => {
  const recordByCalculationId = new Map<string, AllowanceProposalApprovalRecord>();

  [...proposalApprovals]
    .sort((left, right) => right.approvedAt.localeCompare(left.approvedAt) || right.id.localeCompare(left.id))
    .forEach((record) => {
      record.calculationIds.forEach((calculationId) => {
        if (!recordByCalculationId.has(calculationId)) {
          recordByCalculationId.set(calculationId, record);
        }
      });
    });

  return recordByCalculationId;
};

export const buildHistoryRows = (input: {
  results: AllowanceCalculationResultRecord[];
  latestDocumentExportByCalculationId: Map<string, AllowanceDocumentExportRecord>;
  latestApprovalByCalculationId: Map<string, AllowanceApprovalRecord>;
  latestProposalApprovalByCalculationId: Map<string, AllowanceProposalApprovalRecord>;
}) =>
  sortHistoryRows(
    input.results.map((calculation) => {
      const latestExport = input.latestDocumentExportByCalculationId.get(calculation.id);
      const latestApproval = input.latestApprovalByCalculationId.get(calculation.id);
      const proposalApproval = input.latestProposalApprovalByCalculationId.get(calculation.id);

      return {
        rowId: calculation.id,
        calculation,
        registeredAt: calculation.snapshot.createdAt,
        latestExportedAt: latestExport?.exportedAt,
        latestOutputFormat: latestExport?.outputFormat,
        latestReviewedAt: latestApproval?.processedAt,
        latestReviewedByName: latestApproval?.processedByName,
        latestReviewComment: latestApproval?.comment,
        proposalApproval
      } satisfies AllowanceHistoryRow;
    })
  );

export const buildHistorySiteOptions = (input: {
  historyRows: AllowanceHistoryRow[];
  selectedYear: string;
  selectedMonth: string;
  selectedStatus: AllowanceHistoryStatusFilter;
}) =>
  [
    ...new Set(
      input.historyRows
        .filter((row) => {
          if (!matchesYearMonth(row.calculation.workDate, input.selectedYear, input.selectedMonth)) {
            return false;
          }

          if (input.selectedStatus !== "all" && row.calculation.status !== input.selectedStatus) {
            return false;
          }

          return true;
        })
        .map((row) => row.calculation.siteName)
    )
  ].sort((left, right) => left.localeCompare(right, "ko"));

export const buildHistoryEmployeeOptions = (input: {
  historyRows: AllowanceHistoryRow[];
  selectedYear: string;
  selectedMonth: string;
  selectedSite: string;
  selectedWorkType: WorkTypeFilter;
  selectedCurrentStatus: EmployeeCurrentStatusFilter;
  selectedStatus: AllowanceHistoryStatusFilter;
  resolveEmployeeCurrentStatus: ReturnType<typeof createEmployeeCurrentStatusResolver>;
}) =>
  [
    ...new Set(
      input.historyRows
        .filter((row) => {
          if (!matchesYearMonth(row.calculation.workDate, input.selectedYear, input.selectedMonth)) {
            return false;
          }

          if (input.selectedSite !== "all" && row.calculation.siteName !== input.selectedSite) {
            return false;
          }

          if (
            input.selectedWorkType !== "all" &&
            getWorkTypeFilter(row.calculation) !== input.selectedWorkType
          ) {
            return false;
          }

          if (
            input.selectedCurrentStatus !== "all" &&
            input.resolveEmployeeCurrentStatus(row.calculation) !== input.selectedCurrentStatus
          ) {
            return false;
          }

          if (input.selectedStatus !== "all" && row.calculation.status !== input.selectedStatus) {
            return false;
          }

          return true;
        })
        .map((row) => row.calculation.employeeName)
    )
  ].sort((left, right) => left.localeCompare(right, "ko"));

export const buildVisibleHistoryRows = (input: {
  historyRows: AllowanceHistoryRow[];
  selectedYear: string;
  selectedMonth: string;
  selectedSite: string;
  selectedWorkType: WorkTypeFilter;
  selectedCurrentStatus: EmployeeCurrentStatusFilter;
  selectedStatus: AllowanceHistoryStatusFilter;
  selectedEmployee: string;
  resolveEmployeeCurrentStatus: ReturnType<typeof createEmployeeCurrentStatusResolver>;
}) =>
  sortHistoryRows(
    input.historyRows.filter((row) => {
      if (!matchesYearMonth(row.calculation.workDate, input.selectedYear, input.selectedMonth)) {
        return false;
      }

      if (input.selectedSite !== "all" && row.calculation.siteName !== input.selectedSite) {
        return false;
      }

      if (input.selectedWorkType !== "all" && getWorkTypeFilter(row.calculation) !== input.selectedWorkType) {
        return false;
      }

      if (
        input.selectedCurrentStatus !== "all" &&
        input.resolveEmployeeCurrentStatus(row.calculation) !== input.selectedCurrentStatus
      ) {
        return false;
      }

      if (input.selectedStatus !== "all" && row.calculation.status !== input.selectedStatus) {
        return false;
      }

      if (input.selectedEmployee !== "all" && row.calculation.employeeName !== input.selectedEmployee) {
        return false;
      }

      return true;
    })
  );

export const buildHistoryGroups = (visibleHistoryRows: AllowanceHistoryRow[]): AllowanceHistoryGroup[] => {
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
};

export const buildVisibleProposalApprovals = (input: {
  proposalApprovals: AllowanceProposalApprovalRecord[];
  selectedYear: string;
  selectedMonth: string;
  selectedSite: string;
  selectedEmployee: string;
  selectedWorkType: WorkTypeFilter;
  selectedCurrentStatus: EmployeeCurrentStatusFilter;
  selectedStatus: AllowanceHistoryStatusFilter;
  resolveEmployeeCurrentStatus: ReturnType<typeof createEmployeeCurrentStatusResolver>;
}) =>
  [...input.proposalApprovals]
    .filter((record) => {
      if (!matchesYearMonth(record.workMonth, input.selectedYear, input.selectedMonth)) {
        return false;
      }

      if (input.selectedStatus !== "all" && input.selectedStatus !== "proposal-approved") {
        return false;
      }

      if (
        input.selectedSite !== "all" &&
        !record.previewSnapshot.rows.some((row) => row.siteName === input.selectedSite)
      ) {
        return false;
      }

      if (
        input.selectedEmployee !== "all" &&
        !record.previewSnapshot.rows.some((row) => row.employeeName === input.selectedEmployee)
      ) {
        return false;
      }

      if (
        input.selectedWorkType !== "all" &&
        !record.previewSnapshot.rows.some((row) => getWorkTypeFilter({ workType: row.workType }) === input.selectedWorkType)
      ) {
        return false;
      }

      if (
        input.selectedCurrentStatus !== "all" &&
        !record.previewSnapshot.rows.some(
          (row) =>
            input.resolveEmployeeCurrentStatus({
              employeeCode: row.employeeCode,
              employeeName: row.employeeName
            }) === input.selectedCurrentStatus
        )
      ) {
        return false;
      }

      return true;
    })
    .sort((left, right) => right.approvedAt.localeCompare(left.approvedAt) || right.id.localeCompare(left.id));
