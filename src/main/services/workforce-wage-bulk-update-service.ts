import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import ExcelJS from "exceljs";

import type {
  WorkforceWageBulkColumnSuggestion,
  WorkforceWageBulkSuggestibleColumn,
  WorkforceWageBulkUpdateApplyInput,
  WorkforceWageBulkUpdateSavePlan,
  WorkforceWageBulkUpdateApplySummary,
  WorkforceWageBulkUpdatePreview,
  WorkforceWageBulkUpdatePreviewInput,
  WorkforceWageBulkUpdatePreviewRow,
  WorkforceWageBulkUpdateRowStatus
} from "../../shared/bridge/contracts";
import { excelColumnIndexToLabel, excelColumnLabelToIndex } from "../../shared/lib/excel-column";
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
  // What saving would actually do to this person's wage history at the effective date, decided
  // with the same rules the save uses. Read at save time otherwise, which is exactly why the
  // preview has to pin it down.
  savePlan: WorkforceWageBulkUpdateSavePlan;
}

interface ImportedSpreadsheetRow {
  rowNumber: number;
  employeeCode: string;
  siteName: string;
  employeeName: string;
  hourlyRateText: string;
}

const SUPPORTED_EXTENSIONS = new Set([".xlsx", ".xlsm"]);
const HEADER_ROW = 1;
const DATA_START_ROW = 2;

