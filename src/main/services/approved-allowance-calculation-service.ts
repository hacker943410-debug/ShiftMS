import { randomUUID } from "node:crypto";

import type {
  AllowanceApprovedCalculationInput,
  AllowanceEarlyPayoutInput,
  BridgeResult
} from "../../shared/bridge/contracts";
import {
  createAllowanceCalculationSignature,
  createAllowanceCalculationSnapshot,
  type AllowanceCalculationResultRecord,
  type AllowanceRateTable
} from "../../shared/domain/allowance-service";
import type { AllowanceCalculationStatus } from "../../shared/domain/allowance-workflow";
import { normalizeEmployeeRank } from "../../shared/domain/employee-rank";
import { allowanceRateVersionFixtures } from "../../shared/domain/allowance-rate-fixtures";
import {
  buildAllowanceRateTable,
  resolveAllowanceRateCategoryCode,
  resolveAllowanceRateCategoryLabel
} from "../../shared/domain/allowance-rate-matrix";
import { selectActiveAllowanceRateVersion } from "../../shared/domain/allowance-rate-service";
import type { AllowanceRateVersion, WorkType } from "../../shared/domain/model";
import {
  getNonPayableSubstituteReasonText,
  isPoolSubstitutePerformanceEntry
} from "../../shared/domain/performance-file";
import {
  getLatestPerformanceApprovalByEntryId,
  listLatestApprovedPerformanceApprovalsByLogicalKey
} from "./performance-approval-service";
import { parsePerformanceApprovalSnapshot } from "./performance-approval-snapshot-service";
import {
  listStoredAllowanceRateVersions,
  listStoredHolidayCalendars
} from "./operations-storage-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

const calculationResultsStore: AllowanceCalculationResultRecord[] = [];

const isAllowanceCalculationStatus = (value: unknown): value is AllowanceCalculationStatus =>
  value === "pending" ||
  value === "approved" ||
  value === "rejected" ||
  value === "proposal-approved";

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
    employeeRank: normalizeEmployeeRank(
      row.employee_rank ? String(row.employee_rank) : undefined
    ),
    siteName: String(row.site_name ?? ""),
    workDate: String(row.work_date),
    workType: String(row.work_type ?? "overtime") as WorkType,
    hourlyRate: Number(row.hourly_rate ?? 0),
    rateVersionId: String(row.rate_version_id),
    rateVersionLabel: String(row.rate_version_label),
    status: isAllowanceCalculationStatus(row.status) ? row.status : "pending",
    earlyPayoutDate:
      typeof row.early_payout_date === "string" && row.early_payout_date.length > 0
        ? String(row.early_payout_date)
        : undefined,
    signature: String(row.signature),
    snapshot: parsedSnapshot
  };
};

// 근무 날짜에 유효한 요율 버전을 고른다.
// 1순위는 그 날짜에 실제 적용되던 활성 버전이다(소급 정산 시 그 시점의 요율 적용).
// 과거에는 '가장 최근에 수정된 활성 버전'을 먼저 골라, 여러 버전이 동시에 활성인 기간의
// 소급 건이 엉뚱한(최신) 배율로 계산되었다. 올바른 형제 경로(연장근무 보강)와 동일한 순서로 맞춘다.
export const selectRateVersionForWorkDate = (
  versions: AllowanceRateVersion[],
  workDate: string
): AllowanceRateVersion | null => {
  const targetYear = workDate.slice(0, 4);
  const activeVersions = versions.filter((item) => item.status === "active");

  return (
    selectActiveAllowanceRateVersion({
      targetDate: workDate,
      versions
    }) ??
    activeVersions
      .filter((item) => String(item.year) === targetYear)
      .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ??
    activeVersions.sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ??
    null
  );
};

