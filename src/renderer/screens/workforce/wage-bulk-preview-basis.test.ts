import { describe, expect, it } from "vitest";

import {
  buildWageBulkPreviewBasis,
  selectCurrentWageBulkResult,
  selectWageBulkView
} from "./wage-bulk-preview-basis";

const basisInput = {
  filePath: "C:/wages/2026-09.xlsx",
  effectiveFrom: "2026-09-01",
  siteNameColumn: "B",
  employeeNameColumn: "C",
  hourlyRateColumn: "D"
};

describe("buildWageBulkPreviewBasis", () => {
  it("changes when any input that shapes the preview changes", () => {
    const base = buildWageBulkPreviewBasis(basisInput);

    expect(buildWageBulkPreviewBasis({ ...basisInput, filePath: "C:/wages/other.xlsx" })).not.toBe(
      base
    );
    expect(buildWageBulkPreviewBasis({ ...basisInput, effectiveFrom: "2026-10-01" })).not.toBe(base);
    expect(buildWageBulkPreviewBasis({ ...basisInput, siteNameColumn: "A" })).not.toBe(base);
    expect(buildWageBulkPreviewBasis({ ...basisInput, employeeNameColumn: "A" })).not.toBe(base);
    expect(buildWageBulkPreviewBasis({ ...basisInput, hourlyRateColumn: "A" })).not.toBe(base);
  });

  it("stays the same for the same inputs, and treats a missing file as its own basis", () => {
    expect(buildWageBulkPreviewBasis(basisInput)).toBe(buildWageBulkPreviewBasis({ ...basisInput }));
    expect(buildWageBulkPreviewBasis({ ...basisInput, filePath: undefined })).not.toBe(
      buildWageBulkPreviewBasis(basisInput)
    );
  });

  it("does not let different inputs collide into one basis", () => {
    // Values that carry the encoding's own punctuation must still not run together. A plain join
    // on any single character is what these would defeat.
    const quoted = buildWageBulkPreviewBasis({ ...basisInput, filePath: 'a","2026-09-01' });
    const split = buildWageBulkPreviewBasis({ ...basisInput, filePath: "a" });

    expect(quoted).not.toBe(split);
    expect(
      buildWageBulkPreviewBasis({ ...basisInput, filePath: "a|2026-09-01" })
    ).not.toBe(buildWageBulkPreviewBasis({ ...basisInput, filePath: "a" }));
    expect(
      buildWageBulkPreviewBasis({ ...basisInput, filePath: "C:\\wages\\a.xlsx" })
    ).not.toBe(buildWageBulkPreviewBasis({ ...basisInput, filePath: "C:/wages/a.xlsx" }));
  });
});

describe("selectCurrentWageBulkResult", () => {
  it("hands back the preview only while its basis still matches the screen", () => {
    const basis = buildWageBulkPreviewBasis(basisInput);
    const stored = { basis, data: { readyCount: 3 } };

    expect(selectCurrentWageBulkResult(stored, basis)).toBe(stored.data);
  });

  it("drops a preview whose basis was superseded — a late answer cannot be shown or applied", () => {
    // File A preview is requested, the operator swaps to file B, then A's answer arrives late.
    const fileABasis = buildWageBulkPreviewBasis(basisInput);
    const fileBBasis = buildWageBulkPreviewBasis({ ...basisInput, filePath: "C:/wages/B.xlsx" });
    const lateAnswerFromFileA = { basis: fileABasis, data: { readyCount: 3 } };

    expect(selectCurrentWageBulkResult(lateAnswerFromFileA, fileBBasis)).toBeNull();
  });

  it("drops it when only the effective date moved on", () => {
    const stored = { basis: buildWageBulkPreviewBasis(basisInput), data: { readyCount: 3 } };
    const laterBasis = buildWageBulkPreviewBasis({ ...basisInput, effectiveFrom: "2026-10-01" });

    expect(selectCurrentWageBulkResult(stored, laterBasis)).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(selectCurrentWageBulkResult(null, "any")).toBeNull();
    expect(selectCurrentWageBulkResult(undefined, "any")).toBeNull();
  });

  // Applying is asynchronous too. A finished save must not be shown beside another file's name.
  it("drops a finished apply summary whose basis was superseded", () => {
    const fileABasis = buildWageBulkPreviewBasis(basisInput);
    const fileBBasis = buildWageBulkPreviewBasis({ ...basisInput, filePath: "C:/wages/B.xlsx" });
    const lateApplyFromFileA = { basis: fileABasis, data: { appliedCount: 12 } };

    expect(selectCurrentWageBulkResult(lateApplyFromFileA, fileABasis)).toBe(
      lateApplyFromFileA.data
    );
    expect(selectCurrentWageBulkResult(lateApplyFromFileA, fileBBasis)).toBeNull();
  });
});

