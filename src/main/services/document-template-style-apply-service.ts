import type ExcelJS from "exceljs";

import type {
  DocumentTemplateCanvasBounds,
  DocumentTemplateProfile,
  DocumentTemplateSemanticZone,
  DocumentTemplateStyleSpec
} from "../../shared/domain/document-template";
import type { DocumentTemplateVersion } from "../../shared/domain/model";

const toArgb = (color: string) => {
  const normalized = color.trim();
  return /^#([0-9a-fA-F]{6})$/.test(normalized) ? `FF${normalized.slice(1).toUpperCase()}` : null;
};

const parseCellAddress = (address: string): { row: number; column: number } | null => {
  const normalized = address.trim().toUpperCase();
  const match = /^([A-Z]+)(\d+)$/.exec(normalized);

  if (!match) {
    return null;
  }

  const [, letters, rowText] = match;
  let column = 0;

  for (const letter of letters) {
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

const parseCellRange = (value: string): DocumentTemplateCanvasBounds | null => {
  const [startAddress, endAddress] = value.trim().toUpperCase().split(":");

  if (!startAddress || !endAddress) {
    return null;
  }

  const start = parseCellAddress(startAddress);
  const end = parseCellAddress(endAddress);

  if (!start || !end) {
    return null;
  }

  return {
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row),
    startColumn: Math.min(start.column, end.column),
    endColumn: Math.max(start.column, end.column)
  };
};

const formatCellAddress = (row: number, column: number) => {
  let current = column;
  let label = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return `${label}${row}`;
};

const formatCellRange = (bounds: DocumentTemplateCanvasBounds) =>
  `${formatCellAddress(bounds.startRow, bounds.startColumn)}:${formatCellAddress(bounds.endRow, bounds.endColumn)}`;

const getStyleKey = (zone: DocumentTemplateSemanticZone) => zone.fieldKey ?? zone.id;

const getUsedColumnsForRow = (worksheet: ExcelJS.Worksheet, rowNumber: number) => {
  const row = worksheet.getRow(rowNumber);
  const columns = new Set<number>();

  row.eachCell({ includeEmpty: false }, (_cell, columnNumber) => {
    columns.add(columnNumber);
  });

  if (columns.size === 0) {
    for (let columnNumber = 1; columnNumber <= Math.max(worksheet.columnCount, 1); columnNumber += 1) {
      columns.add(columnNumber);
    }
  }

  return Array.from(columns.values()).sort((left, right) => left - right);
};

const resolveZoneBounds = (worksheet: ExcelJS.Worksheet, zone: DocumentTemplateSemanticZone): DocumentTemplateCanvasBounds | null => {
  if (zone.bindingType === "sheet") {
    return {
      startRow: 1,
      endRow: Math.max(worksheet.rowCount, 1),
      startColumn: 1,
      endColumn: Math.max(worksheet.columnCount, 1)
    };
  }

  const rows: number[] = [];
  const columns: number[] = [];

  for (const binding of zone.bindings) {
    const cell = parseCellAddress(binding);
    if (cell) {
      rows.push(cell.row);
      columns.push(cell.column);
      continue;
    }

    const row = parseRowAddress(binding);
    if (row !== null) {
      rows.push(row);
      getUsedColumnsForRow(worksheet, row).forEach((column) => columns.push(column));
      continue;
    }

    const column = parseColumnAddress(binding);
    if (column !== null) {
      columns.push(column);
      rows.push(1, Math.max(worksheet.rowCount, 1));
    }
  }

  if (rows.length === 0 || columns.length === 0) {
    return null;
  }

  return {
    startRow: Math.max(Math.min(...rows), 1),
    endRow: Math.max(Math.max(...rows), 1),
    startColumn: Math.max(Math.min(...columns), 1),
    endColumn: Math.max(Math.max(...columns), 1)
  };
};

const collectCellsForZone = (worksheet: ExcelJS.Worksheet, zone: DocumentTemplateSemanticZone) => {
  const cellMap = new Map<string, ExcelJS.Cell>();
  const addCell = (rowNumber: number, columnNumber: number) => {
    const baseCell = worksheet.getRow(rowNumber).getCell(columnNumber);
    const cell = baseCell.master ?? baseCell;
    cellMap.set(cell.address, cell);
  };

  if (zone.bindingType === "cell") {
    zone.bindings.forEach((binding) => {
      const parsed = parseCellAddress(binding);
      if (parsed) {
        addCell(parsed.row, parsed.column);
      }
    });

    return Array.from(cellMap.values());
  }

  if (zone.bindingType === "row") {
    zone.bindings.forEach((binding) => {
      const rowNumber = parseRowAddress(binding);
      if (rowNumber === null) {
        return;
      }

      getUsedColumnsForRow(worksheet, rowNumber).forEach((columnNumber) => {
        addCell(rowNumber, columnNumber);
      });
    });

    return Array.from(cellMap.values());
  }

  if (zone.bindingType === "column") {
    zone.bindings.forEach((binding) => {
      const columnNumber = parseColumnAddress(binding);
      if (columnNumber === null) {
        return;
      }

      for (let rowNumber = 1; rowNumber <= Math.max(worksheet.rowCount, 1); rowNumber += 1) {
        addCell(rowNumber, columnNumber);
      }
    });

    return Array.from(cellMap.values());
  }

  const bounds = resolveZoneBounds(worksheet, zone);

  if (!bounds) {
    return [];
  }

  for (let rowNumber = bounds.startRow; rowNumber <= bounds.endRow; rowNumber += 1) {
    for (let columnNumber = bounds.startColumn; columnNumber <= bounds.endColumn; columnNumber += 1) {
      addCell(rowNumber, columnNumber);
    }
  }

  return Array.from(cellMap.values());
};

const applyDimensionStyles = (
  worksheet: ExcelJS.Worksheet,
  zone: DocumentTemplateSemanticZone,
  styleSpec: DocumentTemplateStyleSpec,
  styleKey: string
) => {
  const width = styleSpec.columnWidths?.[styleKey];
  const height = styleSpec.rowHeights?.[styleKey];

  if (width !== undefined) {
    if (zone.bindingType === "column") {
      zone.bindings.forEach((binding) => {
        const columnNumber = parseColumnAddress(binding);
        if (columnNumber !== null) {
          worksheet.getColumn(columnNumber).width = width;
        }
      });
    } else if (zone.bindingType === "cell") {
      zone.bindings.forEach((binding) => {
        const parsed = parseCellAddress(binding);
        if (parsed) {
          worksheet.getColumn(parsed.column).width = width;
        }
      });
    } else if (zone.bindingType === "row") {
      zone.bindings.forEach((binding) => {
        const rowNumber = parseRowAddress(binding);
        if (rowNumber === null) {
          return;
        }

        getUsedColumnsForRow(worksheet, rowNumber).forEach((columnNumber) => {
          worksheet.getColumn(columnNumber).width = width;
        });
      });
    } else {
      const bounds = resolveZoneBounds(worksheet, zone);
      if (bounds) {
        for (let columnNumber = bounds.startColumn; columnNumber <= bounds.endColumn; columnNumber += 1) {
          worksheet.getColumn(columnNumber).width = width;
        }
      }
    }
  }

  if (height !== undefined) {
    if (zone.bindingType === "row") {
      zone.bindings.forEach((binding) => {
        const rowNumber = parseRowAddress(binding);
        if (rowNumber !== null) {
          worksheet.getRow(rowNumber).height = height;
        }
      });
    } else if (zone.bindingType === "cell") {
      zone.bindings.forEach((binding) => {
        const parsed = parseCellAddress(binding);
        if (parsed) {
          worksheet.getRow(parsed.row).height = height;
        }
      });
    } else {
      const bounds = resolveZoneBounds(worksheet, zone);
      if (bounds) {
        for (let rowNumber = bounds.startRow; rowNumber <= bounds.endRow; rowNumber += 1) {
          worksheet.getRow(rowNumber).height = height;
        }
      }
    }
  }
};

const applyCellStyles = (
  worksheet: ExcelJS.Worksheet,
  zone: DocumentTemplateSemanticZone,
  styleSpec: DocumentTemplateStyleSpec,
  styleKey: string
) => {
  const fontSize = styleSpec.fontSizes?.[styleKey];
  const fontColorArgb = styleSpec.fontColors?.[styleKey]
    ? toArgb(styleSpec.fontColors[styleKey]!)
    : null;
  const fillColorArgb = styleSpec.fillColors?.[styleKey]
    ? toArgb(styleSpec.fillColors[styleKey]!)
    : null;
  const horizontalAlignment = styleSpec.horizontalAlignments?.[styleKey];

  if (
    fontSize === undefined &&
    fontColorArgb === null &&
    fillColorArgb === null &&
    horizontalAlignment === undefined
  ) {
    return;
  }

  collectCellsForZone(worksheet, zone).forEach((cell) => {
    cell.style = {
      ...cell.style,
      font:
        fontSize !== undefined || fontColorArgb !== null
          ? {
              ...cell.font,
              ...(fontSize !== undefined ? { size: fontSize } : {}),
              ...(fontColorArgb !== null ? { color: { argb: fontColorArgb } } : {})
            }
          : cell.font,
      alignment:
        horizontalAlignment !== undefined
          ? {
              ...cell.alignment,
              horizontal: horizontalAlignment
            }
          : cell.alignment,
      fill:
        fillColorArgb !== null
          ? {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: fillColorArgb }
            }
          : cell.fill
    };
  });
};

