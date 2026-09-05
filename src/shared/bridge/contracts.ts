import type {
  AllowanceRateHistoryRecord,
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
  SiteNameOptionRecord,
  SiteRecord,
  TemplateType,
  UserRecord,
  WageRateRecord
} from "../domain/model";
import type {
  DocumentTemplateProfile,
  DocumentTemplateValidationSnapshot
} from "../domain/document-template";
import type {
  AccessLogActionType,
  AccessLogRecord
} from "../domain/access-log";
import type { AccessMigrationTableName } from "../domain/database-migration";
import type { TeamWorkType } from "../domain/team-work-type";
import type { AllowanceCalculationSnapshot, TimeRange } from "../domain/calculation";
import type { AuthSessionPolicy } from "../config/auth-session-policy";
import type {
  AllowanceDocumentExportFormat,
  AllowanceDocumentExportRecord
} from "../domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "../domain/allowance-service";
import type {
  AllowanceApprovalRecord,
  AllowanceHistoryStatusFilter,
  AllowanceProposalApprovalInput,
  AllowanceProposalApprovalRecord,
  AllowanceProposalPreview,
  AllowanceReviewActionInput
} from "../domain/allowance-workflow";
import type {
  SchedulePlanExportRecord,
  SchedulePlanPreviewRecord
} from "../domain/schedule-plan";
import type {
  PerformanceApprovalScope,
  PerformanceApprovalActionInput,
  PerformanceApprovedRowHiddenResult,
  PerformanceApprovedRowHideInput,
  PerformanceApprovalRecord,
  PerformanceComparisonDetail,
  PerformanceEntryRecord,
  PerformanceEntrySection,
  PerformanceFileDetail,
  PerformanceFileSyncStateSnapshot,
  PerformanceStartupRecoveryStatusSnapshot,
  PerformanceRejectionInput,
  PerformanceReapprovalFinalizeInput,
  PerformanceOverviewSnapshot,
  PerformanceQueueItem
} from "../domain/performance-file";
import type { ReleaseManifest, UpdateStateSnapshot } from "../domain/app-update";

export interface AppHealth {
  appVersion: string;
  environment: "development" | "production";
  databaseConfigured: boolean;
  pendingDirectoryConfigured: boolean;
  approvedDirectoryConfigured: boolean;
  sessionPolicy: AuthSessionPolicy;
  bootstrapCredentialsFilePath?: string;
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
  databaseBackupDir: string;
  databaseBackupSchedule: "monthly" | "weekly" | "daily";
  databaseBackupTime: string;
  migrationFilePath: string;
  scheduleConsecutiveNightLimit?: number;
  scheduleMinimumRestMinutes?: number;
  scheduleRequireWeeklyHoliday?: boolean;
  scheduleWeeklyMaxMinutes?: number;
  // 대체근무수당 새 정책(Pool·주간고정조 제외) 적용 시작일. 비어 있으면 새 규칙을 적용하지 않는다.
  substituteAllowancePolicyEffectiveFrom?: string;
  // 변경후 우선 규칙 적용 시작일. 비어 있으면 옛 규칙(변경전 우선)을 그대로 쓴다.
  changedSlotPriorityEffectiveFrom?: string;
}

