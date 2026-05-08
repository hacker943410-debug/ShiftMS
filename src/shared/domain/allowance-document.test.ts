import { describe, expect, it } from "vitest";

import { buildAllowanceProposalDocumentNumber } from "./allowance-document";

describe("buildAllowanceProposalDocumentNumber", () => {
  it("should use the printed document date month for the proposal document number", () => {
    expect(
      buildAllowanceProposalDocumentNumber({
        printedDate: "2026.05.08",
        fallbackWorkMonth: "2026-04"
      })
    ).toBe("2026-05");
  });

  it("should fall back to the work month when the printed date cannot be parsed", () => {
    expect(
      buildAllowanceProposalDocumentNumber({
        printedDate: "미정",
        fallbackWorkMonth: "2026-04"
      })
    ).toBe("2026-04");
  });
});
