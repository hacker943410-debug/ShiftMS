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
  // An empty string is "no assignment" just as much as an absent one, and ?? would let it through
  // to render as a blank cell - which is how this first reached the screen.
  siteLabel: row.matchedByEmployeeCode
    ? row.matchedSiteName || "미배정"
    : row.matchedSiteName || row.siteName,
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
  ambiguousFields: Array<{ field: SuggestibleColumn; columns: string[] }>;
}

const columnFieldLabels: Record<SuggestibleColumn, string> = {
  employeeCodeColumn: "사번",
  siteNameColumn: "근무지명",
  employeeNameColumn: "이름",
  hourlyRateColumn: "시급"
};

// Reading the header row is asynchronous. "reading" is a state of its own because the defaults
// B/C/D are a complete mapping: without it the preview button was live the moment a file was
// picked, and an operator who clicked at once previewed on columns the detection was about to
// replace - and that click threw the detection's answer away.
export type WageBulkHeaderReadState = "idle" | "reading" | "read" | "failed";

// What the header row said, kept as facts rather than one finished sentence. Two warnings can hold
// at once - no 사번 header, and a 시급 header on two columns - and typing the 시급 column must not
// silence the 사번 warning, which is still true.
export interface WageBulkHeaderFacts {
  detected: Partial<Record<SuggestibleColumn, string>>;
  ambiguousFields: Array<{ field: SuggestibleColumn; columns: string[] }>;
  // Required fields whose header was not found; the explicit defaults were used for them.
  defaultedFields: SuggestibleColumn[];
  missingEmployeeCode: boolean;
}

export interface WageBulkMappingModel {
  // Bumped by every event that decides what the mapping is. A header answer carrying an older
  // number is describing a file, or a mapping, that has since been replaced.
  generation: number;
  mapping: WageBulkColumnMapping;
  headerRead: WageBulkHeaderReadState;
  headerFacts: WageBulkHeaderFacts | null;
  headerReadError: string | null;
  // Fields the operator typed since this file's header was read. A sentence about such a field
  // no longer describes what is in the box, so it is dropped - and only it.
  editedFields: SuggestibleColumn[];
}

export type WageBulkMappingEvent =
  | { type: "modal-opened" }
  | { type: "file-chosen" }
  | { type: "header-read-started" }
  | { type: "column-edited"; field: SuggestibleColumn; value: string }
  // Starting a preview or an apply consumes the mapping. A header answer that lands afterwards
  // would leave the boxes describing columns the save never used.
  | { type: "mapping-consumed" }
  | {
      type: "header-read-succeeded";
      suggestion: WageBulkColumnSuggestionLike;
      requestGeneration: number;
    }
  | { type: "header-read-failed"; message: string; requestGeneration: number };

const freshWageBulkMappingModel = (
  generation: number,
  defaults: WageBulkColumnMapping
): WageBulkMappingModel => ({
  generation,
  mapping: defaults,
  headerRead: "idle",
  headerFacts: null,
  headerReadError: null,
  editedFields: []
});

export const createWageBulkMappingModel = (defaults: WageBulkColumnMapping): WageBulkMappingModel =>
  freshWageBulkMappingModel(0, defaults);

// Every field the matching needs. The employee code is optional - without one the site-and-name
// match still works - so an unresolved code column blocks nothing.
const requiredColumns: SuggestibleColumn[] = [
  "siteNameColumn",
  "employeeNameColumn",
  "hourlyRateColumn"
];

export const canPreviewWageBulk = (model: WageBulkMappingModel) =>
  model.headerRead !== "reading" &&
  requiredColumns.every((field) => model.mapping[field].trim().length > 0);

// Ambiguous fields the operator has not settled yet. A required one keeps the preview locked
// through its empty box; the optional 사번 does not.
export const listUnresolvedWageBulkFields = (model: WageBulkMappingModel): SuggestibleColumn[] =>
  (model.headerFacts?.ambiguousFields ?? [])
    .map((entry) => entry.field)
    .filter((field) => !model.editedFields.includes(field));

// Reading the header row is asynchronous, so its answer arrives after the fact - and a second file
// chosen meanwhile, a column the operator typed, or a preview already under way must not be
// overwritten by it. This reducer owns every one of those transitions so the increments cannot be
// forgotten at a call site, which is how the same defect reached three different inputs.
export const reduceWageBulkMapping = (
  state: WageBulkMappingModel,
  event: WageBulkMappingEvent,
  defaults: WageBulkColumnMapping
): WageBulkMappingModel => {
  switch (event.type) {
    case "modal-opened":
    case "file-chosen":
      // A new file is a new mapping: decided by its own header row and the explicit defaults,
      // never by what the last workbook left in the boxes.
      return freshWageBulkMappingModel(state.generation + 1, defaults);

    case "header-read-started":
      return { ...state, headerRead: "reading", headerFacts: null, headerReadError: null };

    case "column-edited":
      return {
        generation: state.generation + 1,
        mapping: { ...state.mapping, [event.field]: event.value },
        // A typed column outranks a reading still in flight: the answer will be refused by the
        // generation, so it must not keep the preview locked either.
        headerRead: state.headerRead === "reading" ? "idle" : state.headerRead,
        headerFacts: state.headerFacts,
        headerReadError: state.headerReadError,
        editedFields: state.editedFields.includes(event.field)
          ? state.editedFields
          : [...state.editedFields, event.field]
      };

    case "mapping-consumed":
      return {
        ...state,
        generation: state.generation + 1,
        headerRead: state.headerRead === "reading" ? "idle" : state.headerRead
      };

    case "header-read-succeeded": {
      if (event.requestGeneration !== state.generation) {
        return state;
      }

      const outcome = resolveWageBulkColumnSuggestion(event.suggestion, defaults);

      return {
        generation: state.generation,
        mapping: outcome.mapping,
        headerRead: "read",
        headerFacts: outcome.facts,
        headerReadError: null,
        editedFields: []
      };
    }

    case "header-read-failed":
      if (event.requestGeneration !== state.generation) {
        return state;
      }

      // Not silently dropped: the boxes hold the defaults, and the operator is told they were not
      // checked against this file before being allowed to preview on them.
      return {
        ...state,
        headerRead: "failed",
        headerFacts: null,
        headerReadError: event.message
      };

    default:
      return state;
  }
};

