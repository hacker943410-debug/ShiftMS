import type { AllowanceDocumentExportRecord } from "@shared/domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type {
  AllowanceCalculationStatus,
  AllowanceProposalApprovalRecord
} from "@shared/domain/allowance-workflow";

const allowanceLineLabel = {
  base: "기본",
  overtime: "연장",
  night: "야간"
} as const;

const allowanceLineOrder = {
  base: 0,
  overtime: 1,
  night: 2
} as const;

const formatMultiplierLabel = (value: number) =>
  Number.isInteger(value) ? `${value}.0배` : `${value.toFixed(1)}배`;

interface AllowanceEvidencePanelProps {
  exportedAt?: string;
  formatCurrencyValue: (value: number) => string;
  formatDateTimeValue: (value?: string) => string;
  formatDateValue: (value?: string) => string;
  formatHoursValue: (minutes: number) => string;
  outputFormat?: AllowanceDocumentExportRecord["outputFormat"];
  proposalApproval?: AllowanceProposalApprovalRecord;
  result: AllowanceCalculationResultRecord;
  reviewComment?: string;
  reviewedAt?: string;
  reviewedByName?: string;
  statusLabelByCode: Record<AllowanceCalculationStatus, string>;
}

const getAllowanceHistoryStatus = ({
  exportedAt,
  formatDateTimeValue,
  outputFormat,
  proposalApproval,
  result,
  reviewComment,
  reviewedAt,
  reviewedByName,
  statusLabelByCode
}: Pick<
  AllowanceEvidencePanelProps,
  | "exportedAt"
  | "formatDateTimeValue"
  | "outputFormat"
  | "proposalApproval"
  | "result"
  | "reviewComment"
  | "reviewedAt"
  | "reviewedByName"
  | "statusLabelByCode"
> & { exportedAt?: string }) => {
  if (result.status === "proposal-approved" && proposalApproval) {
    return {
      detail: `품의 승인 · ${proposalApproval.approvedByName} · ${formatDateTimeValue(
        proposalApproval.approvedAt
      )}`,
      label: statusLabelByCode["proposal-approved"]
    };
  }

  if (reviewedAt && result.status !== "pending") {
    return {
      detail: `${statusLabelByCode[result.status]} · ${reviewedByName ?? "-"} · ${formatDateTimeValue(
        reviewedAt
      )}${reviewComment ? ` · ${reviewComment}` : ""}`,
      label: statusLabelByCode[result.status]
    };
  }

  if (exportedAt) {
    return {
      detail: `문서 출력 · ${outputFormat === "pdf" ? "PDF" : "Excel"}`,
      label: "문서 출력"
    };
  }

  return {
    detail: `산출 등록 · ${formatDateTimeValue(result.snapshot.createdAt)}`,
    label: statusLabelByCode[result.status]
  };
};

export const AllowanceEvidencePanel = ({
  exportedAt,
  formatCurrencyValue,
  formatDateTimeValue,
  formatDateValue,
  formatHoursValue,
  outputFormat,
  proposalApproval,
  result,
  reviewComment,
  reviewedAt,
  reviewedByName,
  statusLabelByCode
}: AllowanceEvidencePanelProps) => {
  const historyStatus = getAllowanceHistoryStatus({
    exportedAt,
    formatDateTimeValue,
    outputFormat,
    proposalApproval,
    result,
    reviewComment,
    reviewedAt,
    reviewedByName,
    statusLabelByCode
  });

  return (
    <div className="allowance-evidence-panel">
      <div className="allowance-evidence-top">
        <div className="allowance-evidence-identity">
          <span className="allowance-evidence-kicker">수당 산출 상세</span>
          <strong className="allowance-evidence-title">{result.snapshot.businessCategoryLabel}</strong>
          <p className="allowance-evidence-subtitle">
            {result.employeeName} · {result.siteName} · {formatDateValue(result.workDate)} · 산출 파일{" "}
            {result.fileName}
          </p>
        </div>
        <div className="allowance-evidence-total-card">
          <span>총 수당</span>
          <strong>{formatCurrencyValue(result.snapshot.totalAllowanceAmount)}</strong>
          <em>{`적용 요율 ${result.rateVersionLabel} · ${historyStatus.detail}`}</em>
        </div>
      </div>

      <div className="allowance-evidence-facts">
        <article className="allowance-evidence-fact">
          <span>시급</span>
          <strong>{formatCurrencyValue(result.hourlyRate)}</strong>
        </article>
        <article className="allowance-evidence-fact">
          <span>총 근무</span>
          <strong>{formatHoursValue(result.snapshot.breakdown.totalWorkMinutes)}</strong>
        </article>
        <article className="allowance-evidence-fact">
          <span>적용 요율</span>
          <strong>{result.rateVersionLabel}</strong>
        </article>
        <article className="allowance-evidence-fact">
          <span>처리 상태</span>
          <strong>{historyStatus.label}</strong>
        </article>
      </div>

      <div className="allowance-evidence-ledger">
        <div className="allowance-evidence-ledger-head">
          <span>구분</span>
          <span>시간</span>
          <span>적용 요율</span>
          <span>금액</span>
        </div>
        {[...result.snapshot.lines]
          .sort(
            (left, right) =>
              allowanceLineOrder[left.allowanceCode] - allowanceLineOrder[right.allowanceCode]
          )
          .map((line) => (
            <div className="allowance-evidence-ledger-row" key={`${result.id}:${line.allowanceCode}`}>
              <span className="allowance-evidence-ledger-kind">
                {allowanceLineLabel[line.allowanceCode]}
              </span>
              <span className="allowance-evidence-ledger-minutes">
                {formatHoursValue(line.workMinutes)}
              </span>
              <span className="allowance-evidence-ledger-rate">
                {formatMultiplierLabel(line.multiplier)}
              </span>
              <span className="allowance-evidence-ledger-amount">
                {formatCurrencyValue(line.amount)}
              </span>
            </div>
          ))}
        <div className="allowance-evidence-ledger-row total">
          <span className="allowance-evidence-ledger-kind">총 금액</span>
          <span className="allowance-evidence-ledger-minutes">
            {formatHoursValue(result.snapshot.breakdown.totalWorkMinutes)}
          </span>
          <span className="allowance-evidence-ledger-rate">-</span>
          <span className="allowance-evidence-ledger-amount">
            {formatCurrencyValue(result.snapshot.totalAllowanceAmount)}
          </span>
        </div>
      </div>
    </div>
  );
};
