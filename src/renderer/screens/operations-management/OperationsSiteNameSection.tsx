import { useState } from "react";

import type { SiteNameOptionSaveInput } from "@shared/bridge/contracts";
import type { SiteNameOptionRecord } from "@shared/domain/model";

import { useDialogDismiss } from "../../components/useDialogDismiss";

interface OperationsSiteNameSectionProps {
  actionError?: string | null;
  isActionRunning: boolean;
  isLoading: boolean;
  siteNameOptions: SiteNameOptionRecord[];
  onDeleteSiteNameOption: (option: SiteNameOptionRecord) => Promise<void>;
  onSaveSiteNameOption: (input: SiteNameOptionSaveInput) => Promise<void>;
}

interface SiteNameOptionFormState {
  id?: string;
  name: string;
}

const createEmptyForm = (): SiteNameOptionFormState => ({
  name: ""
});

const createFormFromRecord = (option: SiteNameOptionRecord): SiteNameOptionFormState => ({
  id: option.id,
  name: option.name
});

const formatDateTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate()
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
};

export const OperationsSiteNameSection = ({
  actionError,
  isActionRunning,
  isLoading,
  siteNameOptions,
  onDeleteSiteNameOption,
  onSaveSiteNameOption
}: OperationsSiteNameSectionProps) => {
  const [editingOption, setEditingOption] = useState<SiteNameOptionRecord | null>(null);
  const [form, setForm] = useState<SiteNameOptionFormState | null>(null);

  const openCreateModal = () => {
    setEditingOption(null);
    setForm(createEmptyForm());
  };

  const openEditModal = (option: SiteNameOptionRecord) => {
    setEditingOption(option);
    setForm(createFormFromRecord(option));
  };

  const closeModal = () => {
    if (isActionRunning) {
      return;
    }

    setEditingOption(null);
    setForm(null);
  };

  const handleSave = async () => {
    if (!form) {
      return;
    }

    try {
      await onSaveSiteNameOption({
        id: form.id,
        name: form.name
      });
      closeModal();
    } catch {
      // Parent screen surfaces the action error message.
    }
  };

  const { dialogRef, onKeyDown } = useDialogDismiss<HTMLElement>({
    isOpen: form !== null,
    onDismiss: closeModal
  });

  return (
    <>
      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">근무지 이름 관리</p>
            <h3>근무지 이름 선택값 관리</h3>
          </div>
          <div className="button-row">
            <span className="pill neutral">{siteNameOptions.length}건</span>
            <button
              className="primary-button"
              disabled={isLoading || isActionRunning}
              onClick={openCreateModal}
              type="button"
            >
              근무지 이름 추가
            </button>
          </div>
        </div>
        <p className="site-field-note">
          근무지 수정 및 등록 1단계에서 선택하는 근무지 이름 목록입니다.
        </p>
        <div className="data-scroll">
          <table className="info-table">
            <thead>
              <tr>
                <th>근무지 이름</th>
                <th>사용 근무지</th>
                <th>수정일</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4}>근무지 이름 목록을 불러오는 중입니다.</td>
                </tr>
              ) : siteNameOptions.length > 0 ? (
                siteNameOptions.map((option) => (
                  <tr key={option.id}>
                    <td>{option.name}</td>
                    <td>{option.usageCount}건</td>
                    <td>{formatDateTime(option.updatedAt ?? option.createdAt)}</td>
                    <td>
                      <div className="button-row">
                        <button
                          className="ghost-button compact-button"
                          disabled={isActionRunning}
                          onClick={() => {
                            openEditModal(option);
                          }}
                          type="button"
                        >
                          수정
                        </button>
                        <button
                          className="danger-button compact-button"
                          disabled={isActionRunning || option.usageCount > 0}
                          onClick={() => {
                            void onDeleteSiteNameOption(option);
                          }}
                          title={
                            option.usageCount > 0
                              ? "현재 근무지에서 사용하는 근무지 이름은 삭제할 수 없습니다."
                              : undefined
                          }
                          type="button"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>등록된 근무지 이름이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {form ? (
        <div className="modal-overlay">
          <section
            aria-labelledby="operations-site-name-modal-title"
            aria-modal="true"
            className="modal-card operations-edit-modal"
            onKeyDown={onKeyDown}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong id="operations-site-name-modal-title">{editingOption ? "근무지 이름 수정" : "근무지 이름 추가"}</strong>
                <p>
                  {editingOption
                    ? `${editingOption.name} 선택값을 수정합니다.`
                    : "근무지 등록에서 선택할 근무지 이름을 추가합니다."}
                </p>
              </div>
            </div>
            {actionError ? <p className="form-error-text modal-feedback">{actionError}</p> : null}
            <div className="filter-grid">
              <label className="field">
                <span>근무지 이름</span>
                <input
                  onChange={(event) => {
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            name: event.target.value
                          }
                        : current
                    );
                  }}
                  placeholder="예: SK telecom"
                  value={form.name}
                />
              </label>
            </div>
            <div className="button-row modal-actions">
              <button
                className="ghost-button"
                disabled={isActionRunning}
                onClick={closeModal}
                type="button"
              >
                취소
              </button>
              <button
                className="primary-button"
                disabled={isActionRunning}
                onClick={() => {
                  void handleSave();
                }}
                type="button"
              >
                {isActionRunning ? "저장 중..." : "저장"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
};
