import { useState } from "react";

import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type {
  AllowanceProposalApprovalRecord,
  AllowanceProposalPreview
} from "@shared/domain/allowance-workflow";

export interface EarlyPayoutEditorState {
  calculationId: string;
  employeeName: string;
  existingValue?: string;
  siteName: string;
  value: string;
}

export interface ProposalPreviewModalState {
  calculationIds: string[];
  mode: "draft" | "history";
  preview: AllowanceProposalPreview;
  record?: AllowanceProposalApprovalRecord;
}

export const useAllowanceManagementModalState = () => {
  const [earlyPayoutEditor, setEarlyPayoutEditor] = useState<EarlyPayoutEditorState | null>(null);
  const [proposalPreviewModal, setProposalPreviewModal] = useState<ProposalPreviewModalState | null>(
    null
  );
  const [proposalGuideInitialPageId, setProposalGuideInitialPageId] = useState<string | null>(null);
  const [proposalComment, setProposalComment] = useState("");

  const openEarlyPayoutEditor = (
    result: AllowanceCalculationResultRecord,
    defaultDate: string
  ) => {
    setEarlyPayoutEditor({
      calculationId: result.id,
      employeeName: result.employeeName,
      siteName: result.siteName,
      value: result.earlyPayoutDate ?? defaultDate,
      existingValue: result.earlyPayoutDate
    });
  };

  const updateEarlyPayoutValue = (value: string) => {
    setEarlyPayoutEditor((current) =>
      current
        ? {
            ...current,
            value
          }
        : current
    );
  };

  const closeEarlyPayoutEditor = () => {
    setEarlyPayoutEditor(null);
  };

  const openDraftProposalPreview = (input: {
    calculationIds: string[];
    preview: AllowanceProposalPreview;
  }) => {
    setProposalComment("");
    setProposalPreviewModal({
      mode: "draft",
      calculationIds: input.calculationIds,
      preview: input.preview
    });
  };

  const openHistoryProposalPreview = (record: AllowanceProposalApprovalRecord) => {
    setProposalComment(record.comment ?? "");
    setProposalPreviewModal({
      mode: "history",
      calculationIds: record.calculationIds,
      preview: record.previewSnapshot,
      record
    });
  };

  const closeProposalPreview = () => {
    setProposalPreviewModal(null);
    setProposalComment("");
  };

  const openProposalGuide = (pageId: string) => {
    setProposalGuideInitialPageId(pageId);
  };

  const closeProposalGuide = () => {
    setProposalGuideInitialPageId(null);
  };

  return {
    closeEarlyPayoutEditor,
    closeProposalGuide,
    closeProposalPreview,
    earlyPayoutEditor,
    openDraftProposalPreview,
    openEarlyPayoutEditor,
    openHistoryProposalPreview,
    openProposalGuide,
    proposalComment,
    proposalGuideInitialPageId,
    proposalPreviewModal,
    setProposalComment,
    updateEarlyPayoutValue
  };
};
