import { describe, expect, it, vi } from "vitest";

import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type {
  AllowanceProposalApprovalRecord,
  AllowanceProposalPreview
} from "@shared/domain/allowance-workflow";
import type { BridgeResult } from "@shared/bridge/contracts";

import { createAllowanceManagementModalActions } from "./allowance-management-modal-actions";
import type {
  EarlyPayoutEditorState,
  ProposalPreviewModalState
} from "./useAllowanceManagementModalState";

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

const createProposalPreview = (
  input?: Partial<AllowanceProposalPreview>
): AllowanceProposalPreview => ({
  workMonth: input?.workMonth ?? "2026-04",
  generatedAt: input?.generatedAt ?? "2026-04-14T09:00:00.000Z",
  calculationCount: input?.calculationCount ?? 2,
  employeeCount: input?.employeeCount ?? 2,
  totalAllowanceAmount: input?.totalAllowanceAmount ?? 100000,
  regularTotalAllowanceAmount: input?.regularTotalAllowanceAmount ?? 80000,
  earlyPayoutTotalAllowanceAmount: input?.earlyPayoutTotalAllowanceAmount ?? 20000,
  rows: input?.rows ?? [],
  regularSiteSummaries: input?.regularSiteSummaries ?? [],
  earlyPayoutSiteSummaries: input?.earlyPayoutSiteSummaries ?? []
});

const createProposalApprovalRecord = (
  input?: Partial<AllowanceProposalApprovalRecord>
): AllowanceProposalApprovalRecord =>
  ({
    id: input?.id ?? "proposal-1",
    workMonth: input?.workMonth ?? "2026-04",
    calculationIds: input?.calculationIds ?? ["calc-1", "calc-2"],
    calculationCount: input?.calculationCount ?? 2,
    employeeCount: input?.employeeCount ?? 2,
    totalAllowanceAmount: input?.totalAllowanceAmount ?? 100000,
    regularTotalAllowanceAmount: input?.regularTotalAllowanceAmount ?? 80000,
    earlyPayoutTotalAllowanceAmount: input?.earlyPayoutTotalAllowanceAmount ?? 20000,
    exportRecordId: input?.exportRecordId ?? "export-1",
    outputFormat: input?.outputFormat ?? "pdf",
    approvedAt: input?.approvedAt ?? "2026-04-15T08:00:00.000Z",
    approvedBy: input?.approvedBy ?? "admin",
    approvedByName: input?.approvedByName ?? "관리자",
    comment: input?.comment,
    previewSnapshot: input?.previewSnapshot ?? createProposalPreview(),
    backupSummary:
      input?.backupSummary ?? {
        createdAt: "2026-04-15T08:00:00.000Z",
        jsonBackupPath: "C:/temp/backup.json",
        warningMessages: []
      }
  }) satisfies AllowanceProposalApprovalRecord;

const createBridgeResult = <T,>(data: T): BridgeResult<T> => ({
  ok: true,
  data
});

const createEarlyPayoutEditor = (
  overrides?: Partial<EarlyPayoutEditorState>
): EarlyPayoutEditorState => ({
  calculationId: overrides?.calculationId ?? "calc-1",
  employeeName: overrides?.employeeName ?? "홍길동",
  siteName: overrides?.siteName ?? "본관",
  value: overrides?.value ?? "2026-04-20",
  existingValue: overrides?.existingValue
});

const createDraftProposalModal = (
  overrides?: Partial<ProposalPreviewModalState>
): ProposalPreviewModalState => ({
  mode: "draft",
  calculationIds: overrides?.calculationIds ?? ["calc-1", "calc-2"],
  preview: overrides?.preview ?? createProposalPreview(),
  record: overrides?.record
});

const createTestContext = (overrides?: {
  askQuestion?: ReturnType<typeof vi.fn>;
  earlyPayoutEditor?: EarlyPayoutEditorState | null;
  proposalCandidateResults?: AllowanceCalculationResultRecord[];
  proposalComment?: string;
  proposalPreviewModal?: ProposalPreviewModalState | null;
}) => {
  const askQuestion =
    overrides?.askQuestion ??
    vi.fn().mockResolvedValue({
      confirmed: true
    });
  const closeEarlyPayoutEditor = vi.fn();
  const closeProposalPreview = vi.fn();
  const incrementRefreshKey = vi.fn();
  const openDraftProposalPreview = vi.fn();
  const setActionError = vi.fn();
  const setActionMessage = vi.fn();
  const setIsProcessing = vi.fn();
  const setProcessingKey = vi.fn();
  const showProposalApprovalFailureDialog = vi.fn().mockResolvedValue(undefined);
  const buildBackupCompletionDescription = vi.fn().mockReturnValue("백업 설명");
  const getErrorMessage = vi.fn().mockReturnValue("처리 중 오류가 발생했습니다.");
  const formatDateValue = vi.fn((value?: string) => value ?? "-");
  const bridge = {
    setCalculationEarlyPayout: vi
      .fn()
      .mockResolvedValue(createBridgeResult(createCalculationResult({
        id: "calc-1",
        employeeName: "홍길동",
        siteName: "본관",
        workDate: "2026-04-10"
      }))),
    previewAllowanceProposal: vi
      .fn()
      .mockResolvedValue(createBridgeResult(createProposalPreview())),
    approveAllowanceProposal: vi
      .fn()
      .mockResolvedValue(createBridgeResult(createProposalApprovalRecord()))
  };

  const actions = createAllowanceManagementModalActions({
    askQuestion,
    bridge,
    buildBackupCompletionDescription,
    closeEarlyPayoutEditor,
    closeProposalPreview,
    earlyPayoutEditor: overrides?.earlyPayoutEditor ?? createEarlyPayoutEditor(),
    formatDateValue,
    getErrorMessage,
    incrementRefreshKey,
    openDraftProposalPreview,
    proposalCandidateResults:
      overrides?.proposalCandidateResults ??
      [
        createCalculationResult({
          id: "calc-1",
          employeeName: "홍길동",
          siteName: "본관",
          workDate: "2026-04-10"
        }),
        createCalculationResult({
          id: "calc-2",
          employeeName: "김영희",
          siteName: "별관",
          workDate: "2026-04-11"
        })
      ],
    proposalComment: overrides?.proposalComment ?? "  품의 메모  ",
    proposalPreviewModal: overrides?.proposalPreviewModal ?? createDraftProposalModal(),
    setActionError,
    setActionMessage,
    setIsProcessing,
    setProcessingKey,
    showProposalApprovalFailureDialog
  });

  return {
    actions,
    askQuestion,
    bridge,
    buildBackupCompletionDescription,
    closeEarlyPayoutEditor,
    closeProposalPreview,
    formatDateValue,
    getErrorMessage,
    incrementRefreshKey,
    openDraftProposalPreview,
    setActionError,
    setActionMessage,
    setIsProcessing,
    setProcessingKey,
    showProposalApprovalFailureDialog
  };
};

