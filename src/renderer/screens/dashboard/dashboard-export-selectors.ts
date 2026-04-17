import type {
  DashboardChartExportFilterSummary,
  DashboardChartExportInput,
  DashboardReportExportInput
} from "@shared/bridge/contracts";

import type { DashboardFilterState } from "./useDashboardFilterState";
import type { DashboardBusinessCategory } from "./dashboard-records";
import type {
  DashboardMonthlyTrend,
  DashboardRatioItem,
  DashboardSiteAllowance,
  DashboardTopPerformer
} from "./dashboard-selectors";

export interface DashboardControlPanelNotice {
  message: string;
  title: string;
}

export interface DashboardRankingTabOption {
  key: DashboardBusinessCategory;
  label: string;
}

interface BuildDashboardExportModelsInput {
  allOptionValue: string;
  appliedFilters: DashboardFilterState;
  filterSummary: DashboardChartExportFilterSummary;
  rankingTabs: DashboardRankingTabOption[];
  ratioItems: DashboardRatioItem[];
  siteChartItems: DashboardSiteAllowance[];
  topPerformersByCategory: Record<DashboardBusinessCategory, DashboardTopPerformer[]>;
  trendItems: DashboardMonthlyTrend[];
}

const formatRatioPercent = (ratio: number) => Number((ratio * 100).toFixed(1));

const buildDashboardTrendChartTitle = (
  appliedFilters: DashboardFilterState,
  _allOptionValue: string
) =>
  appliedFilters.periodMode === "range"
    ? "기간별 수당 지급 추이"
    : "월별 수당 지급 추이 (최근 6개월)";

export const buildDashboardExportModels = ({
  allOptionValue,
  appliedFilters,
  filterSummary,
  rankingTabs,
  ratioItems,
  siteChartItems,
  topPerformersByCategory,
  trendItems
}: BuildDashboardExportModelsInput) => {
  const trendChartTitle = buildDashboardTrendChartTitle(appliedFilters, allOptionValue);

  const trendChartExportInput: DashboardChartExportInput = {
    chartKey: "trend",
    chartTitle: trendChartTitle,
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
  };

  const siteChartExportInput: DashboardChartExportInput = {
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
  };

  const ratioChartExportInput: DashboardChartExportInput = {
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
  };

  const rankingChartExportInput: DashboardChartExportInput = {
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
    rows: rankingTabs.flatMap((tab) =>
      topPerformersByCategory[tab.key].map((item) => ({
        categoryLabel: tab.label,
        employeeName: item.employeeName,
        siteName: item.siteName,
        minutes: Number((item.minutes / 60).toFixed(1)),
        allowanceAmount: Math.round(item.allowanceAmount)
      }))
    )
  };

  const rankingExportSection: DashboardReportExportInput["sections"][number] = {
    sectionKey: "ranking",
    chartTitle: "근무 유형별 상위 인원 (Top 10)",
    sheetName: "근무 유형별 상위 인원",
    columns: rankingChartExportInput.columns,
    rows: rankingChartExportInput.rows
  };

  return {
    rankingChartExportInput,
    rankingExportSection,
    ratioChartExportInput,
    siteChartExportInput,
    trendChartExportInput,
    trendChartTitle
  };
};

export const buildDashboardControlPanelNotices = ({
  chartActionError,
  chartActionMessage,
  hasRealDashboardRecords,
  isLoading,
  isUsingDemoData,
  screenError
}: {
  chartActionError: string | null;
  chartActionMessage: string | null;
  hasRealDashboardRecords: boolean;
  isLoading: boolean;
  isUsingDemoData: boolean;
  screenError: string | null;
}): DashboardControlPanelNotice[] =>
  [
    isUsingDemoData
      ? {
          title: "샘플 데이터 표시 중",
          message: "실데이터가 없어 2025년 1월부터 2026년 2월까지의 샘플 데이터를 표시 중입니다."
        }
      : null,
    !isLoading && !hasRealDashboardRecords && !isUsingDemoData
      ? {
          title: "대시보드 데이터 없음",
          message: "승인된 수당 실적이 아직 없어 대시보드 집계와 내보내기 기능을 비워 둡니다."
        }
      : null,
    screenError
      ? {
          title: "데이터 로드 경고",
          message: screenError
        }
      : null,
    chartActionError
      ? {
          title: "대시보드 내보내기 오류",
          message: chartActionError
        }
      : null,
    chartActionMessage
      ? {
          title: "대시보드 내보내기 완료",
          message: chartActionMessage
        }
      : null
  ].filter((notice): notice is DashboardControlPanelNotice => Boolean(notice));
