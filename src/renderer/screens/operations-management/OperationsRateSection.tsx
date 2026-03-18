import { useState } from "react";

import type { AllowanceRateVersionSaveInput } from "@shared/bridge/contracts";
import {
  allowanceRateAxisLabels,
  allowanceRateAxisOrder,
  allowanceRateCategoryLabels,
  allowanceRateCategoryOrder,
  allowanceRateDefaultMatrix,
  buildAllowanceRateTable,
  getAllowanceRateEntryCode,
  resolveAllowanceSummaryCategory,
  type AllowanceRateAxis,
  type AllowanceRateCategoryCode
} from "@shared/domain/allowance-rate-matrix";
import type { AllowanceRateVersion } from "@shared/domain/model";

interface OperationsRateSectionProps {
  actionError?: string | null;
  isLoading: boolean;
  isActionRunning: boolean;
  rateVersions: AllowanceRateVersion[];
  onSaveRate: (input: AllowanceRateVersionSaveInput) => Promise<void>;
  onDeleteRate: (version: AllowanceRateVersion) => Promise<void>;
}

type RateMatrixFormState = Record<
  AllowanceRateCategoryCode,
  Record<AllowanceRateAxis, string>
>;

interface RateFormState {
  id?: string;
  year: string;
  versionLabel: string;
  status: AllowanceRateVersion["status"];
  effectiveFrom: string;
  effectiveTo: string;
  matrix: RateMatrixFormState;
}

const rateStatusLabel: Record<AllowanceRateVersion["status"], string> = {
  draft: "초안",
  active: "사용중",
  retired: "종료"
};

const createEmptyRateMatrix = (): RateMatrixFormState =>
  Object.fromEntries(
    allowanceRateCategoryOrder.map((categoryCode) => [
      categoryCode,
      Object.fromEntries(
        allowanceRateAxisOrder.map((axis) => [
          axis,
          String(allowanceRateDefaultMatrix[categoryCode][axis])
        ])
      )
    ])
  ) as RateMatrixFormState;

const createEmptyRateForm = (): RateFormState => ({
  year: String(new Date().getFullYear()),
  versionLabel: "",
  status: "draft",
  effectiveFrom: "",
  effectiveTo: "",
  matrix: createEmptyRateMatrix()
});

const getMatrixValue = (
  version: AllowanceRateVersion,
  categoryCode: AllowanceRateCategoryCode,
  axis: AllowanceRateAxis
) => String(buildAllowanceRateTable(version)[categoryCode][axis]);

const createRateFormFromVersion = (version: AllowanceRateVersion): RateFormState => ({
  id: version.id,
  year: String(version.year),
  versionLabel: version.versionLabel,
  status: version.status,
  effectiveFrom: version.effectiveFrom,
  effectiveTo: version.effectiveTo ?? "",
  matrix: Object.fromEntries(
    allowanceRateCategoryOrder.map((categoryCode) => [
      categoryCode,
      Object.fromEntries(
        allowanceRateAxisOrder.map((axis) => [axis, getMatrixValue(version, categoryCode, axis)])
      )
    ])
  ) as RateMatrixFormState
});

const formatEffectiveRange = (version: AllowanceRateVersion) =>
  version.effectiveTo ? `${version.effectiveFrom} ~ ${version.effectiveTo}` : `${version.effectiveFrom} ~`;

const formatRateCellSummary = (
  version: AllowanceRateVersion,
  categoryCode: AllowanceRateCategoryCode
) =>
  allowanceRateAxisOrder
    .map((axis) => `${allowanceRateAxisLabels[axis]} ${getMatrixValue(version, categoryCode, axis)}`)
    .join(" / ");

const categoryGroupLabel = (categoryCode: AllowanceRateCategoryCode) => {
  const summaryCategory = resolveAllowanceSummaryCategory(categoryCode);

  if (summaryCategory === "legalHoliday") {
    return "법정공휴일";
  }

  if (summaryCategory === "substitute") {
    return "대체근로";
  }

  return "연장근로";
};

