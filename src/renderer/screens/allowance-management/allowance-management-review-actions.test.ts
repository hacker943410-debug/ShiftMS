import type { ReactNode } from "react";

import { describe, expect, it, vi } from "vitest";

import type { AllowanceDocumentExportRecord } from "@shared/domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type { BridgeResult } from "@shared/bridge/contracts";

import {
  createAllowanceManagementReviewActions,
  type AllowanceReviewActionRequest
} from "./allowance-management-review-actions";

const createCalculationResult = (
  input: Partial<AllowanceCalculationResultRecord> & {
    id: string;
    employeeName: string;
    siteName: string;
    workDate: string;
  }
): AllowanceCalculationResultRecord =>
  ({
    id: input.id,
    fileId: input.fileId ?? `file-${input.id}`,
    fileName: input.fileName ?? `${input.siteName}.xlsx`,
    entryId: input.entryId ?? `entry-${input.id}`,
    employeeCode: input.employeeCode ?? `EMP-${input.id}`,
    employeeName: input.employeeName,
    siteName: input.siteName,
    workDate: input.workDate,
    workType: input.workType ?? "overtime",
    hourlyRate: input.hourlyRate ?? 15000,
    rateVersionId: input.rateVersionId ?? "rate-1",
    rateVersionLabel: input.rateVersionLabel ?? "기본",
    status: input.status ?? "approved",
    earlyPayoutDate: input.earlyPayoutDate,
    signature: input.signature ?? `signature-${input.id}`,
    snapshot:
      input.snapshot ??
      ({
        id: `snapshot-${input.id}`,
        performanceApprovalId: `approval-${input.id}`,
        calculationVersion: 1,
        businessCategoryCode: "weekday-overtime",
        businessCategoryLabel: "평일 연장",
        breakdown: {
          totalWorkMinutes: 180,
          baseWorkMinutes: 60,
          overtimeMinutes: 120,
          nightMinutes: 0,
          holidayMinutes: 0,
          substituteMinutes: 0
        },
        lines: [],
        totalAllowanceAmount: 45000,
        createdAt: `${input.workDate}T09:00:00.000Z`
      } as AllowanceCalculationResultRecord["snapshot"])
  }) satisfies AllowanceCalculationResultRecord;

const createBridgeResult = <T,>(data: T): BridgeResult<T> => ({
  ok: true,
  data
});

const createBridgeFailure = <T,>(message: string): BridgeResult<T> => ({
  ok: false,
  errorCode: "TEST_ERROR",
  message
});

const createExportRecord = (
  overrides?: Partial<AllowanceDocumentExportRecord>
): AllowanceDocumentExportRecord => ({
  id: overrides?.id ?? "export-1",
  workMonth: overrides?.workMonth ?? "2026-04",
  outputFormat: overrides?.outputFormat ?? "pdf",
  calculationIds: overrides?.calculationIds ?? ["calc-1"],
  calculationCount: overrides?.calculationCount ?? 1,
  employeeCount: overrides?.employeeCount ?? 1,
  totalAllowanceAmount: overrides?.totalAllowanceAmount ?? 45000,
  proposalTemplateVersionId: overrides?.proposalTemplateVersionId,
  attachment1TemplateVersionId: overrides?.attachment1TemplateVersionId,
  attachment2TemplateVersionId: overrides?.attachment2TemplateVersionId,
  proposalFileName: overrides?.proposalFileName ?? "proposal.pdf",
  proposalPath: overrides?.proposalPath ?? "C:/temp/proposal.pdf",
  attachment1FileName: overrides?.attachment1FileName ?? "attachment1.pdf",
  attachment1Path: overrides?.attachment1Path ?? "C:/temp/attachment1.pdf",
  attachment2FileName: overrides?.attachment2FileName ?? "attachment2.pdf",
  attachment2Path: overrides?.attachment2Path ?? "C:/temp/attachment2.pdf",
  exportedAt: overrides?.exportedAt ?? "2026-04-15T08:00:00.000Z"
});

