import { describe, expect, it } from "vitest";

import { formatEmployeeRank, normalizeEmployeeRank } from "./employee-rank";

describe("employee-rank", () => {
  it("normalizes only supported rank labels", () => {
    expect(normalizeEmployeeRank(" 대리 ")).toBe("대리");
    expect(normalizeEmployeeRank("본부장")).toBeUndefined();
    expect(normalizeEmployeeRank("")).toBeUndefined();
  });

  it("formats blank or unsupported ranks as dash", () => {
    expect(formatEmployeeRank("차장")).toBe("차장");
    expect(formatEmployeeRank(undefined)).toBe("-");
    expect(formatEmployeeRank("임원")).toBe("-");
  });
});
