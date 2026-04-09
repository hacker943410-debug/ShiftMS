import { useEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject } from "react";

import type { EChartsOption } from "echarts";

import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import {
  resolveAllowanceRateCategoryCode,
  resolveAllowanceSummaryCategory
} from "@shared/domain/allowance-rate-matrix";
import type {
  DashboardChartExportInput,
  DashboardReportExportInput
} from "@shared/bridge/contracts";
import type { EmployeeRecord, SiteRecord } from "@shared/domain/model";

import { EChartPanel, type EChartPanelHandle } from "../components/EChartPanel";
import { FormSelect } from "../components/FormSelect";
import { useAppWorkflow } from "../contexts/app-workflow-context";

type DashboardBusinessCategory = "substitute" | "overtime" | "legalHoliday";
type DashboardChangeTone = "" | "is-up" | "is-down";

interface DashboardFilterState {
  year: string;
  month: string;
  siteId: string;
  employeeName: string;
}

interface DashboardRecord {
  id: string;
  approvalId: string;
  employeeCode: string;
  employeeName: string;
  siteId: string;
  siteName: string;
  workDate: string;
  year: string;
  yearMonth: string;
  businessCategory: DashboardBusinessCategory;
  totalWorkMinutes: number;
  overtimeMinutes: number;
  hourlyRate: number;
  totalAllowanceAmount: number;
}

interface DashboardAggregate {
  totalMinutes: number;
  totalAllowanceAmount: number;
  substituteMinutes: number;
  substituteAllowanceAmount: number;
  overtimeMinutes: number;
  overtimeAllowanceAmount: number;
  legalHolidayMinutes: number;
  legalHolidayAllowanceAmount: number;
}

interface DashboardMetric {
  label: string;
  value: string;
  changeText: string;
  changeTone: DashboardChangeTone;
  tone: "time" | "money";
}

interface DashboardMonthlyTrend {
  yearMonth: string;
  label: string;
  overtimeAmount: number;
  substituteAmount: number;
  legalHolidayAmount: number;
}

interface DashboardSiteAllowance {
  siteId: string;
  siteName: string;
  overtimeAmount: number;
  substituteAmount: number;
  legalHolidayAmount: number;
  totalAmount: number;
}

interface DashboardRatioItem {
  category: DashboardBusinessCategory;
  label: string;
  amount: number;
  ratio: number;
}

interface DashboardTopPerformer {
  employeeName: string;
  siteName: string;
  minutes: number;
  allowanceAmount: number;
}

interface DashboardRankingTab {
  key: DashboardBusinessCategory;
  label: string;
}

interface DashboardSiteOption {
  id: string;
  label: string;
}

type DashboardExportFormat = "xlsx" | "pdf";

interface ChartPoint {
  x: number;
  y: number;
}

interface DemoSiteSeed {
  id: string;
  name: string;
  employeeNames: string[];
}

const ALL_OPTION = "all";
const TREND_MONTH_COUNT = 6;
const DEFAULT_AXIS_STEPS = 5;
const MAN_UNIT_DIVISOR = 10_000;
const DEMO_START_YEAR_MONTH = "2025-01";
const DEMO_END_YEAR_MONTH = "2026-02";

const fallbackDemoSiteSeeds: DemoSiteSeed[] = [
  {
    id: "demo-site-boramae",
    name: "보라매DC",
    employeeNames: ["김현수", "이민호", "박지훈", "정우성"]
  },
  {
    id: "demo-site-sillim",
    name: "신림Site",
    employeeNames: ["최유진", "한소희", "윤태성", "서지안"]
  },
  {
    id: "demo-site-hq",
    name: "본사",
    employeeNames: ["강민수", "오세훈", "문하린", "조은별"]
  },
  {
    id: "demo-site-anyang",
    name: "안양센터",
    employeeNames: ["장도윤", "송지우", "권예준", "배수아"]
  }
];

const categoryAllowanceLabels: Record<DashboardBusinessCategory, string> = {
  substitute: "대체수당",
  overtime: "연장수당",
  legalHoliday: "법정공휴일수당"
};

const rankingTabItems: DashboardRankingTab[] = [
  { key: "legalHoliday", label: "법정휴일" },
  { key: "substitute", label: "대체근무" },
  { key: "overtime", label: "연장근무" }
];

const categoryColors: Record<DashboardBusinessCategory, string> = {
  overtime: "#2f79c4",
  substitute: "#3da765",
  legalHoliday: "#e39a2d"
};

const hourFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});

const currencyFormatter = new Intl.NumberFormat("ko-KR");
const chartFontFamily = "\"Pretendard Variable\", \"Pretendard\", \"Noto Sans KR\", sans-serif";
const enableDashboardDemoFallback = import.meta.env.DEV;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "데이터를 불러오는 중 오류가 발생했습니다.";

const normalizeTextKey = (value: string) => value.replace(/\s+/g, "").toLowerCase();

const createDefaultFilters = (selectedMonth: string, selectedSiteId: string): DashboardFilterState => {
  const hasSelectedMonth = /^\d{4}-\d{2}$/.test(selectedMonth);

  return {
    year: hasSelectedMonth ? selectedMonth.slice(0, 4) : String(new Date().getFullYear()),
    month: hasSelectedMonth ? selectedMonth.slice(5, 7) : ALL_OPTION,
    siteId: selectedSiteId || ALL_OPTION,
    employeeName: ALL_OPTION
  };
};

const formatHoursFromMinutes = (minutes: number) => `${hourFormatter.format(minutes / 60)}시간`;

const formatHoursShortFromMinutes = (minutes: number) => `${(minutes / 60).toFixed(1)}h`;

const formatCurrency = (amount: number) => `${currencyFormatter.format(Math.round(amount))}원`;
const formatNumberValue = (amount: number) => currencyFormatter.format(Math.round(amount));
const formatPercentText = (ratio: number) => `${Number((ratio * 100).toFixed(1))}%`;

const formatManUnitAxisValue = (amount: number) =>
  currencyFormatter.format(Math.max(0, Math.round(amount / MAN_UNIT_DIVISOR)));

const formatMonthLabel = (yearMonth: string) => `${Number(yearMonth.slice(5, 7))}월`;
const formatRatioPercent = (ratio: number) => Number((ratio * 100).toFixed(1));

const createSyntheticSiteId = (siteName: string) => `site:${normalizeTextKey(siteName)}`;

const getRankingMinutesForRecord = (record: DashboardRecord) =>
  record.businessCategory === "overtime" ? record.overtimeMinutes : record.totalWorkMinutes;

const createMonthRange = (startYearMonth: string, endYearMonth: string) => {
  const months: string[] = [];
  const [startYear, startMonth] = startYearMonth.split("-").map(Number);
  const [endYear, endMonth] = endYearMonth.split("-").map(Number);
  let cursor = new Date(startYear, startMonth - 1, 1);
  const endCursor = new Date(endYear, endMonth - 1, 1);

  while (cursor <= endCursor) {
    months.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
    );
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return months;
};