const createTestContext = (overrides?: {
  askQuestion?: ReturnType<typeof vi.fn>;
  exportableResults?: AllowanceCalculationResultRecord[];
  results?: AllowanceCalculationResultRecord[];
  showGuidance?: ReturnType<typeof vi.fn>;
}) => {
  const askQuestion =
    overrides?.askQuestion ??
    vi.fn().mockResolvedValue({
      confirmed: true
    });
  const setActionError = vi.fn();
  const setActionMessage = vi.fn();
  const setIsProcessing = vi.fn();
  const setProcessingKey = vi.fn();
  const incrementRefreshKey = vi.fn();
  const focusOverviewKeywordInput = vi.fn();
  const buildDocumentExportCompletionDescription = vi
    .fn<(record: AllowanceDocumentExportRecord) => ReactNode>()
    .mockReturnValue("문서 설명");
  const formatDocumentOutputFormatLabel = vi
    .fn<(format: AllowanceDocumentExportRecord["outputFormat"]) => string>()
    .mockImplementation((format) => (format === "pdf" ? "PDF" : "Excel"));
  const getErrorMessage = vi.fn().mockReturnValue("처리 중 오류가 발생했습니다.");
  const bridge = {
    listPerformanceOverview: vi.fn().mockResolvedValue(
      createBridgeResult({
        groups: [
          {
            rows: [
              {
                fileId: "file-calc-1",
                sourceDirectoryType: "approved",
                sourceFileExists: true
              }
            ]
          }
        ]
      } as {
        groups: Array<{
          rows: Array<{
            fileId: string;
            sourceDirectoryType: string;
            sourceFileExists: boolean;
          }>;
        }>;
      })
    ),
    reviewAllowanceCalculations: vi.fn().mockResolvedValue(
      createBridgeResult([
        {
          id: "approval-1"
        }
      ])
    ),
    exportAllowanceDocuments: vi.fn().mockResolvedValue(createBridgeResult(createExportRecord()))
  };

  const actions = createAllowanceManagementReviewActions({
    askQuestion,
    bridge,
    buildDocumentExportCompletionDescription,
    exportableResults:
      overrides?.exportableResults ??
      [
        createCalculationResult({
          id: "calc-1",
          employeeName: "홍길동",
          siteName: "본관",
          workDate: "2026-04-10"
        })
      ],
    focusOverviewKeywordInput,
    formatDocumentOutputFormatLabel,
    getErrorMessage,
    incrementRefreshKey,
    results:
      overrides?.results ??
      [
        createCalculationResult({
          id: "calc-1",
          employeeName: "홍길동",
          siteName: "본관",
          workDate: "2026-04-10"
        })
      ],
    setActionError,
    setActionMessage,
    setIsProcessing,
    setProcessingKey,
    showGuidance: overrides?.showGuidance
  });

  return {
    actions,
    askQuestion,
    bridge,
    buildDocumentExportCompletionDescription,
    focusOverviewKeywordInput,
    formatDocumentOutputFormatLabel,
    incrementRefreshKey,
    setActionError,
    setActionMessage,
    setIsProcessing,
    setProcessingKey,
    showGuidance: overrides?.showGuidance
  };
};

