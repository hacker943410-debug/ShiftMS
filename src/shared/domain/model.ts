import type {
  DocumentTemplateProfile,
  DocumentTemplateValidationSnapshot
} from "./document-template";
import type { EmployeeRank } from "./employee-rank";
import type { TeamWorkType } from "./team-work-type";

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
  contact?: string;
  rank?: EmployeeRank;
  employmentType: string;
  status: EmploymentStatus;
  hireDate?: string;
  retireDate?: string;
  deletedAt?: string;
  currentSiteId?: string;
  currentSiteName?: string;
  currentSiteDeletedAt?: string;
  currentShiftGroup?: string;
  currentAssignmentOrder?: number;
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
  sortOrder?: number;
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
  // 평·휴 분리(휴일 시간/휴게). cycle.holidayTimeMode === "split"일 때만 사용하며,
  // 휴일(토·일·공휴일)에 평일값 대신 이 값을 쓴다. 없으면 평일값(startTime/endTime/breakMinutes)을 그대로 사용 → 기존 동작과 동일.
  holidayStartTime?: string;
  holidayEndTime?: string;
  holidayBreakMinutes?: number;
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
  // 평·휴 분리 설정. "split"이면 각 step의 holiday* 값을 휴일(토·일·공휴일)에 적용.
  // 없거나 "unified"이면 기존과 동일(평일값 하나만 사용).
  holidayTimeMode?: "unified" | "split";
  // 평일에 낀 공휴일을 휴일 시간으로 볼지 여부. split 모드에서만 의미가 있으며, 값이 없으면 true(공휴일도 휴일 취급)로 본다.
  // 토·일은 이 값과 무관하게 항상 휴일 시간을 쓴다.
  weekdayPublicHolidayAsHoliday?: boolean;
}

export interface ShiftPatternTeamCycleAssignment {
  teamLabel: string;
  cycleKey: string;
}

export interface ShiftPatternTeamCapacity {
  teamLabel: string;
  maxHeadcount?: number;
}

// 조별 기본 설정(근무유형·표시이름·사용여부·정렬). 저장된 행이 없으면
// 이름 기준 기본값(Pool 계열 → POOL, 그 외 → ROTATING)으로 채워 기존 패턴과 동일하게 동작한다.
export interface ShiftPatternTeamSetting {
  teamLabel: string;
  displayName?: string;
  workType: TeamWorkType;
  isActive: boolean;
  sortOrder: number;
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
  // 이 설정이 적용되기 시작하는 날짜. 같은 근무지의 설정은 이 날짜로 갈라져 버전이 쌓이고,
  // 어떤 날짜의 근무는 그 날짜에 유효했던 버전으로 계산한다. 종료일은 다음 버전 시작일 전날로 본다.
  effectiveFrom?: string;
  status: PatternStatus;
  steps: ShiftPatternStep[];
  teamIndexes: ShiftPatternTeamIndex[];
  cycles: ShiftPatternCycle[];
  teamCycleAssignments: ShiftPatternTeamCycleAssignment[];
  teamCapacities: ShiftPatternTeamCapacity[];
  teamSettings: ShiftPatternTeamSetting[];
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
  sortOrder?: number;
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