const demoYearMonths = createMonthRange(DEMO_START_YEAR_MONTH, DEMO_END_YEAR_MONTH);

const createHashSeed = (...parts: Array<string | number>) =>
  parts.join(":").split("").reduce((sum, character, index) => sum + character.charCodeAt(0) * (index + 3), 0);

const createDemoEmployeeNames = (siteName: string) => {
  const normalized = normalizeTextKey(siteName);

  if (normalized.includes("보라매")) {
    return ["김현수", "이민호", "박지훈", "정우성"];
  }

  if (normalized.includes("신림")) {
    return ["최유진", "한소희", "윤태성", "서지안"];
  }

  if (normalized.includes("본사")) {
    return ["강민수", "오세훈", "문하린", "조은별"];
  }

  return ["장도윤", "송지우", "권예준", "배수아"];
};

const buildDemoSiteSeeds = (sites: SiteRecord[], employees: EmployeeRecord[]): DemoSiteSeed[] => {
  if (sites.length === 0) {
    return fallbackDemoSiteSeeds;
  }

  return sites.map((site, siteIndex) => {
    const assignedEmployees = employees
      .filter(
        (employee) =>
          employee.currentSiteId === site.id ||
          normalizeTextKey(employee.currentSiteName ?? "") === normalizeTextKey(site.name)
      )
      .map((employee) => employee.name)
      .filter((name, index, collection) => name.length > 0 && collection.indexOf(name) === index)
      .slice(0, 4);
    const fallbackNames = createDemoEmployeeNames(site.name);

    return {
      id: site.id || `demo-site-${siteIndex + 1}`,
      name: site.name,
      employeeNames: [...assignedEmployees, ...fallbackNames].slice(0, 4)
    };
  });
};

const createDemoDashboardRecords = (sites: SiteRecord[], employees: EmployeeRecord[]): DashboardRecord[] => {
  const siteSeeds = buildDemoSiteSeeds(sites, employees);
  const records: DashboardRecord[] = [];
  const categoryOrder: DashboardBusinessCategory[] = ["substitute", "overtime", "legalHoliday"];
  const categoryMultipliers: Record<DashboardBusinessCategory, number> = {
    substitute: 1.05,
    overtime: 1.52,
    legalHoliday: 1.88
  };

  demoYearMonths.forEach((yearMonth, monthIndex) => {
    siteSeeds.forEach((siteSeed, siteIndex) => {
      siteSeed.employeeNames.forEach((employeeName, employeeIndex) => {
        categoryOrder.forEach((category, categoryIndex) => {
          const hashSeed = createHashSeed(yearMonth, siteSeed.id, employeeName, category);
          const seasonalBoost = monthIndex < 8 ? monthIndex * 18 : 144 + (monthIndex - 8) * 26;
          const siteWeight = siteIndex * 34;
          const employeeWeight = employeeIndex * 19;
          const baseMinutes =
            category === "substitute"
              ? 170
              : category === "overtime"
                ? 230
                : 145;
          const totalWorkMinutes =
            baseMinutes +
            seasonalBoost +
            siteWeight +
            employeeWeight +
            (hashSeed % (category === "overtime" ? 140 : 95));
          const hourlyRate = 11200 + siteIndex * 450 + employeeIndex * 220;
          const totalAllowanceAmount = Math.round(
            (hourlyRate * totalWorkMinutes * categoryMultipliers[category]) / 60
          );
          const workDay = category === "substitute" ? "07" : category === "overtime" ? "16" : "25";

          records.push({
            id: `demo-${yearMonth}-${siteSeed.id}-${employeeIndex}-${category}`,
            approvalId: `demo-approval-${yearMonth}-${siteSeed.id}-${employeeIndex}-${category}`,
            employeeCode: `DEMO-${siteIndex + 1}${employeeIndex + 1}`.padEnd(8, "0"),
            employeeName,
            siteId: siteSeed.id,
            siteName: siteSeed.name,
            workDate: `${yearMonth}-${workDay}`,
            year: yearMonth.slice(0, 4),
            yearMonth,
            businessCategory: category,
            totalWorkMinutes,
            overtimeMinutes: category === "overtime" ? totalWorkMinutes : 0,
            hourlyRate,
            totalAllowanceAmount
          });
        });
      });
    });
  });

  return records;
};

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

const matchesFilters = (
  record: DashboardRecord,
  filters: DashboardFilterState,
  options?: { ignoreMonth?: boolean; ignoreEmployee?: boolean }
) => {
  if (record.year !== filters.year) {
    return false;
  }

  if (!options?.ignoreMonth && filters.month !== ALL_OPTION) {
    if (record.yearMonth !== `${filters.year}-${filters.month}`) {
      return false;
    }
  }

  if (filters.siteId !== ALL_OPTION && record.siteId !== filters.siteId) {
    return false;
  }

  if (!options?.ignoreEmployee && filters.employeeName !== ALL_OPTION) {
    if (record.employeeName !== filters.employeeName) {
      return false;
    }
  }

  return true;
};

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

const aggregateRecords = (records: DashboardRecord[]): DashboardAggregate =>
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

const buildTrendWindow = (anchorYearMonth: string) =>
  Array.from({ length: TREND_MONTH_COUNT }, (_, index) =>
    shiftYearMonth(anchorYearMonth, index - (TREND_MONTH_COUNT - 1))
  );

const roundUpAxisValue = (value: number) => {
  if (value <= 0) {
    return 100;
  }

  const magnitude = 10 ** Math.max(String(Math.floor(value)).length - 1, 0);
  const normalized = value / magnitude;

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
};

const createAxisSteps = (maxValue: number, stepCount = DEFAULT_AXIS_STEPS) => {
  const ceiling = roundUpAxisValue(maxValue);

  return Array.from({ length: stepCount }, (_, index) => {
    const ratio = 1 - index / (stepCount - 1);

    return Math.round(ceiling * ratio);
  });
};

const createChartPoints = (values: number[], maxValue: number): ChartPoint[] => {
  if (values.length === 1) {
    return [{ x: 50, y: 100 - (values[0] / maxValue) * 100 }];
  }

  return values.map((value, index) => ({
    x: (index / (values.length - 1)) * 100,
    y: 100 - (value / maxValue) * 100
  }));
};

const toPolylinePoints = (points: ChartPoint[]) =>
  points.map((point) => `${point.x},${point.y}`).join(" ");

const toAreaPath = (points: ChartPoint[]) => {
  if (points.length === 0) {
    return "";
  }

  const [firstPoint, ...restPoints] = points;

  return [
    `M ${firstPoint.x},100`,
    `L ${firstPoint.x},${firstPoint.y}`,
    ...restPoints.map((point) => `L ${point.x},${point.y}`),
    `L ${points[points.length - 1].x},100`,
    "Z"
  ].join(" ");
};

