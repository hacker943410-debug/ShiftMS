import { contextBridge, ipcRenderer } from "electron";

import type {
  AccessLogBridge,
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
  getUpdateState: () =>
    ipcRenderer.invoke("app:get-update-state") as ReturnType<AppBridge["getUpdateState"]>,
  checkForAppUpdate: () =>
    ipcRenderer.invoke("app:check-for-update") as ReturnType<AppBridge["checkForAppUpdate"]>,
  downloadAppUpdate: () =>
    ipcRenderer.invoke("app:download-update") as ReturnType<AppBridge["downloadAppUpdate"]>,
  installDownloadedUpdate: () =>
    ipcRenderer.invoke("app:install-update") as ReturnType<AppBridge["installDownloadedUpdate"]>,
  dismissUpdateNotice: (version) =>
    ipcRenderer.invoke(
      "app:dismiss-update-notice",
      version
    ) as ReturnType<AppBridge["dismissUpdateNotice"]>,
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
  changePassword: (input) =>
    ipcRenderer.invoke("auth:change-password", input) as ReturnType<AuthBridge["changePassword"]>,
  getAccountRecoveryAvailability: () =>
    ipcRenderer.invoke("auth:get-account-recovery-availability") as ReturnType<
      AuthBridge["getAccountRecoveryAvailability"]
    >,
  recoverAdminAccount: (input) =>
    ipcRenderer.invoke(
      "auth:recover-admin-account",
      input
    ) as ReturnType<AuthBridge["recoverAdminAccount"]>,
  signOut: () => ipcRenderer.invoke("auth:sign-out") as ReturnType<AuthBridge["signOut"]>,
  getSession: () =>
    ipcRenderer.invoke("auth:get-session") as ReturnType<AuthBridge["getSession"]>,
  listAccessLogs: (query) =>
    ipcRenderer.invoke(
      "access-logs:list",
      query
    ) as ReturnType<AccessLogBridge["listAccessLogs"]>,
  recordAccessLog: (input) =>
    ipcRenderer.invoke(
      "access-logs:record",
      input
    ) as ReturnType<AccessLogBridge["recordAccessLog"]>,
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
  reorderEmployeeAssignment: (input) =>
    ipcRenderer.invoke(
      "employees:reorder-assignment",
      input
    ) as ReturnType<WorkforceBridge["reorderEmployeeAssignment"]>,
  previewWorkforceWageBulkUpdate: (input) =>
    ipcRenderer.invoke(
      "employees:preview-wage-bulk-update",
      input
    ) as ReturnType<WorkforceBridge["previewWorkforceWageBulkUpdate"]>,
  applyWorkforceWageBulkUpdate: (input) =>
    ipcRenderer.invoke(
      "employees:apply-wage-bulk-update",
      input
    ) as ReturnType<WorkforceBridge["applyWorkforceWageBulkUpdate"]>,
  saveEmployee: (input) =>
    ipcRenderer.invoke("employees:save", input) as ReturnType<WorkforceBridge["saveEmployee"]>,
  deleteEmployee: (input) =>
    ipcRenderer.invoke(
      "employees:delete",
      input
    ) as ReturnType<WorkforceBridge["deleteEmployee"]>,
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
  selectSpreadsheetFile: (input) =>
    ipcRenderer.invoke(
      "operations:select-spreadsheet-file",
      input
    ) as ReturnType<OperationsBridge["selectSpreadsheetFile"]>,
  checkDatabaseMigrationRequirements: (input) =>
    ipcRenderer.invoke(
      "operations:check-database-migration-requirements",
      input
    ) as ReturnType<OperationsBridge["checkDatabaseMigrationRequirements"]>,
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
  runDatabaseBackupNow: () =>
    ipcRenderer.invoke("operations:run-database-backup-now") as ReturnType<
      OperationsBridge["runDatabaseBackupNow"]
    >,
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
  listAllowanceRateHistory: () =>
    ipcRenderer.invoke(
      "operations:list-allowance-rate-history"
    ) as ReturnType<OperationsBridge["listAllowanceRateHistory"]>,
  listReleaseHistory: (query) =>
    ipcRenderer.invoke(
      "operations:list-release-history",
      query
    ) as ReturnType<OperationsBridge["listReleaseHistory"]>,
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
  rotateAccountRecoveryKey: () =>
    ipcRenderer.invoke("operations:rotate-account-recovery-key") as ReturnType<
      OperationsBridge["rotateAccountRecoveryKey"]
    >,
  listSiteNameOptions: () =>
    ipcRenderer.invoke(
      "operations:list-site-name-options"
    ) as ReturnType<OperationsBridge["listSiteNameOptions"]>,
  saveSiteNameOption: (input) =>
    ipcRenderer.invoke(
      "operations:save-site-name-option",
      input
    ) as ReturnType<OperationsBridge["saveSiteNameOption"]>,
  deleteSiteNameOption: (input) =>
    ipcRenderer.invoke(
      "operations:delete-site-name-option",
      input
    ) as ReturnType<OperationsBridge["deleteSiteNameOption"]>,
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
  analyzeSitePatternImport: (input) =>
    ipcRenderer.invoke(
      "shift-patterns:analyze-import",
      input
    ) as ReturnType<OperationsBridge["analyzeSitePatternImport"]>,
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
  getPerformanceSyncState: () =>
    ipcRenderer.invoke(
      "performance:get-sync-state"
    ) as ReturnType<PerformanceBridge["getPerformanceSyncState"]>,
  getPerformanceStartupRecoveryStatus: () =>
    ipcRenderer.invoke(
      "performance:get-startup-recovery-status"
    ) as ReturnType<PerformanceBridge["getPerformanceStartupRecoveryStatus"]>,
  retryPerformanceStartupRecovery: () =>
    ipcRenderer.invoke(
      "performance:retry-startup-recovery"
    ) as ReturnType<PerformanceBridge["retryPerformanceStartupRecovery"]>,
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
  returnApprovedFileToPending: (input) =>
    ipcRenderer.invoke(
      "performance:return-to-pending",
      input
    ) as ReturnType<PerformanceBridge["returnApprovedFileToPending"]>,
  rejectPendingFile: (input) =>
    ipcRenderer.invoke(
      "performance:reject",
      input
    ) as ReturnType<PerformanceBridge["rejectPendingFile"]>,
  hideApprovedRow: (input) =>
    ipcRenderer.invoke(
      "performance:hide-approved-row",
      input
    ) as ReturnType<PerformanceBridge["hideApprovedRow"]>,
  listApprovalHistory: () =>
    ipcRenderer.invoke(
      "performance:list-approval-history"
    ) as ReturnType<PerformanceBridge["listApprovalHistory"]>,
  openPerformanceSourceFile: (fileId) =>
    ipcRenderer.invoke(
      "performance:open-source-file",
      fileId
    ) as ReturnType<PerformanceBridge["openPerformanceSourceFile"]>,
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
  reviewAllowanceCalculations: (input) =>
    ipcRenderer.invoke(
      "allowance:review-calculations",
      input
    ) as ReturnType<AllowanceBridge["reviewAllowanceCalculations"]>,
  listAllowanceApprovalHistory: () =>
    ipcRenderer.invoke(
      "allowance:list-approval-history"
    ) as ReturnType<AllowanceBridge["listAllowanceApprovalHistory"]>,
  exportAllowanceDocuments: (input) =>
    ipcRenderer.invoke(
      "allowance:export-documents",
      input
    ) as ReturnType<AllowanceBridge["exportAllowanceDocuments"]>,
  listAllowanceDocumentExports: () =>
    ipcRenderer.invoke(
      "allowance:list-document-exports"
    ) as ReturnType<AllowanceBridge["listAllowanceDocumentExports"]>,
  previewAllowanceProposal: (input) =>
    ipcRenderer.invoke(
      "allowance:preview-proposal",
      input
    ) as ReturnType<AllowanceBridge["previewAllowanceProposal"]>,
  approveAllowanceProposal: (input) =>
    ipcRenderer.invoke(
      "allowance:approve-proposal",
      input
    ) as ReturnType<AllowanceBridge["approveAllowanceProposal"]>,
  listAllowanceProposalApprovals: () =>
    ipcRenderer.invoke(
      "allowance:list-proposal-approvals"
    ) as ReturnType<AllowanceBridge["listAllowanceProposalApprovals"]>,
  previewCalculation: (input) =>
    ipcRenderer.invoke(
      "allowance:preview-calculation",
      input
    ) as ReturnType<AllowanceBridge["previewCalculation"]>
} satisfies AppBridge &
  AccessLogBridge &
  DashboardBridge &
  AuthBridge &
  WorkforceBridge &
  OperationsBridge &
  PerformanceBridge &
  AllowanceBridge;

contextBridge.exposeInMainWorld("appBridge", appBridge);
