import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";

import type { AppHealth } from "../shared/bridge/contracts";

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
