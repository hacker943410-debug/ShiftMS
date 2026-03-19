import { Fragment, startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import type { AllowanceDocumentExportRecord } from "@shared/domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import {
  allowanceRateAxisLabels,
  allowanceRateCategoryLabels,
  allowanceRateCategoryOrder,
  buildAllowanceRateTable,
  resolveAllowanceRateCategoryLabel,
  type AllowanceRateAxis,
  type AllowanceRateCategoryCode
} from "@shared/domain/allowance-rate-matrix";
import { selectActiveAllowanceRateVersion } from "@shared/domain/allowance-rate-service";
import type { AllowanceRateVersion } from "@shared/domain/model";
import type { PerformanceEntryRecord } from "@shared/domain/performance-file";
import { formatCurrency } from "@shared/lib/formatCurrency";

import { FormSelect } from "../components/FormSelect";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

const createCurrentDate = () => new Date().toISOString().slice(0, 10);

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

const formatMinutesCompact = (value: number) => {
  if (value <= 0) {
    return "0h";
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (minutes === 0) {
    return `${hours}h`;
  }

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
};

const isDateInRange = (targetDate: string, effectiveFrom: string, effectiveTo?: string) => {
  if (targetDate < effectiveFrom) {
    return false;
  }

  if (effectiveTo && targetDate > effectiveTo) {
    return false;
  }

  return true;
};

const getWorkTypeLabel = (entryOrResult: { workType: string }) => {
  if (entryOrResult.workType === "holiday") {
    return "법정휴일근무";
  }

  if (entryOrResult.workType === "substitute") {
    return "대체근무";
  }

  return "연장근무";
};

const getBreakdownSummary = (result: AllowanceCalculationResultRecord) => {
  const { breakdown } = result.snapshot;

  return `${formatMinutesCompact(breakdown.totalWorkMinutes)} / ${formatMinutesCompact(
    breakdown.baseWorkMinutes
  )} / ${formatMinutesCompact(breakdown.overtimeMinutes)} / ${formatMinutesCompact(
    breakdown.nightMinutes
  )}`;
};

const resolveDisplayedRateVersion = (input: {
  versions: AllowanceRateVersion[];
  selectedYear: string;
  selectedMonth: string;
  visibleResults: AllowanceCalculationResultRecord[];
}) => {
  const versionById = new Map(input.versions.map((version) => [version.id, version]));
  const rateVersionUsage = new Map<string, number>();

  input.visibleResults.forEach((result) => {
    rateVersionUsage.set(result.rateVersionId, (rateVersionUsage.get(result.rateVersionId) ?? 0) + 1);
  });

  const topRateVersionId = [...rateVersionUsage.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];

  if (topRateVersionId && versionById.has(topRateVersionId)) {
    return versionById.get(topRateVersionId) ?? null;
  }

  const filteredVersions =
    input.selectedYear === "all"
      ? input.versions
      : input.versions.filter((version) => String(version.year) === input.selectedYear);

  if (filteredVersions.length === 0) {
    return null;
  }

  const targetDate = input.selectedMonth
    ? `${input.selectedMonth}-01`
    : input.selectedYear === "all"
      ? createCurrentDate()
      : `${input.selectedYear}-12-31`;

  const inRangeVersions = filteredVersions
    .filter((version) => isDateInRange(targetDate, version.effectiveFrom, version.effectiveTo))
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));

  if (inRangeVersions.length > 0) {
    return inRangeVersions[0] ?? null;
  }

  return (
    selectActiveAllowanceRateVersion({
      targetDate,
      versions: filteredVersions
    }) ??
    [...filteredVersions].sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ??
    null
  );
};

const createFormulaCards = (version: AllowanceRateVersion | null) =>
  allowanceRateCategoryOrder.map((categoryCode) => {
    const rateTable = buildAllowanceRateTable(version);
    const row = rateTable[categoryCode];

    return {
      code: categoryCode,
      label: allowanceRateCategoryLabels[categoryCode],
      description: [
        `${allowanceRateAxisLabels.base} x ${row.base}`,
        `${allowanceRateAxisLabels.overtime} x ${row.overtime}`,
        `${allowanceRateAxisLabels.night} x ${row.night}`
      ].join(" / ")
    };
  });

const AllowanceEmptyState = ({ message }: { message: string }) => (
  <div className="allowance-empty-state">
    <strong>{message}</strong>
  </div>
);

