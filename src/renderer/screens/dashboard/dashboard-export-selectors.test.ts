import { describe, expect, it } from "vitest";

import type { DashboardChartExportFilterSummary } from "@shared/bridge/contracts";

import type { DashboardFilterState } from "./useDashboardFilterState";
import type { DashboardBusinessCategory } from "./dashboard-records";
import type {
  DashboardMonthlyTrend,
  DashboardRatioItem,
  DashboardSiteAllowance,
  DashboardTopPerformer
} from "./dashboard-selectors";
import {
  buildDashboardControlPanelNotices,
  buildDashboardExportModels
} from "./dashboard-export-selectors";

const filterSummary: DashboardChartExportFilterSummary = {
  year: "2026년",
  month: "4월",
  periodLabel: "2026년 4월",
  siteName: "전체",
  employeeName: "전체",
  dataSource: "실데이터"
};

const baseFilters: DashboardFilterState = {
  periodMode: "single",
  year: "2026",
  month: "04",
  startYearMonth: "2026-04",
  endYearMonth: "2026-04",
  siteId: "all",
  employeeName: "all"
};

const trendItems: DashboardMonthlyTrend[] = [
  {
    yearMonth: "2026-04",
    label: "2026.04",
    overtimeAmount: 10000,
    substituteAmount: 5000,
    legalHolidayAmount: 2500
  }
];

const siteChartItems: DashboardSiteAllowance[] = [
  {
    siteId: "site-1",
    siteName: "보라매DC",
    overtimeAmount: 10000,
    substituteAmount: 5000,
    legalHolidayAmount: 2500,
    totalAmount: 17500
  }
];

const ratioItems: DashboardRatioItem[] = [
  { category: "overtime", label: "연장수당", amount: 10000, ratio: 0.5 },
  { category: "substitute", label: "대체수당", amount: 5000, ratio: 0.25 },
  { category: "legalHoliday", label: "법정공휴일수당", amount: 5000, ratio: 0.25 }
];

const topPerformersByCategory: Record<DashboardBusinessCategory, DashboardTopPerformer[]> = {
  overtime: [{ employeeName: "홍길동", siteName: "보라매DC", minutes: 180, allowanceAmount: 30000 }],
  substitute: [{ employeeName: "김철수", siteName: "신림Site", minutes: 120, allowanceAmount: 18000 }],
  legalHoliday: []
};

describe("dashboard-export-selectors", () => {
  it("should build chart and report export models from dashboard view models", () => {
    const models = buildDashboardExportModels({
      allOptionValue: "all",
      appliedFilters: baseFilters,
      filterSummary,
      rankingTabs: [
        { key: "legalHoliday", label: "법정휴일" },
        { key: "substitute", label: "대체근무" },
        { key: "overtime", label: "연장근무" }
      ],
      ratioItems,
      siteChartItems,
      topPerformersByCategory,
      trendItems
    });

    expect(models.trendChartTitle).toBe("월별 수당 지급 추이 (최근 6개월)");
    expect(models.trendChartExportInput.rows[0]).toEqual({
      month: "2026.04",
      overtimeAmount: 10000,
      substituteAmount: 5000,
      legalHolidayAmount: 2500,
      totalAmount: 17500
    });
    expect(models.ratioChartExportInput.rows[0]).toEqual({
      category: "연장수당",
      amount: 10000,
      ratioPercent: 50
    });
    expect(models.rankingChartExportInput.rows[0]).toEqual({
      categoryLabel: "대체근무",
      employeeName: "김철수",
      siteName: "신림Site",
      minutes: 2,
      allowanceAmount: 18000
    });
    expect(models.rankingExportSection.sectionKey).toBe("ranking");
  });

  it("should use range title when the filter is a range", () => {
    const models = buildDashboardExportModels({
      allOptionValue: "all",
      appliedFilters: {
        ...baseFilters,
        periodMode: "range",
        startYearMonth: "2026-01",
        endYearMonth: "2026-03"
      },
      filterSummary,
      rankingTabs: [],
      ratioItems: [],
      siteChartItems: [],
      topPerformersByCategory: {
        overtime: [],
        substitute: [],
        legalHoliday: []
      },
      trendItems: []
    });

    expect(models.trendChartTitle).toBe("기간별 수당 지급 추이");
  });

  it("should build the control panel notices in priority order", () => {
    const notices = buildDashboardControlPanelNotices({
      chartActionError: "내보내기 실패",
      chartActionMessage: "내보내기 완료",
      hasRealDashboardRecords: false,
      isLoading: false,
      isUsingDemoData: true,
      screenError: "데이터 불일치"
    });

    expect(notices).toEqual([
      {
        title: "샘플 데이터 표시 중",
        message: "실데이터가 없어 2025년 1월부터 2026년 2월까지의 샘플 데이터를 표시 중입니다."
      },
      {
        title: "데이터 로드 경고",
        message: "데이터 불일치"
      },
      {
        title: "대시보드 내보내기 오류",
        message: "내보내기 실패"
      },
      {
        title: "대시보드 내보내기 완료",
        message: "내보내기 완료"
      }
    ]);
  });
});
