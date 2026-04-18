export type AuthSessionPersistence = "runtime-only";

export interface AuthSessionPolicy {
  persistence: AuthSessionPersistence;
  restoreOnRestart: boolean;
  renewOnAuthenticatedAccess: boolean;
  durationHours: number;
}

export const AUTH_SESSION_DURATION_HOURS = 8;
export const AUTH_SESSION_DURATION_MS = AUTH_SESSION_DURATION_HOURS * 60 * 60 * 1000;

export const authSessionPolicy: AuthSessionPolicy = {
  persistence: "runtime-only",
  restoreOnRestart: false,
  renewOnAuthenticatedAccess: true,
  durationHours: AUTH_SESSION_DURATION_HOURS
};
