import type { UserRole } from "./model";

export type AccessLogActionType = "sign-in" | "sign-out" | "route-view";

export interface AccessLogRecord {
  id: string;
  userId: string;
  loginId: string;
  displayName: string;
  role: UserRole;
  actionType: AccessLogActionType;
  actionLabel: string;
  routeKey?: string;
  routeLabel?: string;
  details?: string;
  occurredAt: string;
}
