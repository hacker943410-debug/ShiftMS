import { describe, expect, it } from "vitest";

import {
  buildWageBulkPreviewBasis,
  describeWageBulkRow,
  resolveWageBulkApplyAnswer,
  resolveWageBulkColumnSuggestion,
  selectCurrentWageBulkResult,
  selectWageBulkView
} from "./wage-bulk-preview-basis";

const basisInput = {
  filePath: "C:/wages/2026-09.xlsx",
  effectiveFrom: "2026-09-01",
  employeeCodeColumn: "A",
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
    expect(buildWageBulkPreviewBasis({ ...basisInput, employeeCodeColumn: "" })).not.toBe(base);
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

describe("resolveWageBulkApplyAnswer", () => {
  const basis = buildWageBulkPreviewBasis(basisInput);

  it("stores a finished save under the basis it was requested for", () => {
    const outcome = resolveWageBulkApplyAnswer({ ok: true, data: { appliedCount: 4 } }, basis);

    expect(outcome.storedSummary).toEqual({ basis, data: { appliedCount: 4 } });
    expect(outcome.discardPreview).toBe(false);
    expect(outcome.errorMessage).toBeNull();
  });

  // The R4 defect was this exact wiring going missing, so the transition is pinned end to end.
  it("forces a rebuild when main rejected the preview as no longer true", () => {
    const outcome = resolveWageBulkApplyAnswer(
      {
        ok: false,
        errorCode: "WORKFORCE_WAGE_BULK_PREVIEW_STALE",
        message: "미리보기를 다시 만들어 확인한 뒤 적용해 주세요."
      },
      basis
    );

    expect(outcome.discardPreview).toBe(true);
    expect(outcome.storedSummary).toBeNull();
    expect(outcome.errorMessage).toContain("다시 만들어");

    // Discarding leaves nothing to apply, so the button cannot be pressed again until a new
    // preview exists.
    const afterDiscard = selectWageBulkView({
      storedPreview: null,
      storedSummary: null,
      currentBasis: basis,
      selectedFileName: "A.xlsx",
      selectedEffectiveFrom: "2026-09-01"
    });

    expect(afterDiscard.canApply).toBe(false);
    expect(afterDiscard.mode).toBe("empty");
  });

  it("leaves a reviewed preview alone for an ordinary save failure", () => {
    const outcome = resolveWageBulkApplyAnswer(
      { ok: false, errorCode: "WORKFORCE_WAGE_BULK_APPLY_FAILED", message: "저장에 실패했습니다." },
      basis
    );

    expect(outcome.discardPreview).toBe(false);
    expect(outcome.errorMessage).toBe("저장에 실패했습니다.");

    expect(
      resolveWageBulkApplyAnswer({ ok: false, message: "알 수 없는 오류" }, basis).discardPreview
    ).toBe(false);
  });
});

describe("describeWageBulkRow", () => {
  const cut = [{ id: "rate-1", effectiveTo: undefined }];

  it("tells the old line's end date apart from the new line's", () => {
    const display = describeWageBulkRow({
      siteName: "보라매DC",
      previousEffectiveTo: "2026-03-31",
      savePlan: { mode: "insert", newEffectiveTo: "2026-07-31", truncatedRates: cut }
    });

    expect(display.previousEffectiveToLabel).toBe("2026-03-31");
    expect(display.newEffectiveToLabel).toBe("2026-07-31");
    expect(display.overwriteNote).toBeNull();
  });

  it("says 계속 when nothing later is on file", () => {
    expect(
      describeWageBulkRow({
        siteName: "보라매DC",
        savePlan: { mode: "insert", truncatedRates: cut }
      }).newEffectiveToLabel
    ).toBe("계속");
  });

  it("says so when the row rewrites a line that already starts that day", () => {
    const display = describeWageBulkRow({
      siteName: "보라매DC",
      previousEffectiveTo: "2026-03-31",
      savePlan: { mode: "overwrite", newEffectiveTo: "2026-07-31", truncatedRates: [] }
    });

    expect(display.overwriteNote).toBe("같은 적용일 기존 이력 덮어쓰기");
    // Nothing gets cut short by an overwrite, so no earlier end date is promised.
    expect(display.previousEffectiveToLabel).toBe("-");
  });

  // A gap in the history means no line crosses the effective date, so none is shortened. Printing
  // "the day before" there described a change that never happens.
  it("promises no end date when the history has a gap and nothing is cut short", () => {
    const display = describeWageBulkRow({
      siteName: "보라매DC",
      previousEffectiveTo: "2026-06-30",
      savePlan: { mode: "insert", truncatedRates: [] }
    });

    expect(display.previousEffectiveToLabel).toBe("-");
  });

  it("says how many lines an overlapping history would end", () => {
    const display = describeWageBulkRow({
      siteName: "보라매DC",
      previousEffectiveTo: "2026-06-30",
      savePlan: {
        mode: "insert",
        truncatedRates: [
          { id: "rate-1", effectiveTo: undefined },
          { id: "rate-2", effectiveTo: "2027-01-01" }
        ]
      }
    });

    expect(display.previousEffectiveToLabel).toBe("2026-06-30 (2개 이력 종료)");
  });

  it("never passes the file's site off as the workplace of someone found by code", () => {
    expect(
      describeWageBulkRow({ siteName: "아무거나", matchedByEmployeeCode: true }).siteLabel
    ).toBe("미배정");
    expect(
      describeWageBulkRow({
        siteName: "옛이름",
        matchedSiteName: "인천허브",
        matchedByEmployeeCode: true
      }).siteLabel
    ).toBe("인천허브");
    // Without a code the file's site is what identified the person, so it stands.
    expect(describeWageBulkRow({ siteName: "보라매DC" }).siteLabel).toBe("보라매DC");
  });
});

describe("resolveWageBulkColumnSuggestion", () => {
  const defaults = {
    employeeCodeColumn: "",
    siteNameColumn: "B",
    employeeNameColumn: "C",
    hourlyRateColumn: "D"
  };

  it("fills the mapping from the header row", () => {
    const outcome = resolveWageBulkColumnSuggestion(
      {
        employeeCodeColumn: "A",
        siteNameColumn: "F",
        employeeNameColumn: "G",
        hourlyRateColumn: "H",
        ambiguousFields: []
      },
      { requestGeneration: 3, currentGeneration: 3, defaults }
    );

    expect(outcome.mapping).toEqual({
      employeeCodeColumn: "A",
      siteNameColumn: "F",
      employeeNameColumn: "G",
      hourlyRateColumn: "H"
    });
    expect(outcome.notice).toContain("사번 열(A)");
  });

  // File A is chosen, file B is chosen before A's header reading returns, then A's answer lands.
  it("drops an answer for a file that is no longer the one on screen", () => {
    const outcome = resolveWageBulkColumnSuggestion(
      { employeeCodeColumn: "A", siteNameColumn: "F", ambiguousFields: [] },
      { requestGeneration: 3, currentGeneration: 4, defaults }
    );

    expect(outcome.mapping).toBeNull();
    expect(outcome.notice).toBeNull();
  });

  // Same guard, other cause: the operator typed a column while the reading was in flight.
  it("drops an answer once a column has been typed by hand", () => {
    expect(
      resolveWageBulkColumnSuggestion(
        { hourlyRateColumn: "Z", ambiguousFields: [] },
        { requestGeneration: 7, currentGeneration: 8, defaults }
      ).mapping
    ).toBeNull();
  });

  // The previous workbook's columns must not stand in for headers this one does not have.
  it("falls back to the explicit defaults, not to the last file's mapping", () => {
    const outcome = resolveWageBulkColumnSuggestion(
      { employeeCodeColumn: "A", ambiguousFields: [] },
      {
        requestGeneration: 1,
        currentGeneration: 1,
        defaults
      }
    );

    expect(outcome.mapping).toEqual({
      employeeCodeColumn: "A",
      siteNameColumn: "B",
      employeeNameColumn: "C",
      hourlyRateColumn: "D"
    });
    expect(outcome.notice).toContain("기본값을 넣었습니다");
    expect(outcome.notice).toContain("근무지명");
  });

  it("warns rather than guessing when no 사번 header exists", () => {
    const outcome = resolveWageBulkColumnSuggestion(
      { siteNameColumn: "B", employeeNameColumn: "C", hourlyRateColumn: "D", ambiguousFields: [] },
      { requestGeneration: 1, currentGeneration: 1, defaults }
    );

    expect(outcome.mapping?.employeeCodeColumn).toBe("");
    expect(outcome.notice).toContain("찾지 못했습니다");
  });

  it("leaves a field alone and names it when two columns claim the same header", () => {
    const outcome = resolveWageBulkColumnSuggestion(
      {
        employeeCodeColumn: "A",
        siteNameColumn: "B",
        employeeNameColumn: "C",
        ambiguousFields: ["hourlyRateColumn"]
      },
      { requestGeneration: 1, currentGeneration: 1, defaults }
    );

    expect(outcome.mapping?.hourlyRateColumn).toBe("D");
    expect(outcome.notice).toContain("시급 머리글이 여러 열에");
    // An ambiguous field is not also reported as merely missing.
    expect(outcome.notice).not.toContain("시급 머리글은 찾지 못해");
  });
});
