import { describe, expect, it } from "vitest";

import type { DashboardFilterState } from "./useDashboardFilterState";
import type { DashboardRecord } from "./dashboard-records";
import {
  aggregateDashboardRecords,
  buildDashboardFilterSummary,
  buildDashboardMetrics,
  buildDashboardTopPerformersByCategory,
  buildDashboardTrendItems
} from "./dashboard-selectors";

const createRecord = (overrides?: Partial<DashboardRecord>): DashboardRecord => ({
  id: "record-1",
  approvalId: "approval-1",
  employeeCode: "E-001",
  employeeName: "홍길동",
  siteId: "site-1",
  siteName: "보라매DC",
  workDate: "2026-04-16",
  year: "2026",
  yearMonth: "2026-04",
  businessCategory: "overtime",
  totalWorkMinutes: 240,
  overtimeMinutes: 240,
  hourlyRate: 12000,
  totalAllowanceAmount: 48000,
  ...overrides
});

const singleFilters: DashboardFilterState = {
  periodMode: "single",
  year: "2026",
  month: "04",
  startYearMonth: "2026-04",
  endYearMonth: "2026-04",
  siteId: "all",
  employeeName: "all"
};

describe("dashboard-selectors", () => {
  it("should aggregate records and build metrics with change text", () => {
    const currentAggregate = aggregateDashboardRecords([
      createRecord({ businessCategory: "overtime", totalWorkMinutes: 180, overtimeMinutes: 180, totalAllowanceAmount: 36000 }),
      createRecord({
        id: "record-2",
        businessCategory: "substitute",
        totalWorkMinutes: 120,
        overtimeMinutes: 0,
        totalAllowanceAmount: 18000
      })
    ]);
    const previousAggregate = aggregateDashboardRecords([
      createRecord({ id: "record-prev", totalWorkMinutes: 60, overtimeMinutes: 60, totalAllowanceAmount: 12000 })
    ]);

    const metrics = buildDashboardMetrics({ currentAggregate, previousAggregate });

    expect(metrics[0]).toMatchObject({
      label: "총 근로시간",
      value: "5시간",
      changeText: "400% ▲",
      tone: "time"
    });
    expect(metrics[4]).toMatchObject({
      label: "총 지급수당",
      value: "54,000원",
      tone: "money"
    });
  });

  it("should build trend items for a range period", () => {
    const items = buildDashboardTrendItems({
      allOptionValue: "all",
      appliedFilters: {
        ...singleFilters,
        periodMode: "range",
        startYearMonth: "2026-03",
        endYearMonth: "2026-04"
      },
      dashboardRecords: [
        createRecord({
          id: "record-1",
          yearMonth: "2026-03",
          workDate: "2026-03-12",
          totalAllowanceAmount: 24000
        }),
        createRecord({
          id: "record-2",
          yearMonth: "2026-04",
          workDate: "2026-04-11",
          totalAllowanceAmount: 36000
        })
      ]
    });

    expect(items).toEqual([
      {
        yearMonth: "2026-03",
        label: "2026.03",
        overtimeAmount: 24000,
        substituteAmount: 0,
        legalHolidayAmount: 0
      },
      {
        yearMonth: "2026-04",
        label: "2026.04",
        overtimeAmount: 36000,
        substituteAmount: 0,
        legalHolidayAmount: 0
      }
    ]);
  });

  it("should rank top performers by overtime minutes but sum the stored allowance amount", () => {
    const rankings = buildDashboardTopPerformersByCategory([
      createRecord({
        id: "record-1",
        employeeName: "홍길동",
        businessCategory: "overtime",
        totalWorkMinutes: 300,
        overtimeMinutes: 120,
        hourlyRate: 10000,
        totalAllowanceAmount: 40000
      }),
      createRecord({
        id: "record-2",
        employeeName: "김철수",
        businessCategory: "overtime",
        totalWorkMinutes: 200,
        overtimeMinutes: 180,
        hourlyRate: 10000,
        // 시급×연장분(=30000)이 아니라 저장된 수당(52000)을 그대로 합산해야 한다.
        totalAllowanceAmount: 52000
      }),
      createRecord({
        id: "record-3",
        employeeName: "박영희",
        businessCategory: "substitute",
        totalWorkMinutes: 240,
        overtimeMinutes: 0,
        hourlyRate: 9000
      })
    ]);

    expect(rankings.overtime[0]).toMatchObject({
      employeeName: "김철수",
      minutes: 180,
      allowanceAmount: 52000
    });
    expect(rankings.substitute[0]).toMatchObject({
      employeeName: "박영희",
      minutes: 240
    });
  });

  it("should build the export filter summary with range label and demo data source", () => {
    const summary = buildDashboardFilterSummary({
      allOptionValue: "all",
      appliedFilters: {
        ...singleFilters,
        periodMode: "range",
        startYearMonth: "2026-01",
        endYearMonth: "2026-03",
        siteId: "site-1",
        employeeName: "홍길동"
      },
      hasRealDashboardRecords: false,
      isUsingDemoData: true,
      siteOptions: [
        { id: "all", label: "전체" },
        { id: "site-1", label: "보라매DC" }
      ]
    });

    expect(summary).toEqual({
      year: "기간 직접 지정",
      month: "2026년 1월 ~ 2026년 3월",
      periodLabel: "2026년 1월 ~ 2026년 3월",
      siteName: "보라매DC",
      employeeName: "홍길동",
      dataSource: "샘플 데이터"
    });
  });
});
