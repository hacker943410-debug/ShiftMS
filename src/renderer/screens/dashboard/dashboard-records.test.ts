import { describe, expect, it } from "vitest";

import type { EmployeeRecord, SiteRecord } from "@shared/domain/model";

import type { DashboardFilterState } from "./useDashboardFilterState";
import {
  matchesDashboardRecordFilters,
  resolveDashboardDemoFallback,
  selectDashboardDataset,
  type DashboardRecord
} from "./dashboard-records";

const createSite = (overrides?: Partial<SiteRecord>): SiteRecord => ({
  id: "site-1",
  siteCode: "SITE-001",
  name: "보라매DC",
  status: "active",
  timezone: "Asia/Seoul",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  ...overrides
});

const createEmployee = (overrides?: Partial<EmployeeRecord>): EmployeeRecord => ({
  id: "employee-1",
  employeeCode: "E-001",
  name: "홍길동",
  employmentType: "staff",
  currentSiteId: "site-1",
  currentSiteName: "보라매DC",
  status: "active",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  ...overrides
});

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

const singleMonthFilters: DashboardFilterState = {
  periodMode: "single",
  year: "2026",
  month: "12",
  startYearMonth: "2026-12",
  endYearMonth: "2026-12",
  siteId: "all",
  employeeName: "all"
};

describe("dashboard-records", () => {
  it("should generate demo data when no real records exist and fallback is enabled", () => {
    const dataset = selectDashboardDataset({
      demoFallbackEnabled: true,
      employees: [createEmployee()],
      realDashboardRecords: [],
      sites: [createSite()]
    });

    expect(dataset.isUsingDemoData).toBe(true);
    expect(dataset.hasRealDashboardRecords).toBe(false);
    expect(dataset.dashboardRecords.length).toBeGreaterThan(0);
    expect(dataset.dashboardRecords[0]).toMatchObject({
      siteId: "site-1",
      siteName: "보라매DC",
      yearMonth: "2025-01"
    });
    expect(dataset.dashboardRecords.some((record) => record.employeeName === "홍길동")).toBe(true);
  });

  it("should keep real dashboard records when available", () => {
    const realRecords = [createRecord()];
    const dataset = selectDashboardDataset({
      demoFallbackEnabled: true,
      employees: [createEmployee()],
      realDashboardRecords: realRecords,
      sites: [createSite()]
    });

    expect(dataset.isUsingDemoData).toBe(false);
    expect(dataset.hasRealDashboardRecords).toBe(true);
    expect(dataset.dashboardRecords).toEqual(realRecords);
  });

  it("should resolve a demo fallback to the latest available month in the selected year", () => {
    const fallback = resolveDashboardDemoFallback({
      allOptionValue: "all",
      appliedFilters: singleMonthFilters,
      dashboardRecords: [
        createRecord({ yearMonth: "2026-02", workDate: "2026-02-16" }),
        createRecord({ id: "record-2", yearMonth: "2026-04", workDate: "2026-04-18" })
      ]
    });

    expect(fallback).not.toBeNull();
    expect(fallback?.nextFilters.month).toBe("04");
    expect(fallback?.nextFilters.startYearMonth).toBe("2026-04");
    expect(fallback?.nextFilters.endYearMonth).toBe("2026-04");
    expect(fallback?.nextSelectedMonth).toBe("2026-04");
  });

  it("should match dashboard records by period, site, and employee", () => {
    const record = createRecord();
    const filters: DashboardFilterState = {
      periodMode: "single",
      year: "2026",
      month: "04",
      startYearMonth: "2026-04",
      endYearMonth: "2026-04",
      siteId: "site-1",
      employeeName: "홍길동"
    };

    expect(matchesDashboardRecordFilters(record, filters)).toBe(true);
    expect(
      matchesDashboardRecordFilters(record, {
        ...filters,
        month: "05",
        startYearMonth: "2026-05",
        endYearMonth: "2026-05"
      })
    ).toBe(false);
    expect(
      matchesDashboardRecordFilters(
        record,
        {
          ...filters,
          month: "05",
          startYearMonth: "2026-05",
          endYearMonth: "2026-05"
        },
        { ignorePeriod: true }
      )
    ).toBe(true);
  });
});