describe("selectWageBulkView", () => {
  const fileA = buildWageBulkPreviewBasis(basisInput);
  const fileB = buildWageBulkPreviewBasis({ ...basisInput, filePath: "C:/wages/B.xlsx" });
  const previewOfA = {
    basis: fileA,
    data: { fileName: "A.xlsx", effectiveFrom: "2026-09-01", readyCount: 3, rows: ["a"] }
  };
  const appliedA = {
    basis: fileA,
    data: { fileName: "A.xlsx", effectiveFrom: "2026-09-01", appliedCount: 3, rows: ["a"] }
  };

  it("shows nothing to apply before a preview exists", () => {
    const view = selectWageBulkView({
      storedPreview: null,
      storedSummary: null,
      currentBasis: fileA,
      selectedFileName: "A.xlsx",
      selectedEffectiveFrom: "2026-09-01"
    });

    expect(view.mode).toBe("empty");
    expect(view.rows).toEqual([]);
    expect(view.canApply).toBe(false);
    expect(view.fileName).toBe("A.xlsx");
  });

  it("offers apply only while the preview matches the inputs on screen", () => {
    const matching = selectWageBulkView({
      storedPreview: previewOfA,
      storedSummary: null,
      currentBasis: fileA,
      selectedFileName: "A.xlsx",
      selectedEffectiveFrom: "2026-09-01"
    });

    expect(matching.mode).toBe("preview");
    expect(matching.canApply).toBe(true);
    expect(matching.readyCount).toBe(3);

    // The operator switched to file B; A's preview is neither shown nor applicable.
    const superseded = selectWageBulkView({
      storedPreview: previewOfA,
      storedSummary: null,
      currentBasis: fileB,
      selectedFileName: "B.xlsx",
      selectedEffectiveFrom: "2026-09-01"
    });

    expect(superseded.mode).toBe("empty");
    expect(superseded.canApply).toBe(false);
    expect(superseded.rows).toEqual([]);
  });

  it("names the file and date the finished save was actually made for", () => {
    const view = selectWageBulkView({
      storedPreview: null,
      storedSummary: appliedA,
      currentBasis: fileA,
      selectedFileName: "A.xlsx",
      selectedEffectiveFrom: "2026-09-01"
    });

    expect(view.mode).toBe("applied");
    expect(view.appliedCount).toBe(3);
    expect(view.fileName).toBe("A.xlsx");
    expect(view.effectiveFrom).toBe("2026-09-01");
    expect(view.canApply).toBe(false);
  });

  // The defect this replaced: the apply answer won over everything and the file name and date
  // beside it came from the controls, so A's saved rows appeared under B's name and date.
  it("does not show a save that finished for another file under the current inputs", () => {
    const view = selectWageBulkView({
      storedPreview: null,
      storedSummary: appliedA,
      currentBasis: fileB,
      selectedFileName: "B.xlsx",
      selectedEffectiveFrom: "2026-10-01"
    });

    expect(view.mode).toBe("empty");
    expect(view.rows).toEqual([]);
    expect(view.appliedCount).toBe(0);
    expect(view.fileName).toBe("B.xlsx");
    expect(view.effectiveFrom).toBe("2026-10-01");
  });

  it("prefers the finished save over the preview it came from", () => {
    const view = selectWageBulkView({
      storedPreview: previewOfA,
      storedSummary: appliedA,
      currentBasis: fileA,
      selectedFileName: "A.xlsx",
      selectedEffectiveFrom: "2026-09-01"
    });

    expect(view.mode).toBe("applied");
  });
});