const getLatestMonthInYear = (records: DashboardRecord[], year: string) =>
  [...new Set(records.filter((record) => record.year === year).map((record) => record.yearMonth))]
    .sort((left, right) => left.localeCompare(right))
    .pop() ?? `${year}-12`;

const createDonutStyle = (items: DashboardRatioItem[]) => {
  const totalRatio = items.reduce((sum, item) => sum + item.ratio, 0);

  if (totalRatio <= 0) {
    return { background: "#e8edf5" };
  }

  let cursor = 0;
  const segments = items.map((item) => {
    const start = cursor;
    const end = cursor + item.ratio * 100;
    cursor = end;

    return `${categoryColors[item.category]} ${start}% ${end}%`;
  });

  if (cursor < 100) {
    segments.push(`#e8edf5 ${cursor}% 100%`);
  }

  return { background: `conic-gradient(${segments.join(", ")})` };
};

const MetricCard = ({ metric }: { metric: DashboardMetric }) => (
  <article
    className={
      metric.tone === "time"
        ? "dashboard-v2-metric-card dashboard-v2-metric-card--time"
        : "dashboard-v2-metric-card dashboard-v2-metric-card--money"
    }
  >
    <div className="dashboard-v2-metric-band">{metric.label}</div>
    <div className="dashboard-v2-metric-body">
      <strong>{metric.value}</strong>
      <span
        className={
          metric.changeTone
            ? `dashboard-v2-metric-change ${metric.changeTone}`
            : "dashboard-v2-metric-change"
        }
      >
        {metric.changeText}
      </span>
    </div>
  </article>
);

const DashboardEmptyState = ({ message }: { message: string }) => (
  <div className="allowance-empty-state">
    <strong>{message}</strong>
  </div>
);

const DashboardNotice = ({ message, title = "데이터 안내" }: { message: string; title?: string }) => (
  <section className="surface-card">
    <strong>{title}</strong>
    <span>{message}</span>
  </section>
);

const createDashboardExportActionKey = (
  scope: DashboardChartExportInput["chartKey"] | "all",
  format: DashboardExportFormat
) => `${scope}:${format}`;

const DashboardExportIconButton = ({
  format,
  isDisabled,
  isExporting,
  label,
  onExport
}: {
  format: DashboardExportFormat;
  isDisabled?: boolean;
  isExporting: boolean;
  label: string;
  onExport: () => void;
}) => (
  <button
    aria-label={label}
    className={`icon-button dashboard-export-icon-button ${format === "pdf" ? "is-pdf" : "is-excel"}${isExporting ? " is-busy" : ""}`}
    disabled={isExporting || isDisabled}
    onClick={onExport}
    title={label}
    type="button"
  >
    <span aria-hidden="true" className={`dashboard-export-icon ${format}`} />
  </button>
);

const DashboardExportActionGroup = ({
  disabled,
  exportTargetLabel,
  exportingFormat,
  onExport
}: {
  disabled?: boolean;
  exportTargetLabel: string;
  exportingFormat: DashboardExportFormat | null;
  onExport: (format: DashboardExportFormat) => void;
}) => (
  <div className="dashboard-export-action-group">
    <DashboardExportIconButton
      format="pdf"
      isDisabled={disabled}
      isExporting={exportingFormat === "pdf"}
      label={`${exportTargetLabel} PDF 내보내기`}
      onExport={() => {
        onExport("pdf");
      }}
    />
    <DashboardExportIconButton
      format="xlsx"
      isDisabled={disabled}
      isExporting={exportingFormat === "xlsx"}
      label={`${exportTargetLabel} Excel 내보내기`}
      onExport={() => {
        onExport("xlsx");
      }}
    />
  </div>
);

const TrendChart = ({
  chartRef,
  exportingFormat,
  isExportDisabled,
  items,
  onExport
}: {
  chartRef: RefObject<EChartPanelHandle | null>;
  exportingFormat: DashboardExportFormat | null;
  isExportDisabled?: boolean;
  items: DashboardMonthlyTrend[];
  onExport: (format: DashboardExportFormat) => void;
}) => {
  const option = useMemo<EChartsOption>(() => {
    const labels = items.map((item) => item.label);
    const seriesDefinition = [
      {
        color: categoryColors.overtime,
        lineType: "solid" as const,
        name: categoryAllowanceLabels.overtime,
        values: items.map((item) => item.overtimeAmount)
      },
      {
        color: categoryColors.substitute,
        lineType: "dashed" as const,
        name: categoryAllowanceLabels.substitute,
        values: items.map((item) => item.substituteAmount)
      },
      {
        color: categoryColors.legalHoliday,
        lineType: "dotted" as const,
        name: categoryAllowanceLabels.legalHoliday,
        values: items.map((item) => item.legalHolidayAmount)
      }
    ];

    return {
      animationDuration: 420,
      color: seriesDefinition.map((series) => series.color),
      grid: {
        top: 54,
        right: 6,
        bottom: 12,
        left: 6,
        containLabel: true
      },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 10,
        itemHeight: 10,
        icon: "roundRect",
        textStyle: {
          color: "#526175",
          fontFamily: chartFontFamily,
          fontSize: 12,
          fontWeight: 700
        }
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 28, 69, 0.96)",
        borderWidth: 0,
        padding: [10, 12],
        textStyle: {
          color: "#ffffff",
          fontFamily: chartFontFamily,
          fontSize: 12
        },
        axisPointer: {
          type: "line",
          lineStyle: {
            color: "rgba(62, 86, 182, 0.22)",
            width: 1
          }
        },
        formatter: (params) => {
          const itemsBySeries = Array.isArray(params) ? params : [params];
          const axisEntry = itemsBySeries[0] as { axisValue?: string | number; name?: string } | undefined;
          const header = String(axisEntry?.axisValue ?? axisEntry?.name ?? "");
          const rows = itemsBySeries
            .map((entry) => {
              const value = typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);

              return [
                "<div style=\"display:flex;justify-content:space-between;gap:16px;min-width:184px;\">",
                `<span style=\"display:inline-flex;align-items:center;gap:8px;\"><span style=\"width:8px;height:8px;border-radius:999px;background:${entry.color};display:inline-block;\"></span>${entry.seriesName}</span>`,
                `<strong>${formatCurrency(value)}</strong>`,
                "</div>"
              ].join("");
            })
            .join("");

          return `<div style="display:grid;gap:6px;"><strong>${header}</strong>${rows}</div>`;
        }
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: labels,
        axisLine: {
          lineStyle: {
            color: "#d6dde9"
          }
        },
        axisTick: {
          show: false
        },
        axisLabel: {
          color: "#586578",
          fontFamily: chartFontFamily,
          fontSize: 12,
          fontWeight: 700,
          margin: 12
        }
      },
      yAxis: {
        type: "value",
        min: 0,
        splitNumber: 4,
        axisLine: {
          show: false
        },
        axisTick: {
          show: false
        },
        axisLabel: {
          color: "#5b687b",
          fontFamily: chartFontFamily,
          fontSize: 12,
          fontWeight: 700,
          formatter: (value: number) => formatManUnitAxisValue(value)
        },
        splitLine: {
          lineStyle: {
            color: "#e3e9f2"
          }
        }
      },
      series: seriesDefinition.map((series) => ({
        type: "line",
        name: series.name,
        data: series.values,
        smooth: 0.28,
        symbol: "circle",
        symbolSize: 8,
        showSymbol: true,
        lineStyle: {
          color: series.color,
          type: series.lineType,
          width: 2.2
        },
        itemStyle: {
          color: series.color,
          borderColor: "#ffffff",
          borderWidth: 2
        },
        emphasis: {
          focus: "series",
          lineStyle: {
            width: 3
          }
        }
      }))
    };
  }, [items]);

  return (
    <>
      <div className="dashboard-v2-card-header">
        <h3>월별 수당 지급 추이 (최근 6개월)</h3>
        <div className="dashboard-v2-card-actions">
          <span className="dashboard-v2-unit-note">단위: 만원</span>
          <DashboardExportActionGroup
            disabled={isExportDisabled}
            exportTargetLabel="월별 수당 지급 추이"
            exportingFormat={exportingFormat}
            onExport={onExport}
          />
        </div>
      </div>
      <div className="dashboard-v2-chart-stage">
        <EChartPanel
          className="dashboard-echart-panel dashboard-echart-panel--trend"
          option={option}
          ref={chartRef}
        />
      </div>
    </>
  );
};

