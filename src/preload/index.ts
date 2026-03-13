import { contextBridge, ipcRenderer } from "electron";

import type {
  AllowanceBridge,
  AppBridge,
  AuthBridge,
  DashboardBridge,
  OperationsBridge,
  PerformanceBridge,
  WorkforceBridge
} from "../shared/bridge/contracts";

const appBridge = {
  getAppVersion: () => ipcRenderer.invoke("app:get-version") as Promise<string>,
  getAppHealth: () =>
    ipcRenderer.invoke("app:get-health") as ReturnType<AppBridge["getAppHealth"]>,
  exportDashboardChartData: (input) =>
    ipcRenderer.invoke(
      "dashboard:export-chart-data",
      input
    ) as ReturnType<DashboardBridge["exportDashboardChartData"]>,
  signIn: (input) =>
    ipcRenderer.invoke("auth:sign-in", input) as ReturnType<AuthBridge["signIn"]>,
  signOut: () => ipcRenderer.invoke("auth:sign-out") as ReturnType<AuthBridge["signOut"]>,
  getSession: () =>
    ipcRenderer.invoke("auth:get-session") as ReturnType<AuthBridge["getSession"]>,
  listEmployees: (query) =>
    ipcRenderer.invoke("employees:list", query) as ReturnType<WorkforceBridge["listEmployees"]>,
  listEmployeeWageRates: (employeeId) =>
    ipcRenderer.invoke(
      "employees:list-wage-rates",
      employeeId
    ) as ReturnType<WorkforceBridge["listEmployeeWageRates"]>,
  listEmployeeAssignments: (employeeId) =>
    ipcRenderer.invoke(
      "employees:list-assignments",
      employeeId
    ) as ReturnType<WorkforceBridge["listEmployeeAssignments"]>,
  saveEmployeeWageRate: (input) =>
    ipcRenderer.invoke(
      "employees:save-wage-rate",
      input
    ) as ReturnType<WorkforceBridge["saveEmployeeWageRate"]>,
  closeEmployeeWageRate: (input) =>
    ipcRenderer.invoke(
      "employees:close-wage-rate",
      input
    ) as ReturnType<WorkforceBridge["closeEmployeeWageRate"]>,
  saveEmployeeAssignment: (input) =>
    ipcRenderer.invoke(
      "employees:save-assignment",
      input
    ) as ReturnType<WorkforceBridge["saveEmployeeAssignment"]>,
  closeEmployeeAssignment: (input) =>
    ipcRenderer.invoke(
      "employees:close-assignment",
      input
    ) as ReturnType<WorkforceBridge["closeEmployeeAssignment"]>,
  saveEmployee: (input) =>
    ipcRenderer.invoke("employees:save", input) as ReturnType<WorkforceBridge["saveEmployee"]>,
  listSites: () =>
    ipcRenderer.invoke("sites:list") as ReturnType<WorkforceBridge["listSites"]>,
  saveSite: (input) =>
    ipcRenderer.invoke("sites:save", input) as ReturnType<WorkforceBridge["saveSite"]>,
  getAppSettings: () =>
    ipcRenderer.invoke("operations:get-app-settings") as ReturnType<
      OperationsBridge["getAppSettings"]
    >,
  saveAppSettings: (input) =>
    ipcRenderer.invoke(
      "operations:save-app-settings",
      input
    ) as ReturnType<OperationsBridge["saveAppSettings"]>,
  getFileWatchStatus: () =>
    ipcRenderer.invoke("operations:get-file-watch-status") as ReturnType<
      OperationsBridge["getFileWatchStatus"]
    >,
  restartFileWatch: () =>
    ipcRenderer.invoke("operations:restart-file-watch") as ReturnType<
      OperationsBridge["restartFileWatch"]
    >,
  stopFileWatch: () =>
    ipcRenderer.invoke("operations:stop-file-watch") as ReturnType<
      OperationsBridge["stopFileWatch"]
    >,
  listHolidayCalendars: (year) =>
    ipcRenderer.invoke(
      "operations:list-holiday-calendars",
      year
    ) as ReturnType<OperationsBridge["listHolidayCalendars"]>,
  listAllowanceRateVersions: (year) =>
    ipcRenderer.invoke(
      "operations:list-allowance-rate-versions",
      year
    ) as ReturnType<OperationsBridge["listAllowanceRateVersions"]>,
  listOperationUsers: () =>
    ipcRenderer.invoke("operations:list-users") as ReturnType<
      OperationsBridge["listOperationUsers"]
    >,
  listDocumentTemplateVersions: (templateType) =>
    ipcRenderer.invoke(
      "operations:list-document-template-versions",
      templateType
    ) as ReturnType<OperationsBridge["listDocumentTemplateVersions"]>,
  listShiftPatterns: (siteId) =>
    ipcRenderer.invoke(
      "shift-patterns:list",
      siteId
    ) as ReturnType<OperationsBridge["listShiftPatterns"]>,
  saveShiftPattern: (input) =>
    ipcRenderer.invoke(
      "shift-patterns:save",
      input
    ) as ReturnType<OperationsBridge["saveShiftPattern"]>,
  deactivateShiftPattern: (input) =>
    ipcRenderer.invoke(
      "shift-patterns:deactivate",
      input
    ) as ReturnType<OperationsBridge["deactivateShiftPattern"]>,
  listMonthlySchedules: (siteId) =>
    ipcRenderer.invoke(
      "monthly-schedules:list",
      siteId
    ) as ReturnType<OperationsBridge["listMonthlySchedules"]>,
  saveMonthlySchedule: (input) =>
    ipcRenderer.invoke(
      "monthly-schedules:save",
      input
    ) as ReturnType<OperationsBridge["saveMonthlySchedule"]>,
  previewMonthlySchedulePlan: (scheduleId) =>
    ipcRenderer.invoke(
      "monthly-schedules:preview-plan",
      scheduleId
    ) as ReturnType<OperationsBridge["previewMonthlySchedulePlan"]>,
  exportMonthlySchedulePlan: (scheduleId) =>
    ipcRenderer.invoke(
      "monthly-schedules:export-plan",
      scheduleId
    ) as ReturnType<OperationsBridge["exportMonthlySchedulePlan"]>,
  listSchedulePlanExports: (scheduleId) =>
    ipcRenderer.invoke(
      "monthly-schedules:list-exports",
      scheduleId
    ) as ReturnType<OperationsBridge["listSchedulePlanExports"]>,
  publishSchedulePlanExport: (exportId) =>
    ipcRenderer.invoke(
      "monthly-schedules:publish-export",
      exportId
    ) as ReturnType<OperationsBridge["publishSchedulePlanExport"]>,
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
  exportAllowanceDocuments: (input) =>
    ipcRenderer.invoke(
      "allowance:export-documents",
      input
    ) as ReturnType<AllowanceBridge["exportAllowanceDocuments"]>,
  listAllowanceDocumentExports: () =>
    ipcRenderer.invoke(
      "allowance:list-document-exports"
    ) as ReturnType<AllowanceBridge["listAllowanceDocumentExports"]>,
  previewCalculation: (input) =>
    ipcRenderer.invoke(
      "allowance:preview-calculation",
      input
    ) as ReturnType<AllowanceBridge["previewCalculation"]>
} satisfies AppBridge &
  DashboardBridge &
  AuthBridge &
  WorkforceBridge &
  OperationsBridge &
  PerformanceBridge &
  AllowanceBridge;

contextBridge.exposeInMainWorld("appBridge", appBridge);
