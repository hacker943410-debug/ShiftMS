import { randomUUID } from "node:crypto";

import {
  createAllowanceCalculationSignature,
  createAllowanceCalculationSnapshot,
  type AllowanceCalculationResultRecord,
  type AllowanceRateTable
} from "../../shared/domain/allowance-service";
import { allowanceRateVersionFixtures } from "../../shared/domain/allowance-rate-fixtures";
import {
  buildAllowanceRateTable,
  resolveAllowanceRateCategoryCode,
  resolveAllowanceRateCategoryLabel
} from "../../shared/domain/allowance-rate-matrix";
import { selectActiveAllowanceRateVersion } from "../../shared/domain/allowance-rate-service";
import type { AllowanceRateVersion } from "../../shared/domain/model";
import type { BridgeResult } from "../../shared/bridge/contracts";
import { getLatestPerformanceApproval } from "./performance-approval-service";
import { parsePerformanceApprovalSnapshot } from "./performance-approval-snapshot-service";
import {
  listStoredAllowanceRateVersions,
  listStoredHolidayCalendars
} from "./operations-storage-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

const calculationResultsStore: AllowanceCalculationResultRecord[] = [];

const toCalculationResultRecord = (
  row: Record<string, unknown>,
  itemRows?: Array<Record<string, unknown>>
): AllowanceCalculationResultRecord => {
  const parsedSnapshot = JSON.parse(String(row.snapshot_json));

  if (itemRows && itemRows.length > 0) {
    parsedSnapshot.lines = itemRows.map((itemRow) => ({
      allowanceCode: String(itemRow.allowance_code),
      workMinutes: Number(itemRow.work_minutes),
      multiplier: Number(itemRow.multiplier),
      amount: Number(itemRow.amount)
    }));
  }

  if (typeof parsedSnapshot.businessCategoryCode !== "string") {
    const fallbackCategoryCode =
      Number(parsedSnapshot.breakdown?.substituteMinutes ?? 0) > 0
        ? "weekday-substitute"
        : Number(parsedSnapshot.breakdown?.holidayMinutes ?? 0) > 0
          ? "legal-holiday"
          : "weekday-overtime";
    parsedSnapshot.businessCategoryCode = fallbackCategoryCode;
  }

  if (typeof parsedSnapshot.businessCategoryLabel !== "string") {
    parsedSnapshot.businessCategoryLabel = resolveAllowanceRateCategoryLabel(
      parsedSnapshot.businessCategoryCode
    );
  }

  return {
    id: String(row.id),
    fileId: String(row.file_id),
    fileName: String(row.file_name),
    employeeName: String(row.employee_name),
    workDate: String(row.work_date),
    rateVersionId: String(row.rate_version_id),
    rateVersionLabel: String(row.rate_version_label),
    signature: String(row.signature),
    snapshot: parsedSnapshot
  };
};