const SiteChart = ({
  chartRef,
  exportingFormat,
  isExportDisabled,
  items,
  onExport
}: {
  chartRef: RefObject<EChartPanelHandle | null>;
  exportingFormat: DashboardExportFormat | null;
  isExportDisabled?: boolean;
  items: DashboardSiteAllowance[];
  onExport: (format: DashboardExportFormat) => void;
}) => {
  const option = useMemo<EChartsOption>(() => ({
    animationDuration: 420,
    color: [categoryColors.overtime, categoryColors.substitute, categoryColors.legalHoliday],
    grid: {
      top: 54,
      left: 0,
      right: 76,
      bottom: 4,
      containLabel: true
    },
    legend: {
      top: 0,
      left: 0,
      data: [
        categoryAllowanceLabels.overtime,
        categoryAllowanceLabels.substitute,
        categoryAllowanceLabels.legalHoliday
      ],
      itemWidth: 10,
      itemHeight: 10,
      icon: "roundRect",
      textStyle: {
        color: "#526175",
        fontFamily: chartFontFamily,
        fontSize: 12,
        fontWeight: 700
      }
    },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
        shadowStyle: {
          color: "rgba(62, 86, 182, 0.08)"
        }
      },
      backgroundColor: "rgba(15, 28, 69, 0.96)",
      borderWidth: 0,
      padding: [10, 12],
      textStyle: {
        color: "#ffffff",
        fontFamily: chartFontFamily,
        fontSize: 12
      },
      formatter: (params) => {
        const itemsBySeries = Array.isArray(params) ? params : [params];
        const dataIndex = itemsBySeries[0]?.dataIndex ?? 0;
        const record = items[dataIndex];
        const rows = itemsBySeries
          .map((entry) => {
            const value = typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);
            const totalAmount = record?.totalAmount ?? 0;
            const ratioText =
              totalAmount > 0 && value > 0 ? formatPercentText(value / totalAmount) : "0%";

            return [
              "<div style=\"display:flex;justify-content:space-between;gap:16px;min-width:188px;\">",
              `<span style=\"display:inline-flex;align-items:center;gap:8px;\"><span style=\"width:8px;height:8px;border-radius:999px;background:${entry.color};display:inline-block;\"></span>${entry.seriesName}</span>`,
              `<strong>${formatCurrency(value)} · ${ratioText}</strong>`,
              "</div>"
            ].join("");
          })
          .join("");

        return [
          "<div style=\"display:grid;gap:6px;\">",
          `<strong>${record?.siteName ?? ""}</strong>`,
          rows,
          `<div style="display:flex;justify-content:space-between;gap:16px;border-top:1px solid rgba(255,255,255,0.12);padding-top:6px;"><span>합계</span><strong>${formatCurrency(record?.totalAmount ?? 0)}</strong></div>`,
          "</div>"
        ].join("");
      }
    },
    xAxis: {
      type: "value",
      axisLabel: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLine: {
        show: false
      },
      splitLine: {
        show: false
      }
    },
    yAxis: {
      type: "category",
      data: items.map((item) => item.siteName),
      axisTick: {
        show: false
      },
      axisLine: {
        show: false
      },
      axisLabel: {
        color: "#1f3047",
        fontFamily: chartFontFamily,
        fontSize: 13,
        fontWeight: 700
      }
    },
    series: [
      {
        name: categoryAllowanceLabels.overtime,
        type: "bar",
        stack: "total",
        barWidth: 16,
        data: items.map((item) => item.overtimeAmount),
        itemStyle: {
          borderRadius: [6, 0, 0, 6]
        },
        label: {
          show: true,
          position: "inside",
          color: "rgba(255,255,255,0.92)",
          fontFamily: chartFontFamily,
          fontSize: 11,
          fontWeight: 800,
          formatter: (params) => {
            const record = items[params.dataIndex];
            const totalAmount = record?.totalAmount ?? 0;
            const value = typeof params.value === "number" ? params.value : Number(params.value ?? 0);

            if (totalAmount <= 0 || value <= 0 || value / totalAmount < 0.18) {
              return "";
            }

            return formatPercentText(value / totalAmount);
          }
        }
      },
      {
        name: categoryAllowanceLabels.substitute,
        type: "bar",
        stack: "total",
        barWidth: 16,
        data: items.map((item) => item.substituteAmount),
        label: {
          show: true,
          position: "inside",
          color: "rgba(255,255,255,0.92)",
          fontFamily: chartFontFamily,
          fontSize: 11,
          fontWeight: 800,
          formatter: (params) => {
            const record = items[params.dataIndex];
            const totalAmount = record?.totalAmount ?? 0;
            const value = typeof params.value === "number" ? params.value : Number(params.value ?? 0);

            if (totalAmount <= 0 || value <= 0 || value / totalAmount < 0.18) {
              return "";
            }

            return formatPercentText(value / totalAmount);
          }
        }
      },
      {
        name: categoryAllowanceLabels.legalHoliday,
        type: "bar",
        stack: "total",
        barWidth: 16,
        data: items.map((item) => item.legalHolidayAmount),
        itemStyle: {
          borderRadius: [0, 6, 6, 0]
        },
        label: {
          show: true,
          position: "inside",
          color: "rgba(255,255,255,0.92)",
          fontFamily: chartFontFamily,
          fontSize: 11,
          fontWeight: 800,
          formatter: (params) => {
            const record = items[params.dataIndex];
            const totalAmount = record?.totalAmount ?? 0;
            const value = typeof params.value === "number" ? params.value : Number(params.value ?? 0);

            if (totalAmount <= 0 || value <= 0 || value / totalAmount < 0.18) {
              return "";
            }

            return formatPercentText(value / totalAmount);
          }
        }
      },
      {
        name: "__total_label__",
        type: "bar",
        silent: true,
        barGap: "-100%",
        barWidth: 16,
        z: 5,
        tooltip: {
          show: false
        },
        itemStyle: {
          color: "rgba(0,0,0,0)"
        },
        data: items.map((item) => item.totalAmount),
        label: {
          show: true,
          position: "right",
          distance: 12,
          color: "#5b697d",
          fontFamily: chartFontFamily,
          fontSize: 12,
          fontWeight: 800,
          formatter: (params) =>
            formatNumberValue(items[params.dataIndex]?.totalAmount ?? 0)
        }
      }
    ]
  }), [items]);

  return (
    <>
      <div className="dashboard-v2-card-header">
        <h3>근무지별 수당 현황</h3>
        <div className="dashboard-v2-card-actions">
          <span className="dashboard-v2-unit-note">단위: 원</span>
          <DashboardExportActionGroup
            disabled={isExportDisabled}
            exportTargetLabel="근무지별 수당 현황"
            exportingFormat={exportingFormat}
            onExport={onExport}
          />
        </div>
      </div>
      <div className="dashboard-v2-chart-stage">
        <EChartPanel
          className="dashboard-echart-panel dashboard-echart-panel--site"
          option={option}
          ref={chartRef}
        />
      </div>
    </>
  );
};

