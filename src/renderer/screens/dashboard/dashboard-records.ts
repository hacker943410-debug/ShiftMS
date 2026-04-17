import type { EmployeeRecord, SiteRecord } from "@shared/domain/model";

import type { DashboardFilterState } from "./useDashboardFilterState";

export type DashboardBusinessCategory = "substitute" | "overtime" | "legalHoliday";

export interface DashboardRecord {
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

interface DemoSiteSeed {
  id: string;
  name: string;
  employeeNames: string[];
}

interface DashboardDatasetSelectionInput {
  demoFallbackEnabled: boolean;
  employees: EmployeeRecord[];
  realDashboardRecords: DashboardRecord[];
  sites: SiteRecord[];
}

interface DashboardDemoFallbackResolution {
  nextFilters: DashboardFilterState;
  nextSelectedMonth: string | null;
}

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

const normalizeTextKey = (value: string) => value.replace(/\s+/g, "").toLowerCase();
const isValidYearMonth = (value: string) => /^\d{4}-\d{2}$/.test(value);

export const createMonthRange = (startYearMonth: string, endYearMonth: string) => {
  const months: string[] = [];
  const [startYear, startMonth] = startYearMonth.split("-").map(Number);
  const [endYear, endMonth] = endYearMonth.split("-").map(Number);

  if (
    !Number.isFinite(startYear) ||
    !Number.isFinite(startMonth) ||
    !Number.isFinite(endYear) ||
    !Number.isFinite(endMonth)
  ) {
    return months;
  }

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

const normalizeYearMonth = (value: string, fallback: string) =>
  isValidYearMonth(value) ? value : fallback;

const demoYearMonths = createMonthRange(DEMO_START_YEAR_MONTH, DEMO_END_YEAR_MONTH);

const createHashSeed = (...parts: Array<string | number>) =>
  parts
    .join(":")
    .split("")
    .reduce((sum, character, index) => sum + character.charCodeAt(0) * (index + 3), 0);

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

export const createDemoDashboardRecords = (
  sites: SiteRecord[],
  employees: EmployeeRecord[]
): DashboardRecord[] => {
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
        categoryOrder.forEach((category) => {
          const hashSeed = createHashSeed(yearMonth, siteSeed.id, employeeName, category);
          const seasonalBoost = monthIndex < 8 ? monthIndex * 18 : 144 + (monthIndex - 8) * 26;
          const siteWeight = siteIndex * 34;
          const employeeWeight = employeeIndex * 19;
          const baseMinutes =
            category === "substitute" ? 170 : category === "overtime" ? 230 : 145;
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

export const selectDashboardDataset = ({
  demoFallbackEnabled,
  employees,
  realDashboardRecords,
  sites
}: DashboardDatasetSelectionInput) => {
  const hasRealDashboardRecords = realDashboardRecords.length > 0;
  const isUsingDemoData = demoFallbackEnabled && !hasRealDashboardRecords;
  const demoDashboardRecords = isUsingDemoData ? createDemoDashboardRecords(sites, employees) : [];

  return {
    dashboardRecords: isUsingDemoData ? demoDashboardRecords : realDashboardRecords,
    hasRealDashboardRecords,
    isUsingDemoData
  };
};

export const getDashboardFilterRange = (filters: DashboardFilterState) => {
  if (filters.periodMode === "range") {
    const fallbackStart = `${filters.year}-01`;
    const startYearMonth = normalizeYearMonth(filters.startYearMonth, fallbackStart);
    const endYearMonth = normalizeYearMonth(filters.endYearMonth, startYearMonth);

    return startYearMonth <= endYearMonth
      ? { startYearMonth, endYearMonth }
      : { startYearMonth: endYearMonth, endYearMonth: startYearMonth };
  }

  if (filters.month !== "all") {
    const yearMonth = `${filters.year}-${filters.month}`;

    return { startYearMonth: yearMonth, endYearMonth: yearMonth };
  }

  return {
    startYearMonth: `${filters.year}-01`,
    endYearMonth: `${filters.year}-12`
  };
};

export const isYearMonthInRange = (
  yearMonth: string,
  range: ReturnType<typeof getDashboardFilterRange>
) => yearMonth >= range.startYearMonth && yearMonth <= range.endYearMonth;

export const matchesDashboardRecordFilters = (
  record: DashboardRecord,
  filters: DashboardFilterState,
  options?: { allOptionValue?: string; ignoreEmployee?: boolean; ignorePeriod?: boolean }
) => {
  const allOptionValue = options?.allOptionValue ?? "all";

  if (!options?.ignorePeriod && !isYearMonthInRange(record.yearMonth, getDashboardFilterRange(filters))) {
    return false;
  }

  if (filters.siteId !== allOptionValue && record.siteId !== filters.siteId) {
    return false;
  }

  if (!options?.ignoreEmployee && filters.employeeName !== allOptionValue) {
    if (record.employeeName !== filters.employeeName) {
      return false;
    }
  }

  return true;
};

export const resolveDashboardDemoFallback = ({
  allOptionValue,
  appliedFilters,
  dashboardRecords
}: {
  allOptionValue: string;
  appliedFilters: DashboardFilterState;
  dashboardRecords: DashboardRecord[];
}): DashboardDemoFallbackResolution | null => {
  if (
    appliedFilters.periodMode === "range" ||
    appliedFilters.month === allOptionValue ||
    dashboardRecords.length === 0
  ) {
    return null;
  }

  const hasMatches = dashboardRecords.some((record) =>
    matchesDashboardRecordFilters(record, appliedFilters, { allOptionValue })
  );

  if (hasMatches) {
    return null;
  }

  const yearMonths = [
    ...new Set(
      dashboardRecords
        .filter((record) => record.year === appliedFilters.year)
        .map((record) => record.yearMonth)
    )
  ].sort((left, right) => left.localeCompare(right));

  const fallbackMonth =
    yearMonths.length > 0 ? yearMonths[yearMonths.length - 1].slice(5, 7) : allOptionValue;
  const fallbackYearMonth =
    fallbackMonth === allOptionValue
      ? appliedFilters.startYearMonth
      : `${appliedFilters.year}-${fallbackMonth}`;
  const nextFilters = {
    ...appliedFilters,
    month: fallbackMonth,
    startYearMonth: fallbackYearMonth,
    endYearMonth: fallbackYearMonth
  };

  return {
    nextFilters,
    nextSelectedMonth:
      fallbackMonth === allOptionValue ? null : `${nextFilters.year}-${fallbackMonth}`
  };
};
