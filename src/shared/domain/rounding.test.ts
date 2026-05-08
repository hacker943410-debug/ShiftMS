import { describe, expect, it } from "vitest";

import { roundMoney, roundUpWon } from "./rounding";

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

describe("roundUpWon", () => {
  it("should keep integer values unchanged", () => {
    expect(roundUpWon(7500)).toBe(7500);
  });

  it("should always round positive decimal won amounts up", () => {
    expect(roundUpWon(222.001)).toBe(223);
    expect(roundUpWon(222.5)).toBe(223);
  });

  it("should fall back to zero for invalid amounts", () => {
    expect(roundUpWon(Number.NaN)).toBe(0);
  });
});
