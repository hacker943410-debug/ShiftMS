import path from "node:path";

import { App, BrowserWindow, dialog, ipcMain } from "electron";

import { createAppHealth } from "../services/app-settings-service";
import {
  checkForAppUpdate,
  dismissUpdateNotice,
  downloadAppUpdate,
  getAppUpdateState,
  installDownloadedUpdate
} from "../services/app-update-service";
import { getStoredAppSettingsSnapshot } from "../services/app-settings-storage-service";
import { listAccessLogs, recordAccessLog } from "../services/access-log-service";
import { changePassword, getSession, signIn, signOut } from "../services/auth-service";
import {
  getAccountRecoveryAvailability,
  recoverAdminAccount
} from "../services/account-recovery-service";
import { getAuthBootstrapCredentialsFilePath } from "../services/auth-bootstrap-service";
import { findStoredOperationAuthByLoginId } from "../services/operations-storage-service";
import {
  exportDashboardChartData,
  exportDashboardReport
} from "../services/dashboard-chart-export-service";
import {
  createIpcFailure,
  createIpcSuccess,
  runIpcAction,
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
  AuthPasswordChangeInput,
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

type WithAccessHistory = <T>(callback: (session: AuthSession) => T) => T | BridgeFailure;

type WithSession = <T>(callback: (session: AuthSession) => T) => T | BridgeFailure;

type RegisterCoreHandlersOptions = {
  app: App;
  isDevelopment: boolean;
  recordActivity: RecordActivity;
  recordSuccessfulActivity: RecordSuccessfulIpcActivity;
  withAccessHistory: WithAccessHistory;
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
  withAccessHistory,
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

    return createIpcSuccess({
      ...health,
      bootstrapCredentialsFilePath: getAuthBootstrapCredentialsFilePath({
        userDataPath: getUserDataPath()
      })
    });
  });
  ipcMain.handle("app:get-update-state", () => createIpcSuccess(getAppUpdateState()));
  ipcMain.handle("app:check-for-update", async () => {
    const result = await runIpcAction({
      action: checkForAppUpdate,
      errorCode: "APP_UPDATE_CHECK_FAILED",
      getErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "업데이트 확인 중 오류가 발생했습니다."
    });

    if (result.ok) {
      recordActivity({
        actionType: "app-update-check",
        routeKey: "dashboard",
        routeLabel: "업데이트",
        details:
          result.data.targetVersion && result.data.status !== "idle"
            ? `v${result.data.targetVersion} 업데이트 확인`
            : "최신 버전 확인"
      });
    }

    return result;
  });
  ipcMain.handle("app:download-update", async () => {
    const result = await runIpcAction({
      action: downloadAppUpdate,
      errorCode: "APP_UPDATE_DOWNLOAD_FAILED",
      getErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "업데이트 다운로드 중 오류가 발생했습니다."
    });

    if (result.ok && result.data.targetVersion) {
      recordActivity({
        actionType: "app-update-download",
        routeKey: "dashboard",
        routeLabel: "업데이트",
        details: `v${result.data.targetVersion} 업데이트 다운로드`
      });
    }

    return result;
  });
  ipcMain.handle("app:install-update", async () => {
    const currentState = getAppUpdateState();
    const result = await runIpcAction({
      action: installDownloadedUpdate,
      errorCode: "APP_UPDATE_INSTALL_FAILED",
      getErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "업데이트 적용 중 오류가 발생했습니다."
    });

    if (result.ok && currentState.targetVersion) {
      recordActivity({
        actionType: "app-update-install",
        routeKey: "dashboard",
        routeLabel: "업데이트",
        details: `v${currentState.targetVersion} 업데이트 적용`
      });
    }

    return result;
  });
  ipcMain.handle("app:dismiss-update-notice", async (_event, version: string) => {
    const currentState = getAppUpdateState();
    const acknowledgedReleaseNotes = currentState.releaseNotesToShow?.toVersion === version.trim();
    const result = await runIpcAction({
      action: () => dismissUpdateNotice(version),
      errorCode: "APP_UPDATE_DISMISS_FAILED",
      getErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "업데이트 안내를 닫는 중 오류가 발생했습니다."
    });

    if (result.ok && acknowledgedReleaseNotes) {
      recordActivity({
        actionType: "release-notes-view",
        routeKey: "dashboard",
        routeLabel: "패치노트",
        details: `v${version.trim()} 패치노트 확인`
      });
    }

    return result;
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
    const normalizedLoginId = String(input.loginId ?? "").trim();

    if (result.ok) {
      recordActivity({
        actionType: "sign-in",
        details: `${result.data.displayName} 계정 로그인`,
        session: result.data
      });
    } else {
      try {
        const attemptedUser = findStoredOperationAuthByLoginId(normalizedLoginId);

        recordAccessLog(
          {
            actionType: "sign-in-failed",
            actionLabel: accessLogActionLabels["sign-in-failed"],
            details:
              normalizedLoginId.length > 0
                ? `${normalizedLoginId} 로그인 실패 (${result.errorCode})`
                : `빈 로그인 ID 로그인 실패 (${result.errorCode})`
          },
          {
            userId: attemptedUser?.id ?? `auth-failed:${normalizedLoginId || "unknown"}`,
            loginId: normalizedLoginId || "(blank)",
            displayName: attemptedUser?.displayName ?? "미인증 사용자",
            role: attemptedUser?.role ?? "operator"
          }
        );
      } catch {
        // Ignore auth failure logging errors to avoid masking the login result.
      }
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
  ipcMain.handle("auth:get-account-recovery-availability", () =>
    createIpcSuccess(getAccountRecoveryAvailability())
  );
  ipcMain.handle("auth:recover-admin-account", async (_event, input) =>
    runIpcAction({
      action: () => recoverAdminAccount(input),
      errorCode: "AUTH_ACCOUNT_RECOVERY_FAILED",
      getErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "계정복구 중 오류가 발생했습니다."
    })
  );
  ipcMain.handle("auth:change-password", (_event, input: AuthPasswordChangeInput) => {
    const result = changePassword(input);

    if (result.ok) {
      recordActivity({
        actionType: "password-change",
        details: `${result.data.displayName} 계정 비밀번호 변경`,
        session: result.data
      });
    }

    return result;
  });
  ipcMain.handle("access-logs:list", (_event, query?: AccessLogListQuery) =>
    withAccessHistory(() => createIpcSuccess(listAccessLogs(query)))
  );
  ipcMain.handle("access-logs:record", (_event, input: AccessLogRecordInput) =>
    withSession((session) => {
      recordAccessLog(input, session);

      return createIpcSuccess(null);
    })
  );
};
