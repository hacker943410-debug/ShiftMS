import type {
  AllowanceRateVersion,
  AuthSession,
  DocumentTemplateHistoryRecord,
  DocumentTemplateVersion,
  EmployeeRecord,
  EmployeeSiteAssignment,
  HolidayCalendar,
  HolidayItem,
  MonthlyScheduleRecord,
  ShiftPatternRecord,
  SiteRecord,
  TemplateType,
  UserRecord,
  WageRateRecord
} from "../domain/model";
import type {
  DocumentTemplateProfile,
  DocumentTemplateValidationSnapshot
} from "../domain/document-template";
import type { AllowanceCalculationSnapshot, TimeRange } from "../domain/calculation";
import type {
  AllowanceDocumentExportFormat,
  AllowanceDocumentExportRecord
} from "../domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "../domain/allowance-service";
import type {
  SchedulePlanExportRecord,
  SchedulePlanPreviewRecord
} from "../domain/schedule-plan";
import type {
  PerformanceApprovalScope,
  PerformanceApprovalActionInput,
  PerformanceApprovalRecord,
  PerformanceComparisonDetail,
  PerformanceEntryRecord,
  PerformanceEntrySection,
  PerformanceFileDetail,
  PerformanceRejectionInput,
  PerformanceReapprovalFinalizeInput,
  PerformanceOverviewSnapshot,
  PerformanceQueueItem
} from "../domain/performance-file";

export interface AppHealth {
  appVersion: string;
  environment: "development" | "production";
  databaseConfigured: boolean;
  pendingDirectoryConfigured: boolean;
  approvedDirectoryConfigured: boolean;
}

export interface AppSettingsSnapshot {
  appName: string;
  holidayApiBaseUrl: string;
  dataDir: string;
  databasePath: string;
  pendingDir: string;
  approvedDir: string;
  scheduleExportDir: string;
  allowanceProposalExportDir: string;
  allowanceAttachment1ExportDir: string;
  allowanceAttachment2ExportDir: string;
}

export interface AppSettingsUpdateInput {
  holidayApiBaseUrl: string;
  pendingDir: string;
  approvedDir: string;
  scheduleExportDir: string;
  allowanceProposalExportDir: string;
  allowanceAttachment1ExportDir: string;
  allowanceAttachment2ExportDir: string;
}

export interface FileWatchEventSnapshot {
  type: "file-added" | "file-changed" | "file-removed" | "watcher-error";
  occurredAt: string;
  filePath: string;
  fileName: string;
  directoryType: "pending" | "approved" | "unknown";
  duplicateKey?: string;
  message?: string;
}

export interface FileWatchStatusSnapshot {
  isRunning: boolean;
  pendingDir: string;
  approvedDir: string;
  lastStartedAt?: string;
  lastStoppedAt?: string;
  lastErrorMessage?: string;
  recentEvents: FileWatchEventSnapshot[];
}

export interface HolidayItemUpsertInput {
  year: number;
  holidayDate: string;
  name: string;
  isSubstitute?: boolean;
}

export interface HolidayItemRenameInput {
  holidayItemId: string;
  name: string;
}

export interface HolidayItemDeleteInput {
  holidayItemId: string;
}

export interface HolidayCalendarReplaceInput {
  year: number;
  sourceName?: string;
  sourceVersion?: string;
  items: Array<Pick<HolidayItem, "holidayDate" | "name" | "isSubstitute">>;
}

export interface DirectorySelectionInput {
  defaultPath?: string;
  title?: string;
  buttonLabel?: string;
}

export interface AllowanceRateItemSaveInput {
  allowanceCode: string;
  multiplier: number;
  roundingPolicy?: string;
}

export interface AllowanceRateVersionSaveInput {
  id?: string;
  year: number;
  versionLabel: string;
  status: AllowanceRateVersion["status"];
  effectiveFrom: string;
  effectiveTo?: string;
  items: AllowanceRateItemSaveInput[];
}

export interface AllowanceRateVersionDeleteInput {
  rateVersionId: string;
}

export interface OperationUserSaveInput {
  id?: string;
  loginId: string;
  displayName: string;
  role: UserRecord["role"];
  status: UserRecord["status"];
  contact?: string;
  email?: string;
}

