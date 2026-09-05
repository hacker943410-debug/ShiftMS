import { describe, expect, it } from "vitest";

import {
  buildWageBulkPreviewBasis,
  canPreviewWageBulk,
  createWageBulkMappingModel,
  describeWageBulkMapping,
  describeWageBulkRow,
  listUnresolvedWageBulkFields,
  reduceWageBulkMapping,
  resolveWageBulkApplyAnswer,
  selectCurrentWageBulkResult,
  selectWageBulkView,
  type WageBulkColumnSuggestionLike,
  type WageBulkMappingEvent,
  type WageBulkMappingModel
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
    // The lookup used to hand back an empty string for "assigned nowhere", which ?? let through
    // and the screen rendered as a blank cell. Found by running the real modal, not by a test.
    expect(
      describeWageBulkRow({ siteName: "아무거나", matchedSiteName: "", matchedByEmployeeCode: true })
        .siteLabel
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

describe("reduceWageBulkMapping", () => {
  const defaults = {
    employeeCodeColumn: "",
    siteNameColumn: "B",
    employeeNameColumn: "C",
    hourlyRateColumn: "D"
  };
  const start = createWageBulkMappingModel(defaults);
  const reduce = (model: WageBulkMappingModel, event: WageBulkMappingEvent) =>
    reduceWageBulkMapping(model, event, defaults);
  const notice = (model: WageBulkMappingModel) => describeWageBulkMapping(model).join(" ");
  // A file is chosen and its header row starts being read - the two events the hook sends together.
  const chooseFile = (model: WageBulkMappingModel) =>
    reduce(reduce(model, { type: "file-chosen" }), { type: "header-read-started" });
  const readHeader = (
    model: WageBulkMappingModel,
    suggestion: WageBulkColumnSuggestionLike,
    requestGeneration = model.generation
  ) => reduce(model, { type: "header-read-succeeded", suggestion, requestGeneration });
  const fullHeaders: WageBulkColumnSuggestionLike = {
    employeeCodeColumn: "A",
    siteNameColumn: "F",
    employeeNameColumn: "G",
    hourlyRateColumn: "H",
    ambiguousFields: []
  };

  it("fills the mapping from the header row of the file that was asked about", () => {
    const read = readHeader(chooseFile(start), fullHeaders);

    expect(read.mapping).toEqual({
      employeeCodeColumn: "A",
      siteNameColumn: "F",
      employeeNameColumn: "G",
      hourlyRateColumn: "H"
    });
    expect(notice(read)).toContain("사번 열(A)");
    expect(canPreviewWageBulk(read)).toBe(true);
  });

  // The R8 defect: B/C/D is a complete mapping, so the preview button was live the moment a file
  // was picked - and an operator who clicked at once previewed on columns nobody had checked
  // against the file, while that click threw the detection's answer away.
  it("locks the preview while the header row is still being read", () => {
    const reading = chooseFile(start);

    expect(reading.headerRead).toBe("reading");
    expect(canPreviewWageBulk(reading)).toBe(false);
    expect(notice(reading)).toContain("확인하는 중");

    const read = readHeader(reading, fullHeaders);

    expect(read.headerRead).toBe("read");
    expect(canPreviewWageBulk(read)).toBe(true);
  });

  it("reports a failed reading instead of silently previewing on unchecked defaults", () => {
    const reading = chooseFile(start);
    const failed = reduce(reading, {
      type: "header-read-failed",
      message: "파일을 열 수 없습니다",
      requestGeneration: reading.generation
    });

    expect(failed.headerRead).toBe("failed");
    expect(failed.mapping).toEqual(defaults);
    // The operator may go on with the defaults, but is told they were never checked.
    expect(canPreviewWageBulk(failed)).toBe(true);
    expect(notice(failed)).toContain("머리글을 읽지 못했습니다");
    expect(notice(failed)).toContain("파일을 열 수 없습니다");
    expect(notice(failed)).toContain("근무지명 B열");
  });

  // File A is chosen, file B is chosen before A's header reading returns, then A's answer lands.
  it("drops an answer for a file that is no longer the one on screen", () => {
    const fileA = chooseFile(start);
    const fileB = chooseFile(fileA);
    const late = readHeader(fileB, fullHeaders, fileA.generation);

    expect(late).toBe(fileB);
    expect(late.mapping).toEqual(defaults);
    // B's own reading is still under way, so the preview stays locked for B.
    expect(canPreviewWageBulk(late)).toBe(false);

    const lateFailure = reduce(fileB, {
      type: "header-read-failed",
      message: "x",
      requestGeneration: fileA.generation
    });

    expect(lateFailure).toBe(fileB);
  });

  it("drops an answer once a column has been typed by hand, and the typed column unlocks the preview", () => {
    const reading = chooseFile(start);
    const edited = reduce(reading, {
      type: "column-edited",
      field: "hourlyRateColumn",
      value: "Z"
    });

    // The reading was abandoned by the edit; it must not keep the preview locked for ever.
    expect(edited.headerRead).toBe("idle");
    expect(canPreviewWageBulk(edited)).toBe(true);

    const late = readHeader(edited, fullHeaders, reading.generation);

    expect(late.mapping.hourlyRateColumn).toBe("Z");
    expect(late.mapping.siteNameColumn).toBe("B");
  });

  // The R7 defect: a slow header answer landing after the operator had already previewed and
  // applied left the boxes describing columns the save never used.
  it("drops an answer that arrives after a preview or an apply has consumed the mapping", () => {
    const read = readHeader(chooseFile(start), { ambiguousFields: [] });
    const previewing = reduce(read, { type: "mapping-consumed" });
    const afterPreview = readHeader(previewing, fullHeaders, read.generation);

    expect(afterPreview.mapping).toEqual(defaults);

    const applying = reduce(previewing, { type: "mapping-consumed" });

    expect(readHeader(applying, fullHeaders, previewing.generation).mapping).toEqual(defaults);
  });

  it("starts a new file from the defaults, not from the last file's mapping", () => {
    const first = readHeader(chooseFile(start), fullHeaders);

    expect(first.mapping.siteNameColumn).toBe("F");

    const second = reduce(first, { type: "file-chosen" });

    expect(second.mapping).toEqual(defaults);
    expect(describeWageBulkMapping(second)).toEqual([]);
  });

  it("reopening the modal clears the mapping and disowns anything in flight", () => {
    const reading = chooseFile(start);
    const reopened = reduce(reading, { type: "modal-opened" });

    expect(reopened.mapping).toEqual(defaults);
    expect(reopened.headerRead).toBe("idle");
    expect(readHeader(reopened, fullHeaders, reading.generation).mapping).toEqual(defaults);
  });

  it("warns rather than guessing when no 사번 header exists", () => {
    const read = readHeader(chooseFile(start), {
      siteNameColumn: "B",
      employeeNameColumn: "C",
      hourlyRateColumn: "D",
      ambiguousFields: []
    });

    expect(read.mapping.employeeCodeColumn).toBe("");
    expect(notice(read)).toContain("'사번' 열을 찾지 못했습니다");
    // The code is optional, so its absence does not block anything.
    expect(canPreviewWageBulk(read)).toBe(true);

    // Typing a code column answers the warning; it must not linger over a filled box.
    const typed = reduce(read, { type: "column-edited", field: "employeeCodeColumn", value: "A" });

    expect(notice(typed)).not.toContain("찾지 못했습니다");
  });

  it("falls back to the explicit defaults and names what it could not find", () => {
    const read = readHeader(chooseFile(start), { employeeCodeColumn: "A", ambiguousFields: [] });

    expect(read.mapping).toEqual({
      employeeCodeColumn: "A",
      siteNameColumn: "B",
      employeeNameColumn: "C",
      hourlyRateColumn: "D"
    });
    expect(notice(read)).toContain("근무지명 · 이름 · 시급 머리글은 찾지 못해 기본값을 넣었습니다");
  });

  // Each sentence describes one box. Typing in that box retires its sentence and no other's.
  it("retires only the sentence about the column that was typed", () => {
    const read = readHeader(chooseFile(start), { employeeCodeColumn: "A", ambiguousFields: [] });
    const siteTyped = reduce(read, { type: "column-edited", field: "siteNameColumn", value: "F" });

    expect(notice(siteTyped)).toContain("사번 열(A)");
    expect(notice(siteTyped)).toContain("이름 · 시급 머리글은 찾지 못해");
    expect(notice(siteTyped)).not.toContain("근무지명 ·");

    const codeTyped = reduce(siteTyped, {
      type: "column-edited",
      field: "employeeCodeColumn",
      value: "B"
    });

    expect(notice(codeTyped)).not.toContain("사번 열(A)");
    expect(notice(codeTyped)).toContain("이름 · 시급 머리글은 찾지 못해");
  });

  // Two columns headed 시급 - an old rate beside the new one. Defaulting to D here would be the
  // position guess the detection exists to avoid, and it would be previewable.
  it("leaves an ambiguous field empty and refuses to preview until it is settled", () => {
    const read = readHeader(chooseFile(start), {
      employeeCodeColumn: "A",
      siteNameColumn: "B",
      employeeNameColumn: "C",
      ambiguousFields: [{ field: "hourlyRateColumn", columns: ["D", "E"] }]
    });

    expect(read.mapping.hourlyRateColumn).toBe("");
    expect(listUnresolvedWageBulkFields(read)).toEqual(["hourlyRateColumn"]);
    expect(canPreviewWageBulk(read)).toBe(false);
    expect(notice(read)).toContain("시급(D · E열)");
    expect(notice(read)).toContain("비워 두었습니다");

    // The operator picks one, and only then can a preview be built.
    const settled = reduce(read, { type: "column-edited", field: "hourlyRateColumn", value: "E" });

    expect(canPreviewWageBulk(settled)).toBe(true);
    expect(listUnresolvedWageBulkFields(settled)).toEqual([]);
    // The warning described a state that no longer holds.
    expect(notice(settled)).not.toContain("시급(D · E열)");
  });

  // The R8 defect: settling the 시급 column wiped the notice wholesale, taking with it the warning
  // that this file has no 사번 - which was still true, and is what stops people being missed.
  it("keeps the 사번 warning when only the 시급 column was settled", () => {
    const read = readHeader(chooseFile(start), {
      siteNameColumn: "B",
      employeeNameColumn: "C",
      ambiguousFields: [{ field: "hourlyRateColumn", columns: ["D", "E"] }]
    });

    expect(notice(read)).toContain("'사번' 열을 찾지 못했습니다");
    expect(notice(read)).toContain("시급(D · E열)");

    const settled = reduce(read, { type: "column-edited", field: "hourlyRateColumn", value: "E" });

    expect(canPreviewWageBulk(settled)).toBe(true);
    expect(notice(settled)).toContain("'사번' 열을 찾지 못했습니다");
    expect(notice(settled)).not.toContain("시급(D · E열)");
  });

  // The code is optional: a duplicated 사번 header leaves the preview open, so the wording must
  // offer a choice rather than claim the preview is blocked.
  it("tells the operator a duplicated 사번 header is a choice, not a requirement", () => {
    const read = readHeader(chooseFile(start), {
      siteNameColumn: "B",
      employeeNameColumn: "C",
      hourlyRateColumn: "D",
      ambiguousFields: [{ field: "employeeCodeColumn", columns: ["A", "E"] }]
    });

    expect(read.mapping.employeeCodeColumn).toBe("");
    expect(canPreviewWageBulk(read)).toBe(true);
    expect(listUnresolvedWageBulkFields(read)).toEqual(["employeeCodeColumn"]);
    expect(notice(read)).toContain("사번 머리글이 여러 열(A · E열)");
    expect(notice(read)).toContain("비워 두면 근무지명과 이름으로 찾습니다");
    expect(notice(read)).not.toContain("직접 넣어야 미리보기");
    expect(notice(read)).not.toContain("찾지 못했습니다");

    const chosen = reduce(read, { type: "column-edited", field: "employeeCodeColumn", value: "A" });

    expect(listUnresolvedWageBulkFields(chosen)).toEqual([]);
    expect(notice(chosen)).not.toContain("사번 머리글이 여러 열");
  });

  it("blocks a preview whenever a required column is empty", () => {
    expect(canPreviewWageBulk(start)).toBe(true);
    expect(
      canPreviewWageBulk({ ...start, mapping: { ...defaults, siteNameColumn: "  " } })
    ).toBe(false);
    expect(
      canPreviewWageBulk({ ...start, mapping: { ...defaults, employeeNameColumn: "" } })
    ).toBe(false);
  });
});