export const OperationsRateSection = ({
  actionError,
  isLoading,
  isActionRunning,
  rateVersions,
  onSaveRate,
  onDeleteRate
}: OperationsRateSectionProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<RateFormState>(createEmptyRateForm());

  const openCreateModal = () => {
    setForm(createEmptyRateForm());
    setIsModalOpen(true);
  };

  const openEditModal = (version: AllowanceRateVersion) => {
    setForm(createRateFormFromVersion(version));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isActionRunning) {
      return;
    }

    setIsModalOpen(false);
    setForm(createEmptyRateForm());
  };

  const handleMatrixValueChange = (
    categoryCode: AllowanceRateCategoryCode,
    axis: AllowanceRateAxis,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      matrix: {
        ...current.matrix,
        [categoryCode]: {
          ...current.matrix[categoryCode],
          [axis]: value
        }
      }
    }));
  };

  const handleSave = async () => {
    try {
      await onSaveRate({
        id: form.id,
        year: Number(form.year),
        versionLabel: form.versionLabel,
        status: form.status,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || undefined,
        items: allowanceRateCategoryOrder.flatMap((categoryCode) =>
          allowanceRateAxisOrder.map((axis) => ({
            allowanceCode: getAllowanceRateEntryCode(categoryCode, axis),
            multiplier: Number(form.matrix[categoryCode][axis])
          }))
        )
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
            <p className="section-kicker">7.2 요율 관리</p>
            <h3>연도별 수당계산 요율 버전</h3>
          </div>
          <div className="button-row">
            <span className="pill neutral">{rateVersions.length}건</span>
            <button
              className="primary-button"
              disabled={isLoading || isActionRunning}
              onClick={openCreateModal}
              type="button"
            >
              신규 등록
            </button>
          </div>
        </div>
        <div className="data-scroll">
          <table className="info-table">
            <thead>
              <tr>
                <th>버전</th>
                <th>상태</th>
                <th>적용기간</th>
                <th>법정공휴일</th>
                <th>평_대체근로수당</th>
                <th>휴_대체근로수당</th>
                <th>평_연장근로수당</th>
                <th>휴_연장근로수당</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9}>요율 정보를 불러오는 중입니다.</td>
                </tr>
              ) : rateVersions.length > 0 ? (
                rateVersions.map((version) => (
                  <tr key={version.id}>
                    <td>{`${version.versionLabel} / ${version.year}`}</td>
                    <td>{rateStatusLabel[version.status]}</td>
                    <td>{formatEffectiveRange(version)}</td>
                    {allowanceRateCategoryOrder.map((categoryCode) => (
                      <td key={`${version.id}-${categoryCode}`} className="rate-summary-cell">
                        {formatRateCellSummary(version, categoryCode)}
                      </td>
                    ))}
                    <td>
                      <div className="button-row">
                        <button
                          className="ghost-button compact-button"
                          disabled={isActionRunning}
                          onClick={() => {
                            openEditModal(version);
                          }}
                          type="button"
                        >
                          수정
                        </button>
                        <button
                          className="danger-button compact-button"
                          disabled={isActionRunning}
                          onClick={() => {
                            void onDeleteRate(version);
                          }}
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
                  <td colSpan={9}>등록된 요율 버전이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen ? (
        <div className="modal-overlay">
          <section className="modal-card operations-edit-modal">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong>{form.id ? "요율 수정" : "요율 신규 등록"}</strong>
                <p>근로유형별 기본/연장/야간 배율을 한 버전으로 저장합니다.</p>
              </div>
            </div>
            {actionError ? <p className="form-error-text modal-feedback">{actionError}</p> : null}
            <div className="filter-grid two-up">
              <label className="field">
                <span>적용 연도</span>
                <input
                  max={2100}
                  min={2000}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      year: event.target.value
                    }));
                  }}
                  type="number"
                  value={form.year}
                />
              </label>
              <label className="field">
                <span>버전명</span>
                <input
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      versionLabel: event.target.value
                    }));
                  }}
                  placeholder="예: 2026.3"
                  value={form.versionLabel}
                />
              </label>
              <label className="field">
                <span>상태</span>
                <select
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as AllowanceRateVersion["status"]
                    }));
                  }}
                  value={form.status}
                >
                  <option value="draft">초안</option>
                  <option value="active">사용중</option>
                  <option value="retired">종료</option>
                </select>
              </label>
              <label className="field">
                <span>적용 시작일</span>
                <input
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      effectiveFrom: event.target.value
                    }));
                  }}
                  type="date"
                  value={form.effectiveFrom}
                />
              </label>
              <label className="field">
                <span>적용 종료일</span>
                <input
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      effectiveTo: event.target.value
                    }));
                  }}
                  type="date"
                  value={form.effectiveTo}
                />
              </label>
            </div>
            <div className="data-scroll rate-matrix-scroll">
              <table className="info-table compact-table rate-matrix-table">
                <thead>
                  <tr>
                    <th>상위구분</th>
                    <th>근로유형</th>
                    <th>기본</th>
                    <th>연장</th>
                    <th>야간</th>
                  </tr>
                </thead>
                <tbody>
                  {allowanceRateCategoryOrder.map((categoryCode) => (
                    <tr key={categoryCode}>
                      <td>{categoryGroupLabel(categoryCode)}</td>
                      <td>{allowanceRateCategoryLabels[categoryCode]}</td>
                      {allowanceRateAxisOrder.map((axis) => (
                        <td key={`${categoryCode}-${axis}`}>
                          <input
                            className="table-number-input"
                            onChange={(event) => {
                              handleMatrixValueChange(categoryCode, axis, event.target.value);
                            }}
                            step="0.1"
                            type="number"
                            value={form.matrix[categoryCode][axis]}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="button-row">
              <button
                className="ghost-button"
                disabled={isActionRunning}
                onClick={closeModal}
                type="button"
              >
                닫기
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
