import { randomUUID } from "node:crypto";

import { allowanceRateVersionFixtures } from "../../shared/domain/allowance-rate-fixtures";
import {
  buildAllowanceRateTable,
  resolveAllowanceRateCategoryCode,
  type AllowanceRateCategoryCode
} from "../../shared/domain/allowance-rate-matrix";
import { selectActiveAllowanceRateVersion } from "../../shared/domain/allowance-rate-service";
import { createAllowanceCalculationSignature, createAllowanceCalculationSnapshot } from "../../shared/domain/allowance-service";
import { calculateWorkBreakdown } from "../../shared/domain/calculation";
import type {
  AllowanceRateVersion,
  WorkType
} from "../../shared/domain/model";
import { listStoredAllowanceRateVersions } from "./operations-storage-service";
import { parsePerformanceApprovalSnapshot } from "./performance-approval-snapshot-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface RepairSummary {
  repairedEntryCount: number;
  repairedApprovalCount: number;
  repairedCalculationCount: number;
}

const resolveRateVersion = (input: {
  rateVersionId?: string | null;
  workDate: string;
}) => {
  const storedVersions = listStoredAllowanceRateVersions();
  const versions: AllowanceRateVersion[] =
    storedVersions.length > 0 ? storedVersions : allowanceRateVersionFixtures;
  const exactVersion = input.rateVersionId
    ? versions.find((item) => item.id === input.rateVersionId)
    : null;

  if (exactVersion) {
    return exactVersion;
  }

  return (
    selectActiveAllowanceRateVersion({
      targetDate: input.workDate,
      versions
    }) ??
    versions
      .filter((item) => String(item.year) === input.workDate.slice(0, 4))
      .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ??
    versions.sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ??
    null
  );
};

const resolveBusinessCategoryCode = (
  storedCategoryCode: unknown,
  workType: WorkType
): AllowanceRateCategoryCode =>
  typeof storedCategoryCode === "string"
    ? (storedCategoryCode as AllowanceRateCategoryCode)
    : resolveAllowanceRateCategoryCode({
        workType,
        isHoliday: false
      });

