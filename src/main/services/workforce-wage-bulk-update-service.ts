import { existsSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import type {
  WorkforceWageBulkUpdateApplyInput,
  WorkforceWageBulkUpdateApplySummary,
  WorkforceWageBulkUpdatePreview,
  WorkforceWageBulkUpdatePreviewInput,
  WorkforceWageBulkUpdatePreviewRow,
  WorkforceWageBulkUpdateRowStatus
} from "../../shared/bridge/contracts";
import { excelColumnLabelToIndex } from "../../shared/lib/excel-column";
import { saveStoredEmployeeWageRate } from "./employee-history-service";
import { listStoredEmployees } from "./employee-storage-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface EmployeeLookupRow {
  id: string;
  employeeCode: string;
  name: string;
  status: string;
  retireDate?: string;
  currentSiteName?: string;
  currentHourlyRate?: number;
  currentEffectiveFrom?: string;
}

interface ImportedSpreadsheetRow {
  rowNumber: number;
  siteName: string;
  employeeName: string;
  hourlyRateText: string;
}

const SUPPORTED_EXTENSIONS = new Set([".xlsx", ".xlsm"]);
const DATA_START_ROW = 2;

const statusLabelByCode: Record<WorkforceWageBulkUpdateRowStatus, string> = {
  ready: "적용 가능",
  applied: "적용 완료",
  "missing-required-value": "필수값 누락",
  "invalid-hourly-rate": "시급 형식 오류",
  "employee-not-found": "일치 인력 없음",
  "ambiguous-employee": "동일 인력 중복",
  "employee-retired": "퇴사자 제외",
  "same-rate": "기존 시급과 동일",
  "duplicate-entry": "중복 행 제외"
};

const normalizeText = (value: string | null | undefined) => value?.trim() ?? "";

