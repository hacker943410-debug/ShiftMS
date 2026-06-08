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
import {
  buildAllowanceRateImpactPreview,
  type AllowanceRateImpactPreview
} from "@shared/domain/allowance-rate-impact";
import { selectAppliedAllowanceRateVersion } from "@shared/domain/allowance-rate-service";
import type { AllowanceRateHistoryRecord, AllowanceRateVersion } from "@shared/domain/model";

import { DateField } from "../../components/DateField";
import { FormSelect } from "../../components/FormSelect";

interface OperationsRateSectionProps {
  actionError?: string | null;
  isLoading: boolean;
  isActionRunning: boolean;
  rateHistory: AllowanceRateHistoryRecord[];
  rateVersions: AllowanceRateVersion[];
  onApplyRate: (version: AllowanceRateVersion) => Promise<void>;
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
  changeReason: string;
  matrix: RateMatrixFormState;
}

const rateStatusLabel: Record<AllowanceRateVersion["status"], string> = {
  draft: "초안",
  active: "적용 중",
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
  changeReason: "",
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
  changeReason: "",
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
  version.effectiveTo
    ? `${formatDate(version.effectiveFrom)} ~ ${formatDate(version.effectiveTo)}`
    : `${formatDate(version.effectiveFrom)} ~`;

const formatCurrencyValue = (value: number) =>
  value.toLocaleString("ko-KR", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "KRW"
  });

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

const rateHistoryActionLabel: Record<AllowanceRateHistoryRecord["actionType"], string> = {
  registered: "등록",
  updated: "수정",
  applied: "적용",
  deleted: "삭제"
};

const rateHistoryActionTone: Record<
  AllowanceRateHistoryRecord["actionType"],
  "neutral" | "info" | "warn"
> = {
  registered: "neutral",
  updated: "warn",
  applied: "info",
  deleted: "warn"
};

const getVersionRows = (version: AllowanceRateVersion) => {
  const rateTable = buildAllowanceRateTable(version);
  return allowanceRateCategoryOrder.map((categoryCode) => ({
    categoryCode,
    categoryLabel: allowanceRateCategoryLabels[categoryCode],
    groupLabel: categoryGroupLabel(categoryCode),
    rateRow: rateTable[categoryCode]
  }));
};

