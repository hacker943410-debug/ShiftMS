import { randomUUID } from "node:crypto";

import type { BridgeResult, AllowanceApprovedCalculationInput } from "../../shared/bridge/contracts";
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
import type { AllowanceRateVersion, WorkType } from "../../shared/domain/model";
import {
  getStoredPerformanceFileDetail,
  listStoredPerformanceFileDetails
} from "./performance-file-storage-service";
import { getLatestPerformanceApprovalByEntryId } from "./performance-approval-service";
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
    entryId: String(row.performance_entry_id ?? ""),
    employeeCode: String(row.employee_code ?? ""),
    employeeName: String(row.employee_name),
    siteName: String(row.site_name ?? ""),
    workDate: String(row.work_date),
    workType: String(row.work_type ?? "overtime") as WorkType,
    hourlyRate: Number(row.hourly_rate ?? 0),
    rateVersionId: String(row.rate_version_id),
    rateVersionLabel: String(row.rate_version_label),
    signature: String(row.signature),
    snapshot: parsedSnapshot
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

const resolveRawCategory = (workType: WorkType) => {
  if (workType === "holiday") {
    return "법정휴일근무";
  }

  if (workType === "substitute") {
    return "대체근무";
  }

  return "연장근무";
};

export const runApprovedAllowanceCalculation = async (
  input: AllowanceApprovedCalculationInput
): Promise<BridgeResult<AllowanceCalculationResultRecord>> => {
  const entryId = typeof input === "string" ? input : input.entryId;
  const latestApproval = getLatestPerformanceApprovalByEntryId(entryId);

  if (!latestApproval || latestApproval.decision !== "approved") {
    return {
      ok: false,
      errorCode: "ALLOWANCE_APPROVAL_REQUIRED",
      message: "승인 완료된 실적 행만 계산할 수 있습니다."
    };
  }

  const detail = getStoredPerformanceFileDetail(latestApproval.fileId);

  if (!detail || detail.status !== "approved" || !detail.isEffective) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_FILE_NOT_EFFECTIVE",
      message: "최신 승인 완료된 실적 파일에서만 수당 계산을 실행할 수 있습니다."
    };
  }

  const approvalSnapshot = parsePerformanceApprovalSnapshot(latestApproval.snapshotJson);
  const approvedEntry = approvalSnapshot?.entry;

  if (!approvalSnapshot || !approvedEntry) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_APPROVAL_SNAPSHOT_REQUIRED",
      message: "승인 시점 스냅샷이 없어 계산 기준을 복원할 수 없습니다."
    };
  }

  if (!approvedEntry.startTime || !approvedEntry.endTime) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_WORK_TIME_REQUIRED",
      message: "근무 시작/종료 시간이 없어 수당 계산을 진행할 수 없습니다."
    };
  }

  const selectedRate = toRateTable(approvedEntry.workDate);
  const holidayContext = resolveHolidayCalendarContext(approvedEntry.workDate);

  if (!selectedRate) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_RATE_NOT_FOUND",
      message: "해당 날짜에 사용할 수당 요율 버전을 찾을 수 없습니다."
    };
  }

  if (!approvedEntry.hourlyRate || approvedEntry.hourlyRate <= 0) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_HOURLY_RATE_REQUIRED",
      message: "적용 시급이 없어 수당 계산을 진행할 수 없습니다."
    };
  }

  const allowanceCategoryCode = resolveAllowanceRateCategoryCode({
    rawCategory: resolveRawCategory(approvedEntry.workType),
    isHoliday: holidayContext.isHoliday,
    workType: approvedEntry.workType
  });
  const snapshot = createAllowanceCalculationSnapshot({
    calculationId: randomUUID(),
    performanceApprovalId: latestApproval.id,
    calculationVersion: 1,
    createdAt: new Date().toISOString(),
    approvedSnapshot: {
      performanceFileId: approvalSnapshot.fileId,
      performanceEntryId: approvedEntry.id,
      approvalStatus: "approved",
      approvedAt: latestApproval.processedAt,
      approvedBy: latestApproval.processedBy,
      holidayCalendarId: holidayContext.holidayCalendarId,
      allowanceRateVersionId: selectedRate.versionId,
      sourceFileChecksum: approvalSnapshot.duplicateKey
    },
    workDate: approvedEntry.workDate,
    timeRange: {
      startTime: approvedEntry.startTime,
      endTime: approvedEntry.endTime,
      breakMinutes: approvedEntry.breakMinutes
    },
    hourlyRate: approvedEntry.hourlyRate,
    isHoliday: holidayContext.isHoliday,
    workType: approvedEntry.workType,
    allowanceCategoryCode,
    rateTable: selectedRate.rateTable
  });
  const signature = createAllowanceCalculationSignature(snapshot);
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    const existingRow = database.prepare(`
      SELECT allowance_calculations.*
      FROM allowance_calculations
      INNER JOIN performance_files
        ON performance_files.id = allowance_calculations.file_id
      WHERE allowance_calculations.signature = ?
        AND performance_files.status = 'approved'
        AND performance_files.is_effective = 1
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
    entryId: approvedEntry.id,
    employeeCode: approvedEntry.employeeCode,
    employeeName: approvedEntry.employeeName,
    siteName: approvedEntry.siteName,
    workDate: approvedEntry.workDate,
    workType: approvedEntry.workType,
    hourlyRate: approvedEntry.hourlyRate,
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
        performance_entry_id,
        calculation_version,
        status,
        file_id,
        file_name,
        site_name,
        employee_code,
        employee_name,
        work_date,
        work_type,
        hourly_rate,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      snapshot.performanceApprovalId,
      record.entryId,
      snapshot.calculationVersion,
      "calculated",
      record.fileId,
      record.fileName,
      record.siteName,
      record.employeeCode,
      record.employeeName,
      record.workDate,
      record.workType,
      record.hourlyRate,
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
          rateVersionId: record.rateVersionId,
          entryId: record.entryId
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
        SELECT allowance_calculations.*
        FROM allowance_calculations
        INNER JOIN performance_files
          ON performance_files.id = allowance_calculations.file_id
        WHERE performance_files.status = 'approved'
          AND performance_files.is_effective = 1
        ORDER BY allowance_calculations.created_at DESC
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

export const listApprovedAllowanceTargets = () =>
  listStoredPerformanceFileDetails()
    .filter((detail) => detail.status === "approved" && detail.isEffective)
    .flatMap((detail) => detail.entries.filter((entry) => entry.status === "approved"))
    .sort(
      (left, right) =>
        left.workDate.localeCompare(right.workDate) ||
        left.siteName.localeCompare(right.siteName, "ko") ||
        left.employeeName.localeCompare(right.employeeName, "ko")
    );

export const resetApprovedAllowanceCalculationStateForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM allowance_calculation_items;");
    database.exec("DELETE FROM allowance_calculations;");
  }

  calculationResultsStore.length = 0;
};
