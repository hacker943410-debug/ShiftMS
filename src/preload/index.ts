import { contextBridge, ipcRenderer } from "electron";

import type { AppBridge } from "../shared/bridge/contracts";

const appBridge = {
  getAppVersion: () => ipcRenderer.invoke("app:get-version") as Promise<string>,
  getAppHealth: () =>
    ipcRenderer.invoke("app:get-health") as ReturnType<AppBridge["getAppHealth"]>
} satisfies AppBridge;

contextBridge.exposeInMainWorld("appBridge", appBridge);
