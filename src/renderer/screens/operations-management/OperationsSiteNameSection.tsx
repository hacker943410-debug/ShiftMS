import { useState } from "react";

import type { SiteNameOptionSaveInput } from "@shared/bridge/contracts";
import type { SiteNameOptionRecord } from "@shared/domain/model";

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

  return (
    <>
      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.5 사이트 명 관리</p>
            <h3>사이트 명 선택값 관리</h3>
          </div>
          <div className="button-row">
            <span className="pill neutral">{siteNameOptions.length}건</span>
            <button
              className="primary-button"
              disabled={isLoading || isActionRunning}
              onClick={openCreateModal}
              type="button"
            >
              사이트 명 추가
            </button>
          </div>
        </div>
        <p className="site-field-note">
          근무지 수정 및 등록 1단계에서 선택하는 사이트 명 목록입니다.
        </p>
        <div className="data-scroll">
          <table className="info-table">
            <thead>
              <tr>
                <th>사이트 명</th>
                <th>사용 근무지</th>
                <th>수정일</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4}>사이트 명 목록을 불러오는 중입니다.</td>
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
                              ? "현재 근무지에서 사용하는 사이트 명은 삭제할 수 없습니다."
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
                  <td colSpan={4}>등록된 사이트 명이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {form ? (
        <div className="modal-overlay">
          <section className="modal-card operations-edit-modal">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong>{editingOption ? "사이트 명 수정" : "사이트 명 추가"}</strong>
                <p>
                  {editingOption
                    ? `${editingOption.name} 선택값을 수정합니다.`
                    : "근무지 등록에서 선택할 사이트 명을 추가합니다."}
                </p>
              </div>
            </div>
            {actionError ? <p className="form-error-text modal-feedback">{actionError}</p> : null}
            <div className="filter-grid">
              <label className="field">
                <span>사이트 명</span>
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
