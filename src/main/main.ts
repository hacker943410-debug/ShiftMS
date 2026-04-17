import { existsSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";

import { resolveAppSettings } from "./services/app-settings-service";
import {
  closeFileWatchRuntime,
  restartFileWatchRuntime
} from "./services/file-watch-runtime-service";
import {
  restartDatabaseBackupRuntime,
  stopDatabaseBackupRuntime
} from "./services/database-backup-service";
import {
  requireAdminSession as resolveRequiredAdminSession,
  requireAuthenticatedSession
} from "./services/ipc-auth-guard-service";
import { getSession } from "./services/auth-service";
import { recordAccessLog } from "./services/access-log-service";
import { closeSqliteStorage, initializeSqliteStorage } from "./services/sqlite-storage-service";
import { repairStoredOvertimePerformanceData } from "./services/performance-overtime-repair-service";
import {
  accessLogActionLabels,
  type AccessLogActionType
} from "../shared/domain/access-log";
import type { AuthSession } from "../shared/domain/model";
import { registerAllowanceHandlers } from "./ipc/register-allowance-handlers";
import { registerCoreHandlers } from "./ipc/register-core-handlers";
import { registerOperationsHandlers } from "./ipc/register-operations-handlers";
import { registerPerformanceHandlers } from "./ipc/register-performance-handlers";
import { registerWorkforceHandlers } from "./ipc/register-workforce-handlers";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const appUserModelId = "com.shiftmgmt.desktop";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

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

const requireSession = () => {
  return requireAuthenticatedSession(getSession());
};

const requireAdmin = () => resolveRequiredAdminSession(getSession());

const withSession = <T>(callback: (session: AuthSession) => T) => {
  const sessionResult = requireSession();

  if (!sessionResult.ok) {
    return sessionResult;
  }

  return callback(sessionResult.data);
};

const withAdmin = <T>(callback: (session: AuthSession) => T) => {
  const sessionResult = requireAdmin();

  if (!sessionResult.ok) {
    return sessionResult;
  }

  return callback(sessionResult.data);
};

const resolveOptionalSession = (): AuthSession | null => {
  const sessionResult = getSession();
  return sessionResult.ok ? sessionResult.data : null;
};

const recordActivity = (input: {
  actionType: AccessLogActionType;
  routeKey?: string;
  routeLabel?: string;
  details?: string;
  session?: AuthSession | null;
}) => {
  const session = input.session ?? resolveOptionalSession();

  if (!session) {
    return;
  }

  try {
    recordAccessLog(
      {
        actionType: input.actionType,
        actionLabel: accessLogActionLabels[input.actionType],
        routeKey: input.routeKey,
        routeLabel: input.routeLabel,
        details: input.details
      },
      session
    );
  } catch {
    // Ignore logging failures to avoid blocking the main workflow.
  }
};

const recordSuccessfulActivity = <T extends { ok: boolean }>(
  result: T,
  input: {
    actionType: AccessLogActionType;
    routeKey?: string;
    routeLabel?: string;
    details?: string;
    session?: AuthSession | null;
  }
) => {
  if (result.ok) {
    recordActivity(input);
  }

  return result;
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
  registerCoreHandlers({
    app,
    isDevelopment,
    withSession,
    withAdmin,
    recordActivity,
    recordSuccessfulActivity
  });
  registerWorkforceHandlers({
    app,
    withSession,
    recordSuccessfulActivity,
    getErrorMessage
  });
  registerOperationsHandlers({
    app,
    withAdmin,
    recordSuccessfulActivity,
    getErrorMessage
  });
  registerPerformanceHandlers({
    app,
    withSession,
    recordSuccessfulActivity,
    getErrorMessage
  });
  registerAllowanceHandlers({
    app,
    withSession,
    recordSuccessfulActivity
  });
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
