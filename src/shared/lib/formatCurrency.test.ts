import { describe, expect, it } from "vitest";

import { formatCurrency } from "./formatCurrency";

describe("formatCurrency", () => {
  it("should format a positive number as KRW", () => {
    expect(formatCurrency(1245000)).toBe("₩1,245,000");
  });

  it("should format zero as KRW", () => {
    expect(formatCurrency(0)).toBe("₩0");
  });
});