export interface AppSettingsUpdateInput {
  holidayApiBaseUrl: string;
  pendingDir: string;
  approvedDir: string;
  scheduleExportDir: string;
  allowanceProposalExportDir: string;
  allowanceAttachment1ExportDir: string;
  allowanceAttachment2ExportDir: string;
  databaseBackupDir: string;
  databaseBackupSchedule: "monthly" | "weekly" | "daily";
  databaseBackupTime: string;
  migrationFilePath: string;
  scheduleConsecutiveNightLimit?: number;
  scheduleMinimumRestMinutes?: number;
  scheduleRequireWeeklyHoliday?: boolean;
  scheduleWeeklyMaxMinutes?: number;
  // 대체근무수당 새 정책(Pool·주간고정조 제외) 적용 시작일. 비어 있으면 새 규칙을 적용하지 않는다.
  substituteAllowancePolicyEffectiveFrom?: string;
  // 변경후 우선 규칙 적용 시작일. 비어 있으면 옛 규칙(변경전 우선)을 그대로 쓴다.
  changedSlotPriorityEffectiveFrom?: string;
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

export interface FileSelectionInput {
  defaultPath?: string;
  title?: string;
  buttonLabel?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
}

export interface LocalFileSelection {
  fileName: string;
  filePath: string;
}

export interface DatabaseMigrationRunInput {
  migrationFilePath: string;
  selectedAccessTables?: AccessMigrationTableName[];
}

export type DatabaseMigrationRequirementStatus =
  | "not-required"
  | "ready"
  | "script-missing"
  | "provider-missing"
  | "check-failed";

export interface DatabaseMigrationRequirementCheck {
  sourceType: "access" | "json";
  isReady: boolean;
  status: DatabaseMigrationRequirementStatus;
  checkedAt: string;
  headline: string;
  details: string[];
  recommendedActions: string[];
  scriptPath?: string;
  detectedProvider?: string;
}

export interface DatabaseMigrationStateSnapshot {
  siteCount: number;
  employeeCount: number;
  activeAssignmentCount: number;
  endedAssignmentCount: number;
  wageRateCount: number;
  patternCount: number;
  holidayCalendarCount: number;
  holidayItemCount: number;
  rateVersionCount: number;
  rateItemCount: number;
  userCount: number;
  templateVersionCount: number;
  templateHistoryCount: number;
  performanceFileCount: number;
  performanceEntryCount: number;
  performanceApprovalCount: number;
  allowanceCalculationCount: number;
  allowanceDocumentExportCount: number;
}

export interface DatabaseBackupSummary {
  createdAt: string;
  jsonBackupPath: string;
  excelBackupPath?: string;
  accessBackupPath?: string;
  warningMessages: string[];
}

interface DatabaseMigrationBaseSummary {
  sourceType: "access" | "json";
  requirementCheck: DatabaseMigrationRequirementCheck;
  migrationFilePath: string;
  selectedAccessTables: AccessMigrationTableName[];
  importedSiteCount: number;
  importedEmployeeCount: number;
  importedWageRateCount: number;
  importedPatternCount: number;
  importedPerformanceFileCount: number;
  importedPerformanceEntryCount: number;
  importedApprovedEntryCount: number;
  importedAllowanceCalculationCount: number;
  closedAssignmentCount: number;
  skippedDutyReleaseCount: number;
  restoredTableCount: number;
  skippedPatternSiteNames: string[];
  warningMessages: string[];
}

export interface DatabaseMigrationPreview extends DatabaseMigrationBaseSummary {
  databasePath: string;
  currentState: DatabaseMigrationStateSnapshot;
  previewState: DatabaseMigrationStateSnapshot;
  previewedAt: string;
}

export interface DatabaseMigrationSummary extends DatabaseMigrationBaseSummary {
  databasePath: string;
  databaseState: DatabaseMigrationStateSnapshot;
  backupSummary: DatabaseBackupSummary;
  completedAt: string;
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
  changeReason?: string;
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
  password?: string;
  extensionNumber?: string;
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

export interface AuthPasswordChangeInput {
  currentPassword: string;
  nextPassword: string;
}

export interface AccountRecoveryAvailability {
  configured: boolean;
  adminLoginId: string;
  issuedAt?: string;
  lockedUntil?: string;
}

export interface AccountRecoveryInput {
  recoveryKey: string;
}

export interface AccountRecoveryResult {
  adminLoginId: string;
  temporaryPassword: string;
  backupPath: string;
  recoveredAt: string;
}

export interface AccountRecoveryKeyRotationResult {
  adminLoginId: string;
  recoveryKey: string;
  issuedAt: string;
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
  customerName?: string;
  status: SiteRecord["status"];
  timezone: string;
}

export interface SiteDeleteInput {
  siteId: string;
}

export interface SiteNameOptionSaveInput {
  id?: string;
  name: string;
}

export interface SiteNameOptionDeleteInput {
  optionId: string;
}

export interface EmployeeUpsertInput {
  id?: string;
  employeeCode: string;
  name: string;
  contact?: string;
  rank?: EmployeeRecord["rank"];
  employmentType: string;
  status: EmployeeRecord["status"];
  // Required: the hire date decides which schedules and performance rows the person counts in,
  // and a row saved without one can never be judged. Only a retired person carries a retire date.
  hireDate: string;
  retireDate?: string;
  siteId?: string;
  shiftGroup?: string;
  hourlyRate?: number;
}

export interface EmployeeDeleteInput {
  employeeId: string;
}

export interface EmployeeWageRateInput {
  employeeId: string;
  hourlyRate: number;
  effectiveFrom: string;
  reason?: string;
}

export interface WorkforceWageBulkUpdateColumnMappingInput {
  siteNameColumn: string;
  employeeNameColumn: string;
  hourlyRateColumn: string;
  // Optional, and the only key that survives a renamed site, a transfer, or a person with no
  // current assignment. When a row carries one it decides the match and the name is checked
  // against it; without one the site-and-name match is all there is.
  employeeCodeColumn?: string;
}

export type WorkforceWageBulkUpdateRowStatus =
  | "ready"
  | "applied"
  | "missing-required-value"
  | "invalid-hourly-rate"
  | "employee-not-found"
  | "employee-code-not-found"
  | "employee-code-name-mismatch"
  | "ambiguous-employee"
  | "employee-retired"
  | "same-rate"
  | "duplicate-entry";

// What the header row of a chosen workbook suggests each column is. The employee code is the one
// that changes the outcome, so it is detected rather than left to be typed in every time - but a
// suggestion is only applied where a header actually said so, never guessed by position.
export type WorkforceWageBulkSuggestibleColumn =
  | "employeeCodeColumn"
  | "siteNameColumn"
  | "employeeNameColumn"
  | "hourlyRateColumn";

export interface WorkforceWageBulkColumnSuggestion {
  employeeCodeColumn?: string;
  siteNameColumn?: string;
  employeeNameColumn?: string;
  hourlyRateColumn?: string;
  // Fields whose header appears on more than one column, with the columns that claimed it. Nothing
  // is suggested for these: silently taking the first would pick a wage column the operator never
  // meant, and the sheet is the only place that can settle which one is right. The candidates are
  // named so the choice is a decision, not a search.
  ambiguousFields: Array<{ field: WorkforceWageBulkSuggestibleColumn; columns: string[] }>;
  headerLabels: string[];
}

export interface WorkforceWageBulkUpdatePreviewInput {
  filePath: string;
  effectiveFrom: string;
  mapping: WorkforceWageBulkUpdateColumnMappingInput;
}

export interface WorkforceWageBulkUpdateApplyInput extends WorkforceWageBulkUpdatePreviewInput {
  // The preview the operator actually reviewed. Applying re-reads the workbook and re-queries the
  // database, so without this the same path holding edited content would be saved unreviewed.
  expectedPreviewId: string;
}

// Exactly what saving one row would do to that person's wage history, decided at preview time
// with the same rules the save itself uses. It goes into the preview fingerprint, so any of it
// changing underneath makes the reviewed preview unusable instead of silently storing something
// else - the end date, which row gets rewritten, and which earlier lines get cut short.
export interface WorkforceWageBulkUpdateSavePlan {
  // "overwrite" rewrites the line that already starts on the effective date; "insert" adds a line.
  // Both cut short whatever earlier lines cross the date (none in a healthy history).
  mode: "insert" | "overwrite";
  // The exact line an overwrite rewrites - not merely that one exists. Saving picks the newest of
  // several lines sharing a start date, so the count alone does not name the target.
  overwrittenRateId?: string;
  // Absent means the new line runs on with no end.
  newEffectiveTo?: string;
  // Every earlier line the save cuts short, with the end date it has now.
  truncatedRates: Array<{ id: string; effectiveTo?: string }>;
}

export interface WorkforceWageBulkUpdatePreviewRow {
  rowNumber: number;
  siteName: string;
  employeeName: string;
  importedHourlyRate?: number;
  currentHourlyRate?: number;
  currentEffectiveFrom?: string;
  previousEffectiveTo?: string;
  effectiveFrom: string;
  savePlan?: WorkforceWageBulkUpdateSavePlan;
  employeeId?: string;
  employeeCode?: string;
  // The code read from the file, kept even when no one matches it, so the operator can see which
  // value failed. matchedSiteName is where that person is actually assigned now - shown when it
  // disagrees with the site written in the file.
  importedEmployeeCode?: string;
  matchedSiteName?: string;
  // True when the employee code decided the match, so the screen knows the site written in the
  // file is not evidence of where this person is assigned.
  matchedByEmployeeCode?: boolean;
  status: WorkforceWageBulkUpdateRowStatus;
  statusLabel: string;
  note?: string;
}

export interface WorkforceWageBulkUpdatePreview {
  // Fingerprint of everything this preview judged - file content, effective date and the matched
  // people. Apply refuses any preview id that no longer describes what it re-reads.
  previewId: string;
  fileName: string;
  filePath: string;
  sheetName: string;
  effectiveFrom: string;
  totalRows: number;
  readyCount: number;
  skippedCount: number;
  rows: WorkforceWageBulkUpdatePreviewRow[];
}

export interface WorkforceWageBulkUpdateApplySummary {
  previewId: string;
  fileName: string;
  filePath: string;
  sheetName: string;
  effectiveFrom: string;
  totalRows: number;
  appliedCount: number;
  skippedCount: number;
  rows: WorkforceWageBulkUpdatePreviewRow[];
}

export interface EmployeeAssignmentInput {
  employeeId: string;
  siteId: string;
  shiftGroup?: string;
  sortOrder?: number;
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

export interface EmployeeAssignmentReorderInput {
  assignmentId: string;
  direction: "up" | "down";
}

export interface ShiftPatternStepInput {
  stepIndex: number;
  dutyCode: string;
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
  // 평·휴 분리(휴일 시간/휴게). 없으면 평일값을 그대로 사용한다.
  holidayStartTime?: string;
  holidayEndTime?: string;
  holidayBreakMinutes?: number;
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
  patternString?: string;
  patternStartDate?: string;
  steps: ShiftPatternStepInput[];
  teamIndexes: ShiftPatternTeamIndexInput[];
  // 평·휴 분리 설정(없으면 "unified" = 기존 동작).
  holidayTimeMode?: "unified" | "split";
  weekdayPublicHolidayAsHoliday?: boolean;
}

export interface ShiftPatternTeamCycleAssignmentInput {
  teamLabel: string;
  cycleKey: string;
}

export interface ShiftPatternTeamCapacityInput {
  teamLabel: string;
  maxHeadcount?: number;
}

// 조별 근무유형/표시이름/사용여부. 없으면 이름 기준 기본값으로 채워진다(기존 동작 유지).
export interface ShiftPatternTeamSettingInput {
  teamLabel: string;
  displayName?: string;
  workType?: TeamWorkType;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ShiftPatternUpsertInput {
  id?: string;
  siteId: string;
  name: string;
  teamCount: number;
  patternCode: string;
  startIndexRule: string;
  patternStartDate?: string;
  // 이 설정을 적용하기 시작할 날짜. 기존 설정과 날짜가 다르면 새 버전으로 저장된다.
  effectiveFrom?: string;
  status: ShiftPatternRecord["status"];
  steps: ShiftPatternStepInput[];
  teamIndexes: ShiftPatternTeamIndexInput[];
  cycles?: ShiftPatternCycleInput[];
  teamCycleAssignments?: ShiftPatternTeamCycleAssignmentInput[];
  teamCapacities?: ShiftPatternTeamCapacityInput[];
  teamSettings?: ShiftPatternTeamSettingInput[];
  poolEnabled?: boolean;
  poolStartTime?: string;
  poolEndTime?: string;
  poolBreakMinutes?: number;
}

export interface ShiftPatternDeactivateInput {
  patternId: string;
}

export interface SitePatternImportAnalyzeInput {
  filePath: string;
  minConfidence?: number;
}

export interface SitePatternImportDatePreview {
  date: string;
  weekday: string;
  holidayName?: string;
}

export interface SitePatternImportWorkerPreview {
  name: string;
  codes: string[];
}

export interface SitePatternImportMismatch {
  index: number;
  cycleIndex: number;
  date: string;
  weekday: string;
  holidayName?: string;
  actualCode: string;
  expectedCode: string;
}

export interface SitePatternImportSkippedWorker {
  name: string;
  reason: string;
}

export interface SitePatternImportMember {
  name: string;
  offset: number;
  confidence: number;
  mismatchCount: number;
  mismatches: SitePatternImportMismatch[];
}

export interface SitePatternImportTeamSuggestion {
  offset: number;
  headcount: number;
  memberNames: string[];
}

export interface SitePatternImportGroup {
  groupId: number;
  cycleKey: string;
  cycleLength: number;
  cycleCodes: string[];
  cycleDisplay: string;
  shiftCount: number;
  members: SitePatternImportMember[];
  teamSuggestions: SitePatternImportTeamSuggestion[];
}

export interface SitePatternImportSuggestedTeamIndex {
  teamLabel: string;
  index: number;
}

export interface SitePatternImportSuggestedCycle {
  cycleKey: string;
  name: string;
  shiftCount: number;
  patternString: string;
  patternStartDate: string;
  breakMinutes: number;
  shiftTimes: string[];
  teamIndexes: SitePatternImportSuggestedTeamIndex[];
  sourceCycleCodes: string[];
}

export interface SitePatternImportSuggestedTeam {
  teamLabel: string;
  cycleKey: string;
  index: number;
  maxHeadcount: number;
  memberNames: string[];
}

export interface SitePatternImportDraftSuggestion {
  teamCount: number;
  cycleCount: number;
  poolEnabled: boolean;
  poolTimeRange: string;
  poolBreakMinutes: number;
  cycles: SitePatternImportSuggestedCycle[];
  teams: SitePatternImportSuggestedTeam[];
}

export interface SitePatternImportAnalysis {
  fileName: string;
  filePath: string;
  sheetName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  workerCount: number;
  holidayCount: number;
  detectedGroupCount: number;
  uniqueCodes: string[];
  analysisReport: string;
  warningMessages: string[];
  skippedWorkers: SitePatternImportSkippedWorker[];
  dates: SitePatternImportDatePreview[];
  previewRows: SitePatternImportWorkerPreview[];
  groups: SitePatternImportGroup[];
  suggestion: SitePatternImportDraftSuggestion;
}

export interface MonthlyScheduleItemInput {
  employeeCode: string;
  teamLabel?: string;
  sortOrder?: number;
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

export interface AllowanceProposalPreviewInput {
  calculationIds: string[];
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
  forceReparse?: boolean;
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
  periodLabel?: string;
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
  chartKey: "trend" | "site" | "ratio" | "ranking";
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

export interface DocumentTemplateFileSelection extends LocalFileSelection {}

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
  getUpdateState: () => Promise<BridgeResult<UpdateStateSnapshot>>;
  checkForAppUpdate: () => Promise<BridgeResult<UpdateStateSnapshot>>;
  downloadAppUpdate: () => Promise<BridgeResult<UpdateStateSnapshot>>;
  installDownloadedUpdate: () => Promise<BridgeResult<UpdateStateSnapshot>>;
  dismissUpdateNotice: (version: string) => Promise<BridgeResult<UpdateStateSnapshot>>;
}

export interface AccessLogListQuery {
  dateFrom?: string;
  dateTo?: string;
  loginId?: string;
  actionType?: AccessLogActionType | "all";
  keyword?: string;
}

export interface ReleaseHistoryListQuery {
  keyword?: string;
  requiredFilter?: "all" | "required" | "optional";
  backupFilter?: "all" | "required" | "not-required";
}

export interface AccessLogRecordInput {
  actionType: AccessLogActionType;
  actionLabel: string;
  routeKey?: string;
  routeLabel?: string;
  details?: string;
}

export interface DashboardBridge {
  exportDashboardChartData: (
    input: DashboardChartExportInput
  ) => Promise<BridgeResult<DashboardChartExportRecord>>;
  exportDashboardReport: (
    input: DashboardReportExportInput
  ) => Promise<BridgeResult<DashboardReportExportRecord>>;
}

export interface AccessLogBridge {
  listAccessLogs: (
    query?: AccessLogListQuery
  ) => Promise<BridgeResult<AccessLogRecord[]>>;
  recordAccessLog: (
    input: AccessLogRecordInput
  ) => Promise<BridgeResult<null>>;
}

export interface AuthBridge {
  signIn: (input: SignInInput) => Promise<BridgeResult<AuthSession>>;
  changePassword: (input: AuthPasswordChangeInput) => Promise<BridgeResult<AuthSession>>;
  getAccountRecoveryAvailability: () => Promise<BridgeResult<AccountRecoveryAvailability>>;
  recoverAdminAccount: (
    input: AccountRecoveryInput
  ) => Promise<BridgeResult<AccountRecoveryResult>>;
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
  deleteEmployee: (input: EmployeeDeleteInput) => Promise<BridgeResult<EmployeeRecord>>;
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
  reorderEmployeeAssignment: (
    input: EmployeeAssignmentReorderInput
  ) => Promise<BridgeResult<EmployeeSiteAssignment[]>>;
  suggestWorkforceWageBulkColumns: (
    input: { filePath: string }
  ) => Promise<BridgeResult<WorkforceWageBulkColumnSuggestion>>;
  previewWorkforceWageBulkUpdate: (
    input: WorkforceWageBulkUpdatePreviewInput
  ) => Promise<BridgeResult<WorkforceWageBulkUpdatePreview>>;
  applyWorkforceWageBulkUpdate: (
    input: WorkforceWageBulkUpdateApplyInput
  ) => Promise<BridgeResult<WorkforceWageBulkUpdateApplySummary>>;
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
  selectMigrationFile: (
    input?: FileSelectionInput
  ) => Promise<BridgeResult<string | null>>;
  selectSpreadsheetFile: (
    input?: FileSelectionInput
  ) => Promise<BridgeResult<LocalFileSelection | null>>;
  checkDatabaseMigrationRequirements: (
    input: DatabaseMigrationRunInput
  ) => Promise<BridgeResult<DatabaseMigrationRequirementCheck>>;
  previewDatabaseMigrationUpdate: (
    input: DatabaseMigrationRunInput
  ) => Promise<BridgeResult<DatabaseMigrationPreview>>;
  updateDatabaseFromMigration: (
    input: DatabaseMigrationRunInput
  ) => Promise<BridgeResult<DatabaseMigrationSummary>>;
  runDatabaseBackupNow: () => Promise<BridgeResult<DatabaseBackupSummary>>;
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
  listAllowanceRateHistory: () => Promise<BridgeResult<AllowanceRateHistoryRecord[]>>;
  listReleaseHistory: (
    query?: ReleaseHistoryListQuery
  ) => Promise<BridgeResult<ReleaseManifest[]>>;
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
  rotateAccountRecoveryKey: () => Promise<BridgeResult<AccountRecoveryKeyRotationResult>>;
  listSiteNameOptions: () => Promise<BridgeResult<SiteNameOptionRecord[]>>;
  saveSiteNameOption: (
    input: SiteNameOptionSaveInput
  ) => Promise<BridgeResult<SiteNameOptionRecord>>;
  deleteSiteNameOption: (
    input: SiteNameOptionDeleteInput
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
  analyzeSitePatternImport: (
    input: SitePatternImportAnalyzeInput
  ) => Promise<BridgeResult<SitePatternImportAnalysis>>;
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
  reviewAllowanceCalculations: (
    input: AllowanceReviewActionInput
  ) => Promise<BridgeResult<AllowanceApprovalRecord[]>>;
  listAllowanceApprovalHistory: () => Promise<BridgeResult<AllowanceApprovalRecord[]>>;
  previewAllowanceProposal: (
    input: AllowanceProposalPreviewInput
  ) => Promise<BridgeResult<AllowanceProposalPreview>>;
  approveAllowanceProposal: (
    input: AllowanceProposalApprovalInput
  ) => Promise<BridgeResult<AllowanceProposalApprovalRecord>>;
  listAllowanceProposalApprovals: () => Promise<BridgeResult<AllowanceProposalApprovalRecord[]>>;
}

export interface PerformanceBridge {
  getPerformanceSyncState: () => Promise<BridgeResult<PerformanceFileSyncStateSnapshot>>;
  getPerformanceStartupRecoveryStatus: () => Promise<
    BridgeResult<PerformanceStartupRecoveryStatusSnapshot>
  >;
  retryPerformanceStartupRecovery: () => Promise<
    BridgeResult<PerformanceStartupRecoveryStatusSnapshot>
  >;
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
  returnApprovedFileToPending: (
    input: PerformanceReapprovalFinalizeInput
  ) => Promise<BridgeResult<PerformanceFileDetail>>;
  rejectPendingFile: (
    input: PerformanceRejectionInput
  ) => Promise<BridgeResult<PerformanceApprovalRecord>>;
  hideApprovedRow: (
    input: PerformanceApprovedRowHideInput
  ) => Promise<BridgeResult<PerformanceApprovedRowHiddenResult>>;
  listApprovalHistory: () => Promise<BridgeResult<PerformanceApprovalRecord[]>>;
  openPerformanceSourceFile: (fileId: string) => Promise<BridgeResult<null>>;
}
