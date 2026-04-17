import type { DashboardChartExportFilterSummary } from "@shared/bridge/contracts";

import type { DashboardFilterState } from "./useDashboardFilterState";
import {
  type DashboardBusinessCategory,
  type DashboardRecord,
  createMonthRange,
  getDashboardFilterRange,
  isYearMonthInRange,
  matchesDashboardRecordFilters
} from "./dashboard-records";

type DashboardChangeTone = "" | "is-up" | "is-down";

export interface DashboardAggregate {
  totalMinutes: number;
  totalAllowanceAmount: number;
  substituteMinutes: number;
  substituteAllowanceAmount: number;
  overtimeMinutes: number;
  overtimeAllowanceAmount: number;
  legalHolidayMinutes: number;
  legalHolidayAllowanceAmount: number;
}

export interface DashboardMetric {
  label: string;
  value: string;
  changeText: string;
  changeTone: DashboardChangeTone;
  tone: "time" | "money";
}

export interface DashboardMonthlyTrend {
  yearMonth: string;
  label: string;
  overtimeAmount: number;
  substituteAmount: number;
  legalHolidayAmount: number;
}

export interface DashboardSiteAllowance {
  siteId: string;
  siteName: string;
  overtimeAmount: number;
  substituteAmount: number;
  legalHolidayAmount: number;
  totalAmount: number;
}

export interface DashboardRatioItem {
  category: DashboardBusinessCategory;
  label: string;
  amount: number;
  ratio: number;
}

export interface DashboardTopPerformer {
  employeeName: string;
  siteName: string;
  minutes: number;
  allowanceAmount: number;
}

const TREND_MONTH_COUNT = 6;

const categoryAllowanceLabels: Record<DashboardBusinessCategory, string> = {
  substitute: "대체수당",
  overtime: "연장수당",
  legalHoliday: "법정공휴일수당"
};

const rankingMinutesForRecord = (record: DashboardRecord) =>
  record.businessCategory === "overtime" ? record.overtimeMinutes : record.totalWorkMinutes;

const hourFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});

const currencyFormatter = new Intl.NumberFormat("ko-KR");

const formatHoursFromMinutes = (minutes: number) => `${hourFormatter.format(minutes / 60)}시간`;
const formatCurrency = (amount: number) => `${currencyFormatter.format(Math.round(amount))}원`;

const createEmptyAggregate = (): DashboardAggregate => ({
  totalMinutes: 0,
  totalAllowanceAmount: 0,
  substituteMinutes: 0,
  substituteAllowanceAmount: 0,
  overtimeMinutes: 0,
  overtimeAllowanceAmount: 0,
  legalHolidayMinutes: 0,
  legalHolidayAllowanceAmount: 0
});

const buildChangeMeta = (
  currentValue: number,
  previousValue: number
): { text: string; tone: DashboardChangeTone } => {
  if (currentValue === 0 && previousValue === 0) {
    return { text: "0%", tone: "" };
  }

  if (previousValue <= 0 && currentValue > 0) {
    return { text: "신규", tone: "is-up" };
  }

  if (currentValue === previousValue) {
    return { text: "0%", tone: "" };
  }

  const changeRate = Math.round((Math.abs(currentValue - previousValue) / previousValue) * 100);

  return currentValue > previousValue
    ? { text: `${changeRate}% ▲`, tone: "is-up" }
    : { text: `${changeRate}% ▼`, tone: "is-down" };
};

const buildMetric = (
  label: string,
  currentValue: number,
  previousValue: number,
  tone: "time" | "money",
  formatter: (value: number) => string
): DashboardMetric => {
  const change = buildChangeMeta(currentValue, previousValue);

  return {
    label,
    value: formatter(currentValue),
    changeText: change.text,
    changeTone: change.tone,
    tone
  };
};

