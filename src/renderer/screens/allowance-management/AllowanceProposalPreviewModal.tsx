import type { AllowanceProposalPreview } from "@shared/domain/allowance-workflow";
import type { AllowanceProposalApprovalRecord } from "@shared/domain/allowance-workflow";
import type { WorkType } from "@shared/domain/model";
import type { ProposalPreviewModalState } from "./useAllowanceManagementModalState";

type AllowanceWorkType = "substitute" | "overtime" | "holiday";

interface AllowanceProposalPreviewModalProps {
  formatCurrencyValue: (value: number) => string;
  formatDateTimeValue: (value?: string) => string;
  formatDateValue: (value?: string) => string;
  formatHoursValue: (minutes: number) => string;
  getWorkTypeValue: (record: { workType: WorkType }) => AllowanceWorkType;
  isProcessing: boolean;
  modal: ProposalPreviewModalState;
  onApprove: () => void;
  onClose: () => void;
  onCommentChange: (value: string) => void;
  onOpenGuide: () => void;
  processingKey: string | null;
  proposalComment: string;
  workTypeLabelByType: Record<AllowanceWorkType, string>;
}

export const AllowanceProposalPreviewModal = ({
  formatCurrencyValue,
  formatDateTimeValue,
  formatDateValue,
  formatHoursValue,
  getWorkTypeValue,
  isProcessing,
  modal,
  onApprove,
  onClose,
  onCommentChange,
  onOpenGuide,
  processingKey,
  proposalComment,
  workTypeLabelByType
}: AllowanceProposalPreviewModalProps) => (
  <div className="modal-overlay">
    <section aria-modal="true" className="modal-card allowance-proposal-modal" role="dialog">
      <div className="surface-card-header">
        <div className="modal-heading-copy">
          <strong>{modal.mode === "draft" ? "품의 승인 미리보기" : "품의 승인 상세"}</strong>
          <p>
            {modal.preview.workMonth} / {modal.preview.calculationCount}건 / {modal.preview.employeeCount}명
          </p>
        </div>
        <div className="button-row">
          <button
            className="ghost-button compact-button"
            disabled={isProcessing}
            onClick={onOpenGuide}
            type="button"
          >
            가이드 보기
          </button>
        </div>
      </div>

      <div className="allowance-proposal-body">
        <div className="allowance-proposal-summary-grid">
          <article className="allowance-proposal-summary-card">
            <span>총 승인 금액</span>
            <strong>{formatCurrencyValue(modal.preview.totalAllowanceAmount)}</strong>
          </article>
          <article className="allowance-proposal-summary-card">
            <span>일반 지급</span>
            <strong>{formatCurrencyValue(modal.preview.regularTotalAllowanceAmount)}</strong>
          </article>
          <article className="allowance-proposal-summary-card">
            <span>선지급</span>
            <strong>{formatCurrencyValue(modal.preview.earlyPayoutTotalAllowanceAmount)}</strong>
          </article>
        </div>

        <div className="allowance-proposal-preview-card">
          <div className="section-heading compact-heading">
            <div>
              <h3>PDF 출력 미리보기</h3>
              <p>품의서에 포함될 승인 건과 근무지별 합계를 확인합니다.</p>
            </div>
          </div>

          <div className="allowance-proposal-preview-grid">
            <article className="allowance-proposal-preview-section">
              <strong>지급 요청 내역</strong>
              <table className="info-table compact-table allowance-preview-table">
                <thead>
                  <tr>
                    <th>고객사</th>
                    <th>근무지</th>
                    <th>대체</th>
                    <th>연장</th>
                    <th>휴일</th>
                    <th>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {modal.preview.regularSiteSummaries.length > 0 ? (
                    modal.preview.regularSiteSummaries.map((row) => (
                      <tr key={`regular:${row.siteName}`}>
                        <td>{row.customerName || "-"}</td>
                        <td>{row.siteName}</td>
                        <td>{formatCurrencyValue(row.substituteAmount)}</td>
                        <td>{formatCurrencyValue(row.overtimeAmount)}</td>
                        <td>{formatCurrencyValue(row.holidayAmount)}</td>
                        <td>{formatCurrencyValue(row.totalAmount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>일반 지급 대상이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </article>

            <article className="allowance-proposal-preview-section">
              <strong>선지급 내역</strong>
              <table className="info-table compact-table allowance-preview-table">
                <thead>
                  <tr>
                    <th>고객사</th>
                    <th>근무지</th>
                    <th>대체</th>
                    <th>연장</th>
                    <th>휴일</th>
                    <th>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {modal.preview.earlyPayoutSiteSummaries.length > 0 ? (
                    modal.preview.earlyPayoutSiteSummaries.map((row) => (
                      <tr key={`early:${row.siteName}`}>
                        <td>{row.customerName || "-"}</td>
                        <td>{row.siteName}</td>
                        <td>{formatCurrencyValue(row.substituteAmount)}</td>
                        <td>{formatCurrencyValue(row.overtimeAmount)}</td>
                        <td>{formatCurrencyValue(row.holidayAmount)}</td>
                        <td>{formatCurrencyValue(row.totalAmount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>선지급 대상이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </article>
          </div>

          <div className="data-scroll allowance-proposal-preview-scroll">
            <table className="info-table compact-table allowance-preview-table">
              <thead>
                <tr>
                  <th>고객사</th>
                  <th>근무지</th>
                  <th>이름</th>
                  <th>근로유형</th>
                  <th>구분</th>
                  <th>근무일자</th>
                  <th>총 근무</th>
                  <th>총 수당</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {modal.preview.rows.map((row) => (
                  <tr key={row.calculationId}>
                    <td>{row.customerName || "-"}</td>
                    <td>{row.siteName}</td>
                    <td>{row.employeeName}</td>
                    <td>{workTypeLabelByType[getWorkTypeValue({ workType: row.workType })]}</td>
                    <td>{row.businessCategoryLabel}</td>
                    <td>{formatDateValue(row.workDate)}</td>
                    <td>{formatHoursValue(row.totalWorkMinutes)}</td>
                    <td>{formatCurrencyValue(row.totalAllowanceAmount)}</td>
                    <td>{row.earlyPayoutDate ? `선지급 ${formatDateValue(row.earlyPayoutDate)}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {modal.mode === "draft" ? (
          <label className="field allowance-proposal-comment-field">
            <span>승인 메모</span>
            <textarea
              onChange={(event) => {
                onCommentChange(event.target.value);
              }}
              placeholder="품의 승인 메모를 남길 수 있습니다."
              rows={3}
              value={proposalComment}
            />
          </label>
        ) : modal.record?.comment ? (
          <div className="allowance-proposal-history-note">
            <strong>승인 메모</strong>
            <p>{modal.record.comment}</p>
          </div>
        ) : null}
      </div>

      <div className="surface-card-footer allowance-early-payout-actions">
        <button className="ghost-button" disabled={isProcessing} onClick={onClose} type="button">
          닫기
        </button>
        {modal.mode === "draft" ? (
          <button className="primary-button" disabled={isProcessing} onClick={onApprove} type="button">
            {processingKey === "proposal-approve" ? "품의 승인 중..." : "최종 품의 승인"}
          </button>
        ) : null}
      </div>
    </section>
  </div>
);
