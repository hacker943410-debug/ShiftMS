import { contextBridge, ipcRenderer } from "electron";

const appBridge = {
  getAppVersion: () => ipcRenderer.invoke("app:get-version") as Promise<string>
};

contextBridge.exposeInMainWorld("appBridge", appBridge);