const toRateTable = (workDate: string): {
  versionId: string;
  versionLabel: string;
  rateTable: AllowanceRateTable;
} | null => {
  const storedVersions = listStoredAllowanceRateVersions();
  const versions: AllowanceRateVersion[] =
    storedVersions.length > 0 ? storedVersions : allowanceRateVersionFixtures;
  const version = selectRateVersionForWorkDate(versions, workDate);

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

const listStoredCalculationRecords = (): AllowanceCalculationResultRecord[] => {
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

  return [...calculationResultsStore];
};

export const listAllowanceCalculationHistory = (): AllowanceCalculationResultRecord[] =>
  listStoredCalculationRecords().sort(
    (left, right) =>
      right.snapshot.createdAt.localeCompare(left.snapshot.createdAt) ||
      right.workDate.localeCompare(left.workDate) ||
      left.siteName.localeCompare(right.siteName, "ko") ||
      left.employeeName.localeCompare(right.employeeName, "ko")
  );

export const getLatestAllowanceCalculationByApprovalId = (
  approvalId: string
): AllowanceCalculationResultRecord | null =>
  listStoredCalculationRecords().find(
    (record) => record.snapshot.performanceApprovalId === approvalId
  ) ?? null;

export const getAllowanceCalculationById = (
  calculationId: string
): AllowanceCalculationResultRecord | null =>
  listStoredCalculationRecords().find((record) => record.id === calculationId) ?? null;

export const listAllowanceCalculationsByIds = (
  calculationIds: string[]
): AllowanceCalculationResultRecord[] => {
  const calculationIdSet = new Set(calculationIds);

  return listStoredCalculationRecords().filter((record) => calculationIdSet.has(record.id));
};

export const deleteAllowanceCalculationByApprovalId = (approvalId: string) => {
  const database = getSqliteDatabase();
  const existing = getLatestAllowanceCalculationByApprovalId(approvalId);

  if (!existing) {
    return;
  }

  if (database && isSqliteStorageReady()) {
    database.prepare(`
      DELETE FROM allowance_calculation_items
      WHERE calculation_id = ?
    `).run(existing.id);
    database.prepare(`
      DELETE FROM allowance_calculations
      WHERE id = ?
    `).run(existing.id);
    return;
  }

  const index = calculationResultsStore.findIndex((record) => record.id === existing.id);

  if (index >= 0) {
    calculationResultsStore.splice(index, 1);
  }
};

export const updateAllowanceCalculationStatus = (input: {
  calculationId: string;
  status: AllowanceCalculationStatus;
}) => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.prepare(`
      UPDATE allowance_calculations
      SET status = ?
      WHERE id = ?
    `).run(input.status, input.calculationId);
    return;
  }

  const target = calculationResultsStore.find((record) => record.id === input.calculationId);

  if (target) {
    target.status = input.status;
  }
};

