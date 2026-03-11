import { describe, expect, it } from "vitest";

import { roundMoney } from "./rounding";

describe("roundMoney", () => {
  it("should keep integer values unchanged", () => {
    expect(roundMoney(7500)).toBe(7500);
  });

  it("should round half up for decimal amounts", () => {
    expect(roundMoney(222.5)).toBe(223);
  });

  it("should round down when the decimal part is below half", () => {
    expect(roundMoney(222.216)).toBe(222);
  });
});
