import type { AuthSession, EmployeeRecord, SiteRecord } from "../domain/model";
import type { AllowanceCalculationSnapshot, TimeRange } from "../domain/calculation";
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

export interface SignInInput {
  loginId: string;
  password: string;
}

export interface EmployeeListQuery {
  siteId?: string;
  status?: string;
  keyword?: string;
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

export interface AuthBridge {
  signIn: (input: SignInInput) => Promise<BridgeResult<AuthSession>>;
  signOut: () => Promise<BridgeResult<null>>;
  getSession: () => Promise<BridgeResult<AuthSession | null>>;
}

export interface WorkforceBridge {
  listEmployees: (
    query?: EmployeeListQuery
  ) => Promise<BridgeResult<EmployeeRecord[]>>;
  listSites: () => Promise<BridgeResult<SiteRecord[]>>;
}

export interface AllowanceBridge {
  previewCalculation: (
    input: AllowancePreviewInput
  ) => Promise<BridgeResult<AllowanceCalculationSnapshot>>;
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