const shiftYearMonth = (yearMonth: string, offset: number) => {
  const [yearText, monthText] = yearMonth.split("-");
  const baseDate = new Date(Number(yearText), Number(monthText) - 1 + offset, 1);

  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}`;
};

const getYearMonthIndex = (yearMonth: string) => {
  const [yearText, monthText] = yearMonth.split("-");

  return Number(yearText) * 12 + Number(monthText) - 1;
};

const getPreviousFilterRange = (range: ReturnType<typeof getDashboardFilterRange>) => {
  const monthCount =
    getYearMonthIndex(range.endYearMonth) - getYearMonthIndex(range.startYearMonth) + 1;
  const endYearMonth = shiftYearMonth(range.startYearMonth, -1);
  const startYearMonth = shiftYearMonth(endYearMonth, -(monthCount - 1));

  return { startYearMonth, endYearMonth };
};

const formatYearMonthLabel = (yearMonth: string) =>
  `${yearMonth.slice(0, 4)}년 ${Number(yearMonth.slice(5, 7))}월`;

const getLatestMonthInYear = (records: DashboardRecord[], year: string) =>
  [...new Set(records.filter((record) => record.year === year).map((record) => record.yearMonth))]
    .sort((left, right) => left.localeCompare(right))
    .pop() ?? `${year}-12`;

const buildTrendWindow = (anchorYearMonth: string) =>
  Array.from({ length: TREND_MONTH_COUNT }, (_, index) =>
    shiftYearMonth(anchorYearMonth, index - (TREND_MONTH_COUNT - 1))
  );

const formatMonthLabel = (yearMonth: string) => `${yearMonth.slice(0, 4)}.${yearMonth.slice(5, 7)}`;

export const aggregateDashboardRecords = (records: DashboardRecord[]): DashboardAggregate =>
  records.reduce<DashboardAggregate>((aggregate, record) => {
    aggregate.totalMinutes += record.totalWorkMinutes;
    aggregate.totalAllowanceAmount += record.totalAllowanceAmount;

    if (record.businessCategory === "substitute") {
      aggregate.substituteMinutes += record.totalWorkMinutes;
      aggregate.substituteAllowanceAmount += record.totalAllowanceAmount;
    }

    if (record.businessCategory === "overtime") {
      aggregate.overtimeMinutes += record.totalWorkMinutes;
      aggregate.overtimeAllowanceAmount += record.totalAllowanceAmount;
    }

    if (record.businessCategory === "legalHoliday") {
      aggregate.legalHolidayMinutes += record.totalWorkMinutes;
      aggregate.legalHolidayAllowanceAmount += record.totalAllowanceAmount;
    }

    return aggregate;
  }, createEmptyAggregate());

export const buildDashboardMetrics = ({
  currentAggregate,
  previousAggregate
}: {
  currentAggregate: DashboardAggregate;
  previousAggregate: DashboardAggregate;
}): DashboardMetric[] => [
  buildMetric(
    "총 근로시간",
    currentAggregate.totalMinutes,
    previousAggregate.totalMinutes,
    "time",
    formatHoursFromMinutes
  ),
  buildMetric(
    "대체근로시간",
    currentAggregate.substituteMinutes,
    previousAggregate.substituteMinutes,
    "time",
    formatHoursFromMinutes
  ),
  buildMetric(
    "연장근로시간",
    currentAggregate.overtimeMinutes,
    previousAggregate.overtimeMinutes,
    "time",
    formatHoursFromMinutes
  ),
  buildMetric(
    "법정공휴일근로시간",
    currentAggregate.legalHolidayMinutes,
    previousAggregate.legalHolidayMinutes,
    "time",
    formatHoursFromMinutes
  ),
  buildMetric(
    "총 지급수당",
    currentAggregate.totalAllowanceAmount,
    previousAggregate.totalAllowanceAmount,
    "money",
    formatCurrency
  ),
  buildMetric(
    "대체근로수당",
    currentAggregate.substituteAllowanceAmount,
    previousAggregate.substituteAllowanceAmount,
    "money",
    formatCurrency
  ),
  buildMetric(
    "연장근로수당",
    currentAggregate.overtimeAllowanceAmount,
    previousAggregate.overtimeAllowanceAmount,
    "money",
    formatCurrency
  ),
  buildMetric(
    "법정공휴일수당",
    currentAggregate.legalHolidayAllowanceAmount,
    previousAggregate.legalHolidayAllowanceAmount,
    "money",
    formatCurrency
  )
];

export const buildPreviousDashboardRecords = ({
  allOptionValue,
  appliedFilters,
  dashboardRecords
}: {
  allOptionValue: string;
  appliedFilters: DashboardFilterState;
  dashboardRecords: DashboardRecord[];
}) => {
  const previousRange = getPreviousFilterRange(getDashboardFilterRange(appliedFilters));

  return dashboardRecords.filter(
    (record) =>
      isYearMonthInRange(record.yearMonth, previousRange) &&
      matchesDashboardRecordFilters(record, appliedFilters, {
        allOptionValue,
        ignorePeriod: true
      })
  );
};

export const buildDashboardTrendItems = ({
  allOptionValue,
  appliedFilters,
  dashboardRecords
}: {
  allOptionValue: string;
  appliedFilters: DashboardFilterState;
  dashboardRecords: DashboardRecord[];
}): DashboardMonthlyTrend[] => {
  const trendBaseRecords = dashboardRecords.filter((record) => {
    if (appliedFilters.siteId !== allOptionValue && record.siteId !== appliedFilters.siteId) {
      return false;
    }

    if (appliedFilters.employeeName !== allOptionValue && record.employeeName !== appliedFilters.employeeName) {
      return false;
    }

    return true;
  });

  const trendRange = getDashboardFilterRange(appliedFilters);
  const trendYearMonths =
    appliedFilters.periodMode === "range"
      ? createMonthRange(trendRange.startYearMonth, trendRange.endYearMonth)
      : buildTrendWindow(
          appliedFilters.month !== allOptionValue
            ? `${appliedFilters.year}-${appliedFilters.month}`
            : getLatestMonthInYear(trendBaseRecords, appliedFilters.year)
        );

  return trendYearMonths.map((yearMonth) => {
    const monthRecords = trendBaseRecords.filter((record) => record.yearMonth === yearMonth);
    const aggregate = aggregateDashboardRecords(monthRecords);

    return {
      yearMonth,
      label: formatMonthLabel(yearMonth),
      overtimeAmount: aggregate.overtimeAllowanceAmount,
      substituteAmount: aggregate.substituteAllowanceAmount,
      legalHolidayAmount: aggregate.legalHolidayAllowanceAmount
    };
  });
};

export const buildDashboardSiteChartItems = (
  filteredRecords: DashboardRecord[]
): DashboardSiteAllowance[] => {
  const siteMap = new Map<string, DashboardSiteAllowance>();

  filteredRecords.forEach((record) => {
    const current =
      siteMap.get(record.siteId) ??
      {
        siteId: record.siteId,
        siteName: record.siteName,
        overtimeAmount: 0,
        substituteAmount: 0,
        legalHolidayAmount: 0,
        totalAmount: 0
      };

    current.totalAmount += record.totalAllowanceAmount;

    if (record.businessCategory === "overtime") {
      current.overtimeAmount += record.totalAllowanceAmount;
    }

    if (record.businessCategory === "substitute") {
      current.substituteAmount += record.totalAllowanceAmount;
    }

    if (record.businessCategory === "legalHoliday") {
      current.legalHolidayAmount += record.totalAllowanceAmount;
    }

    siteMap.set(record.siteId, current);
  });

  return [...siteMap.values()].sort((left, right) => right.totalAmount - left.totalAmount);
};

export const buildDashboardRatioItems = (
  currentAggregate: DashboardAggregate
): DashboardRatioItem[] => {
  const totalAmount = currentAggregate.totalAllowanceAmount;

  return [
    {
      category: "overtime",
      label: categoryAllowanceLabels.overtime,
      amount: currentAggregate.overtimeAllowanceAmount,
      ratio: totalAmount > 0 ? currentAggregate.overtimeAllowanceAmount / totalAmount : 0
    },
    {
      category: "substitute",
      label: categoryAllowanceLabels.substitute,
      amount: currentAggregate.substituteAllowanceAmount,
      ratio: totalAmount > 0 ? currentAggregate.substituteAllowanceAmount / totalAmount : 0
    },
    {
      category: "legalHoliday",
      label: categoryAllowanceLabels.legalHoliday,
      amount: currentAggregate.legalHolidayAllowanceAmount,
      ratio: totalAmount > 0 ? currentAggregate.legalHolidayAllowanceAmount / totalAmount : 0
    }
  ];
};

export const buildDashboardTopPerformersByCategory = (
  filteredRecords: DashboardRecord[]
): Record<DashboardBusinessCategory, DashboardTopPerformer[]> => {
  const rankingMaps: Record<DashboardBusinessCategory, Map<string, DashboardTopPerformer>> = {
    legalHoliday: new Map<string, DashboardTopPerformer>(),
    substitute: new Map<string, DashboardTopPerformer>(),
    overtime: new Map<string, DashboardTopPerformer>()
  };

  filteredRecords.forEach((record) => {
    const rankingMinutes = rankingMinutesForRecord(record);

    if (rankingMinutes <= 0) {
      return;
    }

    const rankingMap = rankingMaps[record.businessCategory];
    const key = `${record.employeeName}:${record.siteId}`;
    const current =
      rankingMap.get(key) ??
      {
        employeeName: record.employeeName,
        siteName: record.siteName,
        minutes: 0,
        allowanceAmount: 0
      };

    current.minutes += rankingMinutes;
    current.allowanceAmount += (record.hourlyRate * rankingMinutes) / 60;
    rankingMap.set(key, current);
  });

  return {
    legalHoliday: [...rankingMaps.legalHoliday.values()]
      .sort((left, right) => right.minutes - left.minutes)
      .slice(0, 10),
    substitute: [...rankingMaps.substitute.values()]
      .sort((left, right) => right.minutes - left.minutes)
      .slice(0, 10),
    overtime: [...rankingMaps.overtime.values()]
      .sort((left, right) => right.minutes - left.minutes)
      .slice(0, 10)
  };
};

export const formatDashboardPeriodLabel = (
  filters: DashboardFilterState,
  allOptionValue = "all"
) => {
  const range = getDashboardFilterRange(filters);

  if (filters.periodMode === "range") {
    return range.startYearMonth === range.endYearMonth
      ? formatYearMonthLabel(range.startYearMonth)
      : `${formatYearMonthLabel(range.startYearMonth)} ~ ${formatYearMonthLabel(range.endYearMonth)}`;
  }

  if (filters.month === allOptionValue) {
    return `${filters.year}년 전체`;
  }

  return formatYearMonthLabel(range.startYearMonth);
};

export const buildDashboardFilterSummary = ({
  allOptionValue,
  appliedFilters,
  hasRealDashboardRecords,
  isUsingDemoData,
  siteOptions
}: {
  allOptionValue: string;
  appliedFilters: DashboardFilterState;
  hasRealDashboardRecords: boolean;
  isUsingDemoData: boolean;
  siteOptions: Array<{ id: string; label: string }>;
}): DashboardChartExportFilterSummary => {
  const selectedSite = siteOptions.find((option) => option.id === appliedFilters.siteId);
  const periodLabel = formatDashboardPeriodLabel(appliedFilters, allOptionValue);

  return {
    year: appliedFilters.periodMode === "range" ? "기간 직접 지정" : `${appliedFilters.year}년`,
    month:
      appliedFilters.periodMode === "range"
        ? periodLabel
        : appliedFilters.month === allOptionValue
          ? "전체"
          : `${Number(appliedFilters.month)}월`,
    periodLabel,
    siteName: selectedSite?.label ?? "전체",
    employeeName: appliedFilters.employeeName === allOptionValue ? "전체" : appliedFilters.employeeName,
    dataSource: isUsingDemoData ? "샘플 데이터" : hasRealDashboardRecords ? "실데이터" : "데이터 없음"
  };
};
