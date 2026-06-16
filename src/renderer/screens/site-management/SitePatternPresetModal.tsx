import { FormSelect } from "../../components/FormSelect";
import { useDialogDismiss } from "../../components/useDialogDismiss";

interface SitePatternPresetOption {
  id: string;
  name: string;
}

interface SitePatternPresetModalProps {
  canApply: boolean;
  onApply: () => void;
  onClose: () => void;
  onSelectSiteId: (value: string) => void;
  selectedSiteId: string;
  siteOptions: SitePatternPresetOption[];
}

export const SitePatternPresetModal = ({
  canApply,
  onApply,
  onClose,
  onSelectSiteId,
  selectedSiteId,
  siteOptions
}: SitePatternPresetModalProps) => {
  const { dialogRef, onKeyDown } = useDialogDismiss<HTMLDivElement>({ onDismiss: onClose });

  return (
  <div className="modal-overlay">
    <div
      aria-labelledby="site-preset-modal-title"
      aria-modal="true"
      className="modal-card site-preset-modal"
      onKeyDown={onKeyDown}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="section-heading compact-heading">
        <div className="modal-heading-copy">
          <h3 id="site-preset-modal-title">패턴 및 설정정보 불러오기</h3>
          <p>선택한 근무지의 운영 구조, Cycle 구성, Pool 설정을 현재 편집 중인 근무지에 적용합니다.</p>
        </div>
      </div>
      <label className="field workforce-select-field">
        <span>근무지명</span>
        <FormSelect
          className="workforce-select-shell"
          onChange={(event) => {
            onSelectSiteId(event.target.value);
          }}
          selectClassName="workforce-modern-select"
          value={selectedSiteId}
        >
          {siteOptions.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </FormSelect>
      </label>
      <p className="site-field-note">
        근무지 코드, 근무지명, 상태는 현재 값이 유지되고 패턴 관련 설정만 덮어씁니다.
      </p>
      <div className="button-row">
        <button className="primary-button" disabled={!canApply} onClick={onApply} type="button">
          불러오기
        </button>
        <button className="ghost-button" onClick={onClose} type="button">
          취소
        </button>
      </div>
    </div>
  </div>
  );
};
