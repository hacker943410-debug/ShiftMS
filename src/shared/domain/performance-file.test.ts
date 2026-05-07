import { describe, expect, it } from "vitest";

import {
  isNonPayablePoolSubstitutePerformanceEntry,
  isPoolWorkerDisplayName,
  parsePoolWorkerDisplayName
} from "./performance-file";

describe("performance-file pool worker helpers", () => {
  it("should normalize worker names with the Pool display suffix", () => {
    expect(parsePoolWorkerDisplayName("홍길동(P)")).toEqual({
      employeeName: "홍길동",
      isPoolDisplayName: true
    });
    expect(parsePoolWorkerDisplayName("홍길동 ( p )")).toEqual({
      employeeName: "홍길동",
      isPoolDisplayName: true
    });
    expect(isPoolWorkerDisplayName("홍길동")).toBe(false);
  });

  it("should mark only Pool substitute rows as non-payable", () => {
    expect(
      isNonPayablePoolSubstitutePerformanceEntry({
        section: "substitute",
        employeeName: "홍길동(P)"
      })
    ).toBe(true);
    expect(
      isNonPayablePoolSubstitutePerformanceEntry({
        section: "substitute",
        employeeName: "홍길동",
        isPoolWorker: true
      })
    ).toBe(true);
    expect(
      isNonPayablePoolSubstitutePerformanceEntry({
        section: "overtime",
        employeeName: "홍길동(P)"
      })
    ).toBe(false);
  });
});
