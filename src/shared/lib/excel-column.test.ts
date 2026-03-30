import { describe, expect, it } from "vitest";

import {
  excelColumnIndexToLabel,
  excelColumnLabelToIndex,
  isValidExcelColumnLabel,
  normalizeExcelColumnLabel
} from "./excel-column";

describe("excel-column", () => {
  it("should normalize column labels to trimmed uppercase text", () => {
    expect(normalizeExcelColumnLabel(" b ")).toBe("B");
  });

  it("should validate alphabetic excel column labels", () => {
    expect(isValidExcelColumnLabel("A")).toBe(true);
    expect(isValidExcelColumnLabel("aa")).toBe(true);
    expect(isValidExcelColumnLabel("A1")).toBe(false);
    expect(isValidExcelColumnLabel("")).toBe(false);
  });

  it("should convert a column label to a 1-based index", () => {
    expect(excelColumnLabelToIndex("A")).toBe(1);
    expect(excelColumnLabelToIndex("Z")).toBe(26);
    expect(excelColumnLabelToIndex("AA")).toBe(27);
    expect(excelColumnLabelToIndex("AZ")).toBe(52);
  });

  it("should reject invalid column labels", () => {
    expect(() => excelColumnLabelToIndex("A1")).toThrow("열 표기는 A, B, C처럼 입력해야 합니다.");
  });

  it("should convert a 1-based index back to a column label", () => {
    expect(excelColumnIndexToLabel(1)).toBe("A");
    expect(excelColumnIndexToLabel(26)).toBe("Z");
    expect(excelColumnIndexToLabel(27)).toBe("AA");
    expect(excelColumnIndexToLabel(52)).toBe("AZ");
  });
});
