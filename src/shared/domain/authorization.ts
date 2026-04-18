import type { RouteKey } from "../config/routes";
import type { UserRole } from "./model";

const roleLabels: Record<UserRole, string> = {
  admin: "관리자",
  planner: "계획 담당",
  reviewer: "승인 담당",
  operator: "사용자",
};

const roleRequirementSatisfaction: Record<UserRole, readonly UserRole[]> = {
  operator: ["operator", "planner", "reviewer", "admin"],
  planner: ["planner", "admin"],
  reviewer: ["reviewer", "admin"],
  admin: ["admin"],
};

export type ActionPermissionKey =
  | "employee-write"
  | "site-write"
  | "shift-pattern-write"
  | "schedule-deploy"
  | "performance-approval"
  | "allowance-approval";

const routeRoleRequirements: Record<RouteKey, UserRole> = {
  dashboard: "operator",
  workforce: "operator",
  sites: "operator",
  schedule: "operator",
  performance: "operator",
  allowance: "operator",
  operations: "admin",
  "access-history": "admin",
};

const actionRoleRequirements: Record<ActionPermissionKey, UserRole> = {
  "employee-write": "planner",
  "site-write": "planner",
  "shift-pattern-write": "planner",
  "schedule-deploy": "planner",
  "performance-approval": "reviewer",
  "allowance-approval": "reviewer",
};

export const getRequiredRoleForRoute = (routeKey: RouteKey): UserRole =>
  routeRoleRequirements[routeKey];

export const getRequiredRoleForAction = (
  actionKey: ActionPermissionKey,
): UserRole => actionRoleRequirements[actionKey];

export const getRoleLabel = (role: UserRole) => roleLabels[role];

export const hasRequiredRole = (role: UserRole, requiredRole: UserRole) =>
  roleRequirementSatisfaction[requiredRole].includes(role);

export const canAccessRoute = (role: UserRole, routeKey: RouteKey) =>
  hasRequiredRole(role, getRequiredRoleForRoute(routeKey));

export const canPerformAction = (
  role: UserRole,
  actionKey: ActionPermissionKey,
) => hasRequiredRole(role, getRequiredRoleForAction(actionKey));
