import type {
  DocumentTemplateProfile,
  DocumentTemplateValidationSnapshot
} from "./document-template";

export type UserRole = "admin" | "planner" | "reviewer" | "operator";

export type UserStatus = "active" | "inactive" | "pending";

export type EmploymentStatus = "active" | "leave" | "retired";

export type SiteStatus = "active" | "inactive";

export type PatternStatus = "active" | "inactive";

export type ApprovalStatus = "approved" | "rejected";

export type PerformanceFileStatus =
  | "pending"
  | "parsed"
  | "approved"
  | "rejected"
  | "error";

export type AllowanceRateStatus = "draft" | "active" | "retired";

export type TemplateType =
  | "schedule"
  | "proposal"
  | "attachment1"
  | "attachment2";

export type DocumentTemplateStatus = "pending" | "approved";

export type WorkType = "regular" | "overtime" | "night" | "holiday" | "substitute";

export interface AuditFields {
  createdAt: string;
  updatedAt?: string;
}

export interface UserRecord extends AuditFields {
  id: string;
  loginId: string;
  role: UserRole;
  displayName: string;
  status: UserStatus;
  extensionNumber?: string;
  contact?: string;
  email?: string;
}

export interface AuthSession {
  userId: string;
  loginId: string;
  role: UserRole;
  displayName: string;
  expiresAt: string;
  sessionToken: string;
  passwordChangeRequired: boolean;
}

export interface EmployeeRecord extends AuditFields {
  id: string;
  employeeCode: string;
  name: string;
  employmentType: string;
  status: EmploymentStatus;
  hireDate?: string;
  retireDate?: string;
  currentSiteId?: string;
  currentSiteName?: string;
  currentShiftGroup?: string;
  currentAssignmentStartDate?: string;
  currentAssignmentEndDate?: string;
  currentHourlyRate?: number;
}

export interface SiteRecord extends AuditFields {
  id: string;
  siteCode: string;
  name: string;
  customerName?: string;
  status: SiteStatus;
  timezone: string;
}

export interface SiteNameOptionRecord extends AuditFields {
  id: string;
  name: string;
  usageCount: number;
}

export interface EmployeeSiteAssignment {
  id: string;
  employeeId: string;
  employeeCode?: string;
  employeeName?: string;
  siteId: string;
  siteName?: string;
  teamName?: string;
  shiftGroup?: string;
  startDate: string;
  endDate?: string;
  status: "active" | "ended";
  createdAt: string;
}

export interface ShiftPatternStep {
  id: string;
  stepIndex: number;
  dutyCode: string;
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
}

export interface ShiftPatternTeamIndex {
  teamLabel: string;
  index: number;
}

export interface ShiftPatternCycle {
  id: string;
  cycleKey: string;
  name: string;
  order: number;
  shiftCount: number;
  cycleLength: number;
  patternCode: string;
  patternString?: string;
  patternStartDate?: string;
  steps: ShiftPatternStep[];
  teamIndexes: ShiftPatternTeamIndex[];
}

export interface ShiftPatternTeamCycleAssignment {
  teamLabel: string;
  cycleKey: string;
}

export interface ShiftPatternTeamCapacity {
  teamLabel: string;
  maxHeadcount?: number;
}

export interface ShiftPatternRecord extends AuditFields {
  id: string;
  siteId: string;
  name: string;
  teamCount: number;
  cycleLength: number;
  patternCode: string;
  startIndexRule: string;
  patternStartDate?: string;
  status: PatternStatus;
  steps: ShiftPatternStep[];
  teamIndexes: ShiftPatternTeamIndex[];
  cycles: ShiftPatternCycle[];
  teamCycleAssignments: ShiftPatternTeamCycleAssignment[];
  teamCapacities: ShiftPatternTeamCapacity[];
  poolEnabled: boolean;
  poolStartTime?: string;
  poolEndTime?: string;
  poolBreakMinutes?: number;
}

export interface WageRateRecord {
  id: string;
  employeeId: string;
  employeeCode?: string;
  employeeName?: string;
  hourlyRate: number;
  effectiveFrom: string;
  effectiveTo?: string;
  reason?: string;
  createdAt: string;
}

export interface AllowanceRateItem {
  id: string;
  allowanceCode: string;
  multiplier: number;
  roundingPolicy: string;
}

export interface AllowanceRateVersion extends AuditFields {
  id: string;
  year: number;
  versionLabel: string;
  status: AllowanceRateStatus;
  effectiveFrom: string;
  effectiveTo?: string;
  changeReason?: string;
  items: AllowanceRateItem[];
}

export type AllowanceRateHistoryAction = "registered" | "updated" | "applied" | "deleted";

export interface AllowanceRateHistoryRecord {
  id: string;
  rateVersionId: string;
  year: number;
  versionLabel: string;
  actionType: AllowanceRateHistoryAction;
  reason: string;
  detail?: string;
  occurredAt: string;
}

export interface HolidayItem {
  id: string;
  holidayDate: string;
  name: string;
  isSubstitute: boolean;
}

export interface HolidayCalendar {
  id: string;
  year: number;
  sourceName: string;
  sourceVersion?: string;
  createdAt: string;
  items: HolidayItem[];
}

export interface MonthlyScheduleItem {
  id: string;
  employeeId: string;
  employeeCode?: string;
  employeeName?: string;
  teamLabel?: string;
  workDate: string;
  dutyCode: string;
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
}

export interface MonthlyScheduleRecord {
  id: string;
  siteId: string;
  siteName?: string;
  scheduleMonth: string;
  patternId: string;
  patternName?: string;
  generatedAt: string;
  generatedBy: string;
  templateVersionId?: string;
  items: MonthlyScheduleItem[];
}

export interface DocumentTemplateVersion {
  id: string;
  templateType: TemplateType;
  versionLabel: string;
  sourcePath: string;
  status: DocumentTemplateStatus;
  isDefault: boolean;
  outputFileNamePattern?: string;
  profileSchemaVersion?: string;
  profile?: DocumentTemplateProfile;
  validation?: DocumentTemplateValidationSnapshot;
  checksum?: string;
  createdAt: string;
  updatedAt?: string;
  approvedAt?: string;
}

export type DocumentTemplateHistoryAction =
  | "registered"
  | "updated"
  | "approved"
  | "set-default"
  | "deleted";

export interface DocumentTemplateHistoryRecord {
  id: string;
  templateId: string;
  templateType: TemplateType;
  versionLabel: string;
  actionType: DocumentTemplateHistoryAction;
  detail?: string;
  occurredAt: string;
}