// MUST stay synchronous. The approval flow calls this INSIDE an open SQLite transaction, and
// isTransaction is connection-wide state rather than a call stack: any await here would hand the
// event loop to another IPC handler, whose save would join this transaction and vanish with its
// rollback. Making this async again silently reopens that window - runInSqliteTransaction now
// refuses a thenable for the same reason. Callers that need a promise wrap it themselves.
export const runApprovedAllowanceCalculationForApproval = (
  latestApproval: {
    id: string;
    fileId: string;
    decision: string;
    processedAt: string;
    processedBy: string;
    snapshotJson?: string;
  }
): BridgeResult<AllowanceCalculationResultRecord> => {
  if (latestApproval.decision !== "approved") {
    return {
      ok: false,
      errorCode: "ALLOWANCE_APPROVAL_REQUIRED",
      message: "승인 완료된 실적 행만 계산할 수 있습니다."
    };
  }

  const existingRecord = getLatestAllowanceCalculationByApprovalId(latestApproval.id);

  if (existingRecord) {
    return {
      ok: true,
      data: existingRecord
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

  if (isPoolSubstitutePerformanceEntry(approvedEntry)) {
    const reasonText = getNonPayableSubstituteReasonText(approvedEntry);

    return {
      ok: false,
      errorCode: "ALLOWANCE_EXCLUDED_ENTRY",
      message:
        reasonText && approvedEntry.substituteAllowanceReasonCode
          ? `${reasonText} 수당 실적 계산 대상이 아닙니다.`
          : "Pool 대체근무는 수당 실적 계산 대상이 아닙니다."
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
  const record: AllowanceCalculationResultRecord = {
    id: snapshot.id,
    fileId: approvalSnapshot.fileId,
    fileName: approvalSnapshot.fileName,
    entryId: approvedEntry.id,
    employeeCode: approvedEntry.employeeCode,
    employeeName: approvedEntry.employeeName,
    employeeRank: approvedEntry.employeeRank,
    siteName: approvedEntry.siteName,
    workDate: approvedEntry.workDate,
    workType: approvedEntry.workType,
    hourlyRate: approvedEntry.hourlyRate,
    rateVersionId: selectedRate.versionId,
    rateVersionLabel: selectedRate.versionLabel,
    status: "pending",
    earlyPayoutDate: undefined,
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
        employee_rank,
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
        early_payout_date,
        signature,
        snapshot_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      snapshot.performanceApprovalId,
      record.entryId,
      snapshot.calculationVersion,
      record.status,
      record.fileId,
      record.fileName,
      record.siteName,
      record.employeeCode,
      record.employeeName,
      record.employeeRank ?? null,
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
      record.earlyPayoutDate ?? null,
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

  return runApprovedAllowanceCalculationForApproval(latestApproval);
};

export const listApprovedAllowanceCalculationResults = (): AllowanceCalculationResultRecord[] => {
  const storedResults = listStoredCalculationRecords();
  const resultsByApprovalId = new Map(
    storedResults.map((record) => [record.snapshot.performanceApprovalId, record] as const)
  );

  return listLatestApprovedPerformanceApprovalsByLogicalKey()
    .flatMap((approval) => {
      const snapshot = parsePerformanceApprovalSnapshot(approval.snapshotJson);

      if (!snapshot?.entry || isPoolSubstitutePerformanceEntry(snapshot.entry)) {
        return [];
      }

      const record = resultsByApprovalId.get(approval.id);
      return record ? [record] : [];
    })
    .sort(
      (left, right) =>
        right.workDate.localeCompare(left.workDate) ||
        left.siteName.localeCompare(right.siteName, "ko") ||
        left.employeeName.localeCompare(right.employeeName, "ko")
    );
};

export const setAllowanceCalculationEarlyPayout = (
  input: AllowanceEarlyPayoutInput
): BridgeResult<AllowanceCalculationResultRecord> => {
  const normalizedDate =
    typeof input.earlyPayoutDate === "string" && input.earlyPayoutDate.trim().length > 0
      ? input.earlyPayoutDate.trim()
      : null;

  if (normalizedDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_EARLY_PAYOUT_DATE_INVALID",
      message: "선지급 날짜 형식이 올바르지 않습니다."
    };
  }

  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    const existingRow = database.prepare(`
      SELECT *
      FROM allowance_calculations
      WHERE id = ?
    `).get(input.calculationId) as Record<string, unknown> | undefined;

    if (!existingRow) {
      return {
        ok: false,
        errorCode: "ALLOWANCE_CALCULATION_NOT_FOUND",
        message: "선지급 상태를 갱신할 수당 산출 결과를 찾을 수 없습니다."
      };
    }

    database.prepare(`
      UPDATE allowance_calculations
      SET early_payout_date = ?
      WHERE id = ?
    `).run(normalizedDate, input.calculationId);

    const updatedRow = database.prepare(`
      SELECT *
      FROM allowance_calculations
      WHERE id = ?
    `).get(input.calculationId) as Record<string, unknown>;
    const itemRows = database.prepare(`
      SELECT *
      FROM allowance_calculation_items
      WHERE calculation_id = ?
      ORDER BY allowance_code ASC
    `).all(input.calculationId) as Array<Record<string, unknown>>;

    return {
      ok: true,
      data: toCalculationResultRecord(updatedRow, itemRows)
    };
  }

  const target = calculationResultsStore.find((record) => record.id === input.calculationId);

  if (!target) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_CALCULATION_NOT_FOUND",
      message: "선지급 상태를 갱신할 수당 산출 결과를 찾을 수 없습니다."
    };
  }

  target.earlyPayoutDate = normalizedDate ?? undefined;

  return {
    ok: true,
    data: { ...target }
  };
};

export const listApprovedAllowanceTargets = () => {
  const calculatedApprovalIds = new Set(
    listStoredCalculationRecords().map((record) => record.snapshot.performanceApprovalId)
  );

  return listLatestApprovedPerformanceApprovalsByLogicalKey()
    .filter((approval) => !calculatedApprovalIds.has(approval.id))
    .flatMap((approval) => {
      const snapshot = parsePerformanceApprovalSnapshot(approval.snapshotJson);
      return snapshot?.entry && !isPoolSubstitutePerformanceEntry(snapshot.entry)
        ? [snapshot.entry]
        : [];
    })
    .sort(
      (left, right) =>
        left.workDate.localeCompare(right.workDate) ||
        left.siteName.localeCompare(right.siteName, "ko") ||
        left.employeeName.localeCompare(right.employeeName, "ko")
    );
};

export const resetApprovedAllowanceCalculationStateForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM allowance_calculation_items;");
    database.exec("DELETE FROM allowance_calculations;");
  }

  calculationResultsStore.length = 0;
};
