import { DateField } from "../../components/DateField";
import { useDialogDismiss } from "../../components/useDialogDismiss";
import type { EarlyPayoutEditorState } from "./useAllowanceManagementModalState";

interface AllowanceEarlyPayoutModalProps {
  editor: EarlyPayoutEditorState;
  isProcessing: boolean;
  onClear: () => void;
  onClose: () => void;
  onSave: () => void;
  onValueChange: (value: string) => void;
  processingKey: string | null;
}

export const AllowanceEarlyPayoutModal = ({
  editor,
  isProcessing,
  onClear,
  onClose,
  onSave,
  onValueChange,
  processingKey
}: AllowanceEarlyPayoutModalProps) => {
  const { dialogRef, onKeyDown } = useDialogDismiss({ onDismiss: onClose });

  return (
  <div className="modal-overlay">
    <section
      aria-labelledby="allowance-early-payout-title"
      aria-modal="true"
      className="modal-card allowance-early-payout-modal"
      onKeyDown={onKeyDown}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="surface-card-header">
        <div className="modal-heading-copy">
          <strong id="allowance-early-payout-title">퇴직자 선지급 설정</strong>
          <p>
            {editor.employeeName} / {editor.siteName}
          </p>
        </div>
      </div>

      <div className="allowance-early-payout-body">
        <div className="allowance-early-payout-status">
          <span>선지급 상태</span>
          <strong className={`allowance-status-pill ${editor.existingValue ? "prepaid" : "pending"}`}>
            {editor.existingValue ? "선지급 승인" : "선지급 미승인"}
          </strong>
        </div>
        <div className="field">
          <span>선지급 날짜</span>
          <DateField
            disabled={Boolean(editor.existingValue)}
            onChange={onValueChange}
            value={editor.value}
          />
        </div>
        <p className="allowance-early-payout-note">
          선지급 실적은 품의서 3번 항목으로 분리되고, 일반 지급 합계에서는 제외됩니다.
        </p>
      </div>

      <div className="surface-card-footer allowance-early-payout-actions">
        {editor.existingValue ? (
          <button className="danger-button" disabled={isProcessing} onClick={onClear} type="button">
            {processingKey === `early-payout:${editor.calculationId}` ? "취소 중..." : "선지급 취소"}
          </button>
        ) : null}
        <button className="ghost-button" disabled={isProcessing} onClick={onClose} type="button">
          취소
        </button>
        <button
          className="primary-button"
          disabled={isProcessing || Boolean(editor.existingValue)}
          onClick={onSave}
          type="button"
        >
          {processingKey === `early-payout:${editor.calculationId}`
            ? "저장 중..."
            : editor.existingValue
              ? "선지급 승인"
              : "선지급"}
        </button>
      </div>
    </section>
  </div>
  );
};
