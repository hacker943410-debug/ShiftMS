import { describe, expect, it } from "vitest";

import {
  classifySequencePatternGroups,
  detectSequencePattern,
  findRotationOffset
} from "./site-pattern-detection";

describe("site-pattern-detection", () => {
  it("should detect a repeated cycle with perfect confidence", () => {
    const sequence = ["D", "D", "O", "O", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N"];

    const result = detectSequencePattern(sequence, {
      minConfidence: 0.7
    });

    expect(result).not.toBeNull();
    expect(result?.cycleLength).toBe(7);
    expect(result?.cycle).toEqual(["D", "D", "O", "O", "N", "N", "N"]);
    expect(result?.confidence).toBe(1);
  });

  it("should ignore blanks when evaluating candidate confidence", () => {
    const sequence = ["D", "D", "", "O", "N", "N", "N", "D", "D", "", "O", "N", "N", "N"];

    const result = detectSequencePattern(sequence, {
      minConfidence: 0.7
    });

    expect(result).not.toBeNull();
    expect(result?.cycleLength).toBe(7);
    expect(result?.confidence).toBe(1);
    expect(result?.mismatchIndices).toEqual([]);
  });

  it("should classify rotated cycles into the same group", () => {
    const employeeA = detectSequencePattern(
      ["D", "D", "O", "O", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N"],
      {
        minConfidence: 0.7
      }
    );
    const employeeB = detectSequencePattern(
      ["O", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N", "D", "D", "O"],
      {
        minConfidence: 0.7
      }
    );

    const groups = classifySequencePatternGroups([
      { name: "김현중", pattern: employeeA },
      { name: "이은동", pattern: employeeB }
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.members).toHaveLength(2);
    expect(groups[0]?.members[0]?.offset).toBe(0);
    expect(groups[0]?.members[1]?.offset).toBe(3);
  });

  it("should resolve the rotation offset between two cycles", () => {
    expect(findRotationOffset(["D", "D", "O", "O", "N", "N", "N"], ["O", "N", "N", "N", "D", "D", "O"])).toBe(3);
    expect(findRotationOffset(["D", "D", "O"], ["D", "O", "O"])).toBeNull();
  });
});
