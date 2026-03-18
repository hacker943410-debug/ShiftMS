import { createAllowanceCalculationSnapshot } from "../../shared/domain/allowance-service";
import { buildAllowanceRateTable, resolveAllowanceRateCategoryCode } from "../../shared/domain/allowance-rate-matrix";
import type {
  AllowancePreviewInput,
  BridgeResult
} from "../../shared/bridge/contracts";

export const previewAllowanceCalculation = (
  input: AllowancePreviewInput
): BridgeResult<ReturnType<typeof createAllowanceCalculationSnapshot>> => {
  try {
    const result = createAllowanceCalculationSnapshot({
      calculationId: "preview-calculation",
      performanceApprovalId: "preview-approval",
      calculationVersion: 1,
      createdAt: new Date().toISOString(),
      approvedSnapshot: {
        performanceFileId: "preview-file",
        approvalStatus: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: "system-preview",
        holidayCalendarId: "preview-holiday-calendar",
        allowanceRateVersionId: "preview-rate-version",
        sourceFileChecksum: "preview-checksum"
      },
      workDate: input.workDate,
      timeRange: {
        startTime: input.startTime,
        endTime: input.endTime,
        breakMinutes: input.breakMinutes
      },
      hourlyRate: input.hourlyRate,
      isHoliday: input.isHoliday,
      workType: input.workType,
      allowanceCategoryCode: resolveAllowanceRateCategoryCode({
        isHoliday: input.isHoliday,
        workType: input.workType
      }),
      rateTable: buildAllowanceRateTable()
    });

    return {
      ok: true,
      data: result
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_PREVIEW_FAILED",
      message: error instanceof Error ? error.message : "Unknown error"
    };
  }
};
