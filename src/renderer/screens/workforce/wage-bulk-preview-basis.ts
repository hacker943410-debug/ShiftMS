// A bulk preview is only meaningful for the exact inputs it was built from: the workbook, the
// effective date, and the four column letters. Remembering to invalidate on every path that
// changes one of those (column edit, date pick, file swap, reopening the modal) is a rule someone
// will forget - both review rounds found paths that had. So the result carries the basis it was
// built from, and the screen refuses to show or apply one whose basis no longer matches what is on
// screen. A late answer from a superseded request cannot be acted on, whoever forgets what.
//
// The apply summary carries a basis for the same reason: applying is asynchronous too, and a
// finished save displayed under another file's name and date is the same lie pointing the other
// way.

export interface WageBulkPreviewBasisInput {
  filePath?: string;
  effectiveFrom: string;
  employeeCodeColumn: string;
  siteNameColumn: string;
  employeeNameColumn: string;
  hourlyRateColumn: string;
}

export interface StoredWageBulkResult<TData> {
  basis: string;
  data: TData;
}

// JSON encoding keeps the fields apart without trusting some character to stay illegal in every
// value: quotes and backslashes inside a path are escaped, so no two different field lists can
// encode to the same string. A missing file is null, which no real path can encode to.
export const buildWageBulkPreviewBasis = (input: WageBulkPreviewBasisInput) =>
  JSON.stringify([
    input.filePath ?? null,
    input.effectiveFrom,
    input.employeeCodeColumn,
    input.siteNameColumn,
    input.employeeNameColumn,
    input.hourlyRateColumn
  ]);

export const selectCurrentWageBulkResult = <TData>(
  stored: StoredWageBulkResult<TData> | null | undefined,
  currentBasis: string
): TData | null => (stored && stored.basis === currentBasis ? stored.data : null);

interface JudgedWageBulkResult<TRow> {
  fileName: string;
  effectiveFrom: string;
  rows: TRow[];
}

export interface WageBulkViewInput<TRow> {
  storedPreview: StoredWageBulkResult<JudgedWageBulkResult<TRow> & { readyCount: number }> | null;
  storedSummary: StoredWageBulkResult<JudgedWageBulkResult<TRow> & { appliedCount: number }> | null;
  currentBasis: string;
  selectedFileName?: string;
  selectedEffectiveFrom: string;
}

export interface WageBulkView<TRow> {
  mode: "empty" | "preview" | "applied";
  rows: TRow[];
  fileName: string;
  effectiveFrom: string;
  readyCount: number;
  appliedCount: number;
  canApply: boolean;
}

// Deciding what the modal shows used to live in the markup, where the apply summary won over
// everything and the file name and date beside it were read off the controls - so a save that
// finished for one file could be displayed under another one's name. The whole decision lives here
// instead, where the superseded cases can be tested: a result is shown only while its basis is the
// one on screen, and it names the file and date it was actually made for.
export const selectWageBulkView = <TRow>(input: WageBulkViewInput<TRow>): WageBulkView<TRow> => {
  const summary = selectCurrentWageBulkResult(input.storedSummary, input.currentBasis);

  if (summary) {
    return {
      mode: "applied",
      rows: summary.rows,
      fileName: summary.fileName,
      effectiveFrom: summary.effectiveFrom,
      readyCount: 0,
      appliedCount: summary.appliedCount,
      canApply: false
    };
  }

  const preview = selectCurrentWageBulkResult(input.storedPreview, input.currentBasis);

  if (preview) {
    return {
      mode: "preview",
      rows: preview.rows,
      fileName: preview.fileName,
      effectiveFrom: preview.effectiveFrom,
      readyCount: preview.readyCount,
      appliedCount: 0,
      canApply: preview.readyCount > 0
    };
  }

  return {
    mode: "empty",
    rows: [],
    fileName: input.selectedFileName ?? "-",
    effectiveFrom: input.selectedEffectiveFrom,
    readyCount: 0,
    appliedCount: 0,
    canApply: false
  };
};

// Main refuses to apply a preview that no longer describes what it re-reads. That refusal is not
// an ordinary save failure: the table on screen can never be applied again, so keeping it invites
// the operator to press Apply at something already known to be void. Only this answer forces the
// rebuild - a transient save failure leaves the reviewed preview alone.
export const shouldRebuildPreviewAfterApplyFailure = (errorCode?: string) =>
  errorCode === "WORKFORCE_WAGE_BULK_PREVIEW_STALE";
