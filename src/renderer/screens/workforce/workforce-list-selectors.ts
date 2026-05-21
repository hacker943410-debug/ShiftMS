import type { EmployeeRecord } from "@shared/domain/model";
import {
  isBpEmploymentType,
  normalizeEmploymentTypeLabel
} from "@shared/domain/employment-type";

export type EmployeeStatusFilter = EmployeeRecord["status"] | "all";
export type EmployeeAssignmentFilter = "all" | "assigned" | "unassigned" | "ended";
export type EmployeeEmploymentFilter = "all" | "regular" | "contract" | "bp";
export type WorkforcePageSize = 10 | 20 | 50;

export interface WorkforceListFilters {
  selectedAssignmentStatus: EmployeeAssignmentFilter;
  selectedEmploymentFilter: EmployeeEmploymentFilter;
  selectedSiteId: string;
  selectedStatus: EmployeeStatusFilter;
  keyword: string;
}

export interface DeletedSiteEmployeeNoticeRow {
  employeeCode: string;
  employeeName: string;
  siteName: string;
  shiftGroup: string;
}

export interface WorkforceEmploymentCounts {
  bp: number;
  contract: number;
  regular: number;
  total: number;
}

export interface WorkforceListState {
  activeEmployees: EmployeeRecord[];
  deletedSiteEmployees: EmployeeRecord[];
  deletedSiteEmployeeRows: DeletedSiteEmployeeNoticeRow[];
  employmentCounts: WorkforceEmploymentCounts;
  filteredEmployees: EmployeeRecord[];
  pageCount: number;
  pageEmployees: EmployeeRecord[];
  requestedPage: number;
  safePage: number;
  startIndex: number;
  endIndex: number;
}

const workforceSortCollator = new Intl.Collator("ko-KR", {
  numeric: true,
  sensitivity: "base"
});

const normalizeSearchValue = (value: string | undefined) => value?.trim().toLowerCase() ?? "";

export const getWorkforceAssignmentState = (
  employee: EmployeeRecord
): Exclude<EmployeeAssignmentFilter, "all"> => {
  if (employee.currentSiteId) {
    return "assigned";
  }

  if (employee.status === "retired") {
    return "ended";
  }

  return "unassigned";
};

export const isEmployeeAssignedToDeletedSite = (employee: EmployeeRecord) =>
  Boolean(employee.currentSiteId && employee.currentSiteDeletedAt);

export const formatWorkforceEmploymentType = (
  value: string | null | undefined
): "정규" | "계약" | "BP" => {
  const normalized = normalizeEmploymentTypeLabel(value);

  if (normalized === "BP") {
    return "BP";
  }

  if (normalized === "계약") {
    return "계약";
  }

  return "정규";
};

export const sortWorkforceEmployees = (employees: EmployeeRecord[]) =>
  [...employees].sort((left, right) => {
    const leftSiteName = left.currentSiteName?.trim() || "\uffff";
    const rightSiteName = right.currentSiteName?.trim() || "\uffff";
    const siteCompare = workforceSortCollator.compare(leftSiteName, rightSiteName);

    if (siteCompare !== 0) {
      return siteCompare;
    }

    const leftShiftGroup = left.currentShiftGroup?.trim() || "\uffff";
    const rightShiftGroup = right.currentShiftGroup?.trim() || "\uffff";
    const shiftCompare = workforceSortCollator.compare(leftShiftGroup, rightShiftGroup);

    if (shiftCompare !== 0) {
      return shiftCompare;
    }

    return workforceSortCollator.compare(left.employeeCode, right.employeeCode);
  });

export const buildDeletedSiteEmployeeNoticeRows = (
  employees: EmployeeRecord[]
): DeletedSiteEmployeeNoticeRow[] =>
  sortWorkforceEmployees(employees).map((employee) => ({
    employeeCode: employee.employeeCode,
    employeeName: employee.name,
    siteName: employee.currentSiteName ?? "삭제된 근무지",
    shiftGroup: employee.currentShiftGroup ?? "미배정"
  }));

export const countWorkforceEmploymentTypes = (
  employees: EmployeeRecord[]
): WorkforceEmploymentCounts => {
  const counts: WorkforceEmploymentCounts = {
    bp: 0,
    contract: 0,
    regular: 0,
    total: employees.length
  };

  employees.forEach((employee) => {
    const employmentType = formatWorkforceEmploymentType(employee.employmentType);

    if (employmentType === "BP") {
      counts.bp += 1;
      return;
    }

    if (employmentType === "계약") {
      counts.contract += 1;
      return;
    }

    counts.regular += 1;
  });

  return counts;
};

export const filterWorkforceEmployees = (
  employees: EmployeeRecord[],
  filters: WorkforceListFilters
) => {
  const normalizedKeyword = normalizeSearchValue(filters.keyword);

  return sortWorkforceEmployees(employees)
    .filter(
      (employee) =>
        filters.selectedSiteId === "all" || employee.currentSiteId === filters.selectedSiteId
    )
    .filter(
      (employee) => filters.selectedStatus === "all" || employee.status === filters.selectedStatus
    )
    .filter((employee) => {
      if (filters.selectedEmploymentFilter === "all") {
        return true;
      }

      if (filters.selectedEmploymentFilter === "bp") {
        return isBpEmploymentType(employee.employmentType);
      }

      return (
        formatWorkforceEmploymentType(employee.employmentType) ===
        (filters.selectedEmploymentFilter === "regular" ? "정규" : "계약")
      );
    })
    .filter(
      (employee) =>
        filters.selectedAssignmentStatus === "all" ||
        getWorkforceAssignmentState(employee) === filters.selectedAssignmentStatus
    )
    .filter((employee) => {
      if (!normalizedKeyword) {
        return true;
      }

      const searchTargets = [
        employee.name,
        employee.employeeCode,
        employee.contact,
        employee.rank,
        employee.currentSiteName
      ];

      return searchTargets.some((target) =>
        normalizeSearchValue(target).includes(normalizedKeyword)
      );
    });
};

export const buildWorkforceListState = (input: {
  employees: EmployeeRecord[];
  filters: WorkforceListFilters;
  page: number;
  pageSize: WorkforcePageSize;
}): WorkforceListState => {
  const deletedSiteEmployees = input.employees.filter(isEmployeeAssignedToDeletedSite);
  const activeEmployees = input.employees.filter((employee) => !isEmployeeAssignedToDeletedSite(employee));
  const filteredEmployees = filterWorkforceEmployees(activeEmployees, input.filters);
  const pageCount = Math.max(Math.ceil(filteredEmployees.length / input.pageSize), 1);
  const requestedPage = Math.max(Math.trunc(input.page), 1);
  const safePage = Math.min(requestedPage, pageCount);
  const startIndex = filteredEmployees.length === 0 ? 0 : (safePage - 1) * input.pageSize;
  const pageEmployees = filteredEmployees.slice(startIndex, startIndex + input.pageSize);
  const endIndex = pageEmployees.length === 0 ? 0 : startIndex + pageEmployees.length;

  return {
    activeEmployees,
    deletedSiteEmployees,
    deletedSiteEmployeeRows: buildDeletedSiteEmployeeNoticeRows(deletedSiteEmployees),
    employmentCounts: countWorkforceEmploymentTypes(activeEmployees),
    filteredEmployees,
    pageCount,
    pageEmployees,
    requestedPage,
    safePage,
    startIndex,
    endIndex
  };
};
