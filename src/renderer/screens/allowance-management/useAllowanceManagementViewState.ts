import { useState } from "react";

import type { AllowanceHistoryStatusFilter } from "@shared/domain/allowance-workflow";

import type { AllowanceWorkType, EmployeeCurrentStatusFilter, WorkTypeFilter } from "./allowance-management-selectors";

type AllowanceViewMode = "overview" | "history";
type AllowanceOverviewLayoutMode = "split" | "distribution-expanded" | "detail-expanded";
type ExpandTarget = "overview" | "history";

export const useAllowanceManagementViewState = () => {
  const [viewMode, setViewMode] = useState<AllowanceViewMode>("overview");
  const [overviewLayoutMode, setOverviewLayoutMode] =
    useState<AllowanceOverviewLayoutMode>("split");
  const [overviewYear, setOverviewYear] = useState("all");
  const [overviewMonth, setOverviewMonth] = useState("");
  const [overviewSite, setOverviewSite] = useState("all");
  const [overviewKeyword, setOverviewKeyword] = useState("");
  const [historyYear, setHistoryYear] = useState("all");
  const [historyMonth, setHistoryMonth] = useState("");
  const [historySite, setHistorySite] = useState("all");
  const [historyWorkType, setHistoryWorkType] = useState<WorkTypeFilter>("all");
  const [historyStatus, setHistoryStatus] = useState<AllowanceHistoryStatusFilter>("all");
  const [historyEmployee, setHistoryEmployee] = useState("all");
  const [historyCurrentStatus, setHistoryCurrentStatus] =
    useState<EmployeeCurrentStatusFilter>("all");
  const [expandedOverviewSites, setExpandedOverviewSites] = useState<string[]>([]);
  const [expandedHistorySites, setExpandedHistorySites] = useState<string[]>([]);
  const [expandedOverviewDetails, setExpandedOverviewDetails] = useState<string[]>([]);
  const [expandedHistoryDetails, setExpandedHistoryDetails] = useState<string[]>([]);
  const [hoveredDistributionSite, setHoveredDistributionSite] = useState<string | null>(null);
  const [activeDonutType, setActiveDonutType] = useState<AllowanceWorkType | null>(null);

  const resetOverviewFilters = () => {
    setOverviewYear("all");
    setOverviewMonth("");
    setOverviewSite("all");
    setOverviewKeyword("");
  };

  const resetHistoryFilters = () => {
    setHistorySite("all");
    setHistoryYear("all");
    setHistoryMonth("");
    setHistoryWorkType("all");
    setHistoryStatus("all");
    setHistoryCurrentStatus("all");
    setHistoryEmployee("all");
  };

  const toggleExpandedSite = (target: ExpandTarget, siteName: string) => {
    const update = (current: string[]) =>
      current.includes(siteName)
        ? current.filter((item) => item !== siteName)
        : [...current, siteName];

    if (target === "overview") {
      setExpandedOverviewSites(update);
      return;
    }

    setExpandedHistorySites(update);
  };

  const toggleExpandedDetail = (target: ExpandTarget, rowId: string) => {
    const update = (current: string[]) =>
      current.includes(rowId) ? current.filter((item) => item !== rowId) : [...current, rowId];

    if (target === "overview") {
      setExpandedOverviewDetails(update);
      return;
    }

    setExpandedHistoryDetails(update);
  };

  const toggleOverviewLayoutMode = (mode: Exclude<AllowanceOverviewLayoutMode, "split">) => {
    setOverviewLayoutMode((current) => (current === mode ? "split" : mode));
  };

  return {
    activeDonutType,
    expandedHistoryDetails,
    expandedHistorySites,
    expandedOverviewDetails,
    expandedOverviewSites,
    historyCurrentStatus,
    historyEmployee,
    historyMonth,
    historySite,
    historyStatus,
    historyWorkType,
    historyYear,
    hoveredDistributionSite,
    overviewKeyword,
    overviewLayoutMode,
    overviewMonth,
    overviewSite,
    overviewYear,
    resetHistoryFilters,
    resetOverviewFilters,
    setActiveDonutType,
    setHistoryCurrentStatus,
    setHistoryEmployee,
    setHistoryMonth,
    setHistorySite,
    setHistoryStatus,
    setHistoryWorkType,
    setHistoryYear,
    setHoveredDistributionSite,
    setOverviewKeyword,
    setOverviewMonth,
    setOverviewSite,
    setOverviewYear,
    setViewMode,
    toggleExpandedDetail,
    toggleExpandedSite,
    toggleOverviewLayoutMode,
    viewMode
  };
};