describe("createAllowanceManagementModalActions", () => {
  it("should require a date before saving early payout", async () => {
    const context = createTestContext({
      earlyPayoutEditor: createEarlyPayoutEditor({ value: "" })
    });

    await context.actions.handleSaveEarlyPayout();

    expect(context.setActionError).toHaveBeenCalledWith("선지급 날짜를 선택해 주세요.");
    expect(context.askQuestion).not.toHaveBeenCalled();
    expect(context.bridge.setCalculationEarlyPayout).not.toHaveBeenCalled();
  });

  it("should save early payout and refresh on success", async () => {
    const context = createTestContext();

    await context.actions.handleSaveEarlyPayout();

    expect(context.askQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "선지급 처리 확인",
        confirmLabel: "처리"
      })
    );
    expect(context.bridge.setCalculationEarlyPayout).toHaveBeenCalledWith({
      calculationId: "calc-1",
      earlyPayoutDate: "2026-04-20"
    });
    expect(context.setProcessingKey).toHaveBeenNthCalledWith(1, "early-payout:calc-1");
    expect(context.setProcessingKey).toHaveBeenLastCalledWith(null);
    expect(context.closeEarlyPayoutEditor).toHaveBeenCalledTimes(1);
    expect(context.incrementRefreshKey).toHaveBeenCalledTimes(1);
    expect(context.setActionMessage).toHaveBeenLastCalledWith(
      "홍길동 실적에 선지급 2026-04-20을 반영했습니다."
    );
  });

  it("should stop when early payout clear is not confirmed", async () => {
    const askQuestion = vi.fn().mockResolvedValue({ confirmed: false });
    const context = createTestContext({ askQuestion });

    await context.actions.handleClearEarlyPayout();

    expect(context.askQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "선지급 취소 확인",
        confirmLabel: "취소"
      })
    );
    expect(context.bridge.setCalculationEarlyPayout).not.toHaveBeenCalled();
    expect(context.closeEarlyPayoutEditor).not.toHaveBeenCalled();
  });

  it("should preview proposal for candidate results", async () => {
    const context = createTestContext();

    await context.actions.handleOpenProposalPreview();

    expect(context.bridge.previewAllowanceProposal).toHaveBeenCalledWith({
      calculationIds: ["calc-1", "calc-2"]
    });
    expect(context.openDraftProposalPreview).toHaveBeenCalledWith({
      calculationIds: ["calc-1", "calc-2"],
      preview: expect.objectContaining({
        workMonth: "2026-04"
      })
    });
    expect(context.setProcessingKey).toHaveBeenNthCalledWith(1, "proposal-preview");
    expect(context.setProcessingKey).toHaveBeenLastCalledWith(null);
  });

  it("should approve proposal and show backup completion dialog", async () => {
    const askQuestion = vi
      .fn()
      .mockResolvedValueOnce({ confirmed: true })
      .mockResolvedValueOnce({ confirmed: true });
    const context = createTestContext({ askQuestion });

    await context.actions.handleApproveProposal();

    expect(context.bridge.approveAllowanceProposal).toHaveBeenCalledWith({
      calculationIds: ["calc-1", "calc-2"],
      comment: "품의 메모",
      outputFormat: "pdf"
    });
    expect(context.closeProposalPreview).toHaveBeenCalledTimes(1);
    expect(context.incrementRefreshKey).toHaveBeenCalledTimes(1);
    expect(context.buildBackupCompletionDescription).toHaveBeenCalledWith({
      baseDescription: "2026-04 품의 승인 PDF 문서 출력과 자동 백업을 저장했습니다.",
      warningMessages: []
    });
    expect(context.askQuestion).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: "백업 완료",
        description: "백업 설명"
      })
    );
    expect(context.setActionMessage).toHaveBeenLastCalledWith("2026-04 품의 승인을 완료했습니다.");
    expect(context.showProposalApprovalFailureDialog).not.toHaveBeenCalled();
  });
});
