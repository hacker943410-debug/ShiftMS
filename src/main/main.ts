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
  disposeAppUpdateService,
  initializeAppUpdateService
} from "./services/app-update-service";
import {
  requireRoleSession,
  requireOperationalSession
} from "./services/ipc-auth-guard-service";
import { getSession, getSessionWithRenewal } from "./services/auth-service";
import { recordAccessLog } from "./services/access-log-service";
import { closeSqliteStorage, initializeSqliteStorage } from "./services/sqlite-storage-service";
import { repairStoredOvertimePerformanceData } from "./services/performance-overtime-repair-service";
import { recoverPerformanceDataOnStartup } from "./services/performance-startup-recovery-service";
import {
  accessLogActionLabels,
  type AccessLogActionType
} from "../shared/domain/access-log";
import {
  getRequiredRoleForAction,
  getRequiredRoleForRoute,
  type ActionPermissionKey
} from "../shared/domain/authorization";
import type { RouteKey } from "../shared/config/routes";
import type { AuthSession } from "../shared/domain/model";
import { registerAllowanceHandlers } from "./ipc/register-allowance-handlers";
import { registerCoreHandlers } from "./ipc/register-core-handlers";
import { registerOperationsHandlers } from "./ipc/register-operations-handlers";
import { registerPerformanceHandlers } from "./ipc/register-performance-handlers";
import { registerWorkforceHandlers } from "./ipc/register-workforce-handlers";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const appUserModelId = "com.shiftmgmt.desktop";
const overriddenUserDataPath = process.env.SHIFTMGMT_USER_DATA_DIR?.trim();

if (overriddenUserDataPath) {
  app.setPath("userData", path.resolve(overriddenUserDataPath));
}

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
  return requireOperationalSession(getSessionWithRenewal());
};

const requireRouteAccess = (routeKey: RouteKey) =>
  requireRoleSession(getSessionWithRenewal(), getRequiredRoleForRoute(routeKey));

const requireActionAccess = (actionKey: ActionPermissionKey) =>
  requireRoleSession(getSessionWithRenewal(), getRequiredRoleForAction(actionKey));

const withSession = <T>(callback: (session: AuthSession) => T) => {
  const sessionResult = requireSession();

  if (!sessionResult.ok) {
    return sessionResult;
  }

  return callback(sessionResult.data);
};

const withActionPermission = <T>(
  actionKey: ActionPermissionKey,
  callback: (session: AuthSession) => T
) => {
  const sessionResult = requireActionAccess(actionKey);

  if (!sessionResult.ok) {
    return sessionResult;
  }

  return callback(sessionResult.data);
};

const withAdmin = <T>(callback: (session: AuthSession) => T) => {
  const sessionResult = requireRouteAccess("operations");

  if (!sessionResult.ok) {
    return sessionResult;
  }

  return callback(sessionResult.data);
};

const withAccessHistory = <T>(callback: (session: AuthSession) => T) => {
  const sessionResult = requireRouteAccess("access-history");

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
    show: false,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const showMaximizedWindow = () => {
    window.maximize();
    window.show();
  };

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
    showMaximizedWindow();
    return;
  }

  const rendererPath = path.join(__dirname, "../../dist/index.html");
  await window.loadFile(rendererPath);
  showMaximizedWindow();
};

let startupBackgroundServicesScheduled = false;

const scheduleStartupBackgroundServices = (userDataPath: string) => {
  if (startupBackgroundServicesScheduled) {
    return;
  }

  startupBackgroundServicesScheduled = true;

  setTimeout(() => {
    void restartFileWatchRuntime({
      userDataPath
    }).catch((error) => {
      console.error("[file-watch-runtime] failed to start", error);
    });
  }, 1200);

  setTimeout(() => {
    void recoverPerformanceDataOnStartup({
      userDataPath
    })
      .then((summary) => {
        console.info("[performance-startup-recovery] completed", summary);
      })
      .catch((error) => {
        console.error("[performance-startup-recovery] failed", error);
      });
  }, 3000);
};

app.whenReady().then(async () => {
  const userDataPath = app.getPath("userData");

  if (process.platform === "win32") {
    app.setAppUserModelId(appUserModelId);
  }

  initializeSqliteStorage({
    userDataPath
  });
  repairStoredOvertimePerformanceData();
  registerCoreHandlers({
    app,
    isDevelopment,
    withSession,
    withAccessHistory,
    recordActivity,
    recordSuccessfulActivity
  });
  registerWorkforceHandlers({
    app,
    withActionPermission,
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
    withActionPermission,
    withSession,
    recordSuccessfulActivity,
    getErrorMessage
  });
  registerAllowanceHandlers({
    app,
    withActionPermission,
    withSession,
    recordSuccessfulActivity
  });
  restartDatabaseBackupRuntime({
    userDataPath
  });
  void initializeAppUpdateService({
    currentVersion: app.getVersion(),
    env: process.env,
    isPackaged: app.isPackaged,
    startupCheckDelayMs: 8000,
    startupCheckSilent: true,
    userDataPath
  });
  void createMainWindow().then(() => {
    scheduleStartupBackgroundServices(userDataPath);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow().then(() => {
        scheduleStartupBackgroundServices(userDataPath);
      });
    }
  });
});

app.on("window-all-closed", () => {
  void closeFileWatchRuntime();
  stopDatabaseBackupRuntime();
  disposeAppUpdateService();
  closeSqliteStorage();

  if (process.platform !== "darwin") {
    app.quit();
  }
});