const RatioChart = ({
  chartRef,
  exportingFormat,
  isExportDisabled,
  items,
  onExport,
  totalAmount
}: {
  chartRef: RefObject<EChartPanelHandle | null>;
  exportingFormat: DashboardExportFormat | null;
  isExportDisabled?: boolean;
  items: DashboardRatioItem[];
  onExport: (format: DashboardExportFormat) => void;
  totalAmount: number;
}) => {
  const option = useMemo<EChartsOption>(() => ({
    animationDuration: 420,
    color: items.map((item) => categoryColors[item.category]),
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(15, 28, 69, 0.96)",
      borderWidth: 0,
      padding: [10, 12],
      textStyle: {
        color: "#ffffff",
        fontFamily: chartFontFamily,
        fontSize: 12
      },
      formatter: (params) => {
        const entry = Array.isArray(params) ? params[0] : params;
        const value = typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);
        const percent = typeof entry.percent === "number" ? entry.percent : 0;

        return `<div style="display:grid;gap:4px;"><strong>${entry.name}</strong><span>${formatCurrency(value)} (${Number(percent.toFixed(1))}%)</span></div>`;
      }
    },
    legend: {
      bottom: 0,
      left: "center",
      itemWidth: 10,
      itemHeight: 10,
      icon: "roundRect",
      textStyle: {
        color: "#405064",
        fontFamily: chartFontFamily,
        fontSize: 12,
        fontWeight: 700
      }
    },
    graphic: [
      {
        type: "text",
        left: "center",
        top: "35%",
        style: {
          text: formatCurrency(totalAmount),
          fill: "#142235",
          font: `800 17px ${chartFontFamily}`,
          textAlign: "center"
        }
      },
      {
        type: "text",
        left: "center",
        top: "48.5%",
        style: {
          text: "총 지급수당",
          fill: "#69778a",
          font: `700 10px ${chartFontFamily}`,
          textAlign: "center"
        }
      }
    ],
    series: [
      {
        type: "pie",
        radius: ["46%", "75%"],
        center: ["50%", "42%"],
        avoidLabelOverlap: true,
        label: {
          show: true,
          position: "inside",
          color: "#ffffff",
          fontFamily: chartFontFamily,
          fontSize: 12,
          fontWeight: 800,
          formatter: (params) => {
            const percent = typeof params.percent === "number" ? params.percent : 0;

            return percent >= 8 ? `${Number(percent.toFixed(1))}%` : "";
          }
        },
        labelLine: {
          show: false
        },
        emphasis: {
          scale: true,
          scaleSize: 6,
          itemStyle: {
            shadowBlur: 18,
            shadowColor: "rgba(24, 41, 62, 0.18)"
          }
        },
        data: items.map((item) => ({
          name: item.label,
          value: item.amount
        }))
      }
    ]
  }), [items, totalAmount]);

  return (
    <>
      <div className="dashboard-v2-card-header">
        <h3>전사 수당 유형 비율</h3>
        <div className="dashboard-v2-card-actions">
          <span className="dashboard-v2-unit-note">단위: %</span>
          <DashboardExportActionGroup
            disabled={isExportDisabled}
            exportTargetLabel="전사 수당 유형 비율"
            exportingFormat={exportingFormat}
            onExport={onExport}
          />
        </div>
      </div>
      <div className="dashboard-v2-chart-stage">
        <EChartPanel
          className="dashboard-echart-panel dashboard-echart-panel--ratio"
          option={option}
          ref={chartRef}
        />
      </div>
    </>
  );
};