export interface OperationUserDeleteInput {
  userId: string;
}

export interface SignInInput {
  loginId: string;
  password: string;
}

export interface EmployeeListQuery {
  siteId?: string;
  status?: string;
  keyword?: string;
}

export interface SiteUpsertInput {
  id?: string;
  siteCode: string;
  name: string;
  status: SiteRecord["status"];
  timezone: string;
}

export interface SiteDeleteInput {
  siteId: string;
}

export interface EmployeeUpsertInput {
  id?: string;
  employeeCode: string;
  name: string;
  employmentType: string;
  status: EmployeeRecord["status"];
  hireDate?: string;
  retireDate?: string;
  siteId?: string;
  shiftGroup?: string;
  hourlyRate?: number;
}

export interface EmployeeWageRateInput {
  employeeId: string;
  hourlyRate: number;
  effectiveFrom: string;
  reason?: string;
}

export interface EmployeeAssignmentInput {
  employeeId: string;
  siteId: string;
  shiftGroup?: string;
  teamName?: string;
  startDate: string;
}

export interface EmployeeWageRateCloseInput {
  wageRateId: string;
  effectiveTo: string;
}

export interface EmployeeAssignmentCloseInput {
  assignmentId: string;
  endDate: string;
}

export interface ShiftPatternStepInput {
  stepIndex: number;
  dutyCode: string;
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
}

export interface ShiftPatternTeamIndexInput {
  teamLabel: string;
  index: number;
}

export interface ShiftPatternCycleInput {
  cycleKey: string;
  name: string;
  order: number;
  shiftCount: number;
  patternCode: string;
  patternStartDate?: string;
  steps: ShiftPatternStepInput[];
  teamIndexes: ShiftPatternTeamIndexInput[];
}

export interface ShiftPatternTeamCycleAssignmentInput {
  teamLabel: string;
  cycleKey: string;
}

export interface ShiftPatternTeamCapacityInput {
  teamLabel: string;
  maxHeadcount?: number;
}

export interface ShiftPatternUpsertInput {
  id?: string;
  siteId: string;
  name: string;
  teamCount: number;
  patternCode: string;
  startIndexRule: string;
  patternStartDate?: string;
  status: ShiftPatternRecord["status"];
  steps: ShiftPatternStepInput[];
  teamIndexes: ShiftPatternTeamIndexInput[];
  cycles?: ShiftPatternCycleInput[];
  teamCycleAssignments?: ShiftPatternTeamCycleAssignmentInput[];
  teamCapacities?: ShiftPatternTeamCapacityInput[];
  poolEnabled?: boolean;
  poolStartTime?: string;
  poolEndTime?: string;
  poolBreakMinutes?: number;
}

export interface ShiftPatternDeactivateInput {
  patternId: string;
}

export interface MonthlyScheduleItemInput {
  employeeCode: string;
  teamLabel?: string;
  workDate: string;
  dutyCode: string;
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
}

export interface MonthlyScheduleUpsertInput {
  id?: string;
  siteId: string;
  scheduleMonth: string;
  patternId: string;
  generatedBy: string;
  templateVersionId?: string;
  items: MonthlyScheduleItemInput[];
}

export interface AllowancePreviewInput {
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  hourlyRate: number;
  isHoliday?: boolean;
  workType?: "regular" | "overtime" | "night" | "holiday" | "substitute";
}

export interface AllowanceDocumentExportInput {
  calculationIds: string[];
  outputFormat: AllowanceDocumentExportFormat;
}

export interface AllowanceEarlyPayoutInput {
  calculationId: string;
  earlyPayoutDate?: string | null;
}

export interface PerformanceFileListQuery {
  status?: "pending" | "approved";
  scheduleMonth?: string;
}

export interface PerformanceFileDetailQuery extends PerformanceFileListQuery {
  fileId: string;
}

export interface PerformanceOverviewQuery {
  approvalScope?: PerformanceApprovalScope;
  section?: PerformanceEntrySection | "all";
  scheduleMonth?: string;
}

export interface PerformanceComparisonQuery {
  fileId: string;
  entryId: string;
}

export type AllowanceApprovedCalculationInput =
  | {
      entryId: string;
    }
  | string;