export const OperationsRateSection = ({
  actionError,
  isLoading,
  isActionRunning,
  rateHistory,
  rateVersions,
  onApplyRate,
  onSaveRate,
  onDeleteRate
}: OperationsRateSectionProps) => {
  const currentYear = String(new Date().getFullYear());
  const todayValue = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [form, setForm] = useState<RateFormState>(createEmptyRateForm(currentYear));
  const [formError, setFormError] = useState<string | null>(null);
  const [impactPreview, setImpactPreview] = useState<AllowanceRateImpactPreview | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [isImpactLoading, setIsImpactLoading] = useState(false);

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

  useEffect(() => {
    if (
      selectedVersionId &&
      selectedYearVersions.some((version) => version.id === selectedVersionId)
    ) {
      return;
    }
    setSelectedVersionId(selectedYearVersions[0]?.id ?? null);
  }, [selectedVersionId, selectedYearVersions]);

  const selectedYearStatusCounts = useMemo(
    () =>
      selectedYearVersions.reduce(
        (summary, version) => {
          summary[version.status] += 1;
          return summary;
        },
        { active: 0, draft: 0, retired: 0 } satisfies Record<AllowanceRateVersion["status"], number>
      ),
    [selectedYearVersions]
  );

  const activeVersionCount = useMemo(
    () => sortedVersions.filter((version) => version.status === "active").length,
    [sortedVersions]
  );
  const appliedVersion = useMemo(
    () => selectAppliedAllowanceRateVersion(sortedVersions),
    [sortedVersions]
  );
  const selectedVersion = useMemo(
    () =>
      selectedYearVersions.find((version) => version.id === selectedVersionId) ??
      selectedYearVersions[0] ??
      null,
    [selectedVersionId, selectedYearVersions]
  );
  const editingVersion = useMemo(
    () => (form.id ? sortedVersions.find((version) => version.id === form.id) ?? null : null),
    [form.id, sortedVersions]
  );
  const isEffectiveFromLocked = Boolean(
    editingVersion && editingVersion.effectiveFrom < todayValue
  );
  const recentHistory = useMemo(() => rateHistory.slice(0, 5), [rateHistory]);
  const appliedVersionRows = useMemo(
    () => (appliedVersion ? getVersionRows(appliedVersion) : []),
    [appliedVersion]
  );
  const selectedVersionRows = useMemo(
    () => (selectedVersion ? getVersionRows(selectedVersion) : []),
    [selectedVersion]
  );
  const hasBlankRateInput = useMemo(
    () =>
      allowanceRateCategoryOrder.some((categoryCode) =>
        allowanceRateAxisOrder.some((axis) => form.matrix[categoryCode][axis].trim().length === 0)
      ),
    [form.matrix]
  );
  const rateInputMessage = formError ?? (hasBlankRateInput ? "요율 칸은 비워둘 수 없습니다." : null);

  const openCreateModal = () => {
    setFormError(null);
    setImpactError(null);
    setImpactPreview(null);
    setForm(createEmptyRateForm(selectedYear));
    setIsModalOpen(true);
  };

  const openEditModal = (version: AllowanceRateVersion) => {
    setFormError(null);
    setImpactError(null);
    setImpactPreview(null);
    setSelectedYear(String(version.year));
    setSelectedVersionId(version.id);
    setForm(createRateFormFromVersion(version));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isActionRunning) {
      return;
    }
    setFormError(null);
    setImpactError(null);
    setImpactPreview(null);
    setIsModalOpen(false);
    setForm(createEmptyRateForm(selectedYear));
  };

  const parseRateMultiplier = (value: string, label: string) => {
    const normalized = value.trim();

    if (normalized.length === 0) {
      throw new Error(`${label}은(는) 비워둘 수 없습니다.`);
    }

    const parsed = Number(normalized);

    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${label}은(는) 0 이상의 숫자여야 합니다.`);
    }

    return parsed;
  };

  const handleMatrixValueChange = (
    categoryCode: AllowanceRateCategoryCode,
    axis: AllowanceRateAxis,
    value: string
  ) => {
    setImpactError(null);
    setImpactPreview(null);
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

  const buildRateSaveInput = (): AllowanceRateVersionSaveInput => ({
    id: form.id,
    year: Number(form.year),
    versionLabel: form.versionLabel,
    status: form.status,
    effectiveFrom: form.effectiveFrom,
    effectiveTo: form.effectiveTo || undefined,
    changeReason: form.id ? form.changeReason : undefined,
    items: allowanceRateCategoryOrder.flatMap((categoryCode) =>
      allowanceRateAxisOrder.map((axis) => ({
        allowanceCode: getAllowanceRateEntryCode(categoryCode, axis),
        multiplier: parseRateMultiplier(
          form.matrix[categoryCode][axis],
          `${allowanceRateCategoryLabels[categoryCode]} ${allowanceRateAxisLabels[axis]} 요율`
        )
      }))
    )
  });

  const handlePreviewImpact = async () => {
    let input: AllowanceRateVersionSaveInput;

    try {
      input = buildRateSaveInput();
      setFormError(null);
      setImpactError(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "요율 입력값을 확인해 주세요.");
      return;
    }

    setIsImpactLoading(true);

    try {
      const result = await window.appBridge.listCalculationResults();

      if (!result.ok) {
        setImpactError(result.message);
        return;
      }

      setImpactPreview(buildAllowanceRateImpactPreview(result.data, input.items));
    } catch (error) {
      setImpactError(error instanceof Error ? error.message : "요율 영향 미리보기 중 오류가 발생했습니다.");
    } finally {
      setIsImpactLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const input = buildRateSaveInput();
      setFormError(null);
      await onSaveRate(input);
      closeModal();
    } catch (error) {
      if (error instanceof Error && !actionError) {
        setFormError(error.message);
      }
    }
  };

  return (
    <>
      <section className="surface-card rate-admin-shell">
        <div className="rate-admin-header">
          <div className="rate-admin-copy">
            <p className="section-kicker">7.2 요율 관리</p>
            <h3>요율 관리</h3>
            <p>적용 중인 요율을 기준으로 승인 수당이 계산됩니다. 초안 등록 후 명시적으로 적용할 수 있습니다.</p>
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
            <strong>조회 연도</strong>
            <span>선택한 연도에 등록된 요율 목록을 오른쪽에서 고르고, 현재 적용 중인 기준은 왼쪽에서 확인합니다.</span>
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
            마지막 업데이트:{" "}
            {selectedYearVersions[0]
              ? formatDateTime(selectedYearVersions[0].updatedAt ?? selectedYearVersions[0].createdAt)
              : "-"}
          </em>
        </div>

        <div className="operations-summary-strip">
          <article className="operations-summary-card" data-tone="accent">
            <span>조회 연도</span>
            <strong>{selectedYear}년</strong>
            <em>연도별 요율 등록 이력과 검토 대상을 분리해서 볼 수 있습니다.</em>
          </article>
          <article className="operations-summary-card" data-tone={appliedVersion ? "ok" : "warn"}>
            <span>적용 중인 요율</span>
            <strong>{appliedVersion?.versionLabel ?? "없음"}</strong>
            <em>
              {appliedVersion
                ? `${formatEffectiveRange(appliedVersion)} 기준`
                : "승인 계산에 사용할 요율을 먼저 적용하세요."}
            </em>
          </article>
          <article className="operations-summary-card">
            <span>{selectedYear}년 버전</span>
            <strong>{selectedYearVersions.length}건</strong>
            <em>초안, 적용, 종료 상태를 같은 연도 안에서 관리합니다.</em>
          </article>
          <article
            className="operations-summary-card"
            data-tone={activeVersionCount > 0 ? "ok" : "warn"}
          >
            <span>전체 적용 상태</span>
            <strong>{activeVersionCount}건</strong>
            <em>
              {activeVersionCount === 1
                ? "현재 하나의 요율만 적용 중입니다."
                : activeVersionCount > 1
                  ? "적용 중 요율이 여러 건입니다."
                  : "적용 중 요율이 없습니다."}
            </em>
          </article>
        </div>

        <div className="rate-admin-status-strip">
          <article className="rate-admin-status-card" data-tone="ok">
            <span>적용 중</span>
            <strong>{selectedYearStatusCounts.active}건</strong>
            <em>실제 승인 계산에 바로 사용되는 버전입니다.</em>
          </article>
          <article className="rate-admin-status-card" data-tone="accent">
            <span>초안</span>
            <strong>{selectedYearStatusCounts.draft}건</strong>
            <em>검토 중인 요율 버전입니다.</em>
          </article>
          <article className="rate-admin-status-card" data-tone="warn">
            <span>종료</span>
            <strong>{selectedYearStatusCounts.retired}건</strong>
            <em>이력 참고용 이전 버전입니다.</em>
          </article>
        </div>

        <div className="rate-admin-layout">
          <article className="rate-admin-panel rate-admin-main-panel">
            <div className="rate-admin-panel-head">
              <div>
                <strong>적용 중인 요율</strong>
                <p>
                  {appliedVersion
                    ? `${formatEffectiveRange(appliedVersion)} / ${rateStatusLabel[appliedVersion.status]}`
                    : "현재 적용된 요율이 없어 승인 계산을 진행할 수 없습니다."}
                </p>
              </div>
              {appliedVersion ? (
                <div className="button-row">
                  <span className={`pill ${rateStatusTone[appliedVersion.status]}`}>
                    {rateStatusLabel[appliedVersion.status]}
                  </span>
                  <button
                    className="ghost-button compact-button"
                    disabled={isActionRunning}
                    onClick={() => {
                      openEditModal(appliedVersion);
                    }}
                    type="button"
                  >
                    수정
                  </button>
                </div>
              ) : null}
            </div>

            {appliedVersion ? (
              <div className="rate-version-meta-grid">
                <article className="rate-version-meta-card">
                  <span>버전명</span>
                  <strong>{appliedVersion.versionLabel}</strong>
                  <em>{appliedVersion.year}년 기준</em>
                </article>
                <article className="rate-version-meta-card">
                  <span>적용 기간</span>
                  <strong>{formatEffectiveRange(appliedVersion)}</strong>
                  <em>승인 계산과 동일 기준</em>
                </article>
                <article className="rate-version-meta-card">
                  <span>최근 저장</span>
                  <strong>{formatDateTime(appliedVersion.updatedAt ?? appliedVersion.createdAt)}</strong>
                  <em>최신 적용 버전</em>
                </article>
                <article className="rate-version-meta-card">
                  <span>최근 변경 사유</span>
                  <strong>{appliedVersion.changeReason ?? "기록 없음"}</strong>
                  <em>이력 기록과 동일 기준</em>
                </article>
              </div>
            ) : null}

            <div className="data-scroll">
              <table className="info-table compact-table rate-admin-table">
                <thead>
                  <tr>
                    <th>업무 유형</th>
                    <th>기본 요율</th>
                    <th>{allowanceRateAxisLabels.overtime}</th>
                    <th>{allowanceRateAxisLabels.night}</th>
                  </tr>
                </thead>
                <tbody>
                  {appliedVersionRows.length > 0 ? (
                    appliedVersionRows.map((row) => (
                      <tr key={`${appliedVersion?.id}-${row.categoryCode}`}>
                        <td>
                          <div className={`rate-type-cell ${categoryToneClassName(row.categoryCode)}`}>
                            <span className="rate-type-dot" />
                            <div>
                              <strong>{row.categoryLabel}</strong>
                              <span>{row.groupLabel}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="rate-multiplier-pill">{row.rateRow.base}x</span>
                        </td>
                        <td>
                          <span className="rate-multiplier-pill">{row.rateRow.overtime}x</span>
                        </td>
                        <td>
                          <span className="rate-multiplier-pill">{row.rateRow.night}x</span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4}>
                        {isLoading
                          ? "요율 정보를 불러오는 중입니다."
                          : "현재 적용 중인 요율 버전이 없습니다."}
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
                  <strong>{selectedYear}년 요율 목록</strong>
                  <p>연도별 이력을 선택하고 필요하면 바로 적용할 수 있습니다.</p>
                </div>
                <span className="pill neutral">{selectedYearVersions.length}건</span>
              </div>

              <div className="rate-version-list">
                {selectedYearVersions.length > 0 ? (
                  selectedYearVersions.map((version) => {
                    const isSelected = selectedVersion?.id === version.id;
                    const isApplied = appliedVersion?.id === version.id;

                    return (
                      <article
                        className={[
                          "rate-version-card",
                          isSelected ? "is-selected" : "",
                          isApplied ? "is-applied" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={version.id}
                      >
                        <div className="rate-version-card-head">
                          <div>
                            <strong>{version.versionLabel}</strong>
                            <span>{formatEffectiveRange(version)}</span>
                          </div>
                          <div className="button-row">
                            {isApplied ? <span className="pill info">적용 중</span> : null}
                            <span className={`pill ${rateStatusTone[version.status]}`}>
                              {rateStatusLabel[version.status]}
                            </span>
                          </div>
                        </div>
                        <div className="rate-version-preview-list">
                          {getVersionRows(version).map((row) => (
                            <span className="rate-version-preview-item" key={`${version.id}-${row.categoryCode}`}>
                              {row.categoryLabel} · 기본 {row.rateRow.base}x / 연장 {row.rateRow.overtime}x / 야간 {row.rateRow.night}x
                            </span>
                          ))}
                        </div>
                        <div className="button-row rate-version-actions">
                          <button
                            className={isSelected ? "secondary-button compact-button" : "ghost-button compact-button"}
                            disabled={isActionRunning}
                            onClick={() => {
                              setSelectedVersionId(version.id);
                            }}
                            type="button"
                          >
                            {isSelected ? "선택됨" : "선택"}
                          </button>
                          {!isApplied ? (
                            <button
                              className="primary-button compact-button"
                              disabled={isActionRunning}
                              onClick={() => {
                                void onApplyRate(version);
                              }}
                              type="button"
                            >
                              요율 적용
                            </button>
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
                    );
                  })
                ) : (
                  <div className="allowance-empty-state">
                    <strong>등록된 버전이 없습니다.</strong>
                    <span>{selectedYear}년 기준 신규 요율을 먼저 등록하세요.</span>
                  </div>
                )}
              </div>
            </article>
            <article className="rate-admin-panel">
              <div className="rate-admin-panel-head">
                <div>
                  <strong>선택한 요율 상세</strong>
                  <p>
                    {selectedVersion
                      ? `${selectedVersion.versionLabel} / ${formatEffectiveRange(selectedVersion)}`
                      : "연도 목록에서 요율 버전을 선택하세요."}
                  </p>
                </div>
                {selectedVersion ? (
                  <span className={`pill ${rateStatusTone[selectedVersion.status]}`}>
                    {rateStatusLabel[selectedVersion.status]}
                  </span>
                ) : null}
              </div>

              {selectedVersion ? (
                <div className="rate-admin-selection-summary">
                  <span>{selectedVersion.year}년</span>
                  <span>최근 저장 {formatDateTime(selectedVersion.updatedAt ?? selectedVersion.createdAt)}</span>
                  <span>최근 사유 {selectedVersion.changeReason ?? "기록 없음"}</span>
                </div>
              ) : null}

              <div className="data-scroll">
                <table className="info-table compact-table rate-admin-table rate-admin-table-compact">
                  <thead>
                    <tr>
                      <th>업무 유형</th>
                      <th>기본</th>
                      <th>연장</th>
                      <th>야간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedVersionRows.length > 0 ? (
                      selectedVersionRows.map((row) => (
                        <tr key={`${selectedVersion?.id}-${row.categoryCode}`}>
                          <td>{row.categoryLabel}</td>
                          <td>{row.rateRow.base}x</td>
                          <td>{row.rateRow.overtime}x</td>
                          <td>{row.rateRow.night}x</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4}>선택한 요율 버전이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </aside>
        </div>

        <div className="rate-admin-bottom-grid">
          <article className="rate-admin-info-card">
            <strong>도움말: 요율 적용 기준</strong>
            <ul className="rate-admin-info-list">
              <li>적용 중인 요율은 승인 계산과 수당 안내 화면에서 공통으로 사용됩니다.</li>
              <li>초안은 저장만 가능하며 `요율 적용` 버튼을 눌러야 실제 계산 기준으로 승격됩니다.</li>
              <li>새 요율을 적용하면 이전 적용 버전은 자동으로 종료 상태로 전환됩니다.</li>
            </ul>
          </article>

          <article className="rate-admin-history-card">
            <div className="rate-admin-panel-head">
              <div>
                <strong>최근 요율 변경 이력</strong>
                <p>변경 사유를 포함한 최근 요율 변경 기록을 확인합니다.</p>
              </div>
            </div>

            <div className="rate-admin-history-list">
              {recentHistory.length > 0 ? (
                recentHistory.map((history) => (
                  <div className="rate-admin-history-item" key={history.id}>
                    <div>
                      <strong>{history.versionLabel}</strong>
                      <span>
                        {formatDateTime(history.occurredAt)} · {rateHistoryActionLabel[history.actionType]} · {history.year}년
                      </span>
                      <em className="rate-admin-history-reason">{history.reason}</em>
                    </div>
                    <span className={`pill ${rateHistoryActionTone[history.actionType]}`}>
                      {rateHistoryActionLabel[history.actionType]}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rate-admin-history-item">
                  <div>
                    <strong>변경 이력이 없습니다.</strong>
                    <span>요율 버전을 저장하거나 적용하면 최근 변경 목록에 반영됩니다.</span>
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
            {rateInputMessage ? <p className="form-error-text modal-feedback">{rateInputMessage}</p> : null}

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
                  <option value="active">적용 중</option>
                  <option value="retired">종료</option>
                  </FormSelect>
                </label>
            </div>

            <div className="rate-editor-date-grid">
              <label className="field rate-editor-date-field">
                <span>적용 시작일</span>
                <DateField
                  disabled={isEffectiveFromLocked}
                  min={form.id ? todayValue : undefined}
                  onChange={(value) => {
                    setForm((current) => ({
                      ...current,
                      effectiveFrom: value
                    }));
                  }}
                  value={form.effectiveFrom}
                />
                {form.id ? (
                  <small className="field-hint">
                    {isEffectiveFromLocked
                      ? "이미 시작된 요율은 적용 시작일을 변경할 수 없습니다."
                      : "수정 시 적용 시작일은 오늘 이전으로 변경할 수 없습니다."}
                  </small>
                ) : null}
              </label>
              <label className="field rate-editor-date-field">
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

            {form.id ? (
              <label className="field">
                <span>변경 사유</span>
                <textarea
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      changeReason: event.target.value
                    }));
                  }}
                  placeholder="예: 하반기 지급 기준 조정, 노사 합의안 반영"
                  rows={3}
                  value={form.changeReason}
                />
                {editingVersion?.changeReason ? (
                  <small className="field-hint">
                    최근 변경 사유: {editingVersion.changeReason}
                  </small>
                ) : (
                  <small className="field-hint">
                    입력한 사유는 요율 변경 이력과 활동 이력에 함께 저장됩니다.
                  </small>
                )}
              </label>
            ) : null}

            <div className="data-scroll rate-matrix-scroll">
              <table className="info-table compact-table rate-matrix-table">
                <thead>
                  <tr>
                    <th>상위구분</th>
                    <th>업무 유형</th>
                    <th>기본 요율</th>
                    <th>{allowanceRateAxisLabels.overtime}</th>
                    <th>{allowanceRateAxisLabels.night}</th>
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

            <section className="rate-admin-info-card">
              <div className="rate-admin-panel-head">
                <div>
                  <strong>요율 영향 미리보기</strong>
                  <p>현재 승인 수당 계산 결과에 후보 요율을 적용했을 때의 예상 증감입니다.</p>
                </div>
                <button
                  className="ghost-button compact-button"
                  disabled={isActionRunning || isImpactLoading || hasBlankRateInput}
                  onClick={() => {
                    void handlePreviewImpact();
                  }}
                  type="button"
                >
                  {isImpactLoading ? "계산 중..." : "영향 미리보기"}
                </button>
              </div>
              {impactError ? <p className="form-error-text modal-feedback">{impactError}</p> : null}
              {impactPreview ? (
                <>
                  <div className="operations-summary-strip">
                    <article className="operations-summary-card">
                      <span>대상 계산</span>
                      <strong>{impactPreview.calculationCount}건</strong>
                      <em>현재 승인 계산 결과 기준</em>
                    </article>
                    <article
                      className="operations-summary-card"
                      data-tone={impactPreview.affectedCalculationCount > 0 ? "warn" : "ok"}
                    >
                      <span>영향 건수</span>
                      <strong>{impactPreview.affectedCalculationCount}건</strong>
                      <em>금액 변동이 있는 계산</em>
                    </article>
                    <article
                      className="operations-summary-card"
                      data-tone={impactPreview.deltaAmount === 0 ? "ok" : "warn"}
                    >
                      <span>예상 증감액</span>
                      <strong>{formatCurrencyValue(impactPreview.deltaAmount)}</strong>
                      <em>
                        {formatCurrencyValue(impactPreview.beforeAmount)} -&gt;{" "}
                        {formatCurrencyValue(impactPreview.afterAmount)}
                      </em>
                    </article>
                    <article
                      className="operations-summary-card"
                      data-tone={impactPreview.zeroedPayWarningCount > 0 ? "warn" : "ok"}
                    >
                      <span>0원화 경고</span>
                      <strong>{impactPreview.zeroedPayWarningCount}건</strong>
                      <em>근무시간이 있는데 후보 요율로 0원이 되는 수당</em>
                    </article>
                  </div>
                  {impactPreview.zeroedPayWarnings.length > 0 ? (
                    <div className="data-scroll">
                      <table className="info-table compact-table">
                        <thead>
                          <tr>
                            <th>근무일</th>
                            <th>근무지</th>
                            <th>사원</th>
                            <th>수당</th>
                            <th>시간</th>
                            <th>기존 금액</th>
                          </tr>
                        </thead>
                        <tbody>
                          {impactPreview.zeroedPayWarnings.slice(0, 5).map((warning) => (
                            <tr key={`${warning.calculationId}-${warning.allowanceLabel}`}>
                              <td>{warning.workDate}</td>
                              <td>{warning.siteName}</td>
                              <td>{warning.employeeName}</td>
                              <td>{warning.allowanceLabel}</td>
                              <td>{(warning.workMinutes / 60).toFixed(1)}h</td>
                              <td>{formatCurrencyValue(warning.beforeAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {impactPreview.rows.length > 0 ? (
                    <div className="data-scroll">
                      <table className="info-table compact-table">
                        <thead>
                          <tr>
                            <th>근무일</th>
                            <th>근무지</th>
                            <th>사원</th>
                            <th>기존</th>
                            <th>예상</th>
                            <th>증감</th>
                          </tr>
                        </thead>
                        <tbody>
                          {impactPreview.rows.slice(0, 5).map((row) => (
                            <tr key={row.calculationId}>
                              <td>{row.workDate}</td>
                              <td>{row.siteName}</td>
                              <td>{row.employeeName}</td>
                              <td>{formatCurrencyValue(row.beforeAmount)}</td>
                              <td>{formatCurrencyValue(row.afterAmount)}</td>
                              <td>{formatCurrencyValue(row.deltaAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="form-success-text">현재 후보 요율로 변동되는 계산 결과가 없습니다.</p>
                  )}
                </>
              ) : (
                <p className="site-field-note">저장 전에 영향 미리보기를 실행해 기존 승인 계산의 예상 변동을 확인하세요.</p>
              )}
            </section>

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
                disabled={
                  isActionRunning ||
                  hasBlankRateInput ||
                  (Boolean(form.id) && form.changeReason.trim().length === 0)
                }
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
