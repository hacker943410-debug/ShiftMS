import type {
  AllowanceRateVersion,
  AuthSession,
  DocumentTemplateVersion,
  EmployeeRecord,
  EmployeeSiteAssignment,
  HolidayCalendar,
  MonthlyScheduleRecord,
  ShiftPatternRecord,
  SiteRecord,
  TemplateType,
  UserRecord,
  WageRateRecord
} from "../domain/model";
import type { AllowanceCalculationSnapshot, TimeRange } from "../domain/calculation";
import type { AllowanceDocumentExportRecord } from "../domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "../domain/allowance-service";
import type {
  SchedulePlanExportRecord,
  SchedulePlanPreviewRecord
} from "../domain/schedule-plan";
import type {
  PerformanceApprovalActionInput,
  PerformanceApprovalRecord,
  PerformanceFileDetail,
  PerformanceRejectionInput,
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
}

export interface AppSettingsUpdateInput {
  holidayApiBaseUrl: string;
  pendingDir: string;
  approvedDir: string;
  scheduleExportDir: string;
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
}

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
}

export interface DashboardChartExportRecord {
  chartKey: DashboardChartExportInput["chartKey"];
  chartTitle: string;
  outputFileName: string;
  outputPath: string;
  rowCount: number;
  exportedAt: string;
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
}

export interface OperationsBridge {
  getAppSettings: () => Promise<BridgeResult<AppSettingsSnapshot>>;
  saveAppSettings: (
    input: AppSettingsUpdateInput
  ) => Promise<BridgeResult<AppSettingsSnapshot>>;
  getFileWatchStatus: () => Promise<BridgeResult<FileWatchStatusSnapshot>>;
  restartFileWatch: () => Promise<BridgeResult<FileWatchStatusSnapshot>>;
  stopFileWatch: () => Promise<BridgeResult<FileWatchStatusSnapshot>>;
  listHolidayCalendars: (
    year?: number
  ) => Promise<BridgeResult<HolidayCalendar[]>>;
  listAllowanceRateVersions: (
    year?: number
  ) => Promise<BridgeResult<AllowanceRateVersion[]>>;
  listOperationUsers: () => Promise<BridgeResult<UserRecord[]>>;
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
  runApprovedCalculation: (
    fileId: string
  ) => Promise<BridgeResult<AllowanceCalculationResultRecord>>;
  listCalculationResults: () => Promise<BridgeResult<AllowanceCalculationResultRecord[]>>;
  exportAllowanceDocuments: (
    input: AllowanceDocumentExportInput
  ) => Promise<BridgeResult<AllowanceDocumentExportRecord>>;
  listAllowanceDocumentExports: () => Promise<BridgeResult<AllowanceDocumentExportRecord[]>>;
}

export interface PerformanceBridge {
  listPendingFiles: () => Promise<BridgeResult<PerformanceQueueItem[]>>;
  getPendingFileDetail: (
    fileId: string
  ) => Promise<BridgeResult<PerformanceFileDetail | null>>;
  approvePendingFile: (
    input: PerformanceApprovalActionInput
  ) => Promise<BridgeResult<PerformanceApprovalRecord>>;
  rejectPendingFile: (
    input: PerformanceRejectionInput
  ) => Promise<BridgeResult<PerformanceApprovalRecord>>;
  listApprovalHistory: () => Promise<BridgeResult<PerformanceApprovalRecord[]>>;
}