export interface DashboardChartExportFilterSummary {
  year: string;
  month: string;
  siteName: string;
  employeeName: string;
  dataSource: string;
}

export interface DashboardChartExportColumn {
  key: string;
  header: string;
  format?: "text" | "number" | "currency" | "percent";
}

export type DashboardChartExportCell = string | number | null;

export interface DashboardChartExportRow {
  [key: string]: DashboardChartExportCell;
}

export interface DashboardChartExportInput {
  chartKey: "trend" | "site" | "ratio";
  chartTitle: string;
  sheetName: string;
  filters: DashboardChartExportFilterSummary;
  columns: DashboardChartExportColumn[];
  rows: DashboardChartExportRow[];
  outputFormat?: "xlsx" | "pdf";
  chartImageDataUrl?: string;
}

export interface DashboardChartExportRecord {
  chartKey: DashboardChartExportInput["chartKey"];
  chartTitle: string;
  outputFileName: string;
  outputPath: string;
  rowCount: number;
  exportedAt: string;
}

export interface DashboardReportExportSection {
  sectionKey: DashboardChartExportInput["chartKey"] | "ranking";
  chartTitle: string;
  sheetName: string;
  columns: DashboardChartExportColumn[];
  rows: DashboardChartExportRow[];
  chartImageDataUrl?: string;
}

export interface DashboardReportExportInput {
  title: string;
  filters: DashboardChartExportFilterSummary;
  outputFormat: "xlsx" | "pdf";
  sections: DashboardReportExportSection[];
}

export interface DashboardReportExportRecord {
  title: string;
  outputFileName: string;
  outputPath: string;
  sectionCount: number;
  exportedAt: string;
}

export interface DocumentTemplateInspectInput {
  templateType: TemplateType;
  sourcePath: string;
}

export interface DocumentTemplateSaveInput {
  id?: string;
  templateType: TemplateType;
  versionLabel: string;
  sourcePath: string;
  managedFileName?: string;
  profileSchemaVersion?: string;
  profile: DocumentTemplateProfile;
  validation: DocumentTemplateValidationSnapshot;
}

export interface DocumentTemplateOutputFileNameUpdateInput {
  templateId: string;
  outputFileNamePattern: string;
}

export interface DocumentTemplateFileSelection {
  fileName: string;
  filePath: string;
}

export interface DocumentTemplatePreviewInput {
  templateType: TemplateType;
  versionLabel?: string;
  sourcePath: string;
  profile: DocumentTemplateProfile;
}

export interface DocumentTemplatePreviewRecord {
  templateType: TemplateType;
  outputFileName: string;
  outputPath: string;
  previewedAt: string;
}

export interface BridgeSuccess<T> {
  ok: true;
  data: T;
}

export interface BridgeFailure {
  ok: false;
  errorCode: string;
  message: string;
}

export type BridgeResult<T> = BridgeSuccess<T> | BridgeFailure;

export interface AppBridge {
  getAppVersion: () => Promise<string>;
  getAppHealth: () => Promise<BridgeResult<AppHealth>>;
}

export interface DashboardBridge {
  exportDashboardChartData: (
    input: DashboardChartExportInput
  ) => Promise<BridgeResult<DashboardChartExportRecord>>;
  exportDashboardReport: (
    input: DashboardReportExportInput
  ) => Promise<BridgeResult<DashboardReportExportRecord>>;
}

export interface AuthBridge {
  signIn: (input: SignInInput) => Promise<BridgeResult<AuthSession>>;
  signOut: () => Promise<BridgeResult<null>>;
  getSession: () => Promise<BridgeResult<AuthSession | null>>;
}