export const AllowanceManagementScreen = () => {
  const [results, setResults] = useState<AllowanceCalculationResultRecord[]>([]);
  const [approvedTargets, setApprovedTargets] = useState<PerformanceEntryRecord[]>([]);
  const [rateVersions, setRateVersions] = useState<AllowanceRateVersion[]>([]);
  const [documentExports, setDocumentExports] = useState<AllowanceDocumentExportRecord[]>([]);
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [keyword, setKeyword] = useState("");
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingEntryId, setProcessingEntryId] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const deferredKeyword = useDeferredValue(keyword);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const [resultsResult, targetsResult, rateVersionsResult, exportsResult] = await Promise.all([
          window.appBridge.listCalculationResults(),
          window.appBridge.listApprovedTargets(),
          window.appBridge.listAllowanceRateVersions(),
          window.appBridge.listAllowanceDocumentExports()
        ]);

        if (!active) {
          return;
        }

        setResults(resultsResult.ok ? resultsResult.data : []);
        setApprovedTargets(targetsResult.ok ? targetsResult.data : []);
        setRateVersions(rateVersionsResult.ok ? rateVersionsResult.data : []);
        setDocumentExports(exportsResult.ok ? exportsResult.data : []);

        const messages = [
          resultsResult.ok ? null : resultsResult.message,
          targetsResult.ok ? null : targetsResult.message,
          rateVersionsResult.ok ? null : rateVersionsResult.message,
          exportsResult.ok ? null : exportsResult.message
        ].filter((message): message is string => Boolean(message));

        setScreenError(messages.length > 0 ? messages.join(" / ") : null);
      } catch (error) {
        if (active) {
          setScreenError(getErrorMessage(error));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();

    rateVersions.forEach((version) => {
      years.add(String(version.year));
    });
    approvedTargets.forEach((target) => {
      years.add(target.workDate.slice(0, 4));
    });
    results.forEach((result) => {
      years.add(result.workDate.slice(0, 4));
    });

    return [...years].sort((left, right) => Number(right) - Number(left));
  }, [approvedTargets, rateVersions, results]);

  const normalizedKeyword = deferredKeyword.trim().toLowerCase();
  const calculatedEntryIds = useMemo(() => new Set(results.map((result) => result.entryId)), [results]);

  const visibleResults = useMemo(
    () =>
      results.filter((result) => {
        if (selectedYear !== "all" && result.workDate.slice(0, 4) !== selectedYear) {
          return false;
        }

        if (selectedMonth && !result.workDate.startsWith(selectedMonth)) {
          return false;
        }

        if (!normalizedKeyword) {
          return true;
        }

        return (
          result.fileName.toLowerCase().includes(normalizedKeyword) ||
          result.employeeName.toLowerCase().includes(normalizedKeyword) ||
          result.siteName.toLowerCase().includes(normalizedKeyword)
        );
      }),
    [normalizedKeyword, results, selectedMonth, selectedYear]
  );

  const visiblePendingTargets = useMemo(
    () =>
      approvedTargets.filter((target) => {
        if (calculatedEntryIds.has(target.id)) {
          return false;
        }

        if (selectedYear !== "all" && target.workDate.slice(0, 4) !== selectedYear) {
          return false;
        }

        if (selectedMonth && !target.workDate.startsWith(selectedMonth)) {
          return false;
        }

        if (!normalizedKeyword) {
          return true;
        }

        return (
          target.employeeName.toLowerCase().includes(normalizedKeyword) ||
          target.siteName.toLowerCase().includes(normalizedKeyword) ||
          getWorkTypeLabel(target).toLowerCase().includes(normalizedKeyword)
        );
      }),
    [approvedTargets, calculatedEntryIds, normalizedKeyword, selectedMonth, selectedYear]
  );

  const visibleDocumentExports = useMemo(
    () =>
      documentExports.filter((record) => {
        if (selectedYear !== "all" && record.workMonth.slice(0, 4) !== selectedYear) {
          return false;
        }

        if (selectedMonth && record.workMonth !== selectedMonth) {
          return false;
        }

        if (!normalizedKeyword) {
          return true;
        }

        return (
          record.proposalFileName.toLowerCase().includes(normalizedKeyword) ||
          record.attachment1FileName.toLowerCase().includes(normalizedKeyword) ||
          record.attachment2FileName.toLowerCase().includes(normalizedKeyword)
        );
      }),
    [documentExports, normalizedKeyword, selectedMonth, selectedYear]
  );

  useEffect(() => {
    if (visibleResults.length === 0) {
      setExpandedResultId(null);
      return;
    }

    if (!expandedResultId || !visibleResults.some((result) => result.id === expandedResultId)) {
      setExpandedResultId(visibleResults[0]!.id);
    }
  }, [expandedResultId, visibleResults]);

  const displayedRateVersion = useMemo(
    () =>
      resolveDisplayedRateVersion({
        versions: rateVersions,
        selectedYear,
        selectedMonth,
        visibleResults
      }),
    [rateVersions, selectedMonth, selectedYear, visibleResults]
  );

  const formulaCards = useMemo(() => createFormulaCards(displayedRateVersion), [displayedRateVersion]);
  const totalAllowanceAmount = useMemo(
    () => visibleResults.reduce((sum, result) => sum + result.snapshot.totalAllowanceAmount, 0),
    [visibleResults]
  );
  const calculatedEmployeeCount = useMemo(
    () => new Set(visibleResults.map((result) => result.employeeCode || result.employeeName)).size,
    [visibleResults]
  );
  const siteTotals = useMemo(() => {
    const grouped = new Map<string, number>();

    visibleResults.forEach((result) => {
      grouped.set(result.siteName, (grouped.get(result.siteName) ?? 0) + result.snapshot.totalAllowanceAmount);
    });

    return [...grouped.entries()].sort((left, right) => right[1] - left[1]);
  }, [visibleResults]);

  const runCalculation = async (entryId: string) => {
    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingEntryId(entryId);

    try {
      const result = await window.appBridge.runApprovedCalculation({ entryId });

      if (!result.ok) {
        setActionError(result.message);
        return null;
      }

      setActionMessage(`${result.data.employeeName} 수당 산출을 완료했습니다.`);
      startTransition(() => {
        setExpandedResultId(result.data.id);
      });
      setRefreshKey((current) => current + 1);
      return result.data;
    } catch (error) {
      setActionError(getErrorMessage(error));
      return null;
    } finally {
      setIsProcessing(false);
      setProcessingEntryId(null);
    }
  };

  const handleRunVisiblePending = async () => {
    if (visiblePendingTargets.length === 0) {
      setActionError("산출할 승인 완료 항목이 없습니다.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingEntryId("__bulk__");

    try {
      let successCount = 0;
      const failedMessages: string[] = [];
      let firstResultId: string | null = null;

      for (const target of visiblePendingTargets) {
        const result = await window.appBridge.runApprovedCalculation({ entryId: target.id });

        if (!result.ok) {
          failedMessages.push(`${target.employeeName}: ${result.message}`);
          continue;
        }

        successCount += 1;
        if (!firstResultId) {
          firstResultId = result.data.id;
        }
      }

      if (firstResultId) {
        startTransition(() => {
          setExpandedResultId(firstResultId);
        });
      }

      setActionMessage(successCount > 0 ? `${successCount}건의 승인 실적을 수당 산출했습니다.` : null);
      setActionError(failedMessages.length > 0 ? failedMessages.join(" / ") : null);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingEntryId(null);
    }
  };

  const handleExportVisibleDocuments = async () => {
    if (visibleResults.length === 0) {
      setActionError("출력할 수당 계산 결과가 없습니다.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingEntryId("__export__");

    try {
      const result = await window.appBridge.exportAllowanceDocuments({
        calculationIds: visibleResults.map((item) => item.id)
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage(`${result.data.workMonth} 품의서/별첨1/별첨2 출력이 완료되었습니다.`);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingEntryId(null);
    }
  };

  return (
    <div className="screen-stack allowance-screen">
      <section className="surface-card allowance-header-card">
        <div className="button-row spread allowance-top-row">
          <div className="button-row">
            <h3>수당 관리</h3>
            <span className="pill neutral">산출 {results.length}건</span>
            <span className="pill warn">미산출 {visiblePendingTargets.length}건</span>
          </div>
          <div className="button-row">
            <button
              className="primary-button compact-button"
              disabled={visibleResults.length === 0 || isProcessing}
              onClick={() => {
                void handleExportVisibleDocuments();
              }}
              type="button"
            >
              {processingEntryId === "__export__" ? "출력 중..." : "품의 신청"}
            </button>
            <button
              className="ghost-button compact-button"
              disabled={visiblePendingTargets.length === 0 || isProcessing}
              onClick={() => {
                void handleRunVisiblePending();
              }}
              type="button"
            >
              {processingEntryId === "__bulk__" ? "산출 중..." : "미산출 일괄 계산"}
            </button>
            <button
              className="ghost-button compact-button"
              onClick={() => {
                setRefreshKey((current) => current + 1);
              }}
              type="button"
            >
              새로고침
            </button>
          </div>
        </div>

        <div className="filter-grid allowance-filter-grid">
          <label className="field filter-field filter-field-sm">
            <span>연도</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                setSelectedYear(event.target.value);
              }}
              selectClassName="top-filter-select"
              value={selectedYear}
            >
              <option value="all">전체</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </FormSelect>
          </label>
          <label className="field filter-field filter-field-sm">
            <span>계산월</span>
            <input
              onChange={(event) => {
                setSelectedMonth(event.target.value);
              }}
              type="month"
              value={selectedMonth}
            />
          </label>
          <label className="field filter-field">
            <span>검색</span>
            <input
              onChange={(event) => {
                setKeyword(event.target.value);
              }}
              placeholder="근무지/이름/원본 파일 검색"
              value={keyword}
            />
          </label>
          <button
            className="ghost-button align-end"
            onClick={() => {
              setSelectedYear("all");
              setSelectedMonth("");
              setKeyword("");
            }}
            type="button"
          >
            초기화
          </button>
        </div>

        <div className="allowance-formula-strip">
          {formulaCards.map((formula) => (
            <div className="formula-item" key={formula.code}>
              <strong>{formula.label}</strong>
              <span>{formula.description}</span>
            </div>
          ))}
        </div>
        <p className="allowance-formula-caption">
          {displayedRateVersion
            ? `적용 요율 버전: ${displayedRateVersion.versionLabel} / ${formatDate(
                displayedRateVersion.effectiveFrom
              )}${displayedRateVersion.effectiveTo ? ` ~ ${formatDate(displayedRateVersion.effectiveTo)}` : ""}`
            : "표시할 요율 버전이 없습니다."}
        </p>

        {screenError ? <p className="form-error-text">{screenError}</p> : null}
        {actionError ? <p className="form-error-text">{actionError}</p> : null}
        {actionMessage ? <p className="form-success-text">{actionMessage}</p> : null}
      </section>

      <section className="allowance-layout">
        <aside className="allowance-left-column">
          <article className="surface-card">
            <div className="section-heading compact-heading">
              <div>
                <h3>요약</h3>
                <p>현재 필터 기준 산출 결과를 집계합니다.</p>
              </div>
            </div>

            <div className="allowance-summary-row">
              <div className="summary-item allowance-summary-item">
                <span>총 지급수당</span>
                <strong>{formatCurrency(totalAllowanceAmount)}</strong>
                <em>{visibleResults.length}건 산출</em>
              </div>
              <div className="summary-item allowance-summary-item">
                <span>대상 인원</span>
                <strong>{calculatedEmployeeCount}명</strong>
                <em>필터 기준</em>
              </div>
            </div>

            {siteTotals.length > 0 ? (
              <div className="allowance-type-list">
                {siteTotals.map(([siteName, amount]) => (
                  <div className="allowance-type-row" key={siteName}>
                    <strong>{siteName}</strong>
                    <span>{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <AllowanceEmptyState message={isLoading ? "수당 결과를 불러오는 중입니다." : "표시할 산출 결과가 없습니다."} />
            )}
          </article>

          <article className="surface-card allowance-run-card">
            <div className="section-heading compact-heading">
              <div>
                <h3>미산출 승인 실적</h3>
                <p>최신 승인 완료 파일 기준으로 아직 계산되지 않은 실적입니다.</p>
              </div>
              <span className="pill warn">{visiblePendingTargets.length}건</span>
            </div>

            {visiblePendingTargets.length > 0 ? (
              <div className="allowance-run-list">
                {visiblePendingTargets.map((target) => (
                  <div className="allowance-run-item" key={target.id}>
                    <div className="allowance-run-copy">
                      <strong>
                        {target.siteName} / {target.employeeName}
                      </strong>
                      <span>
                        {target.workDate} / {getWorkTypeLabel(target)}
                      </span>
                      <span>{`${formatMinutesCompact(target.totalWorkMinutes)} / 시급 ${formatCurrency(target.hourlyRate ?? 0)}`}</span>
                    </div>
                    <div className="button-row">
                      <span className="pill neutral">승인완료</span>
                      <button
                        className="ghost-button compact-button"
                        disabled={isProcessing}
                        onClick={() => {
                          void runCalculation(target.id);
                        }}
                        type="button"
                      >
                        {processingEntryId === target.id ? "산출 중..." : "수당 산출"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <AllowanceEmptyState message="현재 필터 기준 미산출 승인 실적이 없습니다." />
            )}
          </article>

          <article className="surface-card allowance-export-card">
            <div className="section-heading compact-heading">
              <div>
                <h3>최근 문서 출력</h3>
                <p>품의 신청으로 생성된 Excel 3종 이력을 확인합니다.</p>
              </div>
              <span className="pill info">{visibleDocumentExports.length}건</span>
            </div>

            {visibleDocumentExports.length > 0 ? (
              <div className="allowance-export-list">
                {visibleDocumentExports.slice(0, 5).map((record) => (
                  <div className="allowance-export-item" key={record.id}>
                    <div className="allowance-run-copy">
                      <strong>{record.workMonth} 출력</strong>
                      <span>
                        계산 {record.calculationCount}건 / 인원 {record.employeeCount}명 /{" "}
                        {formatCurrency(record.totalAllowanceAmount)}
                      </span>
                      <span>출력시각 {formatDateTime(record.exportedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <AllowanceEmptyState message="현재 필터 기준 문서 출력 이력이 없습니다." />
            )}
          </article>
        </aside>

        <article className="surface-card allowance-table-card">
          <div className="section-heading compact-heading">
            <div>
              <h3>상세 수당 내역</h3>
              <p>실적 1건 단위로 산출된 수당 결과를 확인합니다.</p>
            </div>
            <div className="button-row allowance-table-meta">
              <span className="pill neutral">결과 {visibleResults.length}건</span>
            </div>
          </div>

          <div className="data-scroll">
            <table className="info-table compact-table allowance-results-table">
              <thead>
                <tr>
                  <th>상세</th>
                  <th>근무지</th>
                  <th>이름</th>
                  <th>구분</th>
                  <th>근무일자</th>
                  <th>총 / 기본 / 연장 / 야간</th>
                  <th>총 수당</th>
                  <th>요율 버전</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8}>수당 계산 결과를 불러오는 중입니다.</td>
                  </tr>
                ) : visibleResults.length > 0 ? (
                  visibleResults.map((result) => {
                    const businessCategoryCode =
                      result.snapshot.businessCategoryCode as AllowanceRateCategoryCode;
                    const isExpanded = expandedResultId === result.id;

                    return (
                      <Fragment key={result.id}>
                        <tr className={isExpanded ? "selected" : ""}>
                          <td>
                            <button
                              className={isExpanded ? "icon-button active" : "icon-button"}
                              onClick={() => {
                                startTransition(() => {
                                  setExpandedResultId(result.id);
                                });
                              }}
                              type="button"
                            >
                              {isExpanded ? "열림" : "상세"}
                            </button>
                          </td>
                          <td className="table-strong">{result.siteName}</td>
                          <td>{result.employeeName}</td>
                          <td>
                            <span className="pill neutral">
                              {resolveAllowanceRateCategoryLabel(businessCategoryCode)}
                            </span>
                          </td>
                          <td>{formatDate(result.workDate)}</td>
                          <td>{getBreakdownSummary(result)}</td>
                          <td>{formatCurrency(result.snapshot.totalAllowanceAmount)}</td>
                          <td>{result.rateVersionLabel}</td>
                        </tr>
                        {isExpanded ? (
                          <tr className="allowance-expanded-row">
                            <td />
                            <td colSpan={7}>
                              <div className="allowance-expanded-card">
                                <div>
                                  <strong>상세 산출 근거</strong>
                                  {result.snapshot.lines.map((line) => (
                                    <p key={`${result.id}-${line.allowanceCode}`}>
                                      {allowanceRateAxisLabels[line.allowanceCode as AllowanceRateAxis]} /{" "}
                                      {formatMinutesCompact(line.workMinutes)} x {line.multiplier} ={" "}
                                      {formatCurrency(line.amount)}
                                    </p>
                                  ))}
                                  <p>총 지급수당 {formatCurrency(result.snapshot.totalAllowanceAmount)}</p>
                                </div>
                                <div>
                                  <strong>원본 실적 정보</strong>
                                  <p>근무지 {result.siteName}</p>
                                  <p>근로유형 {getWorkTypeLabel(result)}</p>
                                  <p>시급 {formatCurrency(result.hourlyRate)}</p>
                                  <p>산출시각 {formatDateTime(result.snapshot.createdAt)}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8}>조건에 맞는 수당 산출 결과가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
};
