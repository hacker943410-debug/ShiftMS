import type {
  DashboardBridge,
  DashboardChartExportInput,
  DashboardReportExportInput
} from "@shared/bridge/contracts";

import type { DashboardExportFormat } from "./DashboardControlPanel";

type DashboardExportBridge = Pick<
  DashboardBridge,
  "exportDashboardChartData" | "exportDashboardReport"
>;

type DashboardExportScope = DashboardChartExportInput["chartKey"] | "all";

interface CreateDashboardExportActionsInput {
  bridge: Partial<DashboardExportBridge>;
  filterSummary: DashboardReportExportInput["filters"];
  getChartImageDataUrl: (chartKey: DashboardChartExportInput["chartKey"]) => string | undefined;
  getErrorMessage: (error: unknown) => string;
  rankingExportSection: DashboardReportExportInput["sections"][number];
  ratioChartExportInput: DashboardChartExportInput;
  setChartActionError: (message: string | null) => void;
  setChartActionMessage: (message: string | null) => void;
  setExportingActionKey: (value: string | null) => void;
  siteChartExportInput: DashboardChartExportInput;
  trendChartExportInput: DashboardChartExportInput;
}

export const createDashboardExportActionKey = (
  scope: DashboardExportScope,
  format: DashboardExportFormat
) => `${scope}:${format}`;

export const resolveDashboardExportingFormat = (
  exportingActionKey: string | null,
  scope: DashboardExportScope
): DashboardExportFormat | null =>
  exportingActionKey === createDashboardExportActionKey(scope, "pdf")
    ? "pdf"
    : exportingActionKey === createDashboardExportActionKey(scope, "xlsx")
      ? "xlsx"
      : null;

export const createDashboardExportActions = (input: CreateDashboardExportActionsInput) => {
  const handleExportChart = async (
    chartInput: DashboardChartExportInput,
    outputFormat: DashboardExportFormat
  ) => {
    input.setChartActionError(null);
    input.setChartActionMessage(null);
    input.setExportingActionKey(createDashboardExportActionKey(chartInput.chartKey, outputFormat));

    try {
      if (typeof input.bridge.exportDashboardChartData !== "function") {
        input.setChartActionError(
          "차트 내보내기 기능이 현재 앱 실행본에 반영되지 않았습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요."
        );
        return;
      }

      const result = await input.bridge.exportDashboardChartData({
        ...chartInput,
        outputFormat,
        chartImageDataUrl: input.getChartImageDataUrl(chartInput.chartKey)
      });

      if (!result.ok) {
        if (result.errorCode === "EXPORT_CANCELLED") {
          return;
        }

        input.setChartActionError(result.message);
        return;
      }

      input.setChartActionMessage(
        `${result.data.chartTitle}를 ${result.data.outputFileName}로 저장했습니다.`
      );
    } catch (error) {
      input.setChartActionError(input.getErrorMessage(error));
    } finally {
      input.setExportingActionKey(null);
    }
  };

  const handleExportDashboardReport = async (outputFormat: DashboardExportFormat) => {
    input.setChartActionError(null);
    input.setChartActionMessage(null);
    input.setExportingActionKey(createDashboardExportActionKey("all", outputFormat));

    try {
      if (typeof input.bridge.exportDashboardReport !== "function") {
        input.setChartActionError(
          "대시보드 전체 내보내기 기능이 현재 앱 실행본에 반영되지 않았습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요."
        );
        return;
      }

      const result = await input.bridge.exportDashboardReport({
        title: "대시보드 전체 내보내기",
        filters: input.filterSummary,
        outputFormat,
        sections: [
          {
            sectionKey: "trend",
            chartTitle: input.trendChartExportInput.chartTitle,
            sheetName: input.trendChartExportInput.sheetName,
            columns: input.trendChartExportInput.columns,
            rows: input.trendChartExportInput.rows,
            chartImageDataUrl: input.getChartImageDataUrl("trend")
          },
          {
            sectionKey: "site",
            chartTitle: input.siteChartExportInput.chartTitle,
            sheetName: input.siteChartExportInput.sheetName,
            columns: input.siteChartExportInput.columns,
            rows: input.siteChartExportInput.rows,
            chartImageDataUrl: input.getChartImageDataUrl("site")
          },
          input.rankingExportSection,
          {
            sectionKey: "ratio",
            chartTitle: input.ratioChartExportInput.chartTitle,
            sheetName: input.ratioChartExportInput.sheetName,
            columns: input.ratioChartExportInput.columns,
            rows: input.ratioChartExportInput.rows,
            chartImageDataUrl: input.getChartImageDataUrl("ratio")
          }
        ]
      });

      if (!result.ok) {
        if (result.errorCode === "EXPORT_CANCELLED") {
          return;
        }

        input.setChartActionError(result.message);
        return;
      }

      input.setChartActionMessage(
        `${result.data.title}를 ${result.data.outputFileName}로 저장했습니다.`
      );
    } catch (error) {
      input.setChartActionError(input.getErrorMessage(error));
    } finally {
      input.setExportingActionKey(null);
    }
  };

  return {
    handleExportChart,
    handleExportDashboardReport
  };
};
