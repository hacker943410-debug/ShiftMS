import { randomUUID } from "node:crypto";

import {
  createAllowanceCalculationSignature,
  createAllowanceCalculationSnapshot,
  type AllowanceCalculationResultRecord,
  type AllowanceRateTable
} from "../../shared/domain/allowance-service";
import { allowanceRateVersionFixtures } from "../../shared/domain/allowance-rate-fixtures";
import { selectActiveAllowanceRateVersion } from "../../shared/domain/allowance-rate-service";
import type { BridgeResult } from "../../shared/bridge/contracts";
import { getLatestPerformanceApproval } from "./performance-approval-service";
import { getPendingPerformanceFileDetail } from "./performance-queue-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

const calculationResultsStore: AllowanceCalculationResultRecord[] = [];

const toCalculationResultRecord = (row: Record<string, unknown>): AllowanceCalculationResultRecord => ({
  id: String(row.id),
  fileId: String(row.file_id),
  fileName: String(row.file_name),
  employeeName: String(row.employee_name),
  workDate: String(row.work_date),
  rateVersionId: String(row.rate_version_id),
  rateVersionLabel: String(row.rate_version_label),
  signature: String(row.signature),
  snapshot: JSON.parse(String(row.snapshot_json))
});

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

const toRateTable = (workDate: string): {
  versionId: string;
  versionLabel: string;
  rateTable: AllowanceRateTable;
} | null => {
  const targetYear = workDate.slice(0, 4);
  const activeVersions = allowanceRateVersionFixtures.filter((item) => item.status === "active");
  const version =
    selectActiveAllowanceRateVersion({
      targetDate: workDate,
      versions: allowanceRateVersionFixtures
    }) ??
    activeVersions
      .filter((item) => String(item.year) === targetYear)
      .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ??
    activeVersions.sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];

  if (!version) {
    return null;
  }

  const findMultiplier = (allowanceCode: string, fallback: number) =>
    version.items.find((item) => item.allowanceCode === allowanceCode)?.multiplier ?? fallback;

  return {
    versionId: version.id,
    versionLabel: version.versionLabel,
    rateTable: {
      base: findMultiplier("base", 1),
      overtime: findMultiplier("overtime", 1.5),
      night: findMultiplier("night", 0.5),
      holiday: findMultiplier("holiday", 1.5),
      substitute: findMultiplier("substitute", 1)
    }
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

  const detail = await getPendingPerformanceFileDetail(fileId);

  if (!detail) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_FILE_NOT_FOUND",
      message: "계산 대상 실적 파일을 찾을 수 없습니다."
    };
  }

  const previewRow = detail.previewRows[0];

  if (!previewRow) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_PREVIEW_REQUIRED",
      message: "계산에 사용할 미리보기 행이 없습니다."
    };
  }

  const workDate = String(previewRow["근무일자"] ?? "");
  const employeeName = String(previewRow["성명"] ?? "미확인");
  const workHours = Number(previewRow["근무시간"] ?? 0);
  const derivedHourlyRate = Number(previewRow["시급"] ?? 0);
  const hourlyRate = derivedHourlyRate > 1000 ? derivedHourlyRate : 12000;
  const selectedRate = toRateTable(workDate);

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
      performanceFileId: detail.id,
      approvalStatus: "approved",
      approvedAt: latestApproval.processedAt,
      approvedBy: latestApproval.processedBy,
      holidayCalendarId: "holiday-calendar-2026",
      allowanceRateVersionId: selectedRate.versionId,
      sourceFileChecksum: detail.duplicateKey
    },
    workDate,
    timeRange: createPrototypeTimeRange(workHours),
    hourlyRate,
    rateTable: selectedRate.rateTable
  });

  const signature = createAllowanceCalculationSignature(snapshot);
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    const existingRow = database.prepare(`
      SELECT *
      FROM allowance_calculation_results
      WHERE signature = ?
      LIMIT 1
    `).get(signature) as Record<string, unknown> | undefined;

    if (existingRow) {
      return {
        ok: true,
        data: toCalculationResultRecord(existingRow)
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
    fileId: detail.id,
    fileName: detail.fileName,
    employeeName,
    workDate,
    rateVersionId: selectedRate.versionId,
    rateVersionLabel: selectedRate.versionLabel,
    signature,
    snapshot
  };

  if (database && isSqliteStorageReady()) {
    database.prepare(`
      INSERT INTO allowance_calculation_results (
        id,
        file_id,
        file_name,
        employee_name,
        work_date,
        rate_version_id,
        rate_version_label,
        signature,
        snapshot_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.fileId,
      record.fileName,
      record.employeeName,
      record.workDate,
      record.rateVersionId,
      record.rateVersionLabel,
      record.signature,
      JSON.stringify(record.snapshot),
      record.snapshot.createdAt
    );

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
        FROM allowance_calculation_results
        ORDER BY created_at DESC
      `).all() as Array<Record<string, unknown>>;

      return rows.map(toCalculationResultRecord);
    }

    return calculationResultsStore;
  })()
];

export const resetApprovedAllowanceCalculationStateForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM allowance_calculation_results;");
  }

  calculationResultsStore.length = 0;
};
