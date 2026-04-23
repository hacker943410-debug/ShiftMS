import { describe, expect, it, vi } from "vitest";

import type {
  DashboardChartExportInput,
  DashboardReportExportInput
} from "@shared/bridge/contracts";

import {
  createDashboardExportActionKey,
  createDashboardExportActions,
  resolveDashboardExportingFormat
} from "./dashboard-export-actions";

const createChartInput = (
  chartKey: DashboardChartExportInput["chartKey"]
): DashboardChartExportInput => ({
  chartKey,
  chartTitle: "월별 수당 추이",
  sheetName: "월별 수당 추이",
  filters: {
    year: "2026년",
    month: "4월",
    siteName: "전체",
    employeeName: "전체",
    dataSource: "실데이터"
  },
  columns: [{ key: "month", header: "월", format: "text" }],
  rows: [{ month: "2026.04" }]
});

const baseReportSection: DashboardReportExportInput["sections"][number] = {
  sectionKey: "ranking",
  chartTitle: "근무 유형별 상위 인원",
  sheetName: "근무 유형별 상위 인원",
  columns: [{ key: "name", header: "이름", format: "text" }],
  rows: [{ name: "홍길동" }]
};

describe("dashboard-export-actions", () => {
  it("should export a chart with the image payload and success message", async () => {
    const askQuestion = vi.fn().mockResolvedValue({ confirmed: true });
    const exportDashboardChartData = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        chartTitle: "월별 수당 추이",
        outputFileName: "trend.pdf"
      }
    });
    const setChartActionError = vi.fn();
    const setChartActionMessage = vi.fn();
    const setExportingActionKey = vi.fn();
    const actions = createDashboardExportActions({
      askQuestion,
      bridge: { exportDashboardChartData },
      filterSummary: {
        year: "2026년",
        month: "4월",
        siteName: "전체",
        employeeName: "전체",
        dataSource: "실데이터"
      },
      getChartImageDataUrl: vi.fn().mockReturnValue("data:image/png;base64,AAA"),
      getErrorMessage: (error) => String(error),
      rankingExportSection: baseReportSection,
      ratioChartExportInput: createChartInput("ratio"),
      setChartActionError,
      setChartActionMessage,
      setExportingActionKey,
      siteChartExportInput: createChartInput("site"),
      trendChartExportInput: createChartInput("trend")
    });

    await actions.handleExportChart(createChartInput("trend"), "pdf");

    expect(exportDashboardChartData).toHaveBeenCalledWith(
      expect.objectContaining({
        chartKey: "trend",
        outputFormat: "pdf",
        chartImageDataUrl: "data:image/png;base64,AAA"
      })
    );
    expect(setExportingActionKey).toHaveBeenCalledWith("trend:pdf");
    expect(setExportingActionKey).toHaveBeenLastCalledWith(null);
    expect(setChartActionMessage).toHaveBeenCalledWith("월별 수당 추이를 trend.pdf로 저장했습니다.");
    expect(setChartActionError).toHaveBeenCalledWith(null);
    expect(askQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "차트 출력 완료",
        message: "월별 수당 추이를 trend.pdf로 저장했습니다."
      })
    );
  });

  it("should surface a missing report bridge implementation", async () => {
    const setChartActionError = vi.fn();
    const actions = createDashboardExportActions({
      askQuestion: vi.fn(),
      bridge: {},
      filterSummary: {
        year: "2026년",
        month: "4월",
        siteName: "전체",
        employeeName: "전체",
        dataSource: "실데이터"
      },
      getChartImageDataUrl: vi.fn(),
      getErrorMessage: (error) => String(error),
      rankingExportSection: baseReportSection,
      ratioChartExportInput: createChartInput("ratio"),
      setChartActionError,
      setChartActionMessage: vi.fn(),
      setExportingActionKey: vi.fn(),
      siteChartExportInput: createChartInput("site"),
      trendChartExportInput: createChartInput("trend")
    });

    await actions.handleExportDashboardReport("xlsx");

    expect(setChartActionError).toHaveBeenCalledWith(
      "대시보드 전체 내보내기 기능이 현재 앱 실행본에 반영되지 않았습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요."
    );
  });

  it("should resolve exporting format by action key", () => {
    expect(
      resolveDashboardExportingFormat(createDashboardExportActionKey("site", "xlsx"), "site")
    ).toBe("xlsx");
    expect(
      resolveDashboardExportingFormat(createDashboardExportActionKey("ratio", "pdf"), "ratio")
    ).toBe("pdf");
    expect(resolveDashboardExportingFormat(null, "all")).toBeNull();
  });
});
