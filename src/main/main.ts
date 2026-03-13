import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";

import { createAppHealth, resolveAppSettings } from "./services/app-settings-service";
import {
  getStoredAppSettingsSnapshot,
  saveStoredAppSettings
} from "./services/app-settings-storage-service";
import {
  closeFileWatchRuntime,
  getFileWatchStatusSnapshot,
  restartFileWatchRuntime,
  stopFileWatchRuntime
} from "./services/file-watch-runtime-service";
import { getSession, signIn, signOut } from "./services/auth-service";
import { closeSqliteStorage, initializeSqliteStorage } from "./services/sqlite-storage-service";
import {
  listStoredEmployees,
  saveStoredEmployee
} from "./services/employee-storage-service";
import {
  closeStoredEmployeeAssignment,
  closeStoredEmployeeWageRate,
  listStoredEmployeeAssignments,
  listStoredEmployeeWageRates,
  saveStoredEmployeeAssignment,
  saveStoredEmployeeWageRate
} from "./services/employee-history-service";
import { listStoredSites, saveStoredSite } from "./services/site-storage-service";
import {
  deactivateStoredShiftPattern,
  listStoredShiftPatterns,
  saveStoredShiftPattern
} from "./services/shift-pattern-storage-service";
import {
  listStoredMonthlySchedules,
  saveStoredMonthlySchedule
} from "./services/monthly-schedule-storage-service";
import { exportMonthlySchedulePlan } from "./services/schedule-plan-export-service";
import { listStoredSchedulePlanExports } from "./services/schedule-plan-export-history-service";
import { publishSchedulePlanExport } from "./services/schedule-plan-publish-service";
import { previewMonthlySchedulePlan } from "./services/schedule-plan-preview-service";
import { previewAllowanceCalculation } from "./services/allowance-preview-service";
import {
  exportAllowanceDocuments
} from "./services/allowance-document-export-service";
import { exportDashboardChartData } from "./services/dashboard-chart-export-service";
import {
  listStoredAllowanceDocumentExports
} from "./services/allowance-document-export-history-service";
import {
  listApprovedAllowanceCalculationResults,
  runApprovedAllowanceCalculation
} from "./services/approved-allowance-calculation-service";
import {
  approvePerformanceFile,
  getPerformanceApprovalHistory,
  rejectPerformanceFile
} from "./services/performance-approval-flow-service";
import {
  getPendingPerformanceFileDetail,
  listPendingPerformanceFiles
} from "./services/performance-queue-service";
import {
  listStoredAllowanceRateVersions,
  listStoredDocumentTemplateVersions,
  listStoredHolidayCalendars,
  listStoredOperationUsers
} from "./services/operations-storage-service";
import type {
  AllowanceDocumentExportInput,
  AllowancePreviewInput,
  AppHealth,
  AppSettingsUpdateInput,
  DashboardChartExportInput,
  EmployeeListQuery,
  EmployeeUpsertInput,
  MonthlyScheduleUpsertInput,
  ShiftPatternUpsertInput,
  SiteUpsertInput
} from "../shared/bridge/contracts";
import type {
  PerformanceApprovalActionInput,
  PerformanceRejectionInput
} from "../shared/domain/performance-file";
import type { TemplateType } from "../shared/domain/model";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

const requireSession = () => {
  const sessionResult = getSession();

  if (!sessionResult.ok || !sessionResult.data) {
    return {
      ok: false as const,
      errorCode: "AUTH_SESSION_REQUIRED",
      message: "로그인 세션이 필요합니다."
    };
  }

  return {
    ok: true as const,
    data: sessionResult.data
  };
};

const createMainWindow = async () => {
  const preloadPath = path.join(__dirname, "../preload/index.js");
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f3efe6",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
    return;
  }

  const rendererPath = path.join(__dirname, "../../dist/index.html");
  await window.loadFile(rendererPath);
};

