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

export type WageBulkApplyAnswer<TSummary> =
  | { ok: true; data: TSummary }
  | { ok: false; errorCode?: string; message: string };

export interface WageBulkApplyOutcome<TSummary> {
  storedSummary: StoredWageBulkResult<TSummary> | null;
  // The reviewed preview can never be applied again, so it has to go and be rebuilt.
  discardPreview: boolean;
  errorMessage: string | null;
}

// The whole state transition for an apply answer, decided in one place. Keeping it here rather
// than inside the handler is what makes the transition testable: the R4 defect was a missing line
// of exactly this wiring, and a test of the two ends separately would not have caught it.
//
// Main refuses to apply a preview that no longer describes what it re-reads. That refusal is not
// an ordinary save failure: the table on screen can never be applied again, so keeping it invites
// the operator to press Apply at something already known to be void. Only that answer forces the
// rebuild - a transient save failure leaves the reviewed preview alone.
export const resolveWageBulkApplyAnswer = <TSummary>(
  answer: WageBulkApplyAnswer<TSummary>,
  requestBasis: string
): WageBulkApplyOutcome<TSummary> => {
  if (answer.ok) {
    return {
      storedSummary: { basis: requestBasis, data: answer.data },
      discardPreview: false,
      errorMessage: null
    };
  }

  return {
    storedSummary: null,
    discardPreview: answer.errorCode === "WORKFORCE_WAGE_BULK_PREVIEW_STALE",
    errorMessage: answer.message
  };
};

interface WageBulkRowLike {
  siteName: string;
  matchedSiteName?: string;
  matchedByEmployeeCode?: boolean;
  previousEffectiveTo?: string;
  savePlan?: {
    mode: "insert" | "overwrite";
    newEffectiveTo?: string;
    truncatedRates: Array<{ id: string; effectiveTo?: string }>;
  };
}

export interface WageBulkRowDisplay {
  siteLabel: string;
  previousEffectiveToLabel: string;
  newEffectiveToLabel: string;
  overwriteNote: string | null;
}

const describeTruncation = (row: WageBulkRowLike): string => {
  const truncated = row.savePlan?.truncatedRates ?? [];

  if (row.savePlan?.mode === "overwrite" || truncated.length === 0 || !row.previousEffectiveTo) {
    return "-";
  }

  // More than one line crossing the date means the history overlaps; saying so is the only way the
  // operator can see how much is being rewritten.
  return truncated.length > 1
    ? `${row.previousEffectiveTo} (${truncated.length}개 이력 종료)`
    : row.previousEffectiveTo;
};

// The screen used to print previousEffectiveTo under a heading that read "종료일(자동)", which is
// the day the OLD line stops - not the period the new one gets. With the save plan judged up front
// both can be shown for what they are, and an overwrite can say so instead of looking like an
// ordinary insert. Kept as a pure function so the future-rate and same-start cases are testable.
export const describeWageBulkRow = (row: WageBulkRowLike): WageBulkRowDisplay => ({
  // A person found by employee code may be assigned nowhere, or somewhere other than the file
  // says; in neither case is the file's site evidence of anything.
  siteLabel: row.matchedByEmployeeCode
    ? row.matchedSiteName ?? "미배정"
    : row.matchedSiteName ?? row.siteName,
  // previousEffectiveTo is arithmetic - the day before the effective date - not evidence that any
  // line is actually cut short. With a gap in the history nothing crosses the date and nothing is
  // shortened, so promising an end date there described a change that never happens. The plan says
  // which lines really get cut, and only those are reported.
  previousEffectiveToLabel: describeTruncation(row),
  newEffectiveToLabel: row.savePlan?.newEffectiveTo ?? "계속",
  overwriteNote: row.savePlan?.mode === "overwrite" ? "같은 적용일 기존 이력 덮어쓰기" : null
});

export interface WageBulkColumnMapping {
  employeeCodeColumn: string;
  siteNameColumn: string;
  employeeNameColumn: string;
  hourlyRateColumn: string;
}

type SuggestibleColumn = keyof WageBulkColumnMapping;

export interface WageBulkColumnSuggestionLike {
  employeeCodeColumn?: string;
  siteNameColumn?: string;
  employeeNameColumn?: string;
  hourlyRateColumn?: string;
  ambiguousFields: SuggestibleColumn[];
}

export interface WageBulkColumnSuggestionOutcome {
  // null when the answer describes a file that is no longer the one on screen, or a mapping the
  // operator has since edited by hand.
  mapping: WageBulkColumnMapping | null;
  notice: string | null;
}

const columnFieldLabels: Record<SuggestibleColumn, string> = {
  employeeCodeColumn: "사번",
  siteNameColumn: "근무지명",
  employeeNameColumn: "이름",
  hourlyRateColumn: "시급"
};

// Reading the header row is asynchronous, so its answer arrives after the fact - and a second file
// chosen meanwhile, or a column the operator typed in themselves, must not be overwritten by it.
// The mapping generation is bumped by every one of those, and an answer from an older generation
// is dropped exactly like a superseded preview.
//
// A new file also starts from the explicit defaults rather than from whatever the last file left
// behind: a header this sheet does not have must show as missing, not inherit a plausible-looking
// column from another workbook.
export const resolveWageBulkColumnSuggestion = (
  suggestion: WageBulkColumnSuggestionLike,
  options: {
    requestGeneration: number;
    currentGeneration: number;
    defaults: WageBulkColumnMapping;
  }
): WageBulkColumnSuggestionOutcome => {

  if (options.requestGeneration !== options.currentGeneration) {
    return { mapping: null, notice: null };
  }

  const mapping: WageBulkColumnMapping = {
    employeeCodeColumn: suggestion.employeeCodeColumn ?? "",
    siteNameColumn: suggestion.siteNameColumn ?? options.defaults.siteNameColumn,
    employeeNameColumn: suggestion.employeeNameColumn ?? options.defaults.employeeNameColumn,
    hourlyRateColumn: suggestion.hourlyRateColumn ?? options.defaults.hourlyRateColumn
  };
  const missing = (Object.keys(columnFieldLabels) as SuggestibleColumn[]).filter(
    (field) => !suggestion[field] && !suggestion.ambiguousFields.includes(field)
  );
  const ambiguous = suggestion.ambiguousFields.map((field) => columnFieldLabels[field]);
  const sentences: string[] = [];

  if (suggestion.employeeCodeColumn) {
    sentences.push(`머리글에서 사번 열(${suggestion.employeeCodeColumn})을 찾아 넣었습니다.`);
  } else {
    sentences.push(
      "이 파일 1행에서 '사번' 열을 찾지 못했습니다. 사번 없이 근무지명과 이름으로만 찾으면 근무지 이름이 다르거나 배정이 없는 사람이 빠질 수 있습니다."
    );
  }

  if (ambiguous.length > 0) {
    sentences.push(
      `${ambiguous.join(" · ")} 머리글이 여러 열에 있어 자동으로 고르지 않았습니다. 직접 지정하세요.`
    );
  }

  const missingWithoutCode = missing.filter((field) => field !== "employeeCodeColumn");

  if (missingWithoutCode.length > 0) {
    sentences.push(
      `${missingWithoutCode
        .map((field) => columnFieldLabels[field])
        .join(" · ")} 머리글은 찾지 못해 기본값을 넣었습니다. 맞는지 확인하세요.`
    );
  }

  return { mapping, notice: sentences.join(" ") };
};
