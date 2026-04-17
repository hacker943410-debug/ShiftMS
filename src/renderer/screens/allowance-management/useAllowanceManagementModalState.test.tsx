// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type { AllowanceProposalApprovalRecord } from "@shared/domain/allowance-workflow";

import { useAllowanceManagementModalState } from "./useAllowanceManagementModalState";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];
let latestState: ReturnType<typeof useAllowanceManagementModalState> | null = null;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const HookHarness = () => {
  latestState = useAllowanceManagementModalState();
  return null;
};

const renderHookHarness = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(<HookHarness />);
  });

  if (!latestState) {
    throw new Error("modal state hook did not initialize");
  }

  return latestState;
};

afterEach(async () => {
  latestState = null;

  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();

    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
  }

  mountedContainers.splice(0).forEach((container) => {
    container.remove();
  });
});

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

const createProposalApprovalRecord = (
  input: Partial<AllowanceProposalApprovalRecord> & { id: string; approvedAt: string }
): AllowanceProposalApprovalRecord =>
  ({
    id: input.id,
    workMonth: input.workMonth ?? "2026-04",
    calculationIds: input.calculationIds ?? ["calc-1"],
    calculationCount: input.calculationCount ?? 1,
    employeeCount: input.employeeCount ?? 1,
    totalAllowanceAmount: input.totalAllowanceAmount ?? 45000,
    regularTotalAllowanceAmount: input.regularTotalAllowanceAmount ?? 45000,
    earlyPayoutTotalAllowanceAmount: input.earlyPayoutTotalAllowanceAmount ?? 0,
    exportRecordId: input.exportRecordId ?? "export-1",
    outputFormat: input.outputFormat ?? "pdf",
    approvedAt: input.approvedAt,
    approvedBy: input.approvedBy ?? "admin",
    approvedByName: input.approvedByName ?? "관리자",
    comment: input.comment,
    previewSnapshot:
      input.previewSnapshot ??
      {
        workMonth: "2026-04",
        generatedAt: input.approvedAt,
        calculationCount: 1,
        employeeCount: 1,
        totalAllowanceAmount: 45000,
        regularTotalAllowanceAmount: 45000,
        earlyPayoutTotalAllowanceAmount: 0,
        rows: [],
        regularSiteSummaries: [],
        earlyPayoutSiteSummaries: []
      },
    backupSummary:
      input.backupSummary ??
      {
        createdAt: input.approvedAt,
        jsonBackupPath: "C:/temp/backup.json",
        warningMessages: []
      }
  }) satisfies AllowanceProposalApprovalRecord;

describe("useAllowanceManagementModalState", () => {
  it("should open, update, and close early payout editor", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.openEarlyPayoutEditor(
        createCalculationResult({
          id: "calc-1",
          employeeName: "홍길동",
          siteName: "본관",
          workDate: "2026-04-10"
        }),
        "2026-04-20"
      );
    });

    expect(latestState?.earlyPayoutEditor).toMatchObject({
      calculationId: "calc-1",
      employeeName: "홍길동",
      siteName: "본관",
      value: "2026-04-20"
    });

    await act(async () => {
      latestState?.updateEarlyPayoutValue("2026-04-25");
    });

    expect(latestState?.earlyPayoutEditor?.value).toBe("2026-04-25");

    await act(async () => {
      latestState?.closeEarlyPayoutEditor();
    });

    expect(latestState?.earlyPayoutEditor).toBeNull();
  });

  it("should keep existing early payout date when opening editor", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.openEarlyPayoutEditor(
        createCalculationResult({
          id: "calc-2",
          employeeName: "김영희",
          siteName: "별관",
          workDate: "2026-04-11",
          earlyPayoutDate: "2026-04-18"
        }),
        "2026-04-20"
      );
    });

    expect(latestState?.earlyPayoutEditor).toMatchObject({
      existingValue: "2026-04-18",
      value: "2026-04-18"
    });
  });

  it("should open draft proposal preview and clear comment on close", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.openDraftProposalPreview({
        calculationIds: ["calc-1", "calc-2"],
        preview: {
          workMonth: "2026-04",
          generatedAt: "2026-04-14T09:00:00.000Z",
          calculationCount: 2,
          employeeCount: 2,
          totalAllowanceAmount: 100000,
          regularTotalAllowanceAmount: 80000,
          earlyPayoutTotalAllowanceAmount: 20000,
          rows: [],
          regularSiteSummaries: [],
          earlyPayoutSiteSummaries: []
        }
      });
      state.setProposalComment("임시 메모");
    });

    expect(latestState?.proposalPreviewModal).toMatchObject({
      mode: "draft",
      calculationIds: ["calc-1", "calc-2"]
    });
    expect(latestState?.proposalComment).toBe("임시 메모");

    await act(async () => {
      latestState?.closeProposalPreview();
    });

    expect(latestState?.proposalPreviewModal).toBeNull();
    expect(latestState?.proposalComment).toBe("");
  });

  it("should open history proposal preview with saved comment", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.openHistoryProposalPreview(
        createProposalApprovalRecord({
          id: "proposal-1",
          approvedAt: "2026-04-15T08:00:00.000Z",
          comment: "최종 승인 메모"
        })
      );
    });

    expect(latestState?.proposalPreviewModal?.mode).toBe("history");
    expect(latestState?.proposalPreviewModal?.record?.id).toBe("proposal-1");
    expect(latestState?.proposalComment).toBe("최종 승인 메모");
  });

  it("should open and close proposal guide state", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.openProposalGuide("allowance-proposal-guide-preview");
    });

    expect(latestState?.proposalGuideInitialPageId).toBe("allowance-proposal-guide-preview");

    await act(async () => {
      latestState?.closeProposalGuide();
    });

    expect(latestState?.proposalGuideInitialPageId).toBeNull();
  });
});
