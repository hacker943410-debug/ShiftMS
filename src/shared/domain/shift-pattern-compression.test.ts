import { describe, expect, it } from "vitest";

import {
  buildShiftPatternDutyLabelMap,
  buildShiftPatternDutySlotMap,
  buildShiftPatternDisplayString,
  buildShiftPatternStepsFromPatternString,
  parseCompressedShiftPatternString
} from "./shift-pattern-compression";

describe("shift-pattern-compression", () => {
  it("should expand repeated tokens and grouped expressions for 2-shift patterns", () => {
    const parsed = parseCompressedShiftPatternString("주*2,휴*2,(야휴)*2", 2, ["주간", "야간"]);

    expect(parsed.normalizedPattern).toBe("주*2휴*2(야휴)*2");
    expect(parsed.expandedPatternString).toBe("주주휴휴야휴야휴");
    expect(parsed.tokens).toEqual(["주", "주", "휴", "휴", "야", "휴", "야", "휴"]);
    expect(parsed.cycleLabels).toEqual(["주간", "주간", "휴무", "휴무", "야간", "휴무", "야간", "휴무"]);
    expect(parsed.invalidTokens).toEqual([]);
  });

  it("should accept korean and numeric aliases for 3-shift patterns", () => {
    const parsed = parseCompressedShiftPatternString("1*2,석,3,휴", 3, ["1근", "2근", "3근"]);

    expect(parsed.tokens).toEqual(["주", "주", "석", "야", "휴"]);
    expect(parsed.cycleLabels).toEqual(["1근", "1근", "2근", "3근", "휴무"]);
    expect(parsed.invalidTokens).toEqual([]);
  });

  it("should build shift steps from compressed input with canonical duty codes", () => {
    const steps = buildShiftPatternStepsFromPatternString(
      3,
      ["1근", "2근", "3근"],
      ["06:00 - 14:00", "14:00 - 22:00", "22:00 - 06:00"],
      60,
      "주,석,야,휴"
    );

    expect(steps).toEqual([
      {
        stepIndex: 0,
        dutyCode: "A",
        startTime: "06:00",
        endTime: "14:00",
        breakMinutes: 60
      },
      {
        stepIndex: 1,
        dutyCode: "B",
        startTime: "14:00",
        endTime: "22:00",
        breakMinutes: 60
      },
      {
        stepIndex: 2,
        dutyCode: "C",
        startTime: "22:00",
        endTime: "06:00",
        breakMinutes: 60
      },
      {
        stepIndex: 3,
        dutyCode: "X",
        breakMinutes: 0
      }
    ]);
  });

  it("should report invalid repeat fragments and unmatched groups", () => {
    const parsed = parseCompressedShiftPatternString("주*(야", 2, ["주간", "야간"]);

    expect(parsed.invalidTokens).toEqual(["*", "("]);
    expect(parsed.tokens).toEqual(["주", "야"]);
  });

  it("should build display strings with korean symbols for three-shift duty codes", () => {
    const patternString = buildShiftPatternDisplayString([
      { stepIndex: 0, dutyCode: "A" },
      { stepIndex: 1, dutyCode: "A" },
      { stepIndex: 2, dutyCode: "X" },
      { stepIndex: 3, dutyCode: "B" },
      { stepIndex: 4, dutyCode: "C" }
    ]);

    expect(patternString).toBe("주주휴석야");
  });

  it("should preserve canonical three-shift meanings even when the pattern order is mixed", () => {
    expect(
      Array.from(buildShiftPatternDutySlotMap(["A", "C", "B"], 3).entries())
    ).toEqual([
      ["A", 0],
      ["C", 2],
      ["B", 1]
    ]);
    expect(
      Array.from(buildShiftPatternDutyLabelMap(["A", "C", "B"], 3).entries())
    ).toEqual([
      ["A", "1근"],
      ["C", "3근"],
      ["B", "2근"]
    ]);
  });

  it("should parse access sample strings for two-shift patterns", () => {
    const parsed = parseCompressedShiftPatternString(
      "휴*2,주*2,휴,주*2,휴,주*3,휴,주*2,(휴휴야)*14",
      2,
      ["주간", "야간"]
    );

    expect(parsed.invalidTokens).toEqual([]);
    expect(parsed.tokens).toHaveLength(56);
    expect(parsed.tokens.slice(0, 8)).toEqual(["휴", "휴", "주", "주", "휴", "주", "주", "휴"]);
    expect(parsed.tokens.slice(-6)).toEqual(["휴", "휴", "야", "휴", "휴", "야"]);
  });

  it("should expand mixed single-token and grouped repeats without invalid fragments", () => {
    const parsed = parseCompressedShiftPatternString("(주*2휴)*2야*3", 2, ["주간", "야간"]);

    expect(parsed.invalidTokens).toEqual([]);
    expect(parsed.tokens).toEqual(["주", "주", "휴", "주", "주", "휴", "야", "야", "야"]);
  });

  it("should parse access sample strings for three-shift patterns", () => {
    const parsed = parseCompressedShiftPatternString("석*5,휴*2,(주야휴휴)*7", 3, ["1근", "2근", "3근"]);

    expect(parsed.invalidTokens).toEqual([]);
    expect(parsed.tokens).toHaveLength(35);
    expect(parsed.tokens.slice(0, 7)).toEqual(["석", "석", "석", "석", "석", "휴", "휴"]);
    expect(parsed.tokens.slice(-8)).toEqual(["주", "야", "휴", "휴", "주", "야", "휴", "휴"]);
  });
});
