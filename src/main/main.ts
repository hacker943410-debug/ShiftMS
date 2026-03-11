import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";

import { createAppHealth } from "./services/app-settings-service";
import { getSession, signIn, signOut } from "./services/auth-service";
import { previewAllowanceCalculation } from "./services/allowance-preview-service";
import {
  approvePerformanceFile,
  getPerformanceApprovalHistory,
  rejectPerformanceFile
} from "./services/performance-approval-flow-service";
import {
  getPendingPerformanceFileDetail,
  listPendingPerformanceFiles
} from "./services/performance-queue-service";
import type {
  AllowancePreviewInput,
  AppHealth
} from "../shared/bridge/contracts";
import type {
  PerformanceApprovalActionInput,
  PerformanceRejectionInput
} from "../shared/domain/performance-file";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

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
  ipcMain.handle("auth:sign-in", (_event, input) => signIn(input));
  ipcMain.handle("auth:sign-out", () => signOut());
  ipcMain.handle("auth:get-session", () => getSession());
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

      return approvePerformanceFile(input, sessionResult.data);
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
  ipcMain.handle(
    "allowance:preview-calculation",
    (_event, input: AllowancePreviewInput) => previewAllowanceCalculation(input)
  );
  void createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
