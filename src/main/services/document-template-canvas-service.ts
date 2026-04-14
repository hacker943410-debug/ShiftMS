import type ExcelJS from "exceljs";

import type {
  DocumentTemplateCanvasBounds,
  DocumentTemplateCanvasLabel,
  DocumentTemplateCanvasSnapshot,
  DocumentTemplateCanvasZone,
  DocumentTemplateProfile,
  DocumentTemplateSemanticZone
} from "../../shared/domain/document-template";
import type { TemplateType } from "../../shared/domain/model";

const DEFAULT_SHEET_BOUNDS = {
  maxRow: 40,
  maxColumn: 12
};

const MAX_CANVAS_LABELS = 40;

const clampPositive = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;

const clampWithin = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const parseCellAddress = (address: string): { row: number; column: number } | null => {
  const normalized = address.trim().toUpperCase();
  const match = /^([A-Z]+)(\d+)$/.exec(normalized);

  if (!match) {
    return null;
  }

  const [, columnLetters, rowText] = match;
  let column = 0;

  for (const letter of columnLetters) {
    column = column * 26 + (letter.charCodeAt(0) - 64);
  }

  return {
    row: Number(rowText),
    column
  };
};

const parseColumnAddress = (address: string): number | null => {
  const normalized = address.trim().toUpperCase();

  if (!/^[A-Z]+$/.test(normalized)) {
    return null;
  }

  let column = 0;
  for (const letter of normalized) {
    column = column * 26 + (letter.charCodeAt(0) - 64);
  }

  return column;
};

const parseRowAddress = (address: string): number | null => {
  const normalized = address.trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
};

const createBoundsFromCoordinates = (input: {
  rows: number[];
  columns: number[];
}): DocumentTemplateCanvasBounds | null => {
  if (input.rows.length === 0 || input.columns.length === 0) {
    return null;
  }

  return {
    startRow: Math.min(...input.rows),
    endRow: Math.max(...input.rows),
    startColumn: Math.min(...input.columns),
    endColumn: Math.max(...input.columns)
  };
};

const getDefaultRowSpanByTemplateType = (templateType: Exclude<TemplateType, "schedule">) => {
  switch (templateType) {
    case "proposal":
      return 4;
    case "attachment1":
      return 10;
    case "attachment2":
      return 8;
    default:
      return 4;
  }
};

const getDefaultColumnSpanByTemplateType = (templateType: Exclude<TemplateType, "schedule">) => {
  switch (templateType) {
    case "proposal":
      return 7;
    case "attachment1":
      return 19;
    case "attachment2":
      return 7;
    default:
      return 6;
  }
};

const resolveZoneBounds = (input: {
  zone: DocumentTemplateSemanticZone;
  templateType: TemplateType;
  maxRow: number;
  maxColumn: number;
}): DocumentTemplateCanvasBounds | null => {
  const rows: number[] = [];
  const columns: number[] = [];

  for (const binding of input.zone.bindings) {
    const cell = parseCellAddress(binding);
    if (cell) {
      rows.push(cell.row);
      columns.push(cell.column);
      continue;
    }

    const row = parseRowAddress(binding);
    if (row !== null) {
      rows.push(row, row + getDefaultRowSpanByTemplateType(input.templateType as Exclude<TemplateType, "schedule">));
      columns.push(1, getDefaultColumnSpanByTemplateType(input.templateType as Exclude<TemplateType, "schedule">));
      continue;
    }

    const column = parseColumnAddress(binding);
    if (column !== null) {
      rows.push(1, input.maxRow);
      columns.push(column);
    }
  }

  if (input.zone.bindingType === "sheet") {
    return {
      startRow: 1,
      endRow: input.maxRow,
      startColumn: 1,
      endColumn: input.maxColumn
    };
  }

  if (input.zone.bindingType === "row" && rows.length === 0) {
    rows.push(1, 1 + getDefaultRowSpanByTemplateType(input.templateType as Exclude<TemplateType, "schedule">));
    columns.push(1, getDefaultColumnSpanByTemplateType(input.templateType as Exclude<TemplateType, "schedule">));
  }

  const bounds = createBoundsFromCoordinates({ rows, columns });

  if (!bounds) {
    return null;
  }

  return {
    startRow: clampWithin(clampPositive(bounds.startRow, 1), 1, input.maxRow),
    endRow: clampWithin(clampPositive(bounds.endRow, 1), 1, input.maxRow),
    startColumn: clampWithin(clampPositive(bounds.startColumn, 1), 1, input.maxColumn),
    endColumn: clampWithin(clampPositive(bounds.endColumn, 1), 1, input.maxColumn)
  };
};