const toTimeText = (minutes: number) => {
  const normalizedMinutes = Math.max(minutes, 0);
  const hours = Math.floor(normalizedMinutes / 60) % 24;
  const remains = normalizedMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(remains).padStart(2, "0")}`;
};

const createPrototypeTimeRange = (workHours: number) => {
  const startMinutes = 9 * 60;
  const workMinutes = Math.max(Math.round(workHours * 60), 0);

  return {
    startTime: toTimeText(startMinutes),
    endTime: toTimeText(startMinutes + workMinutes),
    breakMinutes: 0
  };
};

const toNumber = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return Number(value);
  }

  return 0;
};

const resolveApprovedWorkSource = (
  snapshot: NonNullable<ReturnType<typeof parsePerformanceApprovalSnapshot>>
) => {
  const previewRow = snapshot.previewRows[0];

  if (previewRow) {
    return {
      workDate: String(previewRow["근무일자"] ?? snapshot.entries[0]?.workDate ?? ""),
      employeeName: String(previewRow["성명"] ?? snapshot.entries[0]?.employeeName ?? "미확인"),
      workHours: toNumber(previewRow["근무시간"] ?? snapshot.entries[0]?.workHours ?? 0),
      hourlyRate: toNumber(previewRow["시급"] ?? snapshot.entries[0]?.hourlyRate ?? 0),
      category: String(previewRow["구분"] ?? snapshot.entries[0]?.category ?? "")
    };
  }

  const entry = snapshot.entries[0];

  if (!entry) {
    return null;
  }

  return {
    workDate: entry.workDate,
    employeeName: entry.employeeName,
    workHours: entry.workHours,
    hourlyRate: entry.hourlyRate ?? 0,
    category: entry.category ?? ""
  };
};

const toRateTable = (workDate: string): {
  versionId: string;
  versionLabel: string;
  rateTable: AllowanceRateTable;
} | null => {
  const targetYear = workDate.slice(0, 4);
  const storedVersions = listStoredAllowanceRateVersions();
  const versions: AllowanceRateVersion[] =
    storedVersions.length > 0 ? storedVersions : allowanceRateVersionFixtures;
  const activeVersions = versions.filter((item) => item.status === "active");
  const version =
    selectActiveAllowanceRateVersion({
      targetDate: workDate,
      versions
    }) ??
    activeVersions
      .filter((item) => String(item.year) === targetYear)
      .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ??
    activeVersions.sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];

  if (!version) {
    return null;
  }

  return {
    versionId: version.id,
    versionLabel: version.versionLabel,
    rateTable: buildAllowanceRateTable(version)
  };
};

const resolveHolidayCalendarContext = (workDate: string) => {
  const year = Number(workDate.slice(0, 4));
  const calendar = listStoredHolidayCalendars(year)[0] ?? null;
  const isHoliday = calendar?.items.some((item) => item.holidayDate === workDate) ?? false;

  return {
    holidayCalendarId: calendar?.id ?? `holiday-calendar-${year}`,
    isHoliday
  };
};

export const runApprovedAllowanceCalculation = async (
  fileId: string
): Promise<BridgeResult<AllowanceCalculationResultRecord>> => {
  const latestApproval = getLatestPerformanceApproval(fileId);

  if (!latestApproval || latestApproval.decision !== "approved") {
    return {
      ok: false,
      errorCode: "ALLOWANCE_APPROVAL_REQUIRED",
      message: "승인 완료된 실적 파일만 계산할 수 있습니다."
    };
  }

  const approvalSnapshot = parsePerformanceApprovalSnapshot(latestApproval.snapshotJson);

  if (!approvalSnapshot) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_APPROVAL_SNAPSHOT_REQUIRED",
      message: "승인 시점 스냅샷이 없어 계산 기준을 복원할 수 없습니다."
    };
  }

  const approvedSource = resolveApprovedWorkSource(approvalSnapshot);

  if (!approvedSource || !approvedSource.workDate) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_APPROVAL_SNAPSHOT_REQUIRED",
      message: "승인 스냅샷에 계산 기준 행이 없습니다."
    };
  }

  const workDate = approvedSource.workDate;
  const employeeName = approvedSource.employeeName;
  const workHours = approvedSource.workHours;
  const derivedHourlyRate = approvedSource.hourlyRate;
  const rawCategory = approvedSource.category;
  const hourlyRate = derivedHourlyRate > 1000 ? derivedHourlyRate : 12000;
  const selectedRate = toRateTable(workDate);
  const holidayContext = resolveHolidayCalendarContext(workDate);
  const allowanceCategoryCode = resolveAllowanceRateCategoryCode({
    rawCategory,
    isHoliday: holidayContext.isHoliday
  });

  if (!selectedRate) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_RATE_NOT_FOUND",
      message: "해당 날짜에 사용할 수당 요율 버전을 찾을 수 없습니다."
    };
  }

  const snapshot = createAllowanceCalculationSnapshot({
    calculationId: randomUUID(),
    performanceApprovalId: latestApproval.id,
    calculationVersion: 1,
    createdAt: new Date().toISOString(),
    approvedSnapshot: {
      performanceFileId: approvalSnapshot.fileId,
      approvalStatus: "approved",
      approvedAt: latestApproval.processedAt,
      approvedBy: latestApproval.processedBy,
      holidayCalendarId: holidayContext.holidayCalendarId,
      allowanceRateVersionId: selectedRate.versionId,
      sourceFileChecksum: approvalSnapshot.duplicateKey
    },
    workDate,
    timeRange: createPrototypeTimeRange(workHours),
    hourlyRate,
    isHoliday: holidayContext.isHoliday,
    allowanceCategoryCode,
    rateTable: selectedRate.rateTable
  });

  const signature = createAllowanceCalculationSignature(snapshot);
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    const existingRow = database.prepare(`
      SELECT *
      FROM allowance_calculations
      WHERE signature = ?
      LIMIT 1
    `).get(signature) as Record<string, unknown> | undefined;

    if (existingRow) {
      const itemRows = database.prepare(`
        SELECT *
        FROM allowance_calculation_items
        WHERE calculation_id = ?
        ORDER BY allowance_code ASC
      `).all(String(existingRow.id)) as Array<Record<string, unknown>>;

      return {
        ok: true,
        data: toCalculationResultRecord(existingRow, itemRows)
      };
    }
  }

  const existingRecord = calculationResultsStore.find((record) => record.signature === signature);

  if (existingRecord) {
    return {
      ok: true,
      data: existingRecord
    };
  }

  const record: AllowanceCalculationResultRecord = {
    id: snapshot.id,
    fileId: approvalSnapshot.fileId,
    fileName: approvalSnapshot.fileName,
    employeeName,
    workDate,
    rateVersionId: selectedRate.versionId,
    rateVersionLabel: selectedRate.versionLabel,
    signature,
    snapshot
  };

  if (database && isSqliteStorageReady()) {
    database.prepare(`
      INSERT INTO allowance_calculations (
        id,
        performance_approval_id,
        calculation_version,
        status,
        file_id,
        file_name,
        employee_name,
        work_date,
        rate_version_id,
        rate_version_label,
        total_work_minutes,
        base_work_minutes,
        overtime_minutes,
        night_minutes,
        holiday_minutes,
        substitute_minutes,
        total_allowance_amount,
        signature,
        snapshot_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      snapshot.performanceApprovalId,
      snapshot.calculationVersion,
      "calculated",
      record.fileId,
      record.fileName,
      record.employeeName,
      record.workDate,
      record.rateVersionId,
      record.rateVersionLabel,
      snapshot.breakdown.totalWorkMinutes,
      snapshot.breakdown.baseWorkMinutes,
      snapshot.breakdown.overtimeMinutes,
      snapshot.breakdown.nightMinutes,
      snapshot.breakdown.holidayMinutes,
      snapshot.breakdown.substituteMinutes,
      snapshot.totalAllowanceAmount,
      record.signature,
      JSON.stringify(record.snapshot),
      record.snapshot.createdAt
    );

    const insertItem = database.prepare(`
      INSERT INTO allowance_calculation_items (
        id,
        calculation_id,
        allowance_code,
        work_minutes,
        multiplier,
        amount,
        detail_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    record.snapshot.lines.forEach((line) => {
      insertItem.run(
        randomUUID(),
        record.id,
        line.allowanceCode,
        line.workMinutes,
        line.multiplier,
        line.amount,
        JSON.stringify({
          fileId: record.fileId,
          rateVersionId: record.rateVersionId
        })
      );
    });

    return {
      ok: true,
      data: record
    };
  }

  calculationResultsStore.unshift(record);

  return {
    ok: true,
    data: record
  };
};

export const listApprovedAllowanceCalculationResults = (): AllowanceCalculationResultRecord[] => [
  ...((): AllowanceCalculationResultRecord[] => {
    const database = getSqliteDatabase();

    if (database && isSqliteStorageReady()) {
      const rows = database.prepare(`
        SELECT *
        FROM allowance_calculations
        ORDER BY created_at DESC
      `).all() as Array<Record<string, unknown>>;

      return rows.map((row) => {
        const itemRows = database.prepare(`
          SELECT *
          FROM allowance_calculation_items
          WHERE calculation_id = ?
          ORDER BY allowance_code ASC
        `).all(String(row.id)) as Array<Record<string, unknown>>;

        return toCalculationResultRecord(row, itemRows);
      });
    }

    return calculationResultsStore;
  })()
];

export const resetApprovedAllowanceCalculationStateForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM allowance_calculation_items;");
    database.exec("DELETE FROM allowance_calculations;");
  }

  calculationResultsStore.length = 0;
};