export interface WorkforceBridge {
  listEmployees: (
    query?: EmployeeListQuery
  ) => Promise<BridgeResult<EmployeeRecord[]>>;
  listEmployeeWageRates: (
    employeeId: string
  ) => Promise<BridgeResult<WageRateRecord[]>>;
  listEmployeeAssignments: (
    employeeId: string
  ) => Promise<BridgeResult<EmployeeSiteAssignment[]>>;
  saveEmployee: (input: EmployeeUpsertInput) => Promise<BridgeResult<EmployeeRecord>>;
  saveEmployeeWageRate: (
    input: EmployeeWageRateInput
  ) => Promise<BridgeResult<WageRateRecord>>;
  closeEmployeeWageRate: (
    input: EmployeeWageRateCloseInput
  ) => Promise<BridgeResult<WageRateRecord>>;
  saveEmployeeAssignment: (
    input: EmployeeAssignmentInput
  ) => Promise<BridgeResult<EmployeeSiteAssignment>>;
  closeEmployeeAssignment: (
    input: EmployeeAssignmentCloseInput
  ) => Promise<BridgeResult<EmployeeSiteAssignment>>;
  listSites: () => Promise<BridgeResult<SiteRecord[]>>;
  saveSite: (input: SiteUpsertInput) => Promise<BridgeResult<SiteRecord>>;
  deleteSite: (input: SiteDeleteInput) => Promise<BridgeResult<SiteRecord>>;
}

export interface OperationsBridge {
  getAppSettings: () => Promise<BridgeResult<AppSettingsSnapshot>>;
  saveAppSettings: (
    input: AppSettingsUpdateInput
  ) => Promise<BridgeResult<AppSettingsSnapshot>>;
  selectDirectory: (
    input?: DirectorySelectionInput
  ) => Promise<BridgeResult<string | null>>;
  getFileWatchStatus: () => Promise<BridgeResult<FileWatchStatusSnapshot>>;
  restartFileWatch: () => Promise<BridgeResult<FileWatchStatusSnapshot>>;
  stopFileWatch: () => Promise<BridgeResult<FileWatchStatusSnapshot>>;
  listHolidayCalendars: (
    year?: number
  ) => Promise<BridgeResult<HolidayCalendar[]>>;
  fetchHolidayApiItems: (
    year: number
  ) => Promise<BridgeResult<HolidayItem[]>>;
  addHolidayItem: (
    input: HolidayItemUpsertInput
  ) => Promise<BridgeResult<HolidayCalendar>>;
  renameHolidayItem: (
    input: HolidayItemRenameInput
  ) => Promise<BridgeResult<HolidayCalendar>>;
  deleteHolidayItem: (
    input: HolidayItemDeleteInput
  ) => Promise<BridgeResult<HolidayCalendar>>;
  replaceHolidayCalendar: (
    input: HolidayCalendarReplaceInput
  ) => Promise<BridgeResult<HolidayCalendar>>;
  listAllowanceRateVersions: (
    year?: number
  ) => Promise<BridgeResult<AllowanceRateVersion[]>>;
  saveAllowanceRateVersion: (
    input: AllowanceRateVersionSaveInput
  ) => Promise<BridgeResult<AllowanceRateVersion>>;
  deleteAllowanceRateVersion: (
    input: AllowanceRateVersionDeleteInput
  ) => Promise<BridgeResult<null>>;
  listOperationUsers: () => Promise<BridgeResult<UserRecord[]>>;
  saveOperationUser: (
    input: OperationUserSaveInput
  ) => Promise<BridgeResult<UserRecord>>;
  deleteOperationUser: (
    input: OperationUserDeleteInput
  ) => Promise<BridgeResult<null>>;
  listDocumentTemplateHistory: (
    templateType?: TemplateType
  ) => Promise<BridgeResult<DocumentTemplateHistoryRecord[]>>;
  selectDocumentTemplateFile: (
    templateType?: TemplateType
  ) => Promise<BridgeResult<DocumentTemplateFileSelection | null>>;
  inspectDocumentTemplate: (
    input: DocumentTemplateInspectInput
  ) => Promise<BridgeResult<DocumentTemplateValidationSnapshot & { profile: DocumentTemplateProfile }>>;
  previewDocumentTemplate: (
    input: DocumentTemplatePreviewInput
  ) => Promise<BridgeResult<DocumentTemplatePreviewRecord | null>>;
  saveDocumentTemplateVersion: (
    input: DocumentTemplateSaveInput
  ) => Promise<BridgeResult<DocumentTemplateVersion>>;
  approveDocumentTemplateVersion: (
    templateId: string
  ) => Promise<BridgeResult<DocumentTemplateVersion>>;
  setDefaultDocumentTemplateVersion: (
    templateId: string
  ) => Promise<BridgeResult<DocumentTemplateVersion>>;
  updateDocumentTemplateOutputFileName: (
    input: DocumentTemplateOutputFileNameUpdateInput
  ) => Promise<BridgeResult<DocumentTemplateVersion>>;
  deleteDocumentTemplateVersion: (
    templateId: string
  ) => Promise<BridgeResult<null>>;
  listDocumentTemplateVersions: (
    templateType?: TemplateType
  ) => Promise<BridgeResult<DocumentTemplateVersion[]>>;
  listShiftPatterns: (
    siteId?: string
  ) => Promise<BridgeResult<ShiftPatternRecord[]>>;
  saveShiftPattern: (
    input: ShiftPatternUpsertInput
  ) => Promise<BridgeResult<ShiftPatternRecord>>;
  deactivateShiftPattern: (
    input: ShiftPatternDeactivateInput
  ) => Promise<BridgeResult<ShiftPatternRecord>>;
  listMonthlySchedules: (
    siteId?: string
  ) => Promise<BridgeResult<MonthlyScheduleRecord[]>>;
  saveMonthlySchedule: (
    input: MonthlyScheduleUpsertInput
  ) => Promise<BridgeResult<MonthlyScheduleRecord>>;
  previewMonthlySchedulePlan: (
    scheduleId: string
  ) => Promise<BridgeResult<SchedulePlanPreviewRecord | null>>;
  exportMonthlySchedulePlan: (
    scheduleId: string
  ) => Promise<BridgeResult<SchedulePlanExportRecord | null>>;
  listSchedulePlanExports: (
    scheduleId?: string
  ) => Promise<BridgeResult<SchedulePlanExportRecord[]>>;
  publishSchedulePlanExport: (
    exportId: string
  ) => Promise<BridgeResult<SchedulePlanExportRecord | null>>;
}

