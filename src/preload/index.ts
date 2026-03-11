import { contextBridge, ipcRenderer } from "electron";

import type { AllowanceBridge, AppBridge } from "../shared/bridge/contracts";

const appBridge = {
  getAppVersion: () => ipcRenderer.invoke("app:get-version") as Promise<string>,
  getAppHealth: () =>
    ipcRenderer.invoke("app:get-health") as ReturnType<AppBridge["getAppHealth"]>,
  previewAllowanceCalculation: (input) =>
    ipcRenderer.invoke(
      "allowance:preview-calculation",
      input
    ) as ReturnType<AllowanceBridge["previewCalculation"]>
} satisfies AppBridge & {
  previewAllowanceCalculation: AllowanceBridge["previewCalculation"];
};

contextBridge.exposeInMainWorld("appBridge", appBridge);