app.whenReady().then(() => {
  initializeSqliteStorage({
    userDataPath: app.getPath("userData")
  });
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("app:get-health", () => {
    const health: AppHealth = createAppHealth({
      appVersion: app.getVersion(),
      environment: isDevelopment ? "development" : "production",
      userDataPath: app.getPath("userData")
    });

    return {
      ok: true,
      data: health
    };
  });
  ipcMain.handle("dashboard:export-chart-data", async (event, input: DashboardChartExportInput) => {
    const settings = getStoredAppSettingsSnapshot({
      userDataPath: app.getPath("userData")
    });
    const exportedAt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const defaultFileName = `${sanitizeFileSegment(input.chartKey)}_${sanitizeFileSegment(
      input.chartTitle
    )}_${exportedAt}.xlsx`;
    const defaultPath = path.resolve(settings.scheduleExportDir, "dashboard-exports", defaultFileName);
    const window = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
    const saveDialogOptions = {
      title: "차트 데이터 내보내기",
      defaultPath,
      buttonLabel: "저장",
      filters: [
        {
          name: "Excel Workbook",
          extensions: ["xlsx"]
        }
      ],
      showOverwriteConfirmation: true
    };
    const saveResult = window
      ? await dialog.showSaveDialog(window, saveDialogOptions)
      : await dialog.showSaveDialog(saveDialogOptions);

    if (saveResult.canceled || !saveResult.filePath) {
      return {
        ok: false as const,
        errorCode: "EXPORT_CANCELLED",
        message: "차트 내보내기를 취소했습니다."
      };
    }

    return exportDashboardChartData(input, {
      userDataPath: app.getPath("userData"),
      outputPath: saveResult.filePath
    });
  });
  ipcMain.handle("auth:sign-in", (_event, input) => signIn(input));
  ipcMain.handle("auth:sign-out", () => signOut());
  ipcMain.handle("auth:get-session", () => getSession());
  ipcMain.handle("employees:list", (_event, query?: EmployeeListQuery) => ({
    ok: true as const,
    data: listStoredEmployees(query)
  }));
  ipcMain.handle("employees:list-wage-rates", (_event, employeeId: string) => ({
    ok: true as const,
    data: listStoredEmployeeWageRates(employeeId)
  }));
  ipcMain.handle("employees:list-assignments", (_event, employeeId: string) => ({
    ok: true as const,
    data: listStoredEmployeeAssignments(employeeId)
  }));
  ipcMain.handle("employees:save-wage-rate", (_event, input) => ({
    ok: true as const,
    data: saveStoredEmployeeWageRate(input)
  }));
  ipcMain.handle("employees:close-wage-rate", (_event, input) => ({
    ok: true as const,
    data: closeStoredEmployeeWageRate(input)
  }));
  ipcMain.handle("employees:save-assignment", (_event, input) => ({
    ok: true as const,
    data: saveStoredEmployeeAssignment(input)
  }));
  ipcMain.handle("employees:close-assignment", (_event, input) => ({
    ok: true as const,
    data: closeStoredEmployeeAssignment(input)
  }));
  ipcMain.handle("employees:save", (_event, input: EmployeeUpsertInput) => ({
    ok: true as const,
    data: saveStoredEmployee(input)
  }));
  ipcMain.handle("sites:list", () => ({
    ok: true as const,
    data: listStoredSites()
  }));
  ipcMain.handle("sites:save", (_event, input: SiteUpsertInput) => ({
    ok: true as const,
    data: saveStoredSite(input)
  }));
  ipcMain.handle("shift-patterns:list", (_event, siteId?: string) => ({
    ok: true as const,
    data: listStoredShiftPatterns(siteId)
  }));
  ipcMain.handle("operations:get-app-settings", () => ({
    ok: true as const,
    data: getStoredAppSettingsSnapshot({
      userDataPath: app.getPath("userData")
    })
  }));
  ipcMain.handle("operations:save-app-settings", (_event, input: AppSettingsUpdateInput) => {
    try {
      return {
        ok: true as const,
        data: saveStoredAppSettings(input, {
          userDataPath: app.getPath("userData")
        })
      };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: "APP_SETTINGS_SAVE_FAILED",
        message: getErrorMessage(error)
      };
    }
  });
  ipcMain.handle("operations:get-file-watch-status", () => ({
    ok: true as const,
    data: getFileWatchStatusSnapshot({
      userDataPath: app.getPath("userData")
    })
  }));
  ipcMain.handle("operations:restart-file-watch", async () => ({
    ok: true as const,
    data: await restartFileWatchRuntime({
      userDataPath: app.getPath("userData")
    })
  }));
  ipcMain.handle("operations:stop-file-watch", async () => ({
    ok: true as const,
    data: await stopFileWatchRuntime({
      userDataPath: app.getPath("userData")
    })
  }));
  ipcMain.handle("operations:list-holiday-calendars", (_event, year?: number) => ({
    ok: true as const,
    data: listStoredHolidayCalendars(year)
  }));
  ipcMain.handle("operations:list-allowance-rate-versions", (_event, year?: number) => ({
    ok: true as const,
    data: listStoredAllowanceRateVersions(year)
  }));
  ipcMain.handle("operations:list-users", () => ({
    ok: true as const,
    data: listStoredOperationUsers()
  }));
  ipcMain.handle(
    "operations:list-document-template-versions",
    (_event, templateType?: TemplateType) => ({
      ok: true as const,
      data: listStoredDocumentTemplateVersions(templateType)
    })
  );
  ipcMain.handle("shift-patterns:save", (_event, input: ShiftPatternUpsertInput) => ({
    ok: true as const,
    data: saveStoredShiftPattern(input)
  }));
  ipcMain.handle("shift-patterns:deactivate", (_event, input) => ({
    ok: true as const,
    data: deactivateStoredShiftPattern(input.patternId)
  }));
  ipcMain.handle("monthly-schedules:list", (_event, siteId?: string) => ({
    ok: true as const,
    data: listStoredMonthlySchedules(siteId)
  }));
  ipcMain.handle("monthly-schedules:save", (_event, input: MonthlyScheduleUpsertInput) => ({
    ok: true as const,
    data: saveStoredMonthlySchedule(input)
  }));
  ipcMain.handle("monthly-schedules:preview-plan", async (_event, scheduleId: string) => ({
    ok: true as const,
    data: await previewMonthlySchedulePlan(scheduleId)
  }));
  ipcMain.handle("monthly-schedules:export-plan", async (_event, scheduleId: string) => ({
    ok: true as const,
    data: await exportMonthlySchedulePlan({
      scheduleId,
      userDataPath: app.getPath("userData")
    })
  }));
  ipcMain.handle("monthly-schedules:list-exports", (_event, scheduleId?: string) => ({
    ok: true as const,
    data: listStoredSchedulePlanExports(scheduleId)
  }));
  ipcMain.handle("monthly-schedules:publish-export", (_event, exportId: string) => ({
    ok: true as const,
    data: publishSchedulePlanExport({
      exportId,
      userDataPath: app.getPath("userData")
    })
  }));
  ipcMain.handle("performance:list-pending-files", async () => ({
    ok: true as const,
    data: await listPendingPerformanceFiles()
  }));
  ipcMain.handle("performance:get-pending-file-detail", async (_event, fileId: string) => ({
    ok: true as const,
    data: await getPendingPerformanceFileDetail(fileId)
  }));
  ipcMain.handle(
    "performance:approve",
    async (_event, input: PerformanceApprovalActionInput) => {
      const sessionResult = requireSession();

      if (!sessionResult.ok) {
        return sessionResult;
      }

      return approvePerformanceFile(input, sessionResult.data, {
        userDataPath: app.getPath("userData")
      });
    }
  );
  ipcMain.handle(
    "performance:reject",
    async (_event, input: PerformanceRejectionInput) => {
      const sessionResult = requireSession();

      if (!sessionResult.ok) {
        return sessionResult;
      }

      return rejectPerformanceFile(input, sessionResult.data);
    }
  );
  ipcMain.handle("performance:list-approval-history", () => getPerformanceApprovalHistory());
  ipcMain.handle("allowance:run-approved-calculation", async (_event, fileId: string) =>
    runApprovedAllowanceCalculation(fileId)
  );
  ipcMain.handle("allowance:list-results", () => ({
    ok: true as const,
    data: listApprovedAllowanceCalculationResults()
  }));
  ipcMain.handle(
    "allowance:export-documents",
    (_event, input: AllowanceDocumentExportInput) =>
      exportAllowanceDocuments(input, {
        userDataPath: app.getPath("userData")
      })
  );
  ipcMain.handle("allowance:list-document-exports", () => ({
    ok: true as const,
    data: listStoredAllowanceDocumentExports()
  }));
  ipcMain.handle(
    "allowance:preview-calculation",
    (_event, input: AllowancePreviewInput) => previewAllowanceCalculation(input)
  );
  void restartFileWatchRuntime({
    userDataPath: app.getPath("userData")
  });
  void createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  void closeFileWatchRuntime();
  closeSqliteStorage();

  if (process.platform !== "darwin") {
    app.quit();
  }
});