export interface AllowanceBridge {
  previewCalculation: (
    input: AllowancePreviewInput
  ) => Promise<BridgeResult<AllowanceCalculationSnapshot>>;
  listApprovedTargets: () => Promise<BridgeResult<PerformanceEntryRecord[]>>;
  runApprovedCalculation: (
    input: AllowanceApprovedCalculationInput
  ) => Promise<BridgeResult<AllowanceCalculationResultRecord>>;
  listCalculationResults: () => Promise<BridgeResult<AllowanceCalculationResultRecord[]>>;
  listCalculationHistory: () => Promise<BridgeResult<AllowanceCalculationResultRecord[]>>;
  setCalculationEarlyPayout: (
    input: AllowanceEarlyPayoutInput
  ) => Promise<BridgeResult<AllowanceCalculationResultRecord>>;
  exportAllowanceDocuments: (
    input: AllowanceDocumentExportInput
  ) => Promise<BridgeResult<AllowanceDocumentExportRecord>>;
  listAllowanceDocumentExports: () => Promise<BridgeResult<AllowanceDocumentExportRecord[]>>;
}

export interface PerformanceBridge {
  listPerformanceOverview: (
    query?: PerformanceOverviewQuery
  ) => Promise<BridgeResult<PerformanceOverviewSnapshot>>;
  getPerformanceComparison: (
    query: PerformanceComparisonQuery
  ) => Promise<BridgeResult<PerformanceComparisonDetail | null>>;
  listPerformanceFiles: (
    query?: PerformanceFileListQuery
  ) => Promise<BridgeResult<PerformanceQueueItem[]>>;
  getPerformanceFileDetail: (
    query: PerformanceFileDetailQuery
  ) => Promise<BridgeResult<PerformanceFileDetail | null>>;
  listPendingFiles: () => Promise<BridgeResult<PerformanceQueueItem[]>>;
  getPendingFileDetail: (
    fileId: string
  ) => Promise<BridgeResult<PerformanceFileDetail | null>>;
  approvePendingFile: (
    input: PerformanceApprovalActionInput
  ) => Promise<BridgeResult<PerformanceApprovalRecord>>;
  finalizeReapprovedFile: (
    input: PerformanceReapprovalFinalizeInput
  ) => Promise<BridgeResult<PerformanceFileDetail>>;
  rejectPendingFile: (
    input: PerformanceRejectionInput
  ) => Promise<BridgeResult<PerformanceApprovalRecord>>;
  listApprovalHistory: () => Promise<BridgeResult<PerformanceApprovalRecord[]>>;
}