const rebuildAllowanceCalculation = (
  database: ReturnType<typeof getSqliteDatabase>,
  approvalId: string,
  entry: {
    id: string;
    performanceFileId: string;
    logicalKey: string;
    workDate: string;
    workType: WorkType;
    startTime?: string;
    endTime?: string;
    breakMinutes: number;
    hourlyRate?: number;
  }
) => {
  if (!database || !entry.startTime || !entry.endTime || !entry.hourlyRate || entry.hourlyRate <= 0) {
    return false;
  }

  const calculationRow = database.prepare(`
    SELECT *
    FROM allowance_calculations
    WHERE performance_approval_id = ?
  `).get(approvalId) as Record<string, unknown> | undefined;

  if (!calculationRow) {
    return false;
  }

  const calculationSnapshot = JSON.parse(String(calculationRow.snapshot_json ?? "{}")) as Record<
    string,
    unknown
  >;
  const businessCategoryCode = resolveBusinessCategoryCode(
    calculationSnapshot.businessCategoryCode,
    entry.workType
  );
  const rateVersion = resolveRateVersion({
    rateVersionId: typeof calculationRow.rate_version_id === "string"
      ? String(calculationRow.rate_version_id)
      : null,
    workDate: entry.workDate
  });
  const rebuiltSnapshot = createAllowanceCalculationSnapshot({
    calculationId: String(calculationRow.id),
    performanceApprovalId: approvalId,
    calculationVersion: Number(calculationRow.calculation_version ?? 1),
    createdAt: String(calculationRow.created_at),
    approvedSnapshot: {
      performanceFileId: entry.performanceFileId,
      performanceEntryId: entry.id,
      approvalStatus: "approved",
      approvedAt: String(calculationRow.created_at),
      approvedBy: "system-repair",
      holidayCalendarId: `repair-${entry.workDate.slice(0, 4)}`,
      allowanceRateVersionId: rateVersion?.id ?? String(calculationRow.rate_version_id ?? ""),
      sourceFileChecksum: entry.logicalKey
    },
    workDate: entry.workDate,
    timeRange: {
      startTime: entry.startTime,
      endTime: entry.endTime,
      breakMinutes: entry.breakMinutes
    },
    hourlyRate: entry.hourlyRate,
    workType: entry.workType,
    allowanceCategoryCode: businessCategoryCode,
    rateTable: buildAllowanceRateTable(rateVersion)
  });

  database.prepare(`
    UPDATE allowance_calculations
    SET total_work_minutes = ?,
        base_work_minutes = ?,
        overtime_minutes = ?,
        night_minutes = ?,
        holiday_minutes = ?,
        substitute_minutes = ?,
        total_allowance_amount = ?,
        signature = ?,
        snapshot_json = ?
    WHERE id = ?
  `).run(
    rebuiltSnapshot.breakdown.totalWorkMinutes,
    rebuiltSnapshot.breakdown.baseWorkMinutes,
    rebuiltSnapshot.breakdown.overtimeMinutes,
    rebuiltSnapshot.breakdown.nightMinutes,
    rebuiltSnapshot.breakdown.holidayMinutes,
    rebuiltSnapshot.breakdown.substituteMinutes,
    rebuiltSnapshot.totalAllowanceAmount,
    createAllowanceCalculationSignature(rebuiltSnapshot),
    JSON.stringify(rebuiltSnapshot),
    String(calculationRow.id)
  );

  database.prepare(`
    DELETE FROM allowance_calculation_items
    WHERE calculation_id = ?
  `).run(String(calculationRow.id));

  rebuiltSnapshot.lines.forEach((line) => {
    database.prepare(`
      INSERT INTO allowance_calculation_items (
        id,
        calculation_id,
        allowance_code,
        work_minutes,
        multiplier,
        amount,
        detail_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `repair-item-${randomUUID()}`,
      String(calculationRow.id),
      line.allowanceCode,
      line.workMinutes,
      line.multiplier,
      line.amount,
      null
    );
  });

  return true;
};

export const repairStoredOvertimePerformanceData = (): RepairSummary => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return {
      repairedEntryCount: 0,
      repairedApprovalCount: 0,
      repairedCalculationCount: 0
    };
  }

  const rows = database.prepare(`
    SELECT *
    FROM performance_entries
    WHERE work_type = 'overtime'
      AND start_time IS NOT NULL
      AND end_time IS NOT NULL
      AND base_work_minutes > 0
  `).all() as Array<Record<string, unknown>>;

  let repairedEntryCount = 0;
  let repairedApprovalCount = 0;
  let repairedCalculationCount = 0;

  rows.forEach((row) => {
    const breakdown = calculateWorkBreakdown({
      workType: "overtime",
      timeRange: {
        startTime: String(row.start_time),
        endTime: String(row.end_time),
        breakMinutes: Number(row.break_minutes ?? 0)
      }
    });
    const currentBaseMinutes = Number(row.base_work_minutes ?? 0);
    const currentOvertimeMinutes = Number(row.overtime_minutes ?? 0);
    const currentNightMinutes = Number(row.night_minutes ?? 0);

    if (
      currentBaseMinutes === breakdown.baseWorkMinutes &&
      currentOvertimeMinutes === breakdown.overtimeMinutes &&
      currentNightMinutes === breakdown.nightMinutes
    ) {
      return;
    }

    database.prepare(`
      UPDATE performance_entries
      SET total_work_minutes = ?,
          work_hours = ?,
          base_work_minutes = ?,
          overtime_minutes = ?,
          night_minutes = ?
      WHERE id = ?
    `).run(
      breakdown.totalWorkMinutes,
      breakdown.totalWorkMinutes / 60,
      breakdown.baseWorkMinutes,
      breakdown.overtimeMinutes,
      breakdown.nightMinutes,
      String(row.id)
    );
    repairedEntryCount += 1;

    const approvals = database.prepare(`
      SELECT *
      FROM performance_approvals
      WHERE entry_id = ?
        AND decision = 'approved'
    `).all(String(row.id)) as Array<Record<string, unknown>>;

    approvals.forEach((approval) => {
      const parsedSnapshot = parsePerformanceApprovalSnapshot(
        typeof approval.snapshot_json === "string" ? String(approval.snapshot_json) : undefined
      );

      if (!parsedSnapshot?.entry) {
        return;
      }

      const repairedEntry = {
        ...parsedSnapshot.entry,
        totalWorkMinutes: breakdown.totalWorkMinutes,
        baseWorkMinutes: breakdown.baseWorkMinutes,
        overtimeMinutes: breakdown.overtimeMinutes,
        nightMinutes: breakdown.nightMinutes,
        workHours: breakdown.totalWorkMinutes / 60
      };
      const repairedSnapshotJson = JSON.stringify({
        ...parsedSnapshot,
        entry: repairedEntry
      });

      database.prepare(`
        UPDATE performance_approvals
        SET snapshot_json = ?
        WHERE id = ?
      `).run(repairedSnapshotJson, String(approval.id));
      repairedApprovalCount += 1;

      if (
        rebuildAllowanceCalculation(database, String(approval.id), {
          id: repairedEntry.id,
          performanceFileId: repairedEntry.performanceFileId,
          logicalKey: repairedEntry.logicalKey,
          workDate: repairedEntry.workDate,
          workType: repairedEntry.workType,
          startTime: repairedEntry.startTime,
          endTime: repairedEntry.endTime,
          breakMinutes: repairedEntry.breakMinutes,
          hourlyRate: repairedEntry.hourlyRate
        })
      ) {
        repairedCalculationCount += 1;
      }
    });
  });

  return {
    repairedEntryCount,
    repairedApprovalCount,
    repairedCalculationCount
  };
};
