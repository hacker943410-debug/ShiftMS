import { describe, expect, it } from "vitest";

import type { EmployeeRecord, WageRateRecord } from "../../../shared/domain/model";
import {
  createInitialWageRateFormState,
  createWageRateCorrectionFormState,
  isWageRateFormCorrection
} from "./wage-rate-form";

describe("wage-rate-form", () => {
  it("should create initial state with empty effectiveFrom and reason when no employee is provided", () => {
    const state = createInitialWageRateFormState(null);

    expect(state.mode).toBe("create");
    expect(state.targetWageRateId).toBeUndefined();
    expect(state.hourlyRate).toBe("");
    expect(state.effectiveFrom).toBe("");
    expect(state.reason).toBe("");
    expect(isWageRateFormCorrection(state)).toBe(false);
  });

  it("should create initial state with employee hourly rate but keep effectiveFrom empty", () => {
    const mockEmployee = {
      id: "emp-1",
      employeeCode: "EMP-001",
      name: "홍길동",
      status: "active",
      employmentType: "regular",
      currentHourlyRate: 14500
    } as EmployeeRecord;

    const state = createInitialWageRateFormState(mockEmployee);

    expect(state.mode).toBe("create");
    expect(state.targetWageRateId).toBeUndefined();
    expect(state.hourlyRate).toBe("14500");
    expect(state.effectiveFrom).toBe("");
    expect(state.reason).toBe("");
    expect(isWageRateFormCorrection(state)).toBe(false);
  });

  it("should create correction state matching target wage rate record exactly", () => {
    const mockRate: WageRateRecord = {
      id: "wage-123",
      employeeId: "emp-1",
      employeeCode: "EMP-001",
      employeeName: "홍길동",
      hourlyRate: 15000,
      effectiveFrom: "2026-04-01",
      effectiveTo: "2026-06-30",
      reason: "성과 우수 인상",
      createdAt: "2026-04-01T00:00:00.000Z"
    };

    const state = createWageRateCorrectionFormState(mockRate);

    expect(state.mode).toBe("correct");
    expect(state.targetWageRateId).toBe("wage-123");
    expect(state.hourlyRate).toBe("15000");
    expect(state.effectiveFrom).toBe("2026-04-01");
    expect(state.reason).toBe("성과 우수 인상");
    expect(isWageRateFormCorrection(state)).toBe(true);
  });
});
