import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";

import { createAllowanceCalculationSnapshot } from "../shared/domain/allowance-service";
import type {
  AllowancePreviewInput,
  AppHealth,
  BridgeResult
} from "../shared/bridge/contracts";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

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
    const health: AppHealth = {
      appVersion: app.getVersion(),
      environment: isDevelopment ? "development" : "production",
      databaseConfigured: false,
      pendingDirectoryConfigured: false,
      approvedDirectoryConfigured: false
    };

    return {
      ok: true,
      data: health
    };
  });
  ipcMain.handle(
    "allowance:preview-calculation",
    (_event, input: AllowancePreviewInput): BridgeResult<ReturnType<typeof createAllowanceCalculationSnapshot>> => {
      try {
        const result = createAllowanceCalculationSnapshot({
          calculationId: "preview-calculation",
          performanceApprovalId: "preview-approval",
          calculationVersion: 1,
          createdAt: new Date().toISOString(),
          approvedSnapshot: {
            performanceFileId: "preview-file",
            approvalStatus: "approved",
            approvedAt: new Date().toISOString(),
            approvedBy: "system-preview",
            holidayCalendarId: "preview-holiday-calendar",
            allowanceRateVersionId: "preview-rate-version",
            sourceFileChecksum: "preview-checksum"
          },
          workDate: input.workDate,
          timeRange: {
            startTime: input.startTime,
            endTime: input.endTime,
            breakMinutes: input.breakMinutes
          },
          hourlyRate: input.hourlyRate,
          isHoliday: input.isHoliday,
          workType: input.workType,
          rateTable: {
            base: 1,
            overtime: 1.5,
            night: 0.5,
            holiday: 1.5,
            substitute: 1
          }
        });

        return {
          ok: true,
          data: result
        };
      } catch (error) {
        return {
          ok: false,
          errorCode: "ALLOWANCE_PREVIEW_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        };
      }
    }
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
