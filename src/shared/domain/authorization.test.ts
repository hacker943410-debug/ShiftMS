import { describe, expect, it } from "vitest";

import {
  canAccessRoute,
  canPerformAction,
  getRequiredRoleForAction,
  getRequiredRoleForRoute,
  hasRequiredRole,
} from "./authorization";

describe("authorization", () => {
  it("treats admin as a superset of every role requirement", () => {
    expect(hasRequiredRole("admin", "operator")).toBe(true);
    expect(hasRequiredRole("admin", "planner")).toBe(true);
    expect(hasRequiredRole("admin", "reviewer")).toBe(true);
    expect(hasRequiredRole("operator", "admin")).toBe(false);
  });

  it("keeps planner and reviewer as separate action roles", () => {
    expect(hasRequiredRole("planner", "operator")).toBe(true);
    expect(hasRequiredRole("reviewer", "operator")).toBe(true);
    expect(hasRequiredRole("planner", "reviewer")).toBe(false);
    expect(hasRequiredRole("reviewer", "planner")).toBe(false);
  });

  it("keeps operations and access history restricted to admins", () => {
    expect(getRequiredRoleForRoute("operations")).toBe("admin");
    expect(getRequiredRoleForRoute("access-history")).toBe("admin");
    expect(canAccessRoute("operator", "operations")).toBe(false);
    expect(canAccessRoute("planner", "operations")).toBe(false);
    expect(canAccessRoute("operator", "access-history")).toBe(false);
    expect(canAccessRoute("reviewer", "access-history")).toBe(false);
    expect(canAccessRoute("admin", "operations")).toBe(true);
  });

  it("allows operational roles on daily workflow routes", () => {
    expect(canAccessRoute("operator", "performance")).toBe(true);
    expect(canAccessRoute("planner", "schedule")).toBe(true);
    expect(canAccessRoute("reviewer", "allowance")).toBe(true);
    expect(canAccessRoute("operator", "allowance")).toBe(true);
    expect(canAccessRoute("admin", "workforce")).toBe(true);
  });

  it("splits planning and approval actions by specialized role", () => {
    expect(getRequiredRoleForAction("employee-write")).toBe("planner");
    expect(getRequiredRoleForAction("site-write")).toBe("planner");
    expect(getRequiredRoleForAction("shift-pattern-write")).toBe("planner");
    expect(getRequiredRoleForAction("schedule-deploy")).toBe("planner");
    expect(getRequiredRoleForAction("performance-approval")).toBe("reviewer");
    expect(getRequiredRoleForAction("allowance-approval")).toBe("reviewer");
    expect(canPerformAction("operator", "employee-write")).toBe(false);
    expect(canPerformAction("operator", "site-write")).toBe(false);
    expect(canPerformAction("operator", "shift-pattern-write")).toBe(false);
    expect(canPerformAction("operator", "schedule-deploy")).toBe(false);
    expect(canPerformAction("operator", "performance-approval")).toBe(false);
    expect(canPerformAction("operator", "allowance-approval")).toBe(false);
    expect(canPerformAction("planner", "employee-write")).toBe(true);
    expect(canPerformAction("planner", "site-write")).toBe(true);
    expect(canPerformAction("planner", "shift-pattern-write")).toBe(true);
    expect(canPerformAction("planner", "schedule-deploy")).toBe(true);
    expect(canPerformAction("planner", "performance-approval")).toBe(false);
    expect(canPerformAction("planner", "allowance-approval")).toBe(false);
    expect(canPerformAction("reviewer", "employee-write")).toBe(false);
    expect(canPerformAction("reviewer", "site-write")).toBe(false);
    expect(canPerformAction("reviewer", "shift-pattern-write")).toBe(false);
    expect(canPerformAction("reviewer", "schedule-deploy")).toBe(false);
    expect(canPerformAction("reviewer", "performance-approval")).toBe(true);
    expect(canPerformAction("reviewer", "allowance-approval")).toBe(true);
    expect(canPerformAction("admin", "employee-write")).toBe(true);
    expect(canPerformAction("admin", "site-write")).toBe(true);
    expect(canPerformAction("admin", "shift-pattern-write")).toBe(true);
    expect(canPerformAction("admin", "schedule-deploy")).toBe(true);
    expect(canPerformAction("admin", "performance-approval")).toBe(true);
    expect(canPerformAction("admin", "allowance-approval")).toBe(true);
  });
});