const RankingTable = ({
  activeCategory,
  exportingFormat,
  isExportDisabled,
  items,
  onSelectCategory,
  onExport
}: {
  activeCategory: DashboardBusinessCategory;
  exportingFormat: DashboardExportFormat | null;
  isExportDisabled?: boolean;
  items: DashboardTopPerformer[];
  onSelectCategory: (category: DashboardBusinessCategory) => void;
  onExport: (format: DashboardExportFormat) => void;
}) => (
  <>
    <div className="dashboard-v2-ranking-header">
      <div className="dashboard-v2-card-header">
        <h3>근무 유형별 상위 인원 (Top 10)</h3>
        <div className="dashboard-v2-card-actions">
          <span className="dashboard-v2-unit-note">단위: 원</span>
          <DashboardExportActionGroup
            disabled={isExportDisabled}
            exportTargetLabel="근무 유형별 상위 인원"
            exportingFormat={exportingFormat}
            onExport={onExport}
          />
        </div>
      </div>
      <div aria-label="근무 유형 상위 인원 탭" className="dashboard-v2-ranking-tabs" role="tablist">
        {rankingTabItems.map((tab) => (
          <button
            aria-selected={activeCategory === tab.key}
            className={`dashboard-v2-ranking-tab${activeCategory === tab.key ? " is-active" : ""}`}
            key={tab.key}
            onClick={() => {
              onSelectCategory(tab.key);
            }}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
    <div className="dashboard-v2-ranking-stage">
      <table className="dashboard-v2-ranking-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>근무지</th>
            <th>근무시간</th>
            <th>지급 수당</th>
          </tr>
        </thead>
        <tbody>
          {items.length > 0 ? (
            items.map((item) => (
              <tr key={`${item.employeeName}-${item.siteName}`}>
                <td>{item.employeeName}</td>
                <td>{item.siteName}</td>
                <td>{formatHoursShortFromMinutes(item.minutes)}</td>
                <td>{formatCurrency(item.allowanceAmount)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4}>{rankingTabItems.find((tab) => tab.key === activeCategory)?.label ?? "선택한"} 데이터가 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </>
);

export const DashboardScreen = () => {
  const { selectedMonth, selectedSiteId, setSelectedMonth, setSelectedSiteId } = useAppWorkflow();
  const [draftFilters, setDraftFilters] = useState<DashboardFilterState>(() =>
    createDefaultFilters(selectedMonth, selectedSiteId)
  );
  const [appliedFilters, setAppliedFilters] = useState<DashboardFilterState>(() =>
    createDefaultFilters(selectedMonth, selectedSiteId)
  );
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

  const demoDashboardRecords = useMemo(
    () => createDemoDashboardRecords(sites, employees),
    [employees, sites]
  );

  const isUsingDemoData = enableDashboardDemoFallback && realDashboardRecords.length === 0;
  const dashboardRecords = isUsingDemoData ? demoDashboardRecords : realDashboardRecords;
  const hasRealDashboardRecords = realDashboardRecords.length > 0;

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

    dashboardRecords.forEach((record) => {
      if (
        record.year === draftFilters.year &&
        (draftFilters.month === ALL_OPTION || record.yearMonth === `${draftFilters.year}-${draftFilters.month}`) &&
        (draftFilters.siteId === ALL_OPTION || record.siteId === draftFilters.siteId)
      ) {
        names.add(record.employeeName);
      }
    });

    return [ALL_OPTION, ...[...names].sort((left, right) => left.localeCompare(right, "ko"))];
  }, [dashboardRecords, draftFilters.month, draftFilters.siteId, draftFilters.year]);

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
    if (!isUsingDemoData || appliedFilters.month === ALL_OPTION || dashboardRecords.length === 0) {
      return;
    }

    const hasMatches = dashboardRecords.some((record) => matchesFilters(record, appliedFilters));

    if (hasMatches) {
      return;
    }

    const yearMonths = [
      ...new Set(
        dashboardRecords
          .filter((record) => record.year === appliedFilters.year)
          .map((record) => record.yearMonth)
      )
    ].sort((left, right) => left.localeCompare(right));

    const fallbackMonth = yearMonths.length > 0 ? yearMonths[yearMonths.length - 1].slice(5, 7) : ALL_OPTION;
    const nextFilters = { ...appliedFilters, month: fallbackMonth };

    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);

    if (fallbackMonth !== ALL_OPTION) {
      setSelectedMonth(`${nextFilters.year}-${fallbackMonth}`);
    }
  }, [appliedFilters, dashboardRecords, isUsingDemoData, setSelectedMonth]);

  const filteredRecords = useMemo(
    () => dashboardRecords.filter((record) => matchesFilters(record, appliedFilters)),
    [appliedFilters, dashboardRecords]
  );

  const previousPeriodRecords = useMemo(() => {
    if (appliedFilters.month !== ALL_OPTION) {
      const previousYearMonth = shiftYearMonth(`${appliedFilters.year}-${appliedFilters.month}`, -1);

      return dashboardRecords.filter((record) => {
        if (record.yearMonth !== previousYearMonth) {
          return false;
        }

        if (appliedFilters.siteId !== ALL_OPTION && record.siteId !== appliedFilters.siteId) {
          return false;
        }

        if (appliedFilters.employeeName !== ALL_OPTION && record.employeeName !== appliedFilters.employeeName) {
          return false;
        }

        return true;
      });
    }

    const previousYear = String(Number(appliedFilters.year) - 1);

    return dashboardRecords.filter((record) =>
      matchesFilters(
        record,
        { ...appliedFilters, year: previousYear },
        { ignoreMonth: true }
      )
    );
  }, [appliedFilters, dashboardRecords]);

  const currentAggregate = useMemo(() => aggregateRecords(filteredRecords), [filteredRecords]);
  const previousAggregate = useMemo(
    () => aggregateRecords(previousPeriodRecords),
    [previousPeriodRecords]
  );

  const metrics = useMemo(
    () => [
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
    ],
    [currentAggregate, previousAggregate]
  );

  const trendItems = useMemo(() => {
    const trendBaseRecords = dashboardRecords.filter((record) => {
      if (appliedFilters.siteId !== ALL_OPTION && record.siteId !== appliedFilters.siteId) {
        return false;
      }

      if (appliedFilters.employeeName !== ALL_OPTION && record.employeeName !== appliedFilters.employeeName) {
        return false;
      }

      return true;
    });
    const anchorYearMonth =
      appliedFilters.month !== ALL_OPTION
        ? `${appliedFilters.year}-${appliedFilters.month}`
        : getLatestMonthInYear(trendBaseRecords, appliedFilters.year);

    return buildTrendWindow(anchorYearMonth).map((yearMonth) => {
      const monthRecords = trendBaseRecords.filter((record) => record.yearMonth === yearMonth);
      const aggregate = aggregateRecords(monthRecords);

      return {
        yearMonth,
        label: formatMonthLabel(yearMonth),
        overtimeAmount: aggregate.overtimeAllowanceAmount,
        substituteAmount: aggregate.substituteAllowanceAmount,
        legalHolidayAmount: aggregate.legalHolidayAllowanceAmount
      } satisfies DashboardMonthlyTrend;
    });
  }, [appliedFilters, dashboardRecords]);

  const siteChartItems = useMemo(() => {
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
  }, [filteredRecords]);

  const ratioItems = useMemo<DashboardRatioItem[]>(() => {
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
  }, [currentAggregate]);

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

  const topPerformersByCategory = useMemo<Record<DashboardBusinessCategory, DashboardTopPerformer[]>>(() => {
    const rankingMaps: Record<DashboardBusinessCategory, Map<string, DashboardTopPerformer>> = {
      legalHoliday: new Map<string, DashboardTopPerformer>(),
      substitute: new Map<string, DashboardTopPerformer>(),
      overtime: new Map<string, DashboardTopPerformer>()
    };

    filteredRecords.forEach((record) => {
      const rankingMinutes = getRankingMinutesForRecord(record);

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
  }, [filteredRecords]);
  const topPerformers = topPerformersByCategory[activeRankingCategory];
  const hasRankingData = rankingTabItems.some((tab) => topPerformersByCategory[tab.key].length > 0);
  const hasExportableDashboardData =
    hasTrendData || hasSiteChartData || hasRatioData || hasRankingData;

  const filterSummary = useMemo<DashboardChartExportInput["filters"]>(() => {
    const selectedSite = siteOptions.find((option) => option.id === appliedFilters.siteId);

    return {
      year: `${appliedFilters.year}년`,
      month: appliedFilters.month === ALL_OPTION ? "전체" : `${Number(appliedFilters.month)}월`,
      siteName: selectedSite?.label ?? "전체",
      employeeName: appliedFilters.employeeName === ALL_OPTION ? "전체" : appliedFilters.employeeName,
      dataSource: isUsingDemoData ? "샘플 데이터" : hasRealDashboardRecords ? "실데이터" : "데이터 없음"
    };
  }, [appliedFilters, hasRealDashboardRecords, isUsingDemoData, siteOptions]);

  const trendChartExportInput = useMemo<DashboardChartExportInput>(
    () => ({
      chartKey: "trend",
      chartTitle: "월별 수당 지급 추이 (최근 6개월)",
      sheetName: "월별 수당 추이",
      filters: filterSummary,
      columns: [
        { key: "month", header: "월", format: "text" },
        { key: "overtimeAmount", header: "연장수당(원)", format: "currency" },
        { key: "substituteAmount", header: "대체수당(원)", format: "currency" },
        { key: "legalHolidayAmount", header: "법정공휴일수당(원)", format: "currency" },
        { key: "totalAmount", header: "합계(원)", format: "currency" }
      ],
      rows: trendItems.map((item) => ({
        month: item.label,
        overtimeAmount: item.overtimeAmount,
        substituteAmount: item.substituteAmount,
        legalHolidayAmount: item.legalHolidayAmount,
        totalAmount: item.overtimeAmount + item.substituteAmount + item.legalHolidayAmount
      }))
    }),
    [filterSummary, trendItems]
  );

  const siteChartExportInput = useMemo<DashboardChartExportInput>(
    () => ({
      chartKey: "site",
      chartTitle: "근무지별 수당 현황",
      sheetName: "근무지별 수당 현황",
      filters: filterSummary,
      columns: [
        { key: "siteName", header: "근무지", format: "text" },
        { key: "overtimeAmount", header: "연장수당(원)", format: "currency" },
        { key: "substituteAmount", header: "대체수당(원)", format: "currency" },
        { key: "legalHolidayAmount", header: "법정공휴일수당(원)", format: "currency" },
        { key: "totalAmount", header: "합계(원)", format: "currency" }
      ],
      rows: siteChartItems.map((item) => ({
        siteName: item.siteName,
        overtimeAmount: item.overtimeAmount,
        substituteAmount: item.substituteAmount,
        legalHolidayAmount: item.legalHolidayAmount,
        totalAmount: item.totalAmount
      }))
    }),
    [filterSummary, siteChartItems]
  );

  const ratioChartExportInput = useMemo<DashboardChartExportInput>(
    () => ({
      chartKey: "ratio",
      chartTitle: "전사 수당 유형 비율",
      sheetName: "수당 유형 비율",
      filters: filterSummary,
      columns: [
        { key: "category", header: "수당 유형", format: "text" },
        { key: "amount", header: "금액(원)", format: "currency" },
        { key: "ratioPercent", header: "비율(%)", format: "percent" }
      ],
      rows: ratioItems.map((item) => ({
        category: item.label,
        amount: item.amount,
        ratioPercent: formatRatioPercent(item.ratio)
      }))
    }),
    [filterSummary, ratioItems]
  );

  const rankingChartExportInput = useMemo<DashboardChartExportInput>(
    () => ({
      chartKey: "ranking",
      chartTitle: "근무 유형별 상위 인원 (Top 10)",
      sheetName: "근무 유형별 상위 인원",
      filters: filterSummary,
      columns: [
        { key: "categoryLabel", header: "근무 유형", format: "text" },
        { key: "employeeName", header: "이름", format: "text" },
        { key: "siteName", header: "근무지", format: "text" },
        { key: "minutes", header: "근무시간(h)", format: "number" },
        { key: "allowanceAmount", header: "지급 수당(원)", format: "currency" }
      ],
      rows: rankingTabItems.flatMap((tab) =>
        topPerformersByCategory[tab.key].map((item) => ({
          categoryLabel: tab.label,
          employeeName: item.employeeName,
          siteName: item.siteName,
          minutes: Number((item.minutes / 60).toFixed(1)),
          allowanceAmount: Math.round(item.allowanceAmount)
        }))
      )
    }),
    [filterSummary, topPerformersByCategory]
  );

  const rankingExportSection = useMemo<DashboardReportExportInput["sections"][number]>(
    () => ({
      sectionKey: "ranking",
      chartTitle: "근무 유형별 상위 인원 (Top 10)",
      sheetName: "근무 유형별 상위 인원",
      columns: rankingChartExportInput.columns,
      rows: rankingChartExportInput.rows
    }),
    [rankingChartExportInput.columns, rankingChartExportInput.rows]
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

  const handleExportChart = async (
    input: DashboardChartExportInput,
    outputFormat: DashboardExportFormat
  ) => {
    setChartActionError(null);
    setChartActionMessage(null);
    setExportingActionKey(createDashboardExportActionKey(input.chartKey, outputFormat));

    try {
      const exportDashboardChartData = window.appBridge.exportDashboardChartData;

      if (typeof exportDashboardChartData !== "function") {
        setChartActionError(
          "차트 내보내기 기능이 현재 앱 실행본에 반영되지 않았습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요."
        );
        return;
      }

      const result = await exportDashboardChartData({
        ...input,
        outputFormat,
        chartImageDataUrl: getChartImageDataUrl(input.chartKey)
      });

      if (!result.ok) {
        if (result.errorCode === "EXPORT_CANCELLED") {
          return;
        }

        setChartActionError(result.message);
        return;
      }

      setChartActionMessage(
        `${result.data.chartTitle}를 ${result.data.outputFileName}로 저장했습니다.`
      );
    } catch (error) {
      setChartActionError(getErrorMessage(error));
    } finally {
      setExportingActionKey(null);
    }
  };

  const handleExportDashboardReport = async (outputFormat: DashboardExportFormat) => {
    setChartActionError(null);
    setChartActionMessage(null);
    setExportingActionKey(createDashboardExportActionKey("all", outputFormat));

    try {
      const exportDashboardReport = window.appBridge.exportDashboardReport;

      if (typeof exportDashboardReport !== "function") {
        setChartActionError(
          "대시보드 전체 내보내기 기능이 현재 앱 실행본에 반영되지 않았습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요."
        );
        return;
      }

      const result = await exportDashboardReport({
        title: "대시보드 전체 내보내기",
        filters: filterSummary,
        outputFormat,
        sections: [
          {
            sectionKey: "trend",
            chartTitle: trendChartExportInput.chartTitle,
            sheetName: trendChartExportInput.sheetName,
            columns: trendChartExportInput.columns,
            rows: trendChartExportInput.rows,
            chartImageDataUrl: getChartImageDataUrl("trend")
          },
          {
            sectionKey: "site",
            chartTitle: siteChartExportInput.chartTitle,
            sheetName: siteChartExportInput.sheetName,
            columns: siteChartExportInput.columns,
            rows: siteChartExportInput.rows,
            chartImageDataUrl: getChartImageDataUrl("site")
          },
          rankingExportSection,
          {
            sectionKey: "ratio",
            chartTitle: ratioChartExportInput.chartTitle,
            sheetName: ratioChartExportInput.sheetName,
            columns: ratioChartExportInput.columns,
            rows: ratioChartExportInput.rows,
            chartImageDataUrl: getChartImageDataUrl("ratio")
          }
        ]
      });

      if (!result.ok) {
        if (result.errorCode === "EXPORT_CANCELLED") {
          return;
        }

        setChartActionError(result.message);
        return;
      }

      setChartActionMessage(
        `${result.data.title}를 ${result.data.outputFileName}로 저장했습니다.`
      );
    } catch (error) {
      setChartActionError(getErrorMessage(error));
    } finally {
      setExportingActionKey(null);
    }
  };

  const handleDraftChange =
    (field: keyof DashboardFilterState) => (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      const nextFilters = {
        ...draftFilters,
        [field]: value,
        ...(field === "year" || field === "month" || field === "siteId"
          ? { employeeName: ALL_OPTION }
          : {})
      };

      setDraftFilters(nextFilters);
      setAppliedFilters(nextFilters);

      if (nextFilters.month !== ALL_OPTION) {
        setSelectedMonth(`${nextFilters.year}-${nextFilters.month}`);
      }

      setSelectedSiteId(nextFilters.siteId === ALL_OPTION ? "" : nextFilters.siteId);
    };

  return (
    <div className="screen-stack dashboard-v2-shell">
      <section className="dashboard-v2-header">
        <div>
          <h1>교대근무 및 수당 관리 시스템 - 대시보드</h1>
        </div>
        <div className="dashboard-v2-header-actions">
          <span className="dashboard-v2-export-label">전체 내보내기</span>
          <DashboardExportActionGroup
            disabled={!hasExportableDashboardData}
            exportTargetLabel="대시보드 전체"
            exportingFormat={
              exportingActionKey === createDashboardExportActionKey("all", "pdf")
                ? "pdf"
                : exportingActionKey === createDashboardExportActionKey("all", "xlsx")
                  ? "xlsx"
                  : null
            }
            onExport={(format) => {
              void handleExportDashboardReport(format);
            }}
          />
        </div>
      </section>

      <section className="surface-card dashboard-v2-filter-panel">
        <div className="filter-grid dashboard-v2-filter-grid">
          <label className="field dashboard-v2-field">
            <span>조회 연도</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={handleDraftChange("year")}
              selectClassName="top-filter-select"
              value={draftFilters.year}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </FormSelect>
          </label>
          <label className="field dashboard-v2-field">
            <span>조회 월</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={handleDraftChange("month")}
              selectClassName="top-filter-select"
              value={draftFilters.month}
            >
              <option value={ALL_OPTION}>전체</option>
              {Array.from({ length: 12 }, (_, index) => {
                const monthValue = String(index + 1).padStart(2, "0");

                return (
                  <option key={monthValue} value={monthValue}>
                    {index + 1}월
                  </option>
                  );
              })}
            </FormSelect>
          </label>
          <label className="field dashboard-v2-field">
            <span>근무지</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={handleDraftChange("siteId")}
              selectClassName="top-filter-select"
              value={draftFilters.siteId}
            >
              {siteOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </FormSelect>
          </label>
          <label className="field dashboard-v2-field">
            <span>이름</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={handleDraftChange("employeeName")}
              selectClassName="top-filter-select"
              value={draftFilters.employeeName}
            >
              {employeeOptions.map((employeeName) => (
                <option key={employeeName} value={employeeName}>
                  {employeeName === ALL_OPTION ? "전체" : employeeName}
                </option>
              ))}
            </FormSelect>
          </label>
        </div>
      </section>

      {isUsingDemoData ? (
        <DashboardNotice
          message="실데이터가 없어 2025년 1월부터 2026년 2월까지의 샘플 데이터를 표시 중입니다."
          title="샘플 데이터 표시 중"
        />
      ) : null}
      {!isLoading && !hasRealDashboardRecords && !isUsingDemoData ? (
        <DashboardNotice
          message="승인된 수당 실적이 아직 없어 대시보드 집계와 내보내기 기능을 비워 둡니다."
          title="대시보드 데이터 없음"
        />
      ) : null}

      {screenError ? <DashboardNotice message={screenError} title="데이터 로드 경고" /> : null}
      {chartActionError ? <DashboardNotice message={chartActionError} title="대시보드 내보내기 오류" /> : null}
      {chartActionMessage ? <DashboardNotice message={chartActionMessage} title="대시보드 내보내기 완료" /> : null}

      <section className="dashboard-v2-metric-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="dashboard-v2-report-grid">
        <article className="surface-card dashboard-v2-card dashboard-v2-card--trend">
          {isLoading ? (
            <DashboardEmptyState message="대시보드 데이터를 불러오는 중입니다." />
          ) : !hasTrendData ? (
            <DashboardEmptyState message="선택한 조건에 해당하는 월별 수당 추이 데이터가 없습니다." />
          ) : (
            <TrendChart
              chartRef={trendChartRef}
              exportingFormat={
                exportingActionKey === createDashboardExportActionKey("trend", "pdf")
                  ? "pdf"
                  : exportingActionKey === createDashboardExportActionKey("trend", "xlsx")
                    ? "xlsx"
                    : null
              }
              isExportDisabled={!hasTrendData}
              items={trendItems}
              onExport={(format) => {
                void handleExportChart(trendChartExportInput, format);
              }}
            />
          )}
        </article>

        <article className="surface-card dashboard-v2-card dashboard-v2-card--site">
          {siteChartItems.length > 0 ? (
            <SiteChart
              chartRef={siteChartRef}
              exportingFormat={
                exportingActionKey === createDashboardExportActionKey("site", "pdf")
                  ? "pdf"
                  : exportingActionKey === createDashboardExportActionKey("site", "xlsx")
                    ? "xlsx"
                    : null
              }
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
            <RankingTable
              activeCategory={activeRankingCategory}
              exportingFormat={
                exportingActionKey === createDashboardExportActionKey("ranking", "pdf")
                  ? "pdf"
                  : exportingActionKey === createDashboardExportActionKey("ranking", "xlsx")
                    ? "xlsx"
                    : null
              }
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
              <RatioChart
                chartRef={ratioChartRef}
                exportingFormat={
                  exportingActionKey === createDashboardExportActionKey("ratio", "pdf")
                    ? "pdf"
                    : exportingActionKey === createDashboardExportActionKey("ratio", "xlsx")
                      ? "xlsx"
                      : null
                }
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
