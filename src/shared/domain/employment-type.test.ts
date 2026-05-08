import { describe, expect, it } from "vitest";

import {
  formatEmployeeDisplayName,
  isBpDisplayName,
  isBpEmploymentType,
  normalizeEmploymentTypeLabel,
  resolveImportedEmploymentType
} from "./employment-type";

describe("employment-type", () => {
  it("normalizes known employment type variants", () => {
    expect(normalizeEmploymentTypeLabel("정규직")).toBe("정규");
    expect(normalizeEmploymentTypeLabel("계약직")).toBe("계약");
    expect(normalizeEmploymentTypeLabel("BP")).toBe("BP");
    expect(normalizeEmploymentTypeLabel("파견직")).toBe("계약");
    expect(normalizeEmploymentTypeLabel("용역")).toBe("계약");
  });

  it("falls back to regular employment for empty values", () => {
    expect(normalizeEmploymentTypeLabel("")).toBe("정규");
    expect(normalizeEmploymentTypeLabel(undefined)).toBe("정규");
  });

  it("resolves an imported employment type from supported source columns", () => {
    expect(resolveImportedEmploymentType({ 고용구분명: "계약직" })).toBe("계약");
    expect(resolveImportedEmploymentType({ 근로형태: "정규직" })).toBe("정규");
    expect(resolveImportedEmploymentType({ 고용형태: "BP" })).toBe("BP");
    expect(resolveImportedEmploymentType({})).toBe("정규");
  });

  it("formats BP employee names for display only", () => {
    expect(isBpEmploymentType("BP")).toBe(true);
    expect(formatEmployeeDisplayName({ name: "홍길동", employmentType: "BP" })).toBe("BP(홍길동)");
    expect(formatEmployeeDisplayName({ name: "홍길동", employmentType: "정규" })).toBe("홍길동");
  });

  it("detects BP display names used in schedules and performance files", () => {
    expect(isBpDisplayName("BP")).toBe(true);
    expect(isBpDisplayName("BP(홍길동)")).toBe(true);
    expect(isBpDisplayName("BP (홍길동)")).toBe(true);
    expect(isBpDisplayName("홍길동")).toBe(false);
  });
});
