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

const calculationResultsStore: AllowanceCalculationResultRecord[] = [];

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

  calculationResultsStore.unshift(record);

  return {
    ok: true,
    data: record
  };
};

export const listApprovedAllowanceCalculationResults = (): AllowanceCalculationResultRecord[] => [
  ...calculationResultsStore
];

export const resetApprovedAllowanceCalculationStateForTest = () => {
  calculationResultsStore.length = 0;
};
