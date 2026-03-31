import { describe, expect, it } from "vitest";

import {
  normalizeEmploymentTypeLabel,
  resolveImportedEmploymentType
} from "./employment-type";

describe("employment-type", () => {
  it("normalizes known employment type variants", () => {
    expect(normalizeEmploymentTypeLabel("정규직")).toBe("정규");
    expect(normalizeEmploymentTypeLabel("계약직")).toBe("계약");
    expect(normalizeEmploymentTypeLabel("파견직")).toBe("파견");
    expect(normalizeEmploymentTypeLabel("용역")).toBe("파견");
  });

  it("falls back to 미분류 for empty values", () => {
    expect(normalizeEmploymentTypeLabel("")).toBe("미분류");
    expect(normalizeEmploymentTypeLabel(undefined)).toBe("미분류");
  });

  it("resolves an imported employment type from supported source columns", () => {
    expect(resolveImportedEmploymentType({ 고용구분명: "계약직" })).toBe("계약");
    expect(resolveImportedEmploymentType({ 근로형태: "정규직" })).toBe("정규");
    expect(resolveImportedEmploymentType({})).toBe("미분류");
  });
});
