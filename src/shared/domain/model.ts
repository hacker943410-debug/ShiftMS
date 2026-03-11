export type UserRole = "admin" | "operator";

export type UserStatus = "active" | "inactive";

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
}

export interface AuthSession {
  userId: string;
  loginId: string;
  role: UserRole;
  displayName: string;
  expiresAt: string;
  sessionToken: string;
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
  currentHourlyRate?: number;
}

export interface SiteRecord extends AuditFields {
  id: string;
  siteCode: string;
  name: string;
  status: SiteStatus;
  timezone: string;
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

export interface ShiftPatternRecord extends AuditFields {
  id: string;
  siteId: string;
  name: string;
  cycleLength: number;
  patternCode: string;
  startIndexRule: string;
  status: PatternStatus;
  steps: ShiftPatternStep[];
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
  items: AllowanceRateItem[];
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

export interface PerformanceEntry {
  id: string;
  employeeId: string;
  workDate: string;
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
  dutyCode?: string;
  note?: string;
}

export interface PerformanceFileRecord {
  id: string;
  siteId: string;
  fileName: string;
  filePath: string;
  fileChecksum: string;
  fileSize: number;
  receivedAt: string;
  fileStatus: PerformanceFileStatus;
  templateVersionId?: string;
  entries: PerformanceEntry[];
}

export interface DocumentTemplateVersion {
  id: string;
  templateType: TemplateType;
  versionLabel: string;
  sourcePath: string;
  checksum?: string;
  createdAt: string;
}
