import { contextBridge, ipcRenderer } from "electron";

import type {
  AllowanceBridge,
  AppBridge,
  AuthBridge,
  PerformanceBridge,
  WorkforceBridge
} from "../shared/bridge/contracts";

const appBridge = {
  getAppVersion: () => ipcRenderer.invoke("app:get-version") as Promise<string>,
  getAppHealth: () =>
    ipcRenderer.invoke("app:get-health") as ReturnType<AppBridge["getAppHealth"]>,
  signIn: (input) =>
    ipcRenderer.invoke("auth:sign-in", input) as ReturnType<AuthBridge["signIn"]>,
  signOut: () => ipcRenderer.invoke("auth:sign-out") as ReturnType<AuthBridge["signOut"]>,
  getSession: () =>
    ipcRenderer.invoke("auth:get-session") as ReturnType<AuthBridge["getSession"]>,
  listEmployees: (query) =>
    ipcRenderer.invoke("employees:list", query) as ReturnType<WorkforceBridge["listEmployees"]>,
  saveEmployee: (input) =>
    ipcRenderer.invoke("employees:save", input) as ReturnType<WorkforceBridge["saveEmployee"]>,
  listSites: () =>
    ipcRenderer.invoke("sites:list") as ReturnType<WorkforceBridge["listSites"]>,
  saveSite: (input) =>
    ipcRenderer.invoke("sites:save", input) as ReturnType<WorkforceBridge["saveSite"]>,
  listPendingFiles: () =>
    ipcRenderer.invoke(
      "performance:list-pending-files"
    ) as ReturnType<PerformanceBridge["listPendingFiles"]>,
  getPendingFileDetail: (fileId) =>
    ipcRenderer.invoke(
      "performance:get-pending-file-detail",
      fileId
    ) as ReturnType<PerformanceBridge["getPendingFileDetail"]>,
  approvePendingFile: (input) =>
    ipcRenderer.invoke(
      "performance:approve",
      input
    ) as ReturnType<PerformanceBridge["approvePendingFile"]>,
  rejectPendingFile: (input) =>
    ipcRenderer.invoke(
      "performance:reject",
      input
    ) as ReturnType<PerformanceBridge["rejectPendingFile"]>,
  listApprovalHistory: () =>
    ipcRenderer.invoke(
      "performance:list-approval-history"
    ) as ReturnType<PerformanceBridge["listApprovalHistory"]>,
  runApprovedCalculation: (fileId) =>
    ipcRenderer.invoke(
      "allowance:run-approved-calculation",
      fileId
    ) as ReturnType<AllowanceBridge["runApprovedCalculation"]>,
  listCalculationResults: () =>
    ipcRenderer.invoke(
      "allowance:list-results"
    ) as ReturnType<AllowanceBridge["listCalculationResults"]>,
  previewAllowanceCalculation: (input) =>
    ipcRenderer.invoke(
      "allowance:preview-calculation",
      input
    ) as ReturnType<AllowanceBridge["previewCalculation"]>
} satisfies AppBridge &
  AuthBridge &
  WorkforceBridge &
  PerformanceBridge & {
  runApprovedCalculation: AllowanceBridge["runApprovedCalculation"];
  listCalculationResults: AllowanceBridge["listCalculationResults"];
  previewAllowanceCalculation: AllowanceBridge["previewCalculation"];
};

contextBridge.exposeInMainWorld("appBridge", appBridge);
