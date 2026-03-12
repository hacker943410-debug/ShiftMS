import { Fragment, startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import type { AllowanceDocumentExportRecord } from "@shared/domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import { selectActiveAllowanceRateVersion } from "@shared/domain/allowance-rate-service";
import type { AllowanceRateVersion } from "@shared/domain/model";
import type { PerformanceApprovalRecord } from "@shared/domain/performance-file";
import { formatCurrency } from "@shared/lib/formatCurrency";

type AllowanceCode = "base" | "overtime" | "night" | "holiday" | "substitute";

interface AllowanceDistributionItem {
  label: string;
  totalAmount: number;
  share: number;
  width: number;
  count: number;
}

interface AllowanceTypeSummaryItem {
  code: AllowanceCode;
  label: string;
  totalAmount: number;
  share: number;
}

const allowanceCodeLabel: Record<AllowanceCode, string> = {
  base: "기본 수당",
  overtime: "연장 수당",
  night: "야간 수당",
  holiday: "휴일 수당",
  substitute: "대체 수당"
};

const allowanceCodeLegendClass: Record<AllowanceCode, string> = {
  base: "idx-1",
  overtime: "idx-2",
  night: "idx-3",
  holiday: "idx-4",
  substitute: "idx-2"
};

const defaultRateMultipliers: Record<AllowanceCode, number> = {
  base: 1,
  overtime: 1.5,
  night: 0.5,
  holiday: 1.5,
  substitute: 1
};

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

const getRateMultiplier = (version: AllowanceRateVersion | null, code: AllowanceCode) =>
  version?.items.find((item) => item.allowanceCode === code)?.multiplier ?? defaultRateMultipliers[code];

const createFormulaCards = (version: AllowanceRateVersion | null) =>
  (Object.keys(allowanceCodeLabel) as AllowanceCode[]).map((code) => ({
    code,
    label: allowanceCodeLabel[code],
    description: `통상시급 x ${getRateMultiplier(version, code)}`
  }));

const getCalculationCategory = (result: AllowanceCalculationResultRecord) => {
  const breakdown = result.snapshot.breakdown;

  if (breakdown.holidayMinutes > 0) {
    return { label: "휴일", tone: "warn" as const };
  }

  if (breakdown.substituteMinutes > 0) {
    return { label: "대체", tone: "danger" as const };
  }

  if (breakdown.nightMinutes > 0) {
    return { label: "야간", tone: "info" as const };
  }

  if (breakdown.overtimeMinutes > 0) {
    return { label: "연장", tone: "neutral" as const };
  }

  return { label: "정기", tone: "neutral" as const };
};

const getBreakdownSummary = (result: AllowanceCalculationResultRecord) => {
  const { breakdown } = result.snapshot;

  return `${formatMinutesCompact(breakdown.totalWorkMinutes)} / ${formatMinutesCompact(
    breakdown.baseWorkMinutes
  )} / ${formatMinutesCompact(breakdown.overtimeMinutes)} / ${formatMinutesCompact(
    breakdown.nightMinutes
  )}`;
};

const AllowanceEmptyState = ({ message }: { message: string }) => (
  <div className="allowance-empty-state">
    <strong>{message}</strong>
  </div>
);

export const AllowanceManagementScreen = () => {
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [results, setResults] = useState<AllowanceCalculationResultRecord[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<PerformanceApprovalRecord[]>([]);
  const [rateVersions, setRateVersions] = useState<AllowanceRateVersion[]>([]);
  const [documentExports, setDocumentExports] = useState<AllowanceDocumentExportRecord[]>([]);
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [keyword, setKeyword] = useState("");
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingFileId, setProcessingFileId] = useState<string | null>(null);
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
        const [resultsResult, historyResult, rateVersionsResult, exportsResult] = await Promise.all([
          window.appBridge.listCalculationResults(),
          window.appBridge.listApprovalHistory(),
          window.appBridge.listAllowanceRateVersions(),
          window.appBridge.listAllowanceDocumentExports()
        ]);

        if (!active) {
          return;
        }

        const messages = [
          resultsResult.ok ? null : resultsResult.message,
          historyResult.ok ? null : historyResult.message,
          rateVersionsResult.ok ? null : rateVersionsResult.message,
          exportsResult.ok ? null : exportsResult.message
        ].filter((message): message is string => Boolean(message));

        setResults(resultsResult.ok ? resultsResult.data : []);
        setApprovalHistory(historyResult.ok ? historyResult.data : []);
        setRateVersions(rateVersionsResult.ok ? rateVersionsResult.data : []);
        setDocumentExports(exportsResult.ok ? exportsResult.data : []);
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

  const latestApprovedRecords = useMemo(() => {
    const seenFileIds = new Set<string>();

    return approvalHistory.filter((record) => {
      if (seenFileIds.has(record.fileId)) {
        return false;
      }

      seenFileIds.add(record.fileId);
      return record.decision === "approved";
    });
  }, [approvalHistory]);

  const approvalByFileId = useMemo(
    () => new Map(latestApprovedRecords.map((record) => [record.fileId, record])),
    [latestApprovedRecords]
  );

  const calculatedFileIds = useMemo(() => new Set(results.map((result) => result.fileId)), [results]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();

    rateVersions.forEach((version) => {
      years.add(String(version.year));
    });
    results.forEach((result) => {
      years.add(result.workDate.slice(0, 4));
    });
    latestApprovedRecords.forEach((record) => {
      years.add(record.processedAt.slice(0, 4));
    });

    return [...years].sort((left, right) => Number(right) - Number(left));
  }, [latestApprovedRecords, rateVersions, results]);

  const normalizedKeyword = deferredKeyword.trim().toLowerCase();

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
          result.rateVersionLabel.toLowerCase().includes(normalizedKeyword)
        );
      }),
    [normalizedKeyword, results, selectedMonth, selectedYear]
  );

  const visiblePendingApprovals = useMemo(
    () =>
      latestApprovedRecords.filter((record) => {
        if (calculatedFileIds.has(record.fileId)) {
          return false;
        }

        if (selectedYear !== "all" && record.processedAt.slice(0, 4) !== selectedYear) {
          return false;
        }

        if (selectedMonth && record.processedAt.slice(0, 7) !== selectedMonth) {
          return false;
        }

        if (!normalizedKeyword) {
          return true;
        }

        return (
          record.fileName.toLowerCase().includes(normalizedKeyword) ||
          record.processedByName.toLowerCase().includes(normalizedKeyword) ||
          (record.comment ?? "").toLowerCase().includes(normalizedKeyword)
        );
      }),
    [calculatedFileIds, latestApprovedRecords, normalizedKeyword, selectedMonth, selectedYear]
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
    () => new Set(visibleResults.map((result) => result.employeeName)).size,
    [visibleResults]
  );

  const distributionItems = useMemo<AllowanceDistributionItem[]>(() => {
    if (visibleResults.length === 0) {
      return [];
    }

    const grouped = new Map<string, { totalAmount: number; count: number }>();

    visibleResults.forEach((result) => {
      const current = grouped.get(result.fileName) ?? { totalAmount: 0, count: 0 };

      current.totalAmount += result.snapshot.totalAllowanceAmount;
      current.count += 1;
      grouped.set(result.fileName, current);
    });

    const maxAmount = Math.max(...[...grouped.values()].map((item) => item.totalAmount), 1);

    return [...grouped.entries()]
      .map(([label, item]) => ({
        label,
        totalAmount: item.totalAmount,
        share: totalAllowanceAmount > 0 ? (item.totalAmount / totalAllowanceAmount) * 100 : 0,
        width: (item.totalAmount / maxAmount) * 100,
        count: item.count
      }))
      .sort((left, right) => right.totalAmount - left.totalAmount);
  }, [totalAllowanceAmount, visibleResults]);

  const typeSummaryItems = useMemo<AllowanceTypeSummaryItem[]>(() => {
    const totals = new Map<AllowanceCode, number>(
      (Object.keys(allowanceCodeLabel) as AllowanceCode[]).map((code) => [code, 0])
    );

    visibleResults.forEach((result) => {
      result.snapshot.lines.forEach((line) => {
        const allowanceCode = line.allowanceCode as AllowanceCode;

        if (!totals.has(allowanceCode)) {
          return;
        }

        totals.set(allowanceCode, (totals.get(allowanceCode) ?? 0) + line.amount);
      });
    });

    return [...totals.entries()]
      .map(([code, totalAmount]) => ({
        code,
        label: allowanceCodeLabel[code],
        totalAmount,
        share: totalAllowanceAmount > 0 ? (totalAmount / totalAllowanceAmount) * 100 : 0
      }))
      .filter((item) => item.totalAmount > 0)
      .sort((left, right) => right.totalAmount - left.totalAmount);
  }, [totalAllowanceAmount, visibleResults]);

  const runCalculation = async (fileId: string) => {
    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingFileId(fileId);

    try {
      const result = await window.appBridge.runApprovedCalculation(fileId);

      if (!result.ok) {
        setActionError(result.message);
        return null;
      }

      setActionMessage(`${result.data.fileName} 수당 산출을 완료했습니다.`);
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
      setProcessingFileId(null);
    }
  };

  const handleRunVisiblePending = async () => {
    if (visiblePendingApprovals.length === 0) {
      setActionError("산출할 승인 완료 항목이 없습니다.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingFileId("__bulk__");

    try {
      let successCount = 0;
      const failedMessages: string[] = [];
      let firstResultId: string | null = null;

      for (const approval of visiblePendingApprovals) {
        const result = await window.appBridge.runApprovedCalculation(approval.fileId);

        if (!result.ok) {
          failedMessages.push(`${approval.fileName}: ${result.message}`);
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

      setActionMessage(
        successCount > 0 ? `${successCount}건의 승인 완료 항목을 수당 산출했습니다.` : null
      );
      setActionError(failedMessages.length > 0 ? failedMessages.join(" / ") : null);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingFileId(null);
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
    setProcessingFileId("__export__");

    try {
      const result = await window.appBridge.exportAllowanceDocuments({
        calculationIds: visibleResults.map((item) => item.id)
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage(
        `${result.data.workMonth} 품의서/별첨1/별첨2 출력이 완료되었습니다.`
      );
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingFileId(null);
    }
  };

  return (
    <div className="screen-stack allowance-screen">
      <section className="surface-card allowance-header-card">
        <div className="button-row spread allowance-top-row">
          <div className="button-row">
            <h3>수당 관리</h3>
            <span className="pill neutral">산출 {results.length}건</span>
            <span className="pill warn">미산출 {visiblePendingApprovals.length}건</span>
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
              {processingFileId === "__export__" ? "출력 중..." : "품의 신청"}
            </button>
            <button
              className="ghost-button compact-button"
              disabled={visiblePendingApprovals.length === 0 || isProcessing}
              onClick={() => {
                void handleRunVisiblePending();
              }}
              type="button"
            >
              {processingFileId === "__bulk__" ? "산출 중..." : "미산출 일괄 계산"}
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
            <select
              onChange={(event) => {
                setSelectedYear(event.target.value);
              }}
              value={selectedYear}
            >
              <option value="all">전체</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>
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
              placeholder="원본 파일/성명/요율 버전 검색"
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
            : "표시할 요율 버전이 없습니다. 승인 완료 후 산출을 실행하면 실제 계산 결과를 확인할 수 있습니다."}
        </p>

        {screenError ? <p className="form-error-text">{screenError}</p> : null}
        {actionError ? <p className="form-error-text">{actionError}</p> : null}
        {actionMessage ? <p className="form-success-text">{actionMessage}</p> : null}
      </section>

      <section className={isChartExpanded ? "allowance-layout expanded-left" : "allowance-layout"}>
        <aside className="allowance-left-column">
          <article className="surface-card">
            <div className="section-heading compact-heading">
              <div>
                <h3>승인 파일별 수당 분포</h3>
                <p>현재 필터 기준 산출 완료 결과만 집계합니다.</p>
              </div>
              <div className="button-row allowance-mode-row">
                <button
                  className={
                    isChartExpanded
                      ? "tab-chip active allowance-mode-button mode-chart"
                      : "tab-chip allowance-mode-button mode-chart"
                  }
                  onClick={() => {
                    setIsChartExpanded(true);
                  }}
                  type="button"
                >
                  <span aria-hidden="true" className="mode-icon" />
                  분석 우선
                </button>
                <button
                  className={
                    isChartExpanded
                      ? "tab-chip allowance-mode-button mode-detail"
                      : "tab-chip active allowance-mode-button mode-detail"
                  }
                  onClick={() => {
                    setIsChartExpanded(false);
                  }}
                  type="button"
                >
                  <span aria-hidden="true" className="mode-icon" />
                  상세 우선
                </button>
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

            {distributionItems.length > 0 ? (
              <div className="progress-list">
                {distributionItems.map((item) => (
                  <div className="progress-row interactive-progress-row" key={item.label}>
                    <div className="progress-copy">
                      <strong>{item.label}</strong>
                      <span>{formatCurrency(item.totalAmount)}</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${item.width}%` }} />
                    </div>
                    <div className="chart-tooltip inline-tooltip">
                      <strong>{item.label}</strong>
                      <span>지급수당 {formatCurrency(item.totalAmount)}</span>
                      <span>구성비 {item.share.toFixed(1)}%</span>
                      <span>산출 {item.count}건</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <AllowanceEmptyState message={isLoading ? "수당 결과를 불러오는 중입니다." : "표시할 산출 결과가 없습니다."} />
            )}

            <div className="allowance-total-box">
              <span>요약</span>
              <strong>{formatCurrency(totalAllowanceAmount)}</strong>
              <em>승인 완료 {latestApprovedRecords.length}건 / 미산출 {visiblePendingApprovals.length}건</em>
            </div>
          </article>

          <article className="surface-card">
            <div className="section-heading compact-heading">
              <div>
                <h3>수당 유형별 구성</h3>
                <p>실제 산출된 line amount 기준으로 집계합니다.</p>
              </div>
            </div>

            {typeSummaryItems.length > 0 ? (
              <div className="allowance-type-list">
                {typeSummaryItems.map((item) => (
                  <div className="allowance-type-row" key={item.code}>
                    <div className="button-row">
                      <span className={`legend-dot ${allowanceCodeLegendClass[item.code]}`} />
                      <strong>{item.label}</strong>
                    </div>
                    <div className="allowance-type-meta">
                      <span>{formatCurrency(item.totalAmount)}</span>
                      <em>{item.share.toFixed(1)}%</em>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <AllowanceEmptyState message="유형별 집계를 표시할 산출 결과가 없습니다." />
            )}
          </article>

          <article className="surface-card allowance-run-card">
            <div className="section-heading compact-heading">
              <div>
                <h3>미산출 승인 목록</h3>
                <p>승인 완료됐지만 아직 수당 계산을 실행하지 않은 파일입니다.</p>
              </div>
              <span className="pill warn">{visiblePendingApprovals.length}건</span>
            </div>

            {visiblePendingApprovals.length > 0 ? (
              <div className="allowance-run-list">
                {visiblePendingApprovals.map((record) => (
                  <div className="allowance-run-item" key={record.id}>
                    <div className="allowance-run-copy">
                      <strong>{record.fileName}</strong>
                      <span>승인시각 {formatDateTime(record.processedAt)}</span>
                      <span>처리자 {record.processedByName}</span>
                    </div>
                    <div className="button-row">
                      <span className="pill neutral">승인완료</span>
                      <button
                        className="ghost-button compact-button"
                        disabled={isProcessing}
                        onClick={() => {
                          void runCalculation(record.fileId);
                        }}
                        type="button"
                      >
                        {processingFileId === record.fileId ? "산출 중..." : "수당 산출"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <AllowanceEmptyState message="현재 필터 기준 미산출 승인 항목이 없습니다." />
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
                    <div className="allowance-export-meta">
                      <span>{record.proposalFileName}</span>
                      <span>{record.attachment1FileName}</span>
                      <span>{record.attachment2FileName}</span>
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
              <p>수당 계산 결과와 승인 메모를 같은 화면에서 확인합니다.</p>
            </div>
            <div className="button-row allowance-table-meta">
              <span className="pill neutral">결과 {visibleResults.length}건</span>
              <span className="pill info">승인 {latestApprovedRecords.length}건</span>
            </div>
          </div>

          <div className="data-scroll">
            <table className="info-table compact-table allowance-results-table">
              <thead>
                <tr>
                  <th>상세</th>
                  <th>원본 파일</th>
                  <th>성명</th>
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
                    const category = getCalculationCategory(result);
                    const approvalRecord = approvalByFileId.get(result.fileId);
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
                          <td className="table-strong">{result.fileName}</td>
                          <td>{result.employeeName}</td>
                          <td>
                            <span className={`pill ${category.tone}`}>{category.label}</span>
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
                                      {allowanceCodeLabel[line.allowanceCode as AllowanceCode]} /{" "}
                                      {formatMinutesCompact(line.workMinutes)} x {line.multiplier} ={" "}
                                      {formatCurrency(line.amount)}
                                    </p>
                                  ))}
                                  <p>총 지급수당 {formatCurrency(result.snapshot.totalAllowanceAmount)}</p>
                                </div>
                                <div>
                                  <strong>승인 / 적용 정보</strong>
                                  <p>산출시각 {formatDateTime(result.snapshot.createdAt)}</p>
                                  <p>승인시각 {formatDateTime(approvalRecord?.processedAt)}</p>
                                  <p>처리자 {approvalRecord?.processedByName ?? "-"}</p>
                                  <p>요율 버전 {result.rateVersionLabel}</p>
                                  <p>승인 메모 {approvalRecord?.comment ?? "없음"}</p>
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
