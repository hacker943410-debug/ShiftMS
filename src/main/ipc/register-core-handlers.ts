import path from "node:path";

import { App, BrowserWindow, dialog, ipcMain } from "electron";

import { createAppHealth } from "../services/app-settings-service";
import { getStoredAppSettingsSnapshot } from "../services/app-settings-storage-service";
import { listAccessLogs, recordAccessLog } from "../services/access-log-service";
import { getSession, signIn, signOut } from "../services/auth-service";
import {
  exportDashboardChartData,
  exportDashboardReport
} from "../services/dashboard-chart-export-service";
import {
  createIpcFailure,
  createIpcSuccess,
  runIpcSaveDialogResultAction,
  runIpcResultAction
} from "./ipc-handler-helpers";
import {
  accessLogActionLabels
} from "../../shared/domain/access-log";
import type { AuthSession } from "../../shared/domain/model";
import type {
  AccessLogListQuery,
  AccessLogRecordInput,
  AppHealth,
  BridgeFailure,
  DashboardChartExportInput,
  DashboardReportExportInput
} from "../../shared/bridge/contracts";
import type {
  IpcActivityInput,
  RecordSuccessfulIpcActivity
} from "./ipc-handler-helpers";

type RecordActivity = (input: IpcActivityInput) => void;

type WithAdmin = <T>(callback: (session: AuthSession) => T) => T | BridgeFailure;

type WithSession = <T>(callback: (session: AuthSession) => T) => T | BridgeFailure;

type RegisterCoreHandlersOptions = {
  app: App;
  isDevelopment: boolean;
  recordActivity: RecordActivity;
  recordSuccessfulActivity: RecordSuccessfulIpcActivity;
  withAdmin: WithAdmin;
  withSession: WithSession;
};

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

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

export const registerCoreHandlers = ({
  app,
  isDevelopment,
  recordActivity,
  recordSuccessfulActivity,
  withAdmin,
  withSession
}: RegisterCoreHandlersOptions) => {
  const getUserDataPath = () => app.getPath("userData");
  const trackSuccess = (input: IpcActivityInput) => ({
    input,
    recordSuccessfulActivity
  });

  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("app:get-health", () => {
    const health: AppHealth = createAppHealth({
      appVersion: app.getVersion(),
      environment: isDevelopment ? "development" : "production",
      userDataPath: getUserDataPath()
    });

    return createIpcSuccess(health);
  });
  ipcMain.handle("dashboard:export-chart-data", async (event, input: DashboardChartExportInput) =>
    withSession(async (session) => {
      const settings = getStoredAppSettingsSnapshot({
        userDataPath: getUserDataPath()
      });
      const outputFormat = input.outputFormat ?? "xlsx";
      const exportedAt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const defaultFileName = `${sanitizeFileSegment(input.chartKey)}_${sanitizeFileSegment(
        input.chartTitle
      )}_${exportedAt}.${outputFormat}`;
      const defaultPath = path.resolve(
        settings.scheduleExportDir,
        "dashboard-exports",
        defaultFileName
      );
      const window =
        BrowserWindow.fromWebContents(event.sender) ??
        BrowserWindow.getFocusedWindow() ??
        undefined;
      const saveDialogOptions = createDashboardSaveDialogOptions({
        title: outputFormat === "pdf" ? "차트 PDF 내보내기" : "차트 Excel 내보내기",
        defaultPath,
        outputFormat
      });
      return runIpcSaveDialogResultAction({
        choosePath: async () => {
          const saveResult = window
            ? await dialog.showSaveDialog(window, saveDialogOptions)
            : await dialog.showSaveDialog(saveDialogOptions);

          return saveResult.canceled ? null : (saveResult.filePath ?? null);
        },
        onCancel: () => createIpcFailure("EXPORT_CANCELLED", "차트 내보내기를 취소했습니다."),
        action: (outputPath) =>
          exportDashboardChartData(input, {
            userDataPath: getUserDataPath(),
            outputPath
          }),
        errorCode: "DASHBOARD_CHART_EXPORT_FAILED",
        getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
        activity: trackSuccess({
          actionType: "dashboard-export",
          routeKey: "dashboard",
          routeLabel: "대시보드",
          details: `${input.chartTitle} ${outputFormat.toUpperCase()} 출력`,
          session
        })
      });
    })
  );
  ipcMain.handle("dashboard:export-report", async (event, input: DashboardReportExportInput) =>
    withSession(async (session) => {
      const settings = getStoredAppSettingsSnapshot({
        userDataPath: getUserDataPath()
      });
      const exportedAt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const defaultFileName = `${sanitizeFileSegment(input.title)}_${exportedAt}.${input.outputFormat}`;
      const defaultPath = path.resolve(
        settings.scheduleExportDir,
        "dashboard-exports",
        defaultFileName
      );
      const window =
        BrowserWindow.fromWebContents(event.sender) ??
        BrowserWindow.getFocusedWindow() ??
        undefined;
      const saveDialogOptions = createDashboardSaveDialogOptions({
        title: input.outputFormat === "pdf" ? "대시보드 PDF 내보내기" : "대시보드 Excel 내보내기",
        defaultPath,
        outputFormat: input.outputFormat
      });
      return runIpcSaveDialogResultAction({
        choosePath: async () => {
          const saveResult = window
            ? await dialog.showSaveDialog(window, saveDialogOptions)
            : await dialog.showSaveDialog(saveDialogOptions);

          return saveResult.canceled ? null : (saveResult.filePath ?? null);
        },
        onCancel: () => createIpcFailure("EXPORT_CANCELLED", "대시보드 내보내기를 취소했습니다."),
        action: (outputPath) =>
          exportDashboardReport(input, {
            userDataPath: getUserDataPath(),
            outputPath
          }),
        errorCode: "DASHBOARD_REPORT_EXPORT_FAILED",
        getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
        activity: trackSuccess({
          actionType: "dashboard-export",
          routeKey: "dashboard",
          routeLabel: "대시보드",
          details: `${input.title} ${input.outputFormat.toUpperCase()} 출력`,
          session
        })
      });
    })
  );
  ipcMain.handle("auth:sign-in", (_event, input) => {
    const result = signIn(input);

    if (result.ok) {
      recordActivity({
        actionType: "sign-in",
        details: `${result.data.displayName} 계정 로그인`,
        session: result.data
      });
    }

    return result;
  });
  ipcMain.handle("auth:sign-out", () => {
    const sessionResult = getSession();
    const result = signOut();

    if (sessionResult.ok && sessionResult.data) {
      recordActivity({
        actionType: "sign-out",
        details: `${sessionResult.data.displayName} 계정 로그아웃`,
        session: sessionResult.data
      });
    }

    return result;
  });
  ipcMain.handle("auth:get-session", () => getSession());
  ipcMain.handle("access-logs:list", (_event, query?: AccessLogListQuery) =>
    withAdmin(() => createIpcSuccess(listAccessLogs(query)))
  );
  ipcMain.handle("access-logs:record", (_event, input: AccessLogRecordInput) =>
    withSession((session) => {
      recordAccessLog(input, session);

      return createIpcSuccess(null);
    })
  );
};