describe("createAllowanceManagementReviewActions", () => {
  it("should reject empty review requests before prompting", async () => {
    const context = createTestContext();

    await context.actions.handleReviewCalculations({
      calculationIds: [],
      decision: "approved",
      scopeLabel: "본관"
    });

    expect(context.setActionError).toHaveBeenCalledWith("승인할 수당 산출 결과가 없습니다.");
    expect(context.askQuestion).not.toHaveBeenCalled();
    expect(context.bridge.reviewAllowanceCalculations).not.toHaveBeenCalled();
  });

  it("should require a rejection comment for synced site rejects", async () => {
    const askQuestion = vi
      .fn()
      .mockResolvedValueOnce({
        confirmed: true,
        inputValue: "   "
      });
    const context = createTestContext({ askQuestion });

    await context.actions.handleReviewCalculations({
      calculationIds: ["calc-1"],
      decision: "rejected",
      scopeLabel: "본관",
      syncPerformanceSiteReject: true
    });

    expect(context.setActionError).toHaveBeenCalledWith("근무지 반려 사유를 입력해 주세요.");
    expect(context.focusOverviewKeywordInput).toHaveBeenCalledTimes(1);
    expect(context.bridge.reviewAllowanceCalculations).not.toHaveBeenCalled();
  });

  it("should stop synced site reject when approved file warning is cancelled", async () => {
    const askQuestion = vi
      .fn()
      .mockResolvedValueOnce({
        confirmed: true,
        inputValue: "사유"
      })
      .mockResolvedValueOnce({
        confirmed: true
      })
      .mockResolvedValueOnce({
        confirmed: false
      });
    const context = createTestContext({
      askQuestion,
      results: [
        createCalculationResult({
          id: "calc-1",
          employeeName: "홍길동",
          siteName: "본관",
          workDate: "2026-04-10",
          fileId: "file-calc-1"
        })
      ]
    });
    context.bridge.listPerformanceOverview.mockResolvedValue(
      createBridgeResult({
        groups: []
      } as { groups: Array<{ rows?: unknown[] }> })
    );

    await context.actions.handleReviewCalculations({
      calculationIds: ["calc-1"],
      decision: "rejected",
      scopeLabel: "본관",
      syncPerformanceSiteReject: true
    });

    expect(context.focusOverviewKeywordInput).toHaveBeenCalledTimes(1);
    expect(context.bridge.reviewAllowanceCalculations).not.toHaveBeenCalled();
  });

  it("should guide the user (and not proceed) when the approved file is missing and guidance is available", async () => {
    const showGuidance = vi.fn();
    const askQuestion = vi
      .fn()
      .mockResolvedValueOnce({ confirmed: true, inputValue: "사유" })
      .mockResolvedValueOnce({ confirmed: true });
    const context = createTestContext({
      askQuestion,
      showGuidance,
      results: [
        createCalculationResult({
          id: "calc-1",
          employeeName: "홍길동",
          siteName: "본관",
          workDate: "2026-04-10",
          fileId: "file-calc-1"
        })
      ]
    });
    context.bridge.listPerformanceOverview.mockResolvedValue(
      createBridgeResult({ groups: [] } as { groups: Array<{ rows?: unknown[] }> })
    );

    await context.actions.handleReviewCalculations({
      calculationIds: ["calc-1"],
      decision: "rejected",
      scopeLabel: "본관",
      syncPerformanceSiteReject: true
    });

    expect(showGuidance).toHaveBeenCalledTimes(1);
    expect(showGuidance).toHaveBeenCalledWith(
      expect.objectContaining({
        navigation: expect.objectContaining({ route: "performance" })
      })
    );
    // The terse "계속 진행" confirm prompt must NOT fire, and the reject must NOT proceed.
    expect(context.askQuestion).toHaveBeenCalledTimes(2);
    expect(context.bridge.reviewAllowanceCalculations).not.toHaveBeenCalled();
    expect(context.focusOverviewKeywordInput).toHaveBeenCalledTimes(1);
  });

  it("should review calculations and refresh on success", async () => {
    const askQuestion = vi.fn().mockResolvedValue({
      confirmed: true
    });
    const context = createTestContext({ askQuestion });
    const request: AllowanceReviewActionRequest = {
      calculationIds: ["calc-1"],
      decision: "approved",
      scopeLabel: "본관"
    };

    await context.actions.handleReviewCalculations(request);

    expect(context.bridge.reviewAllowanceCalculations).toHaveBeenCalledWith({
      calculationIds: ["calc-1"],
      decision: "approved",
      comment: undefined,
      syncPerformanceSiteReject: undefined
    });
    expect(context.setProcessingKey).toHaveBeenNthCalledWith(1, "review:approved:calc-1");
    expect(context.setProcessingKey).toHaveBeenLastCalledWith(null);
    expect(context.setActionMessage).toHaveBeenCalledWith("본관 승인 1건을 반영했습니다.");
    expect(context.incrementRefreshKey).toHaveBeenCalledTimes(1);
  });

  it("should export documents and show completion dialog", async () => {
    const askQuestion = vi.fn().mockResolvedValue({
      confirmed: true
    });
    const context = createTestContext({ askQuestion });

    await context.actions.handleExportDocuments("pdf");

    expect(context.bridge.exportAllowanceDocuments).toHaveBeenCalledWith({
      calculationIds: ["calc-1"],
      outputFormat: "pdf"
    });
    expect(context.buildDocumentExportCompletionDescription).toHaveBeenCalledWith(
      expect.objectContaining({
        workMonth: "2026-04"
      })
    );
    expect(context.askQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "문서 출력 완료",
        description: "문서 설명"
      })
    );
    expect(context.setActionMessage).toHaveBeenLastCalledWith(
      "2026-04 PDF 문서 출력이 완료되었습니다. 품의서/별첨1/별첨2 지정 경로에 저장했습니다."
    );
    expect(context.incrementRefreshKey).toHaveBeenCalledTimes(1);
  });

  it("should show an internal dialog when document export fails", async () => {
    const askQuestion = vi.fn().mockResolvedValue({
      confirmed: true
    });
    const context = createTestContext({ askQuestion });

    context.bridge.exportAllowanceDocuments.mockResolvedValueOnce(
      createBridgeFailure("저장 경로를 찾지 못했습니다.\n- C:/exports/2026년/04월/2026_04_품의서.pdf")
    );

    await context.actions.handleExportDocuments("pdf");

    expect(context.setActionError).toHaveBeenCalledWith(expect.stringContaining("저장 경로"));
    expect(context.askQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "문서 출력 실패",
        message: "PDF 문서 출력에 실패했습니다.",
        description: expect.stringContaining("2026_04_품의서.pdf")
      })
    );
    expect(context.incrementRefreshKey).not.toHaveBeenCalled();
  });
});
