import { useEffect, useMemo, useState } from "react";

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

import { DateField } from "../../components/DateField";
import { FormSelect } from "../../components/FormSelect";

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

const rateStatusTone: Record<AllowanceRateVersion["status"], "neutral" | "info" | "warn"> = {
  draft: "neutral",
  active: "info",
  retired: "warn"
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

const createEmptyRateForm = (year = String(new Date().getFullYear())): RateFormState => ({
  year,
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

const formatDate = (value?: string) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate()
  ).padStart(2, "0")}`;
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${formatDate(value)} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
};

const formatEffectiveRange = (version: AllowanceRateVersion) =>
  version.effectiveTo ? `${formatDate(version.effectiveFrom)} ~ ${formatDate(version.effectiveTo)}` : `${formatDate(version.effectiveFrom)} ~`;

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

const categoryToneClassName = (categoryCode: AllowanceRateCategoryCode) => {
  const summaryCategory = resolveAllowanceSummaryCategory(categoryCode);

  if (summaryCategory === "legalHoliday") {
    return "holiday";
  }

  if (summaryCategory === "substitute") {
    return "substitute";
  }

  return "overtime";
};

const getSortedVersions = (versions: AllowanceRateVersion[]) =>
  [...versions].sort((left, right) => {
    if (left.year !== right.year) {
      return right.year - left.year;
    }

    if (left.status !== right.status) {
      const priority = { active: 0, draft: 1, retired: 2 } as const;
      return priority[left.status] - priority[right.status];
    }

    return (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt);
  });

const pickFeaturedVersion = (versions: AllowanceRateVersion[]) =>
  versions.find((version) => version.status === "active") ?? versions[0] ?? null;

export const OperationsRateSection = ({
  actionError,
  isLoading,
  isActionRunning,
  rateVersions,
  onSaveRate,
  onDeleteRate
}: OperationsRateSectionProps) => {
  const currentYear = String(new Date().getFullYear());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [form, setForm] = useState<RateFormState>(createEmptyRateForm(currentYear));

  const sortedVersions = useMemo(() => getSortedVersions(rateVersions), [rateVersions]);
  const availableYears = useMemo(() => {
    const years = new Set<string>([currentYear]);

    sortedVersions.forEach((version) => {
      years.add(String(version.year));
    });

    return [...years].sort((left, right) => Number(right) - Number(left));
  }, [currentYear, sortedVersions]);

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0] ?? currentYear);
    }
  }, [availableYears, currentYear, selectedYear]);

  const selectedYearVersions = useMemo(
    () => sortedVersions.filter((version) => String(version.year) === selectedYear),
    [selectedYear, sortedVersions]
  );

  const featuredVersion = useMemo(
    () => pickFeaturedVersion(selectedYearVersions),
    [selectedYearVersions]
  );

  const recentVersions = useMemo(() => sortedVersions.slice(0, 5), [sortedVersions]);
  const featuredMatrix = featuredVersion ? buildAllowanceRateTable(featuredVersion) : null;

  const openCreateModal = () => {
    setForm(createEmptyRateForm(selectedYear));
    setIsModalOpen(true);
  };

  const openEditModal = (version: AllowanceRateVersion) => {
    setSelectedYear(String(version.year));
    setForm(createRateFormFromVersion(version));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isActionRunning) {
      return;
    }

    setIsModalOpen(false);
    setForm(createEmptyRateForm(selectedYear));
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
      <section className="surface-card rate-admin-shell">
        <div className="rate-admin-header">
          <div className="rate-admin-copy">
            <p className="section-kicker">7.2 요율 관리</p>
            <h3>요율 설정</h3>
            <p>업무 유형별 기본 및 가산 요율을 관리합니다. 변경 사항은 즉시 시스템에 반영됩니다.</p>
          </div>
          <div className="button-row">
            <span className="pill neutral">버전 {rateVersions.length}건</span>
            <button
              className="primary-button"
              disabled={isLoading || isActionRunning}
              onClick={openCreateModal}
              type="button"
            >
              신규 요율 추가
            </button>
          </div>
        </div>

        {actionError ? <p className="form-error-text">{actionError}</p> : null}

        <div className="rate-admin-year-strip">
          <div className="rate-admin-year-copy">
            <strong>기준 연도</strong>
            <span>조회 연도를 선택하면 대표 버전과 변경 이력을 함께 보여줍니다.</span>
          </div>
          <label className="field rate-admin-filter-field">
            <span>조회 연도</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                setSelectedYear(event.target.value);
              }}
              selectClassName="top-filter-select"
              value={selectedYear}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </FormSelect>
          </label>
          <em>
            마지막 업데이트: {selectedYearVersions[0] ? formatDateTime(selectedYearVersions[0].updatedAt ?? selectedYearVersions[0].createdAt) : "-"}
          </em>
        </div>

        <div className="rate-admin-layout">
          <article className="rate-admin-panel rate-admin-main-panel">
            <div className="rate-admin-panel-head">
              <div>
                <strong>{featuredVersion ? `${featuredVersion.versionLabel} 대표 요율` : "등록된 요율 없음"}</strong>
                <p>
                  {featuredVersion
                    ? `${formatEffectiveRange(featuredVersion)} / ${rateStatusLabel[featuredVersion.status]}`
                    : "선택한 연도의 요율 버전을 먼저 등록하세요."}
                </p>
              </div>
              {featuredVersion ? (
                <span className={`pill ${rateStatusTone[featuredVersion.status]}`}>
                  {rateStatusLabel[featuredVersion.status]}
                </span>
              ) : null}
            </div>

            <div className="data-scroll">
              <table className="info-table compact-table rate-admin-table">
                <thead>
                  <tr>
                    <th>업무 유형</th>
                    <th>기본 요율</th>
                    <th>시간 외 가산 요율</th>
                    <th>야간 가산 요율</th>
                    <th>적용 연도</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {featuredVersion && featuredMatrix ? (
                    allowanceRateCategoryOrder.map((categoryCode) => (
                      <tr key={`${featuredVersion.id}-${categoryCode}`}>
                        <td>
                          <div className={`rate-type-cell ${categoryToneClassName(categoryCode)}`}>
                            <span className="rate-type-dot" />
                            <div>
                              <strong>{allowanceRateCategoryLabels[categoryCode]}</strong>
                              <span>{categoryGroupLabel(categoryCode)}</span>
                            </div>
                          </div>
                        </td>
                        {allowanceRateAxisOrder.map((axis) => (
                          <td key={`${categoryCode}-${axis}`}>
                            <span className="rate-multiplier-pill">
                              {featuredMatrix[categoryCode][axis]}x
                            </span>
                          </td>
                        ))}
                        <td>{featuredVersion.year}</td>
                        <td>
                          <button
                            className="ghost-button compact-button"
                            disabled={isActionRunning}
                            onClick={() => {
                              openEditModal(featuredVersion);
                            }}
                            type="button"
                          >
                            수정
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        {isLoading ? "요율 정보를 불러오는 중입니다." : "선택한 연도에 등록된 요율 버전이 없습니다."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="rate-admin-side-column">
            <article className="rate-admin-panel">
              <div className="rate-admin-panel-head">
                <div>
                  <strong>{selectedYear}년 버전 목록</strong>
                  <p>대표 버전 외 이력도 같은 연도에서 바로 수정하거나 종료할 수 있습니다.</p>
                </div>
                <span className="pill neutral">{selectedYearVersions.length}건</span>
              </div>

              <div className="rate-version-list">
                {selectedYearVersions.length > 0 ? (
                  selectedYearVersions.map((version) => (
                    <article
                      className={
                        featuredVersion?.id === version.id
                          ? "rate-version-card is-featured"
                          : "rate-version-card"
                      }
                      key={version.id}
                    >
                      <div className="rate-version-card-head">
                        <div>
                          <strong>{version.versionLabel}</strong>
                          <span>{formatEffectiveRange(version)}</span>
                        </div>
                        <span className={`pill ${rateStatusTone[version.status]}`}>
                          {rateStatusLabel[version.status]}
                        </span>
                      </div>
                      <div className="rate-version-preview-list">
                        {allowanceRateCategoryOrder.map((categoryCode) => {
                          const rateTable = buildAllowanceRateTable(version);
                          const row = rateTable[categoryCode];

                          return (
                            <span
                              className="rate-version-preview-item"
                              key={`${version.id}-${categoryCode}`}
                            >
                              {allowanceRateCategoryLabels[categoryCode]} · 기본 {row.base}x / 연장{" "}
                              {row.overtime}x / 야간 {row.night}x
                            </span>
                          );
                        })}
                      </div>
                      <div className="button-row rate-version-actions">
                        {featuredVersion?.id === version.id ? (
                          <span className="pill neutral">대표 표시중</span>
                        ) : null}
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
                    </article>
                  ))
                ) : (
                  <div className="allowance-empty-state">
                    <strong>등록된 버전이 없습니다.</strong>
                    <span>{selectedYear}년 기준 신규 요율을 먼저 등록하세요.</span>
                  </div>
                )}
              </div>
            </article>
          </aside>
        </div>

        <div className="rate-admin-bottom-grid">
          <article className="rate-admin-info-card">
            <strong>도움말: 요율 적용 기준</strong>
            <ul className="rate-admin-info-list">
              <li>기본 요율은 통상 시급의 100%를 기준으로 합니다.</li>
              <li>야간 요율은 22:00 ~ 익일 06:00 사이 근무에 적용됩니다.</li>
              <li>연장 요율은 기본 근로를 넘긴 시간의 추가 요율로 함께 계산됩니다.</li>
            </ul>
          </article>

          <article className="rate-admin-history-card">
            <div className="rate-admin-panel-head">
              <div>
                <strong>최근 요율 변경 이력</strong>
                <p>최근 저장된 버전 순으로 주요 변경 내역을 확인합니다.</p>
              </div>
            </div>

            <div className="rate-admin-history-list">
              {recentVersions.length > 0 ? (
                recentVersions.map((version) => (
                  <div className="rate-admin-history-item" key={`recent-${version.id}`}>
                    <div>
                      <strong>{version.versionLabel}</strong>
                      <span>
                        {formatDate(version.updatedAt ?? version.createdAt)} · 시스템 저장 · {version.year}년
                      </span>
                    </div>
                    <span className={`pill ${rateStatusTone[version.status]}`}>
                      {rateStatusLabel[version.status]}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rate-admin-history-item">
                  <div>
                    <strong>변경 이력이 없습니다.</strong>
                    <span>요율 버전을 저장하면 최근 변경 목록에 반영됩니다.</span>
                  </div>
                </div>
              )}
            </div>
          </article>
        </div>
      </section>

      {isModalOpen ? (
        <div className="modal-overlay">
          <section className="modal-card operations-edit-modal rate-editor-modal">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong>{form.id ? "요율 수정" : "신규 요율 추가"}</strong>
                <p>근로유형별 기본, 시간 외, 야간 가산 배율을 한 버전 단위로 저장합니다.</p>
              </div>
            </div>
            {actionError ? <p className="form-error-text modal-feedback">{actionError}</p> : null}

            <div className="rate-editor-top-grid">
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
                  placeholder="예: 2026 기본"
                  value={form.versionLabel}
                />
              </label>
              <label className="field">
                <span>상태</span>
                <FormSelect
                  className="top-filter-select-shell"
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as AllowanceRateVersion["status"]
                    }));
                  }}
                  selectClassName="top-filter-select"
                  value={form.status}
                >
                  <option value="draft">초안</option>
                  <option value="active">사용중</option>
                  <option value="retired">종료</option>
                </FormSelect>
              </label>
              <label className="field">
                <span>적용 시작일</span>
                <DateField
                  onChange={(value) => {
                    setForm((current) => ({
                      ...current,
                      effectiveFrom: value
                    }));
                  }}
                  value={form.effectiveFrom}
                />
              </label>
              <label className="field">
                <span>적용 종료일</span>
                <DateField
                  onChange={(value) => {
                    setForm((current) => ({
                      ...current,
                      effectiveTo: value
                    }));
                  }}
                  value={form.effectiveTo}
                />
              </label>
            </div>

            <div className="data-scroll rate-matrix-scroll">
              <table className="info-table compact-table rate-matrix-table">
                <thead>
                  <tr>
                    <th>상위구분</th>
                    <th>업무 유형</th>
                    <th>기본 요율</th>
                    <th>시간 외 가산</th>
                    <th>야간 가산</th>
                  </tr>
                </thead>
                <tbody>
                  {allowanceRateCategoryOrder.map((categoryCode) => (
                    <tr key={categoryCode}>
                      <td>{categoryGroupLabel(categoryCode)}</td>
                      <td>{allowanceRateCategoryLabels[categoryCode]}</td>
                      {allowanceRateAxisOrder.map((axis) => (
                        <td key={`${categoryCode}-${axis}`}>
                          <div className="rate-editor-number-field">
                            <input
                              className="table-number-input"
                              onChange={(event) => {
                                handleMatrixValueChange(categoryCode, axis, event.target.value);
                              }}
                              step="0.1"
                              type="number"
                              value={form.matrix[categoryCode][axis]}
                            />
                            <span>x</span>
                          </div>
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
