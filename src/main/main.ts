import { existsSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

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
import {
  restartDatabaseBackupRuntime,
  stopDatabaseBackupRuntime
} from "./services/database-backup-service";
import {
  previewDatabaseMigrationUpdate,
  runDatabaseMigrationUpdate
} from "./services/database-migration-service";
import { getSession, signIn, signOut } from "./services/auth-service";
import { listAccessLogs, recordAccessLog } from "./services/access-log-service";
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
import {
  applyWorkforceWageBulkUpdate,
  previewWorkforceWageBulkUpdate
} from "./services/workforce-wage-bulk-update-service";
import { deleteStoredSite, listStoredSites, saveStoredSite } from "./services/site-storage-service";
import {
  deactivateStoredShiftPattern,
  listStoredShiftPatterns,
  saveStoredShiftPattern
} from "./services/shift-pattern-storage-service";
import { analyzeSitePatternImport } from "./services/site-pattern-extraction-service";
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
import {
  exportDashboardChartData,
  exportDashboardReport
} from "./services/dashboard-chart-export-service";
import {
  listStoredAllowanceDocumentExports
} from "./services/allowance-document-export-history-service";
import {
  listApprovedAllowanceTargets,
  listAllowanceCalculationHistory,
  listApprovedAllowanceCalculationResults,
  runApprovedAllowanceCalculation,
  setAllowanceCalculationEarlyPayout
} from "./services/approved-allowance-calculation-service";
import {
  approvePerformanceFile,
  finalizeReapprovedPerformanceFile,
  getPerformanceApprovalHistory,
  rejectPerformanceFile
} from "./services/performance-approval-flow-service";
import { hideApprovedPerformanceOverviewRow } from "./services/performance-approved-row-management-service";
import { repairStoredOvertimePerformanceData } from "./services/performance-overtime-repair-service";
import {
  getPerformanceFileDetail,
  getPendingPerformanceFileDetail,
  listPerformanceFiles,
  listPendingPerformanceFiles
} from "./services/performance-queue-service";
import {
  getPerformanceComparison,
  listPerformanceOverview
} from "./services/performance-management-service";
import {
  approveManagedDocumentTemplateVersion,
  deleteManagedDocumentTemplateVersion,
  inspectDocumentTemplateImport,
  saveManagedDocumentTemplateVersion
} from "./services/document-template-management-service";
import { previewDocumentTemplateFile } from "./services/document-template-preview-service";
import { fetchHolidayApiItems } from "./services/holiday-api-service";
import {
  deleteStoredAllowanceRateVersion,
  deleteStoredHolidayItem,
  deleteStoredOperationUser,
  listStoredAllowanceRateVersions,
  listStoredDocumentTemplateHistory,
  listStoredDocumentTemplateVersions,
  listStoredHolidayCalendars,
  listStoredOperationUsers,
  renameStoredHolidayItem,
  replaceStoredHolidayCalendar,
  saveStoredAllowanceRateVersion,
  saveStoredHolidayItem,
  saveStoredOperationUser,
  setStoredDefaultDocumentTemplateVersion,
  updateStoredDocumentTemplateOutputFileNamePattern
} from "./services/operations-storage-service";
import type {
  AccessLogListQuery,
  AccessLogRecordInput,
  AllowanceRateVersionDeleteInput,
  AllowanceRateVersionSaveInput,
  AllowanceDocumentExportInput,
  AllowancePreviewInput,
  AppHealth,
  AppSettingsUpdateInput,
  DashboardChartExportInput,
  DashboardReportExportInput,
  DirectorySelectionInput,
  FileSelectionInput,
  HolidayCalendarReplaceInput,
  HolidayItemDeleteInput,
  HolidayItemRenameInput,
  HolidayItemUpsertInput,
  DatabaseMigrationRunInput,
  DocumentTemplateInspectInput,
  DocumentTemplateOutputFileNameUpdateInput,
  DocumentTemplatePreviewInput,
  DocumentTemplateSaveInput,
  EmployeeListQuery,
  EmployeeUpsertInput,
  MonthlyScheduleUpsertInput,
  OperationUserDeleteInput,
  OperationUserSaveInput,
  PerformanceFileDetailQuery,
  PerformanceComparisonQuery,
  PerformanceFileListQuery,
  PerformanceOverviewQuery,
  ShiftPatternUpsertInput,
  SiteUpsertInput
} from "../shared/bridge/contracts";
import type {
  PerformanceApprovalActionInput,
  PerformanceReapprovalFinalizeInput,
  PerformanceRejectionInput
} from "../shared/domain/performance-file";
import type { TemplateType } from "../shared/domain/model";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const appUserModelId = "com.shiftmgmt.desktop";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

const resolveWindowIconPath = () => {
  if (process.platform !== "win32") {
    return undefined;
  }

  const candidates = [
    path.join(process.resourcesPath, "icon.ico"),
    path.resolve(process.cwd(), "build", "icon.ico")
  ];

  return candidates.find((candidate) => existsSync(candidate));
};

const createDashboardSaveDialogOptions = (input: {
  title: string;
  defaultPath: string;
  outputFormat: "xlsx" | "pdf";
}) => ({
  title: input.title,
  defaultPath: input.defaultPath,
  buttonLabel: "저장",
  filters: [
    input.outputFormat === "pdf"
      ? {
          name: "PDF Document",
          extensions: ["pdf"]
        }
      : {
          name: "Excel Workbook",
          extensions: ["xlsx"]
        }
  ],
  showOverwriteConfirmation: true
});

const documentTemplateLabelByType: Record<TemplateType, string> = {
  schedule: "근무표",
  proposal: "품의서",
  attachment1: "별첨1",
  attachment2: "별첨2"
};

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
  const iconPath = resolveWindowIconPath();
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f3efe6",
    autoHideMenuBar: true,
    ...(iconPath ? { icon: iconPath } : {}),
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

app.whenReady().then(async () => {
  if (process.platform === "win32") {
    app.setAppUserModelId(appUserModelId);
  }

  initializeSqliteStorage({
    userDataPath: app.getPath("userData")
  });
  repairStoredOvertimePerformanceData();
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
    const outputFormat = input.outputFormat ?? "xlsx";
    const exportedAt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const defaultFileName = `${sanitizeFileSegment(input.chartKey)}_${sanitizeFileSegment(
      input.chartTitle
    )}_${exportedAt}.${outputFormat}`;
    const defaultPath = path.resolve(settings.scheduleExportDir, "dashboard-exports", defaultFileName);
    const window = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
    const saveDialogOptions = createDashboardSaveDialogOptions({
      title: outputFormat === "pdf" ? "차트 PDF 내보내기" : "차트 Excel 내보내기",
      defaultPath,
      outputFormat
    });
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
  ipcMain.handle("dashboard:export-report", async (event, input: DashboardReportExportInput) => {
    const settings = getStoredAppSettingsSnapshot({
      userDataPath: app.getPath("userData")
    });
    const exportedAt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const defaultFileName = `${sanitizeFileSegment(input.title)}_${exportedAt}.${input.outputFormat}`;
    const defaultPath = path.resolve(settings.scheduleExportDir, "dashboard-exports", defaultFileName);
    const window = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
    const saveDialogOptions = createDashboardSaveDialogOptions({
      title: input.outputFormat === "pdf" ? "대시보드 PDF 내보내기" : "대시보드 Excel 내보내기",
      defaultPath,
      outputFormat: input.outputFormat
    });
    const saveResult = window
      ? await dialog.showSaveDialog(window, saveDialogOptions)
      : await dialog.showSaveDialog(saveDialogOptions);

    if (saveResult.canceled || !saveResult.filePath) {
      return {
        ok: false as const,
        errorCode: "EXPORT_CANCELLED",
        message: "대시보드 내보내기를 취소했습니다."
      };
    }

    return exportDashboardReport(input, {
      userDataPath: app.getPath("userData"),
      outputPath: saveResult.filePath
    });
  });
  ipcMain.handle("auth:sign-in", (_event, input) => {
    const result = signIn(input);

    if (result.ok) {
      recordAccessLog(
        {
          actionType: "sign-in",
          actionLabel: "로그인",
          details: `${result.data.displayName} 계정 로그인`
        },
        result.data
      );
    }

    return result;
  });
  ipcMain.handle("auth:sign-out", () => {
    const sessionResult = getSession();
    const result = signOut();

    if (sessionResult.ok && sessionResult.data) {
      recordAccessLog(
        {
          actionType: "sign-out",
          actionLabel: "로그아웃",
          details: `${sessionResult.data.displayName} 계정 로그아웃`
        },
        sessionResult.data
      );
    }

    return result;
  });
  ipcMain.handle("auth:get-session", () => getSession());
  ipcMain.handle("access-logs:list", (_event, query?: AccessLogListQuery) => {
    const sessionResult = requireSession();

    if (!sessionResult.ok) {
      return sessionResult;
    }

    return {
      ok: true as const,
      data: listAccessLogs(query)
    };
  });
  ipcMain.handle("access-logs:record", (_event, input: AccessLogRecordInput) => {
    const sessionResult = requireSession();

    if (!sessionResult.ok) {
      return sessionResult;
    }

    recordAccessLog(input, sessionResult.data);

    return {
      ok: true as const,
      data: null
    };
  });
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
  ipcMain.handle("employees:preview-wage-bulk-update", async (_event, input) => {
    try {
      return {
        ok: true as const,
        data: await previewWorkforceWageBulkUpdate(input)
      };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: "WORKFORCE_WAGE_BULK_PREVIEW_FAILED",
        message: getErrorMessage(error)
      };
    }
  });
  ipcMain.handle("employees:apply-wage-bulk-update", async (_event, input) => {
    try {
      return {
        ok: true as const,
        data: await applyWorkforceWageBulkUpdate(input)
      };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: "WORKFORCE_WAGE_BULK_APPLY_FAILED",
        message: getErrorMessage(error)
      };
    }
  });
  ipcMain.handle("sites:list", () => ({
    ok: true as const,
    data: listStoredSites()
  }));
  ipcMain.handle("sites:save", (_event, input: SiteUpsertInput) => ({
    ok: true as const,
    data: saveStoredSite(input)
  }));
  ipcMain.handle("sites:delete", (_event, input) => ({
    ok: true as const,
    data: deleteStoredSite(input.siteId)
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
  ipcMain.handle("operations:save-app-settings", async (_event, input: AppSettingsUpdateInput) => {
    try {
      const savedSettings = saveStoredAppSettings(input, {
        userDataPath: app.getPath("userData")
      });
      await restartFileWatchRuntime({
        userDataPath: app.getPath("userData")
      });
      restartDatabaseBackupRuntime({
        userDataPath: app.getPath("userData")
      });

      return {
        ok: true as const,
        data: savedSettings
      };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: "APP_SETTINGS_SAVE_FAILED",
        message: getErrorMessage(error)
      };
    }
  });
  ipcMain.handle("operations:select-directory", async (event, input?: DirectorySelectionInput) => {
    const window =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow() ??
      undefined;
    const dialogOptions = {
      title: input?.title ?? "폴더 선택",
      buttonLabel: input?.buttonLabel ?? "선택",
      defaultPath: input?.defaultPath,
      properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">
    };
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    return {
      ok: true as const,
      data: result.canceled ? null : (result.filePaths[0] ?? null)
    };
  });
  ipcMain.handle("operations:select-migration-file", async (event, input?: FileSelectionInput) => {
    const window =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow() ??
      undefined;
    const dialogOptions = {
      title: input?.title ?? "마이그레이션 파일 선택",
      buttonLabel: input?.buttonLabel ?? "선택",
      defaultPath: input?.defaultPath,
      properties: ["openFile"] as Array<"openFile">,
      filters:
        input?.filters && input.filters.length > 0
          ? input.filters
          : [
              {
                name: "마이그레이션 파일",
                extensions: ["accdb", "json"]
              }
            ]
    };
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    return {
      ok: true as const,
      data: result.canceled ? null : (result.filePaths[0] ?? null)
    };
  });
  ipcMain.handle("operations:select-spreadsheet-file", async (event, input?: FileSelectionInput) => {
    const window =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow() ??
      undefined;
    const dialogOptions = {
      title: input?.title ?? "Excel 파일 선택",
      buttonLabel: input?.buttonLabel ?? "가져오기",
      defaultPath: input?.defaultPath,
      properties: ["openFile"] as Array<"openFile">,
      filters:
        input?.filters && input.filters.length > 0
          ? input.filters
          : [
              {
                name: "Excel Workbook",
                extensions: ["xlsx", "xlsm"]
              }
            ]
    };
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return {
        ok: true as const,
        data: null
      };
    }

    const filePath = result.filePaths[0]!;

    return {
      ok: true as const,
      data: {
        fileName: path.basename(filePath),
        filePath
      }
    };
  });
  ipcMain.handle(
    "operations:preview-database-migration-update",
    async (_event, input: DatabaseMigrationRunInput) => {
      try {
        await stopFileWatchRuntime({
          userDataPath: app.getPath("userData")
        });

        const preview = previewDatabaseMigrationUpdate({
          userDataPath: app.getPath("userData"),
          migrationFilePath: input.migrationFilePath
        });

        await restartFileWatchRuntime({
          userDataPath: app.getPath("userData")
        });

        return {
          ok: true as const,
          data: preview
        };
      } catch (error) {
        await restartFileWatchRuntime({
          userDataPath: app.getPath("userData")
        });

        return {
          ok: false as const,
          errorCode: "DATABASE_MIGRATION_PREVIEW_FAILED",
          message: getErrorMessage(error)
        };
      }
    }
  );
  ipcMain.handle(
    "operations:update-database-from-migration",
    async (_event, input: DatabaseMigrationRunInput) => {
      try {
        await stopFileWatchRuntime({
          userDataPath: app.getPath("userData")
        });

        const summary = runDatabaseMigrationUpdate({
          userDataPath: app.getPath("userData"),
          migrationFilePath: input.migrationFilePath
        });

        await restartFileWatchRuntime({
          userDataPath: app.getPath("userData")
        });

        return {
          ok: true as const,
          data: summary
        };
      } catch (error) {
        await restartFileWatchRuntime({
          userDataPath: app.getPath("userData")
        });

        return {
          ok: false as const,
          errorCode: "DATABASE_MIGRATION_FAILED",
          message: getErrorMessage(error)
        };
      }
    }
  );
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
  ipcMain.handle("operations:fetch-holiday-api-items", async (_event, year: number) => {
    try {
      const settings = getStoredAppSettingsSnapshot({
        userDataPath: app.getPath("userData")
      });

      return {
        ok: true as const,
        data: await fetchHolidayApiItems({
          baseUrl: settings.holidayApiBaseUrl,
          year
        })
      };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: "HOLIDAY_API_FETCH_FAILED",
        message: getErrorMessage(error)
      };
    }
  });
  ipcMain.handle("operations:add-holiday-item", (_event, input: HolidayItemUpsertInput) => {
    try {
      return {
        ok: true as const,
        data: saveStoredHolidayItem(input)
      };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: "HOLIDAY_ITEM_SAVE_FAILED",
        message: getErrorMessage(error)
      };
    }
  });
  ipcMain.handle("operations:rename-holiday-item", (_event, input: HolidayItemRenameInput) => {
    try {
      return {
        ok: true as const,
        data: renameStoredHolidayItem(input)
      };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: "HOLIDAY_ITEM_RENAME_FAILED",
        message: getErrorMessage(error)
      };
    }
  });
  ipcMain.handle("operations:delete-holiday-item", (_event, input: HolidayItemDeleteInput) => {
    try {
      return {
        ok: true as const,
        data: deleteStoredHolidayItem(input)
      };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: "HOLIDAY_ITEM_DELETE_FAILED",
        message: getErrorMessage(error)
      };
    }
  });
  ipcMain.handle(
    "operations:replace-holiday-calendar",
    (_event, input: HolidayCalendarReplaceInput) => {
      try {
        return {
          ok: true as const,
          data: replaceStoredHolidayCalendar(input)
        };
      } catch (error) {
        return {
          ok: false as const,
          errorCode: "HOLIDAY_CALENDAR_REPLACE_FAILED",
          message: getErrorMessage(error)
        };
      }
    }
  );
  ipcMain.handle("operations:list-allowance-rate-versions", (_event, year?: number) => ({
    ok: true as const,
    data: listStoredAllowanceRateVersions(year)
  }));
  ipcMain.handle(
    "operations:save-allowance-rate-version",
    (_event, input: AllowanceRateVersionSaveInput) => {
      try {
        return {
          ok: true as const,
          data: saveStoredAllowanceRateVersion(input)
        };
      } catch (error) {
        return {
          ok: false as const,
          errorCode: "ALLOWANCE_RATE_SAVE_FAILED",
          message: getErrorMessage(error)
        };
      }
    }
  );
  ipcMain.handle(
    "operations:delete-allowance-rate-version",
    (_event, input: AllowanceRateVersionDeleteInput) => {
      try {
        deleteStoredAllowanceRateVersion(input.rateVersionId);

        return {
          ok: true as const,
          data: null
        };
      } catch (error) {
        return {
          ok: false as const,
          errorCode: "ALLOWANCE_RATE_DELETE_FAILED",
          message: getErrorMessage(error)
        };
      }
    }
  );
  ipcMain.handle("operations:list-users", () => ({
    ok: true as const,
    data: listStoredOperationUsers()
  }));
  ipcMain.handle("operations:save-user", (_event, input: OperationUserSaveInput) => {
    try {
      return {
        ok: true as const,
        data: saveStoredOperationUser(input)
      };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: "OPERATION_USER_SAVE_FAILED",
        message: getErrorMessage(error)
      };
    }
  });
  ipcMain.handle("operations:delete-user", (_event, input: OperationUserDeleteInput) => {
    try {
      deleteStoredOperationUser(input.userId);

      return {
        ok: true as const,
        data: null
      };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: "OPERATION_USER_DELETE_FAILED",
        message: getErrorMessage(error)
      };
    }
  });
  ipcMain.handle(
    "operations:list-document-template-history",
    (_event, templateType?: TemplateType) => ({
      ok: true as const,
      data: listStoredDocumentTemplateHistory(templateType)
    })
  );
  ipcMain.handle(
    "operations:select-document-template-file",
    async (event, templateType?: TemplateType) => {
      const window =
        BrowserWindow.fromWebContents(event.sender) ??
        BrowserWindow.getFocusedWindow() ??
        undefined;
      const openDialogOptions = {
        title: "양식 파일 선택",
        buttonLabel: "가져오기",
        properties: ["openFile"] as Array<"openFile">,
        filters: [
          {
            name:
              templateType === "schedule"
                ? "근무표 Excel 양식"
                : "Excel 양식 파일",
            extensions: ["xlsx", "xlsm"]
          }
        ]
      };
      const result = window
        ? await dialog.showOpenDialog(window, openDialogOptions)
        : await dialog.showOpenDialog(openDialogOptions);

      if (result.canceled || result.filePaths.length === 0) {
        return {
          ok: true as const,
          data: null
        };
      }

      const filePath = result.filePaths[0]!;

      return {
        ok: true as const,
        data: {
          fileName: path.basename(filePath),
          filePath
        }
      };
    }
  );
  ipcMain.handle(
    "operations:inspect-document-template",
    async (_event, input: DocumentTemplateInspectInput) => {
      try {
        return {
          ok: true as const,
          data: await inspectDocumentTemplateImport(input)
        };
      } catch (error) {
        return {
          ok: false as const,
          errorCode: "DOCUMENT_TEMPLATE_INSPECT_FAILED",
          message: getErrorMessage(error)
        };
      }
    }
  );
  ipcMain.handle(
    "operations:preview-document-template",
    async (event, input: DocumentTemplatePreviewInput) => {
      try {
        const settings = getStoredAppSettingsSnapshot({
          userDataPath: app.getPath("userData")
        });
        const previewDirectory = path.resolve(
          settings.scheduleExportDir,
          "template-previews",
          input.templateType
        );
        const sourceBaseName = path.basename(input.sourcePath, path.extname(input.sourcePath));
        const versionSegment = sanitizeFileSegment(
          input.versionLabel?.trim() || sourceBaseName || documentTemplateLabelByType[input.templateType]
        );
        const defaultPath = path.resolve(
          previewDirectory,
          `${documentTemplateLabelByType[input.templateType]}_${versionSegment}_preview.xlsx`
        );
        const window =
          BrowserWindow.fromWebContents(event.sender) ??
          BrowserWindow.getFocusedWindow() ??
          undefined;
        const saveDialogOptions = {
          title: "양식 미리보기 저장",
          defaultPath,
          buttonLabel: "미리보기 저장",
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
            ok: true as const,
            data: null
          };
        }

        return {
          ok: true as const,
          data: await previewDocumentTemplateFile(input, {
            outputPath: saveResult.filePath
          })
        };
      } catch (error) {
        return {
          ok: false as const,
          errorCode: "DOCUMENT_TEMPLATE_PREVIEW_FAILED",
          message: getErrorMessage(error)
        };
      }
    }
  );
  ipcMain.handle(
    "operations:save-document-template-version",
    (_event, input: DocumentTemplateSaveInput) => {
      try {
        return {
          ok: true as const,
          data: saveManagedDocumentTemplateVersion(input, {
            userDataPath: app.getPath("userData")
          })
        };
      } catch (error) {
        return {
          ok: false as const,
          errorCode: "DOCUMENT_TEMPLATE_SAVE_FAILED",
          message: getErrorMessage(error)
        };
      }
    }
  );
  ipcMain.handle(
    "operations:approve-document-template-version",
    (_event, templateId: string) => {
      try {
        return {
          ok: true as const,
          data: approveManagedDocumentTemplateVersion(templateId)
        };
      } catch (error) {
        return {
          ok: false as const,
          errorCode: "DOCUMENT_TEMPLATE_APPROVE_FAILED",
          message: getErrorMessage(error)
        };
      }
    }
  );
  ipcMain.handle(
    "operations:set-default-document-template-version",
    (_event, templateId: string) => {
      try {
        return {
          ok: true as const,
          data: setStoredDefaultDocumentTemplateVersion(templateId)
        };
      } catch (error) {
        return {
          ok: false as const,
          errorCode: "DOCUMENT_TEMPLATE_SET_DEFAULT_FAILED",
          message: getErrorMessage(error)
        };
      }
    }
  );
  ipcMain.handle(
    "operations:update-document-template-output-file-name",
    (_event, input: DocumentTemplateOutputFileNameUpdateInput) => {
      try {
        return {
          ok: true as const,
          data: updateStoredDocumentTemplateOutputFileNamePattern(input)
        };
      } catch (error) {
        return {
          ok: false as const,
          errorCode: "DOCUMENT_TEMPLATE_OUTPUT_FILE_NAME_UPDATE_FAILED",
          message: getErrorMessage(error)
        };
      }
    }
  );
  ipcMain.handle(
    "operations:delete-document-template-version",
    (_event, templateId: string) => {
      try {
        deleteManagedDocumentTemplateVersion(templateId, {
          userDataPath: app.getPath("userData")
        });

        return {
          ok: true as const,
          data: null
        };
      } catch (error) {
        return {
          ok: false as const,
          errorCode: "DOCUMENT_TEMPLATE_DELETE_FAILED",
          message: getErrorMessage(error)
        };
      }
    }
  );
  ipcMain.handle(
    "operations:list-document-template-versions",
    (_event, templateType?: TemplateType) => ({
      ok: true as const,
      data: listStoredDocumentTemplateVersions(templateType)
    })
  );
  ipcMain.handle("shift-patterns:analyze-import", async (_event, input) => {
    try {
      return {
        ok: true as const,
        data: await analyzeSitePatternImport(input)
      };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: "SITE_PATTERN_IMPORT_ANALYZE_FAILED",
        message: getErrorMessage(error)
      };
    }
  });
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
  ipcMain.handle("performance:list-files", async (_event, query?: PerformanceFileListQuery) => ({
    ok: true as const,
    data: await listPerformanceFiles(query, getStoredAppSettingsSnapshot({
      userDataPath: app.getPath("userData")
    }))
  }));
  ipcMain.handle("performance:list-overview", async (_event, query?: PerformanceOverviewQuery) => ({
    ok: true as const,
    data: await listPerformanceOverview(query, getStoredAppSettingsSnapshot({
      userDataPath: app.getPath("userData")
    }))
  }));
  ipcMain.handle("performance:get-file-detail", async (_event, query: PerformanceFileDetailQuery) => ({
    ok: true as const,
    data: await getPerformanceFileDetail(query, getStoredAppSettingsSnapshot({
      userDataPath: app.getPath("userData")
    }))
  }));
  ipcMain.handle(
    "performance:get-comparison",
    async (_event, query: PerformanceComparisonQuery) => ({
      ok: true as const,
      data: getPerformanceComparison(query)
    })
  );
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
    "performance:finalize-reapproved-file",
    async (_event, input: PerformanceReapprovalFinalizeInput) => {
      const sessionResult = requireSession();

      if (!sessionResult.ok) {
        return sessionResult;
      }

      return finalizeReapprovedPerformanceFile(input, sessionResult.data, {
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
  ipcMain.handle("performance:hide-approved-row", async (_event, input) => {
    const sessionResult = requireSession();

    if (!sessionResult.ok) {
      return sessionResult;
    }

    return hideApprovedPerformanceOverviewRow(input, sessionResult.data);
  });
  ipcMain.handle("performance:list-approval-history", () => getPerformanceApprovalHistory());
  ipcMain.handle("performance:open-source-file", async (_event, fileId: string) => {
    try {
      const detail = await getPerformanceFileDetail({ fileId });

      if (!detail) {
        return {
          ok: false as const,
          errorCode: "PERFORMANCE_FILE_NOT_FOUND",
          message: "원본 파일 정보를 찾을 수 없습니다."
        };
      }

      if (!existsSync(detail.filePath)) {
        return {
          ok: false as const,
          errorCode: "PERFORMANCE_FILE_MISSING",
          message: "원본 Excel 파일이 존재하지 않습니다."
        };
      }

      const openResult = await shell.openPath(detail.filePath);

      return openResult
        ? {
            ok: false as const,
            errorCode: "PERFORMANCE_FILE_OPEN_FAILED",
            message: openResult
          }
        : {
            ok: true as const,
            data: null
          };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: "PERFORMANCE_FILE_OPEN_FAILED",
        message: getErrorMessage(error)
      };
    }
  });
  ipcMain.handle("allowance:run-approved-calculation", async (_event, input) =>
    runApprovedAllowanceCalculation(input)
  );
  ipcMain.handle("allowance:list-results", () => ({
    ok: true as const,
    data: listApprovedAllowanceCalculationResults()
  }));
  ipcMain.handle("allowance:list-history", () => ({
    ok: true as const,
    data: listAllowanceCalculationHistory()
  }));
  ipcMain.handle("allowance:set-early-payout", (_event, input) =>
    setAllowanceCalculationEarlyPayout(input)
  );
  ipcMain.handle("allowance:list-approved-targets", () => ({
    ok: true as const,
    data: listApprovedAllowanceTargets()
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
  restartDatabaseBackupRuntime({
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
  stopDatabaseBackupRuntime();
  closeSqliteStorage();

  if (process.platform !== "darwin") {
    app.quit();
  }
});