const isDateInputValue = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const shiftDateValue = (value: string, offsetDays: number) => {
  if (!isDateInputValue(value)) {
    throw new Error("적용일 형식이 올바르지 않습니다.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day));

  targetDate.setUTCDate(targetDate.getUTCDate() + offsetDays);

  return `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(targetDate.getUTCDate()).padStart(2, "0")}`;
};

const parseImportedHourlyRate = (value: string) => {
  const normalizedValue = normalizeText(value).replace(/[,\s원]/g, "");

  if (!normalizedValue) {
    return null;
  }

  const parsed = Number(normalizedValue);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const requireReadyDatabase = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  return database;
};

const readWorkbook = async (filePath: string) => {
  if (!existsSync(filePath)) {
    throw new Error("선택한 Excel 파일을 찾을 수 없습니다.");
  }

  if (!SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw new Error("Excel 파일은 .xlsx 또는 .xlsm 형식만 지원합니다.");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  if (workbook.worksheets.length === 0) {
    throw new Error("워크시트가 없는 Excel 파일입니다.");
  }

  return workbook;
};

// 비교 기준 시급은 "적용일 그 날에 유효한 시급"이다. 지난 날짜로 일괄 적용할 때도
// 그 시점 시급과 견줘야 '기존 시급과 동일'을 제대로 걸러낸다.
const listEmployeeLookupRows = (effectiveFrom: string) => {
  const database = requireReadyDatabase();

  return database.prepare(`
    SELECT
      employees.id,
      employees.employee_code,
      employees.name,
      employees.status,
      employees.retire_date,
      sites.name as current_site_name,
      wage_rates.hourly_rate as current_hourly_rate,
      wage_rates.effective_from as current_effective_from
    FROM employees
    LEFT JOIN employee_site_assignments as assignments
      ON assignments.id = (
        SELECT latest_assignments.id
        FROM employee_site_assignments as latest_assignments
        WHERE latest_assignments.employee_id = employees.id
          AND latest_assignments.status = 'active'
        ORDER BY latest_assignments.start_date DESC, latest_assignments.created_at DESC
        LIMIT 1
      )
    LEFT JOIN sites
      ON sites.id = assignments.site_id
    LEFT JOIN wage_rates
      ON wage_rates.id = (
        SELECT latest_wage_rates.id
        FROM wage_rates as latest_wage_rates
        WHERE latest_wage_rates.employee_id = employees.id
          AND latest_wage_rates.effective_from <= ?
          AND (
            latest_wage_rates.effective_to IS NULL
            OR latest_wage_rates.effective_to >= ?
          )
        ORDER BY latest_wage_rates.effective_from DESC, latest_wage_rates.created_at DESC
        LIMIT 1
      )
    ORDER BY employees.name ASC
  `).all(effectiveFrom, effectiveFrom) as Array<Record<string, unknown>>;
};

const buildEmployeeLookup = (effectiveFrom: string) => {
  listStoredEmployees();

  const lookup = new Map<string, EmployeeLookupRow[]>();

  listEmployeeLookupRows(effectiveFrom).forEach((row) => {
    const currentSiteName = normalizeText(
      row.current_site_name ? String(row.current_site_name) : undefined
    );
    const employeeName = normalizeText(String(row.name));

    if (!currentSiteName || !employeeName) {
      return;
    }

    const key = `${currentSiteName}::${employeeName}`.toLowerCase();
    const currentRows = lookup.get(key) ?? [];

    currentRows.push({
      id: String(row.id),
      employeeCode: String(row.employee_code),
      name: employeeName,
      status: String(row.status),
      retireDate: row.retire_date ? String(row.retire_date) : undefined,
      currentSiteName,
      currentHourlyRate:
        row.current_hourly_rate !== null && row.current_hourly_rate !== undefined
          ? Number(row.current_hourly_rate)
          : undefined,
      currentEffectiveFrom: row.current_effective_from
        ? String(row.current_effective_from)
        : undefined
    });

    lookup.set(key, currentRows);
  });

  return lookup;
};

const extractImportedRows = async (
  input: WorkforceWageBulkUpdatePreviewInput
): Promise<{ fileName: string; filePath: string; sheetName: string; rows: ImportedSpreadsheetRow[] }> => {
  if (!isDateInputValue(input.effectiveFrom)) {
    throw new Error("적용일은 YYYY-MM-DD 형식이어야 합니다.");
  }

  const workbook = await readWorkbook(input.filePath);
  const worksheet = workbook.worksheets[0]!;
  const siteNameColumnIndex = excelColumnLabelToIndex(input.mapping.siteNameColumn);
  const employeeNameColumnIndex = excelColumnLabelToIndex(input.mapping.employeeNameColumn);
  const hourlyRateColumnIndex = excelColumnLabelToIndex(input.mapping.hourlyRateColumn);
  const rows: ImportedSpreadsheetRow[] = [];

  for (let rowNumber = DATA_START_ROW; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const siteName = normalizeText(worksheet.getCell(rowNumber, siteNameColumnIndex).text);
    const employeeName = normalizeText(worksheet.getCell(rowNumber, employeeNameColumnIndex).text);
    const hourlyRateText = normalizeText(worksheet.getCell(rowNumber, hourlyRateColumnIndex).text);

    if (!siteName && !employeeName && !hourlyRateText) {
      continue;
    }

    rows.push({
      rowNumber,
      siteName,
      employeeName,
      hourlyRateText
    });
  }

  return {
    fileName: path.basename(input.filePath),
    filePath: input.filePath,
    sheetName: worksheet.name,
    rows
  };
};

const createPreviewRow = (
  input: WorkforceWageBulkUpdatePreviewInput,
  row: ImportedSpreadsheetRow,
  employeeLookup: Map<string, EmployeeLookupRow[]>
): WorkforceWageBulkUpdatePreviewRow => {
  const importedHourlyRate = parseImportedHourlyRate(row.hourlyRateText) ?? undefined;

  if (!row.siteName || !row.employeeName || !row.hourlyRateText) {
    return {
      rowNumber: row.rowNumber,
      siteName: row.siteName,
      employeeName: row.employeeName,
      importedHourlyRate,
      effectiveFrom: input.effectiveFrom,
      status: "missing-required-value",
      statusLabel: statusLabelByCode["missing-required-value"],
      note: "근무지명, 이름, 시급 값이 모두 필요합니다."
    };
  }

  if (typeof importedHourlyRate !== "number") {
    return {
      rowNumber: row.rowNumber,
      siteName: row.siteName,
      employeeName: row.employeeName,
      effectiveFrom: input.effectiveFrom,
      status: "invalid-hourly-rate",
      statusLabel: statusLabelByCode["invalid-hourly-rate"],
      note: "시급은 숫자 또는 쉼표가 포함된 숫자만 지원합니다."
    };
  }

  const lookupKey = `${row.siteName}::${row.employeeName}`.toLowerCase();
  const matchedEmployees = employeeLookup.get(lookupKey) ?? [];

  if (matchedEmployees.length === 0) {
    return {
      rowNumber: row.rowNumber,
      siteName: row.siteName,
      employeeName: row.employeeName,
      importedHourlyRate,
      effectiveFrom: input.effectiveFrom,
      status: "employee-not-found",
      statusLabel: statusLabelByCode["employee-not-found"],
      note: "현재 배정된 인력 목록에서 동일한 근무지명과 이름을 찾지 못했습니다."
    };
  }

  // Someone who had already left before the effective date cannot be raised for it. Judge that by
  // the leaving date, not by today's status: a backdated raise covering days the person actually
  // worked must still reach them. With no leaving date recorded, fall back to the status.
  const hadLeftBefore = (employee: EmployeeLookupRow) =>
    employee.retireDate
      ? employee.retireDate < input.effectiveFrom
      : employee.status === "retired";

  // Filter leavers out BEFORE judging ambiguity. Doing it after meant one same-named leaver in the
  // same site knocked the working colleague out of the raise as "동일 인력 중복".
  const eligibleEmployees = matchedEmployees.filter((employee) => !hadLeftBefore(employee));
  const previousEffectiveTo = shiftDateValue(input.effectiveFrom, -1);

  if (eligibleEmployees.length === 0) {
    const leaver = matchedEmployees[0]!;

    return {
      rowNumber: row.rowNumber,
      siteName: row.siteName,
      employeeName: row.employeeName,
      importedHourlyRate,
      currentHourlyRate: leaver.currentHourlyRate,
      currentEffectiveFrom: leaver.currentEffectiveFrom,
      previousEffectiveTo,
      effectiveFrom: input.effectiveFrom,
      employeeId: leaver.id,
      employeeCode: leaver.employeeCode,
      status: "employee-retired",
      statusLabel: statusLabelByCode["employee-retired"],
      note: "적용일 이전에 퇴사한 인력입니다."
    };
  }

  if (eligibleEmployees.length > 1) {
    return {
      rowNumber: row.rowNumber,
      siteName: row.siteName,
      employeeName: row.employeeName,
      importedHourlyRate,
      effectiveFrom: input.effectiveFrom,
      status: "ambiguous-employee",
      statusLabel: statusLabelByCode["ambiguous-employee"],
      note: "같은 근무지와 이름으로 여러 인력이 조회되어 수동 확인이 필요합니다."
    };
  }

  const matchedEmployee = eligibleEmployees[0]!;

  if (matchedEmployee.currentHourlyRate === importedHourlyRate) {
    return {
      rowNumber: row.rowNumber,
      siteName: row.siteName,
      employeeName: row.employeeName,
      importedHourlyRate,
      currentHourlyRate: matchedEmployee.currentHourlyRate,
      currentEffectiveFrom: matchedEmployee.currentEffectiveFrom,
      previousEffectiveTo,
      effectiveFrom: input.effectiveFrom,
      employeeId: matchedEmployee.id,
      employeeCode: matchedEmployee.employeeCode,
      status: "same-rate",
      statusLabel: statusLabelByCode["same-rate"],
      note: "현재 활성 시급과 동일하여 변경하지 않습니다."
    };
  }

  return {
    rowNumber: row.rowNumber,
    siteName: row.siteName,
    employeeName: row.employeeName,
    importedHourlyRate,
    currentHourlyRate: matchedEmployee.currentHourlyRate,
    currentEffectiveFrom: matchedEmployee.currentEffectiveFrom,
    previousEffectiveTo,
    effectiveFrom: input.effectiveFrom,
    employeeId: matchedEmployee.id,
    employeeCode: matchedEmployee.employeeCode,
    status: "ready",
    statusLabel: statusLabelByCode.ready,
    note: "미리보기 검증을 통과했습니다."
  };
};

const deduplicatePreviewRows = (rows: WorkforceWageBulkUpdatePreviewRow[]) => {
  const usedEmployeeIds = new Set<string>();

  return rows.map((row) => {
    if (row.status !== "ready" || !row.employeeId) {
      return row;
    }

    if (!usedEmployeeIds.has(row.employeeId)) {
      usedEmployeeIds.add(row.employeeId);
      return row;
    }

    return {
      ...row,
      status: "duplicate-entry",
      statusLabel: statusLabelByCode["duplicate-entry"],
      note: "같은 인력이 파일에 중복으로 포함되어 첫 번째 행만 사용합니다."
    } satisfies WorkforceWageBulkUpdatePreviewRow;
  });
};

const evaluatePreview = async (input: WorkforceWageBulkUpdatePreviewInput) => {
  const extracted = await extractImportedRows(input);
  const employeeLookup = buildEmployeeLookup(input.effectiveFrom);
  const previewRows = deduplicatePreviewRows(
    extracted.rows.map((row) => createPreviewRow(input, row, employeeLookup))
  );

  return {
    fileName: extracted.fileName,
    filePath: extracted.filePath,
    sheetName: extracted.sheetName,
    effectiveFrom: input.effectiveFrom,
    totalRows: previewRows.length,
    readyCount: previewRows.filter((row) => row.status === "ready").length,
    skippedCount: previewRows.filter((row) => row.status !== "ready").length,
    rows: previewRows
  } satisfies WorkforceWageBulkUpdatePreview;
};

const isReadyPreviewRow = (
  row: WorkforceWageBulkUpdatePreviewRow
): row is WorkforceWageBulkUpdatePreviewRow &
  Required<Pick<WorkforceWageBulkUpdatePreviewRow, "employeeId" | "importedHourlyRate">> =>
  row.status === "ready" &&
  typeof row.employeeId === "string" &&
  typeof row.importedHourlyRate === "number";

export const previewWorkforceWageBulkUpdate = async (
  input: WorkforceWageBulkUpdatePreviewInput
) => evaluatePreview(input);

export const applyWorkforceWageBulkUpdate = async (
  input: WorkforceWageBulkUpdateApplyInput
) => {
  const database = requireReadyDatabase();
  const preview = await evaluatePreview(input);
  const readyRows = preview.rows.filter(isReadyPreviewRow);

  if (readyRows.length > 0) {
    // 단건 시급 저장과 같은 규칙을 쓴다: 지난 날짜도 넣을 수 있고, 앞뒤 기간이 겹치지 않게
    // 정리되며, 같은 적용일이 이미 있으면 그 줄을 고쳐 쓴다.
    try {
      database.exec("BEGIN");

      readyRows.forEach((row) => {
        saveStoredEmployeeWageRate({
          employeeId: row.employeeId,
          hourlyRate: row.importedHourlyRate,
          effectiveFrom: input.effectiveFrom,
          reason: `엑셀 일괄 시급 업데이트 (${preview.fileName})`
        });
      });

      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    fileName: preview.fileName,
    filePath: preview.filePath,
    sheetName: preview.sheetName,
    effectiveFrom: preview.effectiveFrom,
    totalRows: preview.totalRows,
    appliedCount: readyRows.length,
    skippedCount: preview.rows.length - readyRows.length,
    rows: preview.rows.map((row) =>
      row.status === "ready"
        ? {
            ...row,
            status: "applied",
            statusLabel: statusLabelByCode.applied,
            note: "시급 변경 이력에 반영되었습니다."
          }
        : row
    )
  } satisfies WorkforceWageBulkUpdateApplySummary;
};