const unmergeCellsInRange = (
  worksheet: ExcelJS.Worksheet,
  bounds: DocumentTemplateCanvasBounds
) => {
  const merges = [...((worksheet.model.merges ?? []) as string[])];

  merges.forEach((range) => {
    const parsed = parseCellRange(range);

    if (!parsed) {
      return;
    }

    const intersects =
      parsed.startRow <= bounds.endRow &&
      parsed.endRow >= bounds.startRow &&
      parsed.startColumn <= bounds.endColumn &&
      parsed.endColumn >= bounds.startColumn;

    if (!intersects) {
      return;
    }

    try {
      worksheet.unMergeCells(range);
    } catch {
      // Ignore already released merge references after template mutations.
    }
  });

  const mergedCellAddresses = new Set<string>();

  for (let rowNumber = bounds.startRow; rowNumber <= bounds.endRow; rowNumber += 1) {
    for (let columnNumber = bounds.startColumn; columnNumber <= bounds.endColumn; columnNumber += 1) {
      const cell = worksheet.getCell(rowNumber, columnNumber);

      if (cell.isMerged) {
        mergedCellAddresses.add(cell.master?.address ?? cell.address);
      }
    }
  }

  mergedCellAddresses.forEach((address) => {
    try {
      worksheet.unMergeCells(address);
    } catch {
      // Ignore overlaps that were released by another detected master cell.
    }
  });
};