export interface WageBulkColumnSuggestionOutcome {
  mapping: WageBulkColumnMapping;
  facts: WageBulkHeaderFacts;
}

export const resolveWageBulkColumnSuggestion = (
  suggestion: WageBulkColumnSuggestionLike,
  defaults: WageBulkColumnMapping
): WageBulkColumnSuggestionOutcome => {
  const ambiguousFields = suggestion.ambiguousFields.map((entry) => entry.field);
  const columnFor = (field: SuggestibleColumn) => {
    if (ambiguousFields.includes(field)) {
      // Deliberately empty: nothing runs until the operator picks one. Filling in B/C/D here
      // would be the position guess the detection exists to avoid.
      return "";
    }

    return suggestion[field] ?? (field === "employeeCodeColumn" ? "" : defaults[field]);
  };
  const detected: Partial<Record<SuggestibleColumn, string>> = {};

  for (const field of Object.keys(columnFieldLabels) as SuggestibleColumn[]) {
    const column = suggestion[field];

    if (column && !ambiguousFields.includes(field)) {
      detected[field] = column;
    }
  }

  return {
    mapping: {
      employeeCodeColumn: columnFor("employeeCodeColumn"),
      siteNameColumn: columnFor("siteNameColumn"),
      employeeNameColumn: columnFor("employeeNameColumn"),
      hourlyRateColumn: columnFor("hourlyRateColumn")
    },
    facts: {
      detected,
      ambiguousFields: suggestion.ambiguousFields,
      defaultedFields: requiredColumns.filter(
        (field) => !suggestion[field] && !ambiguousFields.includes(field)
      ),
      missingEmployeeCode:
        !suggestion.employeeCodeColumn && !ambiguousFields.includes("employeeCodeColumn")
    }
  };
};

const describeColumns = (columns: string[]) => `${columns.join(" · ")}열`;

// The sentences shown under the column boxes, rebuilt from the facts on every render. Each one is
// kept only while it is still true of the box it describes: a field the operator typed loses its
// sentence, the others keep theirs.
export const describeWageBulkMapping = (model: WageBulkMappingModel): string[] => {
  if (model.headerRead === "reading") {
    return ["파일 1행의 머리글을 확인하는 중입니다. 끝나면 열이 자동으로 채워집니다."];
  }

  if (model.headerRead === "failed") {
    const { mapping } = model;

    return [
      `머리글을 읽지 못했습니다(${model.headerReadError ?? "원인 미상"}). 기본값(근무지명 ${
        mapping.siteNameColumn
      }열 · 이름 ${mapping.employeeNameColumn}열 · 시급 ${
        mapping.hourlyRateColumn
      }열)을 넣었으니, 이 파일의 열과 맞는지 확인한 뒤 미리보기를 만드세요.`
    ];
  }

  const facts = model.headerFacts;

  if (!facts) {
    return [];
  }

  const isStanding = (field: SuggestibleColumn) => !model.editedFields.includes(field);
  const sentences: string[] = [];
  const detectedCode = facts.detected.employeeCodeColumn;
  const ambiguousCode = facts.ambiguousFields.find(
    (entry) => entry.field === "employeeCodeColumn"
  );

  if (detectedCode && isStanding("employeeCodeColumn")) {
    sentences.push(`머리글에서 사번 열(${detectedCode})을 찾아 넣었습니다.`);
  } else if (facts.missingEmployeeCode && isStanding("employeeCodeColumn")) {
    sentences.push(
      "이 파일 1행에서 '사번' 열을 찾지 못했습니다. 사번 없이 근무지명과 이름으로만 찾으면 근무지 이름이 다르거나 배정이 없는 사람이 빠질 수 있습니다."
    );
  } else if (ambiguousCode && isStanding("employeeCodeColumn")) {
    // The code is optional, so this is a choice, not a requirement - the wording for the required
    // fields below would claim the preview is blocked when it is not.
    sentences.push(
      `사번 머리글이 여러 열(${describeColumns(
        ambiguousCode.columns
      )})에 있어 비워 두었습니다. 비워 두면 근무지명과 이름으로 찾습니다. 사번으로 찾으려면 그중 한 열을 넣으세요.`
    );
  }

  const ambiguousRequired = facts.ambiguousFields.filter(
    (entry) => entry.field !== "employeeCodeColumn" && isStanding(entry.field)
  );

  if (ambiguousRequired.length > 0) {
    sentences.push(
      `${ambiguousRequired
        .map((entry) => `${columnFieldLabels[entry.field]}(${describeColumns(entry.columns)})`)
        .join(", ")} 머리글이 여러 열에 있어 비워 두었습니다. 어느 열을 쓸지 직접 넣어야 미리보기를 만들 수 있습니다.`
    );
  }

  const defaulted = facts.defaultedFields.filter(isStanding);

  if (defaulted.length > 0) {
    sentences.push(
      `${defaulted
        .map((field) => columnFieldLabels[field])
        .join(" · ")} 머리글은 찾지 못해 기본값을 넣었습니다. 맞는지 확인하세요.`
    );
  }

  return sentences;
};
