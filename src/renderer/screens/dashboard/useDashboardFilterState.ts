import { useCallback, useState } from "react";

export type DashboardPeriodMode = "single" | "range";

export interface DashboardFilterState {
  periodMode: DashboardPeriodMode;
  year: string;
  month: string;
  startYearMonth: string;
  endYearMonth: string;
  siteId: string;
  employeeName: string;
}

const isValidYearMonth = (value: string) => /^\d{4}-\d{2}$/.test(value);

const createDefaultDashboardFilters = (
  selectedMonth: string,
  selectedSiteId: string,
  allOptionValue: string
): DashboardFilterState => {
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
  const hasSelectedMonth = isValidYearMonth(selectedMonth);
  const year = hasSelectedMonth ? selectedMonth.slice(0, 4) : currentYear;
  const month = hasSelectedMonth ? selectedMonth.slice(5, 7) : allOptionValue;
  const endYearMonth = hasSelectedMonth ? selectedMonth : `${year}-${currentMonth}`;

  return {
    periodMode: "single",
    year,
    month,
    startYearMonth: hasSelectedMonth ? selectedMonth : `${year}-01`,
    endYearMonth,
    siteId: selectedSiteId || allOptionValue,
    employeeName: allOptionValue
  };
};

interface UseDashboardFilterStateInput {
  allOptionValue: string;
  selectedMonth: string;
  selectedSiteId: string;
  setSelectedMonth: (value: string) => void;
  setSelectedSiteId: (value: string) => void;
}

export const useDashboardFilterState = ({
  allOptionValue,
  selectedMonth,
  selectedSiteId,
  setSelectedMonth,
  setSelectedSiteId
}: UseDashboardFilterStateInput) => {
  const [draftFilters, setDraftFilters] = useState<DashboardFilterState>(() =>
    createDefaultDashboardFilters(selectedMonth, selectedSiteId, allOptionValue)
  );
  const [appliedFilters, setAppliedFilters] = useState<DashboardFilterState>(() =>
    createDefaultDashboardFilters(selectedMonth, selectedSiteId, allOptionValue)
  );

  const applyDraftValueChange = useCallback(
    (field: keyof DashboardFilterState, value: string) => {
      const normalizedValue =
        field === "periodMode" ? (value === "range" ? "range" : "single") : value;
      const periodPatch: Partial<DashboardFilterState> = {};

      if (field === "year") {
        if (draftFilters.periodMode === "single") {
          if (draftFilters.month === allOptionValue) {
            periodPatch.startYearMonth = `${value}-01`;
            periodPatch.endYearMonth = `${value}-12`;
          } else {
            periodPatch.startYearMonth = `${value}-${draftFilters.month}`;
            periodPatch.endYearMonth = `${value}-${draftFilters.month}`;
          }
        }
      }

      if (field === "month") {
        if (value === allOptionValue) {
          periodPatch.startYearMonth = `${draftFilters.year}-01`;
          periodPatch.endYearMonth = `${draftFilters.year}-12`;
        } else {
          periodPatch.startYearMonth = `${draftFilters.year}-${value}`;
          periodPatch.endYearMonth = `${draftFilters.year}-${value}`;
        }
      }

      if (field === "startYearMonth" || field === "endYearMonth") {
        periodPatch.periodMode = "range";
      }

      const nextFilters = {
        ...draftFilters,
        [field]: normalizedValue,
        ...periodPatch,
        ...(field === "periodMode" ||
        field === "year" ||
        field === "month" ||
        field === "startYearMonth" ||
        field === "endYearMonth" ||
        field === "siteId"
          ? { employeeName: allOptionValue }
          : {})
      } as DashboardFilterState;

      setDraftFilters(nextFilters);
      setAppliedFilters(nextFilters);

      if (nextFilters.periodMode === "single" && nextFilters.month !== allOptionValue) {
        setSelectedMonth(`${nextFilters.year}-${nextFilters.month}`);
      } else if (
        nextFilters.periodMode === "range" &&
        nextFilters.startYearMonth === nextFilters.endYearMonth &&
        isValidYearMonth(nextFilters.startYearMonth)
      ) {
        setSelectedMonth(nextFilters.startYearMonth);
      } else {
        setSelectedMonth("");
      }

      setSelectedSiteId(nextFilters.siteId === allOptionValue ? "" : nextFilters.siteId);
    },
    [allOptionValue, draftFilters, setSelectedMonth, setSelectedSiteId]
  );

  return {
    appliedFilters,
    applyDraftValueChange,
    draftFilters,
    setAppliedFilters,
    setDraftFilters
  };
};
