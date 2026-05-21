import { describe, expect, it } from "vitest";

import type { EmployeeRecord } from "@shared/domain/model";

import {
  buildWorkforceListState,
  filterWorkforceEmployees,
  formatWorkforceEmploymentType,
  getWorkforceAssignmentState
} from "./workforce-list-selectors";

const createEmployee = (overrides: Partial<EmployeeRecord>): EmployeeRecord => ({
  id: overrides.id ?? overrides.employeeCode ?? "employee",
  employeeCode: overrides.employeeCode ?? "EMP-001",
  name: overrides.name ?? "직원",
  contact: overrides.contact,
  rank: overrides.rank,
  employmentType: overrides.employmentType ?? "정규",
  status: overrides.status ?? "active",
  hireDate: overrides.hireDate,
  retireDate: overrides.retireDate,
  currentSiteId: overrides.currentSiteId,
  currentSiteName: overrides.currentSiteName,
  currentSiteDeletedAt: overrides.currentSiteDeletedAt,
  currentShiftGroup: overrides.currentShiftGroup,
  currentHourlyRate: overrides.currentHourlyRate,
  createdAt: "2026-01-01T00:00:00.000Z"
});

const defaultFilters = {
  keyword: "",
  selectedAssignmentStatus: "all" as const,
  selectedEmploymentFilter: "all" as const,
  selectedSiteId: "all",
  selectedStatus: "all" as const
};

describe("workforce-list-selectors", () => {
  it("normalizes workforce employment labels to the three supported display values", () => {
    expect(formatWorkforceEmploymentType("정규직")).toBe("정규");
    expect(formatWorkforceEmploymentType("계약직")).toBe("계약");
    expect(formatWorkforceEmploymentType("파견직")).toBe("계약");
    expect(formatWorkforceEmploymentType("BP")).toBe("BP");
  });

  it("searches employees by name, employee code, contact, and rank", () => {
    const employees = [
      createEmployee({ employeeCode: "EMP-010", name: "김현우", contact: "010-1111-2222" }),
      createEmployee({ employeeCode: "EMP-020", name: "박정호", contact: "010-3333-4444", rank: "과장" })
    ];

    expect(
      filterWorkforceEmployees(employees, {
        ...defaultFilters,
        keyword: "3333"
      }).map((employee) => employee.employeeCode)
    ).toEqual(["EMP-020"]);

    expect(
      filterWorkforceEmployees(employees, {
        ...defaultFilters,
        keyword: "과장"
      }).map((employee) => employee.employeeCode)
    ).toEqual(["EMP-020"]);
  });

  it("excludes employees assigned to deleted sites from the list and counts", () => {
    const employees = [
      createEmployee({
        employeeCode: "EMP-001",
        name: "정상 인력",
        employmentType: "정규",
        currentSiteId: "site-active",
        currentSiteName: "운영 근무지",
        currentShiftGroup: "A조"
      }),
      createEmployee({
        employeeCode: "EMP-002",
        name: "제외 인력",
        employmentType: "BP",
        currentSiteId: "site-deleted",
        currentSiteName: "삭제 근무지",
        currentSiteDeletedAt: "2026-05-01T00:00:00.000Z",
        currentShiftGroup: "B조"
      })
    ];

    const state = buildWorkforceListState({
      employees,
      filters: defaultFilters,
      page: 1,
      pageSize: 10
    });

    expect(state.pageEmployees.map((employee) => employee.employeeCode)).toEqual(["EMP-001"]);
    expect(state.employmentCounts.total).toBe(1);
    expect(state.employmentCounts.bp).toBe(0);
    expect(state.deletedSiteEmployeeRows).toEqual([
      {
        employeeCode: "EMP-002",
        employeeName: "제외 인력",
        siteName: "삭제 근무지",
        shiftGroup: "B조"
      }
    ]);
  });

  it("sorts by site name, shift group, and employee code before paginating", () => {
    const employees = [
      createEmployee({
        employeeCode: "EMP-020",
        currentSiteName: "B근무지",
        currentShiftGroup: "A조"
      }),
      createEmployee({
        employeeCode: "EMP-010",
        currentSiteName: "A근무지",
        currentShiftGroup: "B조"
      }),
      createEmployee({
        employeeCode: "EMP-002",
        currentSiteName: "A근무지",
        currentShiftGroup: "A조"
      })
    ];

    const state = buildWorkforceListState({
      employees,
      filters: defaultFilters,
      page: 1,
      pageSize: 10
    });

    expect(state.pageEmployees.map((employee) => employee.employeeCode)).toEqual([
      "EMP-002",
      "EMP-010",
      "EMP-020"
    ]);
  });

  it("calculates page ranges and assignment states", () => {
    const employees = Array.from({ length: 12 }, (_, index) =>
      createEmployee({
        employeeCode: `EMP-${String(index + 1).padStart(3, "0")}`,
        currentSiteId: index % 2 === 0 ? "site" : undefined,
        currentSiteName: index % 2 === 0 ? "근무지" : undefined
      })
    );

    const state = buildWorkforceListState({
      employees,
      filters: defaultFilters,
      page: 2,
      pageSize: 10
    });

    expect(state.pageCount).toBe(2);
    expect(state.startIndex).toBe(10);
    expect(state.endIndex).toBe(12);
    expect(getWorkforceAssignmentState(employees[0])).toBe("assigned");
    expect(getWorkforceAssignmentState(createEmployee({ status: "retired" }))).toBe("ended");
  });
});