const statusLabelByCode: Record<WorkforceWageBulkUpdateRowStatus, string> = {
  ready: "적용 가능",
  applied: "적용 완료",
  "missing-required-value": "필수값 누락",
  "invalid-hourly-rate": "시급 형식 오류",
  "employee-not-found": "일치 인력 없음",
  "employee-code-not-found": "사번 없음",
  "employee-code-name-mismatch": "사번·이름 불일치",
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

// Mirrors saveStoredEmployeeWageRate: an existing line starting on the effective date is rewritten
// (and nothing is cut short), otherwise a line is added and every earlier line crossing the date is
// cut to the day before. Keeping the two in step is the whole point - a plan built by different
// rules would promise a save that never happens.
const buildSavePlansByEmployee = (effectiveFrom: string) => {
  const database = requireReadyDatabase();
  const rows = database.prepare(`
    SELECT employee_id, id, effective_from, effective_to
    FROM wage_rates
    WHERE effective_from = ?
       OR effective_from > ?
       OR (effective_from < ? AND (effective_to IS NULL OR effective_to >= ?))
    ORDER BY employee_id ASC, effective_from ASC, created_at ASC
  `).all(effectiveFrom, effectiveFrom, effectiveFrom, effectiveFrom) as Array<{
    employee_id: string;
    id: string;
    effective_from: string;
    effective_to: string | null;
  }>;

  const plans = new Map<string, WorkforceWageBulkUpdateSavePlan>();
  const byEmployee = new Map<string, typeof rows>();

  rows.forEach((row) => {
    byEmployee.set(row.employee_id, [...(byEmployee.get(row.employee_id) ?? []), row]);
  });

  byEmployee.forEach((employeeRows, employeeId) => {
    // Rows arrive created_at ASC, and reads resolve a shared start date to the newest row, so the
    // LAST match here is the one the save would rewrite.
    const sameStart = [...employeeRows]
      .reverse()
      .find((row) => row.effective_from === effectiveFrom);
    const nextRate = employeeRows.find((row) => row.effective_from > effectiveFrom);
    const newEffectiveTo = nextRate ? shiftDateValue(nextRate.effective_from, -1) : undefined;

    plans.set(
      employeeId,
      sameStart
        ? {
            mode: "overwrite",
            overwrittenRateId: sameStart.id,
            newEffectiveTo,
            truncatedRates: []
          }
        : {
            mode: "insert",
            newEffectiveTo,
            truncatedRates: employeeRows
              .filter(
                (row) =>
                  row.effective_from < effectiveFrom &&
                  (row.effective_to === null || row.effective_to >= effectiveFrom)
              )
              .map((row) => ({ id: row.id, effectiveTo: row.effective_to ?? undefined }))
          }
    );
  });

  return plans;
};

export interface EmployeeLookup {
  bySiteAndName: Map<string, EmployeeLookupRow[]>;
  byEmployeeCode: Map<string, EmployeeLookupRow[]>;
}

const buildEmployeeLookup = (effectiveFrom: string): EmployeeLookup => {
  listStoredEmployees();

  const savePlans = buildSavePlansByEmployee(effectiveFrom);
  const emptyPlan: WorkforceWageBulkUpdateSavePlan = { mode: "insert", truncatedRates: [] };

  const bySiteAndName = new Map<string, EmployeeLookupRow[]>();
  // Keyed for everyone, including people with no current assignment - they are exactly the ones
  // the site-and-name key loses, and the whole point of matching by code is to reach them.
  const byEmployeeCode = new Map<string, EmployeeLookupRow[]>();

  listEmployeeLookupRows(effectiveFrom).forEach((row) => {
    const currentSiteName = normalizeText(
      row.current_site_name ? String(row.current_site_name) : undefined
    );
    const employeeName = normalizeText(String(row.name));
    const employeeCode = normalizeText(String(row.employee_code));

    if (!employeeName) {
      return;
    }

    const lookupRow: EmployeeLookupRow = {
      id: String(row.id),
      employeeCode,
      name: employeeName,
      status: String(row.status),
      retireDate: row.retire_date ? String(row.retire_date) : undefined,
      // Absent, not empty: "no current assignment" has to be distinguishable from a site named "",
      // and an empty string slips past every ?? that guards this field downstream.
      currentSiteName: currentSiteName || undefined,
      currentHourlyRate:
        row.current_hourly_rate !== null && row.current_hourly_rate !== undefined
          ? Number(row.current_hourly_rate)
          : undefined,
      currentEffectiveFrom: row.current_effective_from
        ? String(row.current_effective_from)
        : undefined,
      savePlan: savePlans.get(String(row.id)) ?? emptyPlan
    };

    if (employeeCode) {
      // The column is UNIQUE but case-sensitively so, and the file may be typed in either case.
      // Matching case-insensitively can therefore find more than one person, which is reported
      // rather than guessed at.
      const codeKey = employeeCode.toLowerCase();

      byEmployeeCode.set(codeKey, [...(byEmployeeCode.get(codeKey) ?? []), lookupRow]);
    }

    if (currentSiteName) {
      const key = `${currentSiteName}::${employeeName}`.toLowerCase();

      bySiteAndName.set(key, [...(bySiteAndName.get(key) ?? []), lookupRow]);
    }
  });

  return { bySiteAndName, byEmployeeCode };
};

// Told apart from an ordinary save failure so the screen can force a rebuild of the preview
// instead of leaving an approved-looking table the operator can keep pressing Apply on.
export class WageBulkPreviewStaleError extends Error {
  constructor() {
    super(
      "미리보기를 만든 뒤 파일 내용이나 인력 정보가 바뀌었습니다. 미리보기를 다시 만들어 확인한 뒤 적용해 주세요."
    );
    this.name = "WageBulkPreviewStaleError";
  }
}

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
  // Optional: only read when the operator mapped a column for it.
  const employeeCodeColumn = normalizeText(input.mapping.employeeCodeColumn);
  const employeeCodeColumnIndex = employeeCodeColumn
    ? excelColumnLabelToIndex(employeeCodeColumn)
    : null;
  const rows: ImportedSpreadsheetRow[] = [];

  for (let rowNumber = DATA_START_ROW; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const siteName = normalizeText(worksheet.getCell(rowNumber, siteNameColumnIndex).text);
    const employeeName = normalizeText(worksheet.getCell(rowNumber, employeeNameColumnIndex).text);
    const hourlyRateText = normalizeText(worksheet.getCell(rowNumber, hourlyRateColumnIndex).text);
    const employeeCode = employeeCodeColumnIndex
      ? normalizeText(worksheet.getCell(rowNumber, employeeCodeColumnIndex).text)
      : "";

    if (!siteName && !employeeName && !hourlyRateText && !employeeCode) {
      continue;
    }

    rows.push({
      rowNumber,
      employeeCode,
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
  employeeLookup: EmployeeLookup
): WorkforceWageBulkUpdatePreviewRow => {
  const importedHourlyRate = parseImportedHourlyRate(row.hourlyRateText) ?? undefined;
  const identity = {
    rowNumber: row.rowNumber,
    siteName: row.siteName,
    employeeName: row.employeeName,
    importedEmployeeCode: row.employeeCode || undefined
  };
  // With a code in hand the site name is not needed to find the person - which is the point, since
  // a renamed site or a transfer is exactly what makes the site-and-name key miss.
  const requiresSiteName = !row.employeeCode;

  if ((requiresSiteName && !row.siteName) || !row.employeeName || !row.hourlyRateText) {
    return {
      ...identity,
      importedHourlyRate,
      effectiveFrom: input.effectiveFrom,
      status: "missing-required-value",
      statusLabel: statusLabelByCode["missing-required-value"],
      note: row.employeeCode
        ? "이름과 시급 값이 필요합니다."
        : "근무지명, 이름, 시급 값이 모두 필요합니다."
    };
  }

  if (typeof importedHourlyRate !== "number") {
    return {
      ...identity,
      effectiveFrom: input.effectiveFrom,
      status: "invalid-hourly-rate",
      statusLabel: statusLabelByCode["invalid-hourly-rate"],
      note: "시급은 숫자 또는 쉼표가 포함된 숫자만 지원합니다."
    };
  }

  // The code path narrows to ONE person before anything else looks at the list. Handing a wider
  // list on - as an earlier version did, checking that SOMEONE in it had the right name and then
  // filtering that list by retirement - let a leaver satisfy the name check while a different,
  // working person was the one left standing to be paid.
  let matchedEmployees: EmployeeLookupRow[];

  if (row.employeeCode) {
    const codeBucket = employeeLookup.byEmployeeCode.get(row.employeeCode.toLowerCase()) ?? [];
    // employee_code is UNIQUE, but case-sensitively so: "EMP-1" and "emp-1" can both exist. Prefer
    // the exact spelling; only when nothing matches exactly does the case-folded bucket decide,
    // and a bucket holding more than one person is reported rather than guessed at.
    const exactMatches = codeBucket.filter(
      (employee) => employee.employeeCode === row.employeeCode
    );
    const candidates = exactMatches.length > 0 ? exactMatches : codeBucket;

    if (candidates.length === 0) {
      return {
        ...identity,
        importedHourlyRate,
        effectiveFrom: input.effectiveFrom,
        status: "employee-code-not-found",
        statusLabel: statusLabelByCode["employee-code-not-found"],
        note: `사번 ${row.employeeCode}에 해당하는 인력이 없습니다.`
      };
    }

    if (candidates.length > 1) {
      return {
        ...identity,
        importedHourlyRate,
        effectiveFrom: input.effectiveFrom,
        status: "ambiguous-employee",
        statusLabel: statusLabelByCode["ambiguous-employee"],
        note: `사번 ${row.employeeCode}과 대소문자만 다른 사번이 함께 있어 수동 확인이 필요합니다.`
      };
    }

    const found = candidates[0]!;

    // A mistyped code would otherwise raise the wrong person's wage, so the name written beside it
    // has to agree. Compared exactly after trimming - a looser rule here would only ever turn a
    // refusal into a payment.
    if (found.name !== row.employeeName) {
      return {
        ...identity,
        importedHourlyRate,
        effectiveFrom: input.effectiveFrom,
        employeeId: found.id,
        employeeCode: found.employeeCode,
        matchedSiteName: found.currentSiteName,
        matchedByEmployeeCode: true,
        status: "employee-code-name-mismatch",
        statusLabel: statusLabelByCode["employee-code-name-mismatch"],
        note: `사번 ${row.employeeCode}은 '${found.name}'입니다. 파일의 이름과 달라 적용하지 않습니다.`
      };
    }

    matchedEmployees = candidates;
  } else {
    matchedEmployees =
      employeeLookup.bySiteAndName.get(`${row.siteName}::${row.employeeName}`.toLowerCase()) ?? [];

    if (matchedEmployees.length === 0) {
      return {
        ...identity,
        importedHourlyRate,
        effectiveFrom: input.effectiveFrom,
        status: "employee-not-found",
        statusLabel: statusLabelByCode["employee-not-found"],
        note: "현재 배정된 인력 목록에서 동일한 근무지명과 이름을 찾지 못했습니다."
      };
    }
  }

  // Someone who had already left before the effective date cannot be raised for it. Judge that by
  // the leaving date, not by today's status: a backdated raise covering days the person actually
  // worked must still reach them. With no leaving date recorded, fall back to the status.
  //
  // The leaving date is this project's FIRST non-working day, not the last worked one - the
  // schedule draft and the performance parser both refuse work on that very date. So a leaving date
  // equal to the effective date means the new rate would cover no worked day at all: exclude it.
  const hadLeftBefore = (employee: EmployeeLookupRow) =>
    employee.retireDate
      ? employee.retireDate <= input.effectiveFrom
      : employee.status === "retired";

  // Filter leavers out BEFORE judging ambiguity. Doing it after meant one same-named leaver in the
  // same site knocked the working colleague out of the raise as "동일 인력 중복".
  const eligibleEmployees = matchedEmployees.filter((employee) => !hadLeftBefore(employee));
  const previousEffectiveTo = shiftDateValue(input.effectiveFrom, -1);

  if (eligibleEmployees.length === 0) {
    const leaver = matchedEmployees[0]!;

    return {
      ...identity,
      importedHourlyRate,
      currentHourlyRate: leaver.currentHourlyRate,
      currentEffectiveFrom: leaver.currentEffectiveFrom,
      previousEffectiveTo,
      effectiveFrom: input.effectiveFrom,
      employeeId: leaver.id,
      employeeCode: leaver.employeeCode,
      matchedSiteName: leaver.currentSiteName,
      matchedByEmployeeCode: Boolean(row.employeeCode),
      status: "employee-retired",
      statusLabel: statusLabelByCode["employee-retired"],
      note: "적용일에는 이미 퇴사 처리된 인력입니다."
    };
  }

  if (eligibleEmployees.length > 1) {
    return {
      ...identity,
      importedHourlyRate,
      effectiveFrom: input.effectiveFrom,
      status: "ambiguous-employee",
      statusLabel: statusLabelByCode["ambiguous-employee"],
      note: row.employeeCode
        ? "같은 사번으로 여러 인력이 조회되어 수동 확인이 필요합니다."
        : "같은 근무지와 이름으로 여러 인력이 조회되어 수동 확인이 필요합니다."
    };
  }

  const matchedEmployee = eligibleEmployees[0]!;

  if (matchedEmployee.currentHourlyRate === importedHourlyRate) {
    return {
      ...identity,
      importedHourlyRate,
      currentHourlyRate: matchedEmployee.currentHourlyRate,
      currentEffectiveFrom: matchedEmployee.currentEffectiveFrom,
      previousEffectiveTo,
      effectiveFrom: input.effectiveFrom,
      employeeId: matchedEmployee.id,
      employeeCode: matchedEmployee.employeeCode,
      matchedSiteName: matchedEmployee.currentSiteName,
      matchedByEmployeeCode: Boolean(row.employeeCode),
      status: "same-rate",
      statusLabel: statusLabelByCode["same-rate"],
      note: "현재 활성 시급과 동일하여 변경하지 않습니다."
    };
  }

  const matchedByEmployeeCode = Boolean(row.employeeCode);
  // Found by code, but assigned nowhere right now. The site written in the file says nothing about
  // this person, so the screen must not pass it off as their workplace.
  const hasNoAssignment = matchedByEmployeeCode && !matchedEmployee.currentSiteName;
  const movedSite =
    matchedByEmployeeCode &&
    Boolean(row.siteName) &&
    Boolean(matchedEmployee.currentSiteName) &&
    matchedEmployee.currentSiteName!.toLowerCase() !== row.siteName.toLowerCase();

  return {
    ...identity,
    importedHourlyRate,
    currentHourlyRate: matchedEmployee.currentHourlyRate,
    currentEffectiveFrom: matchedEmployee.currentEffectiveFrom,
    previousEffectiveTo,
    effectiveFrom: input.effectiveFrom,
    // Everything the save would touch, judged here so the fingerprint covers it: the end date the
    // new line gets, the exact line an overwrite rewrites, and every earlier line an insert cuts
    // short. A row added underneath after review changes this, and the apply is refused.
    savePlan: matchedEmployee.savePlan,
    employeeId: matchedEmployee.id,
    employeeCode: matchedEmployee.employeeCode,
    matchedSiteName: matchedEmployee.currentSiteName,
    matchedByEmployeeCode,
    status: "ready",
    statusLabel: statusLabelByCode.ready,
    // Matching by code is allowed to disagree with the site written in the file, but the operator
    // should not have to notice that on their own.
    note: hasNoAssignment
      ? "사번으로 찾았습니다. 현재 배정된 근무지가 없습니다."
      : movedSite
        ? `사번으로 찾았습니다. 현재 배정 근무지는 '${matchedEmployee.currentSiteName}'입니다.`
        : "미리보기 검증을 통과했습니다."
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

// Apply re-reads the workbook and re-queries the database rather than trusting anything the screen
// sends, which is right - but it means the operator can edit the same file after previewing and
// have rows nobody reviewed saved under the reviewed preview's name. Fingerprinting the judged
// result closes that: it changes when the file content changes, and also when the people or their
// current rates change underneath, because both shape the rows.
const buildPreviewFingerprint = (
  preview: Omit<WorkforceWageBulkUpdatePreview, "previewId">
): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        preview.fileName,
        preview.sheetName,
        preview.effectiveFrom,
        preview.rows
      ])
    )
    .digest("hex");

const evaluatePreview = async (
  input: WorkforceWageBulkUpdatePreviewInput
): Promise<WorkforceWageBulkUpdatePreview> => {
  const extracted = await extractImportedRows(input);
  const employeeLookup = buildEmployeeLookup(input.effectiveFrom);
  const previewRows = deduplicatePreviewRows(
    extracted.rows.map((row) => createPreviewRow(input, row, employeeLookup))
  );

  const judged = {
    fileName: extracted.fileName,
    filePath: extracted.filePath,
    sheetName: extracted.sheetName,
    effectiveFrom: input.effectiveFrom,
    totalRows: previewRows.length,
    readyCount: previewRows.filter((row) => row.status === "ready").length,
    skippedCount: previewRows.filter((row) => row.status !== "ready").length,
    rows: previewRows
  } satisfies Omit<WorkforceWageBulkUpdatePreview, "previewId">;

  return { previewId: buildPreviewFingerprint(judged), ...judged };
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

  // Only the preview the operator actually read may be applied. Re-reading is what makes this
  // check possible AND necessary: the same path can hold different content by now, and the people
  // it matches can have changed too.
  if (preview.previewId !== input.expectedPreviewId) {
    throw new WageBulkPreviewStaleError();
  }

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
    previewId: preview.previewId,
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

// Header labels operators actually use. Matched after stripping spaces and case so "사원 번호" and
// "EmployeeCode" both land, but only an actual header decides a column - guessing by position
// would quietly read whatever sits there, which is worse than asking.
const headerAliases: Array<{ key: WorkforceWageBulkSuggestibleColumn; labels: string[] }> = [
  {
    key: "employeeCodeColumn",
    labels: ["사번", "사원번호", "직원번호", "사원코드", "employeecode", "empno", "empcode"]
  },
  { key: "siteNameColumn", labels: ["근무지", "근무지명", "사업장", "사업장명", "현장", "site"] },
  { key: "employeeNameColumn", labels: ["이름", "성명", "인력명", "직원명", "name"] },
  { key: "hourlyRateColumn", labels: ["시급", "통상시급", "시간급", "hourlyrate", "rate"] }
];

const normalizeHeaderLabel = (value: string) => value.replace(/[\s_-]/g, "").toLowerCase();

export const suggestWorkforceWageBulkColumns = async (input: {
  filePath: string;
}): Promise<WorkforceWageBulkColumnSuggestion> => {
  const workbook = await readWorkbook(input.filePath);
  const worksheet = workbook.worksheets[0]!;
  const headerLabels: string[] = [];
  const matchesByField = new Map<WorkforceWageBulkSuggestibleColumn, string[]>();

  for (let columnIndex = 1; columnIndex <= Math.max(worksheet.columnCount, 1); columnIndex += 1) {
    const label = normalizeText(worksheet.getCell(HEADER_ROW, columnIndex).text);

    headerLabels.push(label);

    if (!label) {
      continue;
    }

    const normalized = normalizeHeaderLabel(label);
    const alias = headerAliases.find((candidate) =>
      candidate.labels.some((name) => normalized === name)
    );

    if (alias) {
      matchesByField.set(alias.key, [
        ...(matchesByField.get(alias.key) ?? []),
        excelColumnIndexToLabel(columnIndex)
      ]);
    }
  }

  const suggestion: WorkforceWageBulkColumnSuggestion = { ambiguousFields: [], headerLabels };

  matchesByField.forEach((columns, key) => {
    // One header, one answer. Two columns claiming to be the wage - which happens in sheets that
    // carry an old rate beside the new one - is a question only the operator can settle, so it is
    // asked rather than guessed.
    if (columns.length === 1) {
      suggestion[key] = columns[0];
      return;
    }

    suggestion.ambiguousFields.push({ field: key, columns });
  });

  return suggestion;
};