const createCanvasZones = (input: {
  templateType: TemplateType;
  semanticZones: DocumentTemplateSemanticZone[];
  maxRow: number;
  maxColumn: number;
}): DocumentTemplateCanvasZone[] =>
  input.semanticZones
    .map((zone) => {
      const bounds = resolveZoneBounds({
        zone,
        templateType: input.templateType,
        maxRow: input.maxRow,
        maxColumn: input.maxColumn
      });

      if (!bounds) {
        return null;
      }

      const nextZone: DocumentTemplateCanvasZone = {
        id: zone.id,
        label: zone.label,
        description: zone.description,
        role: zone.role,
        bindingType: zone.bindingType,
        bindings: zone.bindings,
        bounds
      };

      if (zone.fieldKey) {
        nextZone.fieldKey = zone.fieldKey;
      }

      return nextZone;
    })
    .filter((zone): zone is NonNullable<typeof zone> => zone !== null);

const createFallbackCanvasZones = (input: {
  templateType: TemplateType;
  maxRow: number;
  maxColumn: number;
}): DocumentTemplateCanvasZone[] => {
  const fallbackEndRow =
    input.templateType === "schedule"
      ? Math.min(input.maxRow, 18)
      : input.templateType === "attachment1"
        ? Math.min(input.maxRow, 28)
        : Math.min(input.maxRow, 20);
  const fallbackEndColumn =
    input.templateType === "schedule"
      ? Math.min(input.maxColumn, 16)
      : input.templateType === "proposal"
        ? Math.min(input.maxColumn, 9)
        : Math.min(input.maxColumn, 12);

  return [
    {
      id: `fallback-${input.templateType}-sheet`,
      label: "전체 시트",
      description: "현재 읽은 시트 전체 범위입니다.",
      role: "sheet",
      bindingType: "sheet",
      bindings: [],
      bounds: {
        startRow: 1,
        endRow: input.maxRow,
        startColumn: 1,
        endColumn: input.maxColumn
      }
    },
    {
      id: `fallback-${input.templateType}-main`,
      label: input.templateType === "schedule" ? "근무표 주요 영역" : "문서 주요 영역",
      description: "양식 구조를 다시 확인할 때 우선 검토할 기본 영역입니다.",
      role: input.templateType === "schedule" ? "week" : "table",
      bindingType: "block",
      bindings: [],
      bounds: {
        startRow: 1,
        endRow: fallbackEndRow,
        startColumn: 1,
        endColumn: fallbackEndColumn
      }
    }
  ];
};

const createCanvasLabels = (input: {
  titleCandidates: Array<{ address: string; text: string; sheetName: string }>;
  sheetName: string;
  maxRow: number;
  maxColumn: number;
}): DocumentTemplateCanvasLabel[] =>
  input.titleCandidates
    .filter((candidate) => candidate.sheetName === input.sheetName)
    .map((candidate, index) => {
      const cell = parseCellAddress(candidate.address);

      if (!cell) {
        return null;
      }

      if (cell.row > input.maxRow || cell.column > input.maxColumn) {
        return null;
      }

      return {
        id: `label-${index}-${candidate.address}`,
        text: candidate.text,
        row: cell.row,
        column: cell.column
      } satisfies DocumentTemplateCanvasLabel;
    })
    .filter((label): label is DocumentTemplateCanvasLabel => label !== null)
    .slice(0, MAX_CANVAS_LABELS);

export const createDocumentTemplateCanvasSnapshot = (input: {
  workbook: ExcelJS.Workbook;
  templateType: TemplateType;
  profile: DocumentTemplateProfile;
  titleCandidates: Array<{ address: string; text: string; sheetName: string }>;
}): DocumentTemplateCanvasSnapshot => {
  const sheetName =
    input.profile.kind === "schedule"
      ? input.profile.layout.sheetName
      : input.profile.fieldMappings.sheetName ?? input.profile.primarySheetName;
  const worksheet = input.workbook.getWorksheet(sheetName) ?? input.workbook.worksheets[0];
  const maxRow = clampPositive(worksheet?.rowCount ?? 0, DEFAULT_SHEET_BOUNDS.maxRow);
  const maxColumn = clampPositive(worksheet?.columnCount ?? 0, DEFAULT_SHEET_BOUNDS.maxColumn);
  const zones = createCanvasZones({
    templateType: input.templateType,
    semanticZones: input.profile.semanticZones,
    maxRow,
    maxColumn
  });

  return {
    templateType: input.templateType,
    sheetName: worksheet?.name ?? sheetName,
    maxRow,
    maxColumn,
    zones: zones.length > 0 ? zones : createFallbackCanvasZones({
      templateType: input.templateType,
      maxRow,
      maxColumn
    }),
    labels: createCanvasLabels({
      titleCandidates: input.titleCandidates,
      sheetName: worksheet?.name ?? sheetName,
      maxRow,
      maxColumn
    })
  };
};
