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
  exportDashboardReport: (input) =>
    ipcRenderer.invoke(
      "dashboard:export-report",
      input
    ) as ReturnType<DashboardBridge["exportDashboardReport"]>,
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
  deleteSite: (input) =>
    ipcRenderer.invoke("sites:delete", input) as ReturnType<WorkforceBridge["deleteSite"]>,
  getAppSettings: () =>
    ipcRenderer.invoke("operations:get-app-settings") as ReturnType<
      OperationsBridge["getAppSettings"]
    >,
  saveAppSettings: (input) =>
    ipcRenderer.invoke(
      "operations:save-app-settings",
      input
    ) as ReturnType<OperationsBridge["saveAppSettings"]>,
  selectDirectory: (input) =>
    ipcRenderer.invoke(
      "operations:select-directory",
      input
    ) as ReturnType<OperationsBridge["selectDirectory"]>,
  selectMigrationFile: (input) =>
    ipcRenderer.invoke(
      "operations:select-migration-file",
      input
    ) as ReturnType<OperationsBridge["selectMigrationFile"]>,
  previewDatabaseMigrationUpdate: (input) =>
    ipcRenderer.invoke(
      "operations:preview-database-migration-update",
      input
    ) as ReturnType<OperationsBridge["previewDatabaseMigrationUpdate"]>,
  updateDatabaseFromMigration: (input) =>
    ipcRenderer.invoke(
      "operations:update-database-from-migration",
      input
    ) as ReturnType<OperationsBridge["updateDatabaseFromMigration"]>,
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
  fetchHolidayApiItems: (year) =>
    ipcRenderer.invoke(
      "operations:fetch-holiday-api-items",
      year
    ) as ReturnType<OperationsBridge["fetchHolidayApiItems"]>,
  addHolidayItem: (input) =>
    ipcRenderer.invoke(
      "operations:add-holiday-item",
      input
    ) as ReturnType<OperationsBridge["addHolidayItem"]>,
  renameHolidayItem: (input) =>
    ipcRenderer.invoke(
      "operations:rename-holiday-item",
      input
    ) as ReturnType<OperationsBridge["renameHolidayItem"]>,
  deleteHolidayItem: (input) =>
    ipcRenderer.invoke(
      "operations:delete-holiday-item",
      input
    ) as ReturnType<OperationsBridge["deleteHolidayItem"]>,
  replaceHolidayCalendar: (input) =>
    ipcRenderer.invoke(
      "operations:replace-holiday-calendar",
      input
    ) as ReturnType<OperationsBridge["replaceHolidayCalendar"]>,
  listAllowanceRateVersions: (year) =>
    ipcRenderer.invoke(
      "operations:list-allowance-rate-versions",
      year
    ) as ReturnType<OperationsBridge["listAllowanceRateVersions"]>,
  saveAllowanceRateVersion: (input) =>
    ipcRenderer.invoke(
      "operations:save-allowance-rate-version",
      input
    ) as ReturnType<OperationsBridge["saveAllowanceRateVersion"]>,
  deleteAllowanceRateVersion: (input) =>
    ipcRenderer.invoke(
      "operations:delete-allowance-rate-version",
      input
    ) as ReturnType<OperationsBridge["deleteAllowanceRateVersion"]>,
  listOperationUsers: () =>
    ipcRenderer.invoke("operations:list-users") as ReturnType<
      OperationsBridge["listOperationUsers"]
    >,
  saveOperationUser: (input) =>
    ipcRenderer.invoke(
      "operations:save-user",
      input
    ) as ReturnType<OperationsBridge["saveOperationUser"]>,
  deleteOperationUser: (input) =>
    ipcRenderer.invoke(
      "operations:delete-user",
      input
    ) as ReturnType<OperationsBridge["deleteOperationUser"]>,
  listDocumentTemplateHistory: (templateType) =>
    ipcRenderer.invoke(
      "operations:list-document-template-history",
      templateType
    ) as ReturnType<OperationsBridge["listDocumentTemplateHistory"]>,
  selectDocumentTemplateFile: (templateType) =>
    ipcRenderer.invoke(
      "operations:select-document-template-file",
      templateType
    ) as ReturnType<OperationsBridge["selectDocumentTemplateFile"]>,
  inspectDocumentTemplate: (input) =>
    ipcRenderer.invoke(
      "operations:inspect-document-template",
      input
    ) as ReturnType<OperationsBridge["inspectDocumentTemplate"]>,
  previewDocumentTemplate: (input) =>
    ipcRenderer.invoke(
      "operations:preview-document-template",
      input
    ) as ReturnType<OperationsBridge["previewDocumentTemplate"]>,
  saveDocumentTemplateVersion: (input) =>
    ipcRenderer.invoke(
      "operations:save-document-template-version",
      input
    ) as ReturnType<OperationsBridge["saveDocumentTemplateVersion"]>,
  approveDocumentTemplateVersion: (templateId) =>
    ipcRenderer.invoke(
      "operations:approve-document-template-version",
      templateId
    ) as ReturnType<OperationsBridge["approveDocumentTemplateVersion"]>,
  setDefaultDocumentTemplateVersion: (templateId) =>
    ipcRenderer.invoke(
      "operations:set-default-document-template-version",
      templateId
    ) as ReturnType<OperationsBridge["setDefaultDocumentTemplateVersion"]>,
  updateDocumentTemplateOutputFileName: (input) =>
    ipcRenderer.invoke(
      "operations:update-document-template-output-file-name",
      input
    ) as ReturnType<OperationsBridge["updateDocumentTemplateOutputFileName"]>,
  deleteDocumentTemplateVersion: (templateId) =>
    ipcRenderer.invoke(
      "operations:delete-document-template-version",
      templateId
    ) as ReturnType<OperationsBridge["deleteDocumentTemplateVersion"]>,
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
  listPerformanceFiles: (query) =>
    ipcRenderer.invoke(
      "performance:list-files",
      query
    ) as ReturnType<PerformanceBridge["listPerformanceFiles"]>,
  listPerformanceOverview: (query) =>
    ipcRenderer.invoke(
      "performance:list-overview",
      query
    ) as ReturnType<PerformanceBridge["listPerformanceOverview"]>,
  getPerformanceComparison: (query) =>
    ipcRenderer.invoke(
      "performance:get-comparison",
      query
    ) as ReturnType<PerformanceBridge["getPerformanceComparison"]>,
  getPerformanceFileDetail: (query) =>
    ipcRenderer.invoke(
      "performance:get-file-detail",
      query
    ) as ReturnType<PerformanceBridge["getPerformanceFileDetail"]>,
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
  finalizeReapprovedFile: (input) =>
    ipcRenderer.invoke(
      "performance:finalize-reapproved-file",
      input
    ) as ReturnType<PerformanceBridge["finalizeReapprovedFile"]>,
  rejectPendingFile: (input) =>
    ipcRenderer.invoke(
      "performance:reject",
      input
    ) as ReturnType<PerformanceBridge["rejectPendingFile"]>,
  listApprovalHistory: () =>
    ipcRenderer.invoke(
      "performance:list-approval-history"
    ) as ReturnType<PerformanceBridge["listApprovalHistory"]>,
  runApprovedCalculation: (input) =>
    ipcRenderer.invoke(
      "allowance:run-approved-calculation",
      input
    ) as ReturnType<AllowanceBridge["runApprovedCalculation"]>,
  listCalculationResults: () =>
    ipcRenderer.invoke(
      "allowance:list-results"
    ) as ReturnType<AllowanceBridge["listCalculationResults"]>,
  listCalculationHistory: () =>
    ipcRenderer.invoke(
      "allowance:list-history"
    ) as ReturnType<AllowanceBridge["listCalculationHistory"]>,
  setCalculationEarlyPayout: (input) =>
    ipcRenderer.invoke(
      "allowance:set-early-payout",
      input
    ) as ReturnType<AllowanceBridge["setCalculationEarlyPayout"]>,
  listApprovedTargets: () =>
    ipcRenderer.invoke(
      "allowance:list-approved-targets"
    ) as ReturnType<AllowanceBridge["listApprovedTargets"]>,
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