const applyMergeStyles = (
  worksheet: ExcelJS.Worksheet,
  styleSpec: DocumentTemplateStyleSpec,
  styleKey: string
) => {
  const mergedRange = styleSpec.mergedRanges?.[styleKey];

  if (!mergedRange) {
    return;
  }

  const parsedRange = parseCellRange(mergedRange);

  if (!parsedRange) {
    return;
  }

  if (
    parsedRange.startRow === parsedRange.endRow &&
    parsedRange.startColumn === parsedRange.endColumn
  ) {
    return;
  }

  const normalizedRange = formatCellRange(parsedRange);
  unmergeCellsInRange(worksheet, parsedRange);
  worksheet.mergeCells(normalizedRange);
};

export const applyDocumentTemplateStyleSpec = (input: {
  workbook: ExcelJS.Workbook;
  template: Pick<DocumentTemplateVersion, "profile" | "validation"> | { profile?: DocumentTemplateProfile | null; validation?: DocumentTemplateVersion["validation"] };
}) => {
  const profile = input.template.profile;

  if (!profile || !profile.styleSpec) {
    return;
  }

  const hasAnyStyle =
    Boolean(profile.styleSpec.columnWidths && Object.keys(profile.styleSpec.columnWidths).length > 0) ||
    Boolean(profile.styleSpec.rowHeights && Object.keys(profile.styleSpec.rowHeights).length > 0) ||
    Boolean(profile.styleSpec.fontSizes && Object.keys(profile.styleSpec.fontSizes).length > 0) ||
    Boolean(profile.styleSpec.fontColors && Object.keys(profile.styleSpec.fontColors).length > 0) ||
    Boolean(profile.styleSpec.fillColors && Object.keys(profile.styleSpec.fillColors).length > 0) ||
    Boolean(profile.styleSpec.horizontalAlignments && Object.keys(profile.styleSpec.horizontalAlignments).length > 0) ||
    Boolean(profile.styleSpec.mergedRanges && Object.keys(profile.styleSpec.mergedRanges).length > 0);

  if (!hasAnyStyle) {
    return;
  }

  profile.semanticZones.forEach((zone) => {
    const styleKey = getStyleKey(zone);
    const worksheet =
      (zone.sheetName ? input.workbook.getWorksheet(zone.sheetName) : undefined) ??
      (profile.kind !== "schedule" ? input.workbook.getWorksheet(profile.primarySheetName) : undefined) ??
      input.workbook.getWorksheet(input.template.validation?.primarySheetName ?? "") ??
      input.workbook.worksheets[0];

    if (!worksheet) {
      return;
    }

    applyDimensionStyles(worksheet, zone, profile.styleSpec, styleKey);
    applyCellStyles(worksheet, zone, profile.styleSpec, styleKey);
    applyMergeStyles(worksheet, profile.styleSpec, styleKey);
  });
};
