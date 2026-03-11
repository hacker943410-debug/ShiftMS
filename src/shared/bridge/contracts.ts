import type { AuthSession, EmployeeRecord, SiteRecord } from "../domain/model";

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
