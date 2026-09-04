// A bulk preview is only meaningful for the exact inputs it was built from: the workbook, the
// effective date, and the three column letters. Remembering to invalidate on every path that
// changes one of those (column edit, date pick, file swap, reopening the modal) is a rule someone
// will forget - both review rounds found paths that had. So the preview carries the basis it was
// built from, and the screen refuses to show or apply one whose basis no longer matches what is on
// screen. A late answer from a superseded request cannot be acted on, whoever forgets what.

export interface WageBulkPreviewBasisInput {
  filePath?: string;
  effectiveFrom: string;
  siteNameColumn: string;
  employeeNameColumn: string;
  hourlyRateColumn: string;
}

export interface StoredWageBulkPreview<TPreview> {
  basis: string;
  data: TPreview;
}

// "|" is illegal in a Windows path and cannot appear in a date or a column letter, so no two
// different inputs can produce the same basis.
export const buildWageBulkPreviewBasis = (input: WageBulkPreviewBasisInput) =>
  [
    input.filePath ?? "",
    input.effectiveFrom,
    input.siteNameColumn,
    input.employeeNameColumn,
    input.hourlyRateColumn
  ].join("|");

export const selectCurrentWageBulkPreview = <TPreview>(
  stored: StoredWageBulkPreview<TPreview> | null | undefined,
  currentBasis: string
): TPreview | null => (stored && stored.basis === currentBasis ? stored.data : null);
