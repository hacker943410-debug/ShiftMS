import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import type {
  AppSettingsSnapshot,
  FileWatchStatusSnapshot
} from "@shared/bridge/contracts";
import type {
  PerformanceApprovalRecord,
  PerformanceFileDetail,
  PerformanceQueueItem
} from "@shared/domain/performance-file";

import { FormSelect } from "../components/FormSelect";

type TemplateFilter = PerformanceQueueItem["templateKind"] | "all";

const templateKindLabel: Record<PerformanceQueueItem["templateKind"], string> = {
  attachment1: "별첨1",
  attachment2: "별첨2",
  proposal: "품의서",
  "schedule-plan": "근무표",
  unknown: "미확인"
};

const queueStatusLabel: Record<PerformanceQueueItem["status"], string> = {
  pending: "승인대기",
  parsed: "파싱완료",
  approved: "승인",
  rejected: "반려",
  error: "오류"
};

const queueStatusTone: Record<PerformanceQueueItem["status"], "warn" | "info" | "danger" | "neutral"> = {
  pending: "warn",
  parsed: "info",
  approved: "info",
  rejected: "danger",
  error: "danger"
};

const decisionLabel: Record<PerformanceApprovalRecord["decision"], string> = {
  approved: "승인",
  rejected: "반려"
};

const decisionTone: Record<PerformanceApprovalRecord["decision"], "info" | "danger"> = {
  approved: "info",
  rejected: "danger"
};

const createCurrentMonthValue = () => {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

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

const formatFileSize = (value: number) => {
  if (value < 1024) {
    return `${value}B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)}KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
};

const getMonthValue = (value: string) => value.slice(0, 7);

const getPreviewColumns = (detail: PerformanceFileDetail | null) => {
  if (!detail || detail.previewRows.length === 0) {
    return [];
  }

  return Array.from(
    new Set(detail.previewRows.flatMap((row) => Object.keys(row)))
  );
};

const formatWatchEventTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
    2,
    "0"
  )}`;
};

export const PerformanceManagementScreen = () => {
  const [settings, setSettings] = useState<AppSettingsSnapshot | null>(null);
  const [fileWatchStatus, setFileWatchStatus] = useState<FileWatchStatusSnapshot | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PerformanceQueueItem[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<PerformanceApprovalRecord[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<PerformanceFileDetail | null>(null);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>("all");
  const [monthFilter, setMonthFilter] = useState(createCurrentMonthValue());
  const [keyword, setKeyword] = useState("");
  const [approvalComment, setApprovalComment] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isWatchActionRunning, setIsWatchActionRunning] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const deferredKeyword = useDeferredValue(keyword);

  useEffect(() => {
    let active = true;

    const loadOverview = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const [settingsResult, watchStatusResult, pendingResult, historyResult] = await Promise.all([
          window.appBridge.getAppSettings(),
          window.appBridge.getFileWatchStatus(),
          window.appBridge.listPendingFiles(),
          window.appBridge.listApprovalHistory()
        ]);

        if (!active) {
          return;
        }

        if (!settingsResult.ok) {
          setScreenError(settingsResult.message);
        } else {
          setSettings(settingsResult.data);
        }

        if (!watchStatusResult.ok) {
          setScreenError(watchStatusResult.message);
        } else {
          setFileWatchStatus(watchStatusResult.data);
        }

        if (!pendingResult.ok) {
          setScreenError(pendingResult.message);
        } else {
          setPendingFiles(pendingResult.data);
        }

        if (!historyResult.ok) {
          setScreenError(historyResult.message);
        } else {
          setApprovalHistory(historyResult.data);
        }
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

    void loadOverview();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;

    const loadFileWatchStatus = async () => {
      const result = await window.appBridge.getFileWatchStatus();

      if (!active || !result.ok) {
        return;
      }

      setFileWatchStatus(result.data);
    };

    void loadFileWatchStatus();

    const intervalId = window.setInterval(() => {
      void loadFileWatchStatus();
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const pendingIdSet = new Set(pendingFiles.map((item) => item.id));

    setSelectedIds((current) => current.filter((id) => pendingIdSet.has(id)));

    if (pendingFiles.length === 0) {
      setSelectedFileId(null);
      return;
    }

    if (!selectedFileId || !pendingIdSet.has(selectedFileId)) {
      setSelectedFileId(pendingFiles[0]!.id);
    }
  }, [pendingFiles, selectedFileId]);

  useEffect(() => {
    let active = true;

    const loadDetail = async () => {
      if (!selectedFileId) {
        setDetail(null);
        return;
      }

      setIsLoadingDetail(true);

      try {
        const result = await window.appBridge.getPendingFileDetail(selectedFileId);

        if (!active) {
          return;
        }

        if (!result.ok) {
          setActionError(result.message);
          setDetail(null);
          return;
        }

        setDetail(result.data);
      } catch (error) {
        if (active) {
          setActionError(getErrorMessage(error));
          setDetail(null);
        }
      } finally {
        if (active) {
          setIsLoadingDetail(false);
        }
      }
    };

    void loadDetail();

    return () => {
      active = false;
    };
  }, [selectedFileId, refreshKey]);

  const filteredPendingFiles = useMemo(() => {
    const normalizedKeyword = deferredKeyword.trim().toLowerCase();

    return pendingFiles.filter((item) => {
      if (templateFilter !== "all" && item.templateKind !== templateFilter) {
        return false;
      }

      if (monthFilter && getMonthValue(item.receivedAt) !== monthFilter) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return (
        item.fileName.toLowerCase().includes(normalizedKeyword) ||
        item.detailLabel.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [deferredKeyword, monthFilter, pendingFiles, templateFilter]);

  const filteredApprovalHistory = useMemo(() => {
    const normalizedKeyword = deferredKeyword.trim().toLowerCase();

    return approvalHistory.filter((item) => {
      if (monthFilter && getMonthValue(item.processedAt) !== monthFilter) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return (
        item.fileName.toLowerCase().includes(normalizedKeyword) ||
        item.processedByName.toLowerCase().includes(normalizedKeyword) ||
        (item.comment ?? "").toLowerCase().includes(normalizedKeyword) ||
        (item.rejectionReason ?? "").toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [approvalHistory, deferredKeyword, monthFilter]);

  const previewColumns = useMemo(() => getPreviewColumns(detail), [detail]);
  const selectedVisibleCount = filteredPendingFiles.filter((item) => selectedIds.includes(item.id)).length;
  const isAllVisibleSelected =
    filteredPendingFiles.length > 0 && selectedVisibleCount === filteredPendingFiles.length;

  const toggleSelectedFile = (fileId: string) => {
    setSelectedIds((current) =>
      current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId]
    );
  };

  const handleApprove = async () => {
    if (!selectedFileId) {
      setActionError("승인할 실적 파일을 먼저 선택해야 합니다.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);

    try {
      const result = await window.appBridge.approvePendingFile({
        fileId: selectedFileId,
        comment: approvalComment.trim() || undefined
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setApprovalComment("");
      setRejectionReason("");
      setSelectedIds((current) => current.filter((id) => id !== selectedFileId));
      setActionMessage(`${result.data.fileName} 파일을 승인했습니다.`);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedFileId) {
      setActionError("반려할 실적 파일을 먼저 선택해야 합니다.");
      return;
    }

    if (!rejectionReason.trim()) {
      setActionError("반려 사유를 입력해야 합니다.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);

    try {
      const result = await window.appBridge.rejectPendingFile({
        fileId: selectedFileId,
        rejectionReason: rejectionReason.trim(),
        comment: approvalComment.trim() || undefined
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setApprovalComment("");
      setRejectionReason("");
      setSelectedIds((current) => current.filter((id) => id !== selectedFileId));
      setActionMessage(`${result.data.fileName} 파일을 반려했습니다.`);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkApprove = async () => {
    const targetIds = filteredPendingFiles
      .filter((item) => selectedIds.includes(item.id))
      .map((item) => item.id);

    if (targetIds.length === 0) {
      setActionError("일괄승인할 파일을 먼저 선택해야 합니다.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);

    try {
      let successCount = 0;
      const failedMessages: string[] = [];

      for (const fileId of targetIds) {
        const result = await window.appBridge.approvePendingFile({
          fileId,
          comment: approvalComment.trim() || undefined
        });

        if (result.ok) {
          successCount += 1;
          continue;
        }

        failedMessages.push(`${fileId}: ${result.message}`);
      }

      setSelectedIds([]);
      setActionMessage(
        successCount > 0 ? `${successCount}건의 승인대기 파일을 일괄승인했습니다.` : null
      );
      setActionError(failedMessages.length > 0 ? failedMessages.join(" / ") : null);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestartWatch = async () => {
    setActionError(null);
    setActionMessage(null);
    setIsWatchActionRunning(true);

    try {
      const result = await window.appBridge.restartFileWatch();

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setFileWatchStatus(result.data);
      setActionMessage("실적 파일 감시를 재시작했습니다.");
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsWatchActionRunning(false);
    }
  };

  return (
    <div className="screen-stack performance-screen">
      <section className="surface-card performance-page-card">
        <div className="section-heading compact-heading">
          <div>
            <h3>실적 관리</h3>
            <p>승인대기 파일을 실제 대기열, 상세 미리보기, 승인 이력 기준으로 확인합니다.</p>
          </div>
          <div className="button-row">
            <span className="pill warn">대기 {pendingFiles.length}건</span>
            <span className="pill neutral">이력 {approvalHistory.length}건</span>
          </div>
        </div>

        <div className="performance-section">
          <strong>파일 경로 설정</strong>
          <div className="filter-grid two-up">
            <label className="field">
              <span>승인 대기 폴더</span>
              <input readOnly value={settings?.pendingDir ?? "-"} />
            </label>
            <label className="field">
              <span>승인 완료 폴더</span>
              <input readOnly value={settings?.approvedDir ?? "-"} />
            </label>
          </div>
          <div className="button-row" style={{ marginTop: "12px" }}>
            <span className={`pill ${fileWatchStatus?.isRunning ? "info" : "neutral"}`}>
              {fileWatchStatus?.isRunning ? "감시 중" : "감시 중지"}
            </span>
            <span className="pill neutral">
              최근 이벤트 {fileWatchStatus?.recentEvents.length ?? 0}건
            </span>
            <span className="pill neutral">
              최근 시작 {formatWatchEventTime(fileWatchStatus?.lastStartedAt)}
            </span>
            <button
              className="ghost-button compact-button"
              disabled={isWatchActionRunning}
              onClick={() => {
                void handleRestartWatch();
              }}
              type="button"
            >
              {isWatchActionRunning ? "재시작 중..." : "감시 재시작"}
            </button>
          </div>
          <p className="field-hint">
            {fileWatchStatus?.lastErrorMessage
              ? `최근 감시 오류: ${fileWatchStatus.lastErrorMessage}`
              : fileWatchStatus?.recentEvents[0]
                ? `최근 이벤트 ${formatWatchEventTime(fileWatchStatus.recentEvents[0].occurredAt)} / ${fileWatchStatus.recentEvents[0].fileName}`
                : "최근 감지 이벤트가 없습니다."}
          </p>
        </div>

        <div className="performance-section">
          <strong>상세 필터</strong>
          <div className="filter-grid performance-filter-grid">
            <label className="field filter-field filter-field-sm">
              <span>상태</span>
              <input readOnly value="승인대기" />
            </label>
            <label className="field filter-field filter-field-sm">
              <span>양식</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setTemplateFilter(event.target.value as TemplateFilter);
                }}
                selectClassName="top-filter-select"
                value={templateFilter}
              >
                <option value="all">전체</option>
                <option value="attachment1">별첨1</option>
                <option value="attachment2">별첨2</option>
                <option value="proposal">품의서</option>
                <option value="schedule-plan">근무표</option>
                <option value="unknown">미확인</option>
              </FormSelect>
            </label>
            <label className="field filter-field filter-field-sm">
              <span>접수월</span>
              <input
                onChange={(event) => {
                  setMonthFilter(event.target.value);
                }}
                type="month"
                value={monthFilter}
              />
            </label>
            <label className="field filter-field filter-field-search">
              <span>검색</span>
              <input
                onChange={(event) => {
                  setKeyword(event.target.value);
                }}
                placeholder="파일명/양식/처리자 검색"
                value={keyword}
              />
            </label>
            <div className="button-row align-end">
              <button
                className="ghost-button compact-button"
                onClick={() => {
                  setRefreshKey((current) => current + 1);
                }}
                type="button"
              >
                새로고침
              </button>
              <button
                className="primary-button compact-button"
                disabled={selectedVisibleCount === 0 || isProcessing}
                onClick={() => {
                  void handleBulkApprove();
                }}
                type="button"
              >
                {isProcessing ? "처리 중..." : "일괄승인"}
              </button>
            </div>
          </div>
        </div>

        {screenError ? <p className="form-error-text">{screenError}</p> : null}
        {actionError ? <p className="form-error-text">{actionError}</p> : null}
        {actionMessage ? <p className="form-success-text">{actionMessage}</p> : null}
      </section>

      <section className="performance-layout">
        <article className="surface-card performance-queue-card">
          <div className="section-heading compact-heading">
            <div>
              <h3>승인대기 목록</h3>
              <p>선택한 파일은 오른쪽 상세 패널에서 바로 확인하고 처리할 수 있습니다.</p>
            </div>
            <div className="button-row performance-selection-row">
              <button
                className="ghost-button compact-button"
                onClick={() => {
                  setSelectedIds(
                    isAllVisibleSelected ? [] : filteredPendingFiles.map((item) => item.id)
                  );
                }}
                type="button"
              >
                {isAllVisibleSelected ? "선택 해제" : "전체 선택"}
              </button>
              <span className="pill neutral">{selectedVisibleCount}건 선택</span>
            </div>
          </div>

          <div className="data-scroll">
            <table className="info-table compact-table performance-table">
              <thead>
                <tr>
                  <th>선택</th>
                  <th>파일명</th>
                  <th>양식</th>
                  <th>접수시각</th>
                  <th>크기</th>
                  <th>상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7}>승인대기 파일을 불러오는 중입니다.</td>
                  </tr>
                ) : filteredPendingFiles.length > 0 ? (
                  filteredPendingFiles.map((item) => (
                    <tr
                      className={item.id === selectedFileId ? "selected" : ""}
                      key={item.id}
                      onClick={() => {
                        startTransition(() => {
                          setSelectedFileId(item.id);
                        });
                      }}
                    >
                      <td
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <input
                          checked={selectedIds.includes(item.id)}
                          onChange={() => {
                            toggleSelectedFile(item.id);
                          }}
                          type="checkbox"
                        />
                      </td>
                      <td className="table-strong">{item.fileName}</td>
                      <td>
                        <span className={`pill ${queueStatusTone[item.status]}`}>
                          {templateKindLabel[item.templateKind]}
                        </span>
                      </td>
                      <td>{formatDateTime(item.receivedAt)}</td>
                      <td>{formatFileSize(item.fileSize)}</td>
                      <td>
                        <span className={`pill ${queueStatusTone[item.status]}`}>
                          {queueStatusLabel[item.status]}
                        </span>
                      </td>
                      <td>
                        <button
                          className={item.id === selectedFileId ? "icon-button active" : "icon-button"}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedFileId(item.id);
                          }}
                          type="button"
                        >
                          {item.id === selectedFileId ? "열림" : "상세"}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>조건에 맞는 승인대기 파일이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="performance-detail-side">
          <article className="surface-card performance-detail-card">
            <div className="section-heading compact-heading">
              <div>
                <h3>파일 상세</h3>
                <p>선택한 파일의 메타데이터, 미리보기, 승인 메모를 확인합니다.</p>
              </div>
            </div>

            {isLoadingDetail ? (
              <div className="performance-empty-state">
                <strong>파일 상세를 불러오는 중입니다.</strong>
              </div>
            ) : detail ? (
              <>
                <div className="performance-meta-grid">
                  <div className="performance-meta-item">
                    <span>파일명</span>
                    <strong>{detail.fileName}</strong>
                  </div>
                  <div className="performance-meta-item">
                    <span>양식 / 시트</span>
                    <strong>
                      {templateKindLabel[detail.templateKind]} / {detail.sheetName || "시트 미확인"}
                    </strong>
                  </div>
                  <div className="performance-meta-item">
                    <span>접수시각</span>
                    <strong>{formatDateTime(detail.receivedAt)}</strong>
                  </div>
                  <div className="performance-meta-item">
                    <span>행 / 열 / 크기</span>
                    <strong>
                      {detail.rowCount}행 / {detail.columnCount}열 / {formatFileSize(detail.fileSize)}
                    </strong>
                  </div>
                </div>

                <div className="performance-preview-shell">
                  <div className="section-heading compact-heading">
                    <div>
                      <h3>미리보기</h3>
                      <p>{detail.filePath}</p>
                    </div>
                  </div>
                  {detail.previewRows.length > 0 ? (
                    <div className="data-scroll">
                      <table className="info-table compact-table performance-preview-table">
                        <thead>
                          <tr>
                            {previewColumns.map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.previewRows.map((row, index) => (
                            <tr key={`${detail.id}-preview-${index}`}>
                              {previewColumns.map((column) => (
                                <td key={`${detail.id}-${index}-${column}`}>{String(row[column] ?? "-")}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="performance-empty-state compact">
                      <strong>표시할 미리보기 행이 없습니다.</strong>
                    </div>
                  )}
                </div>

                <div className="performance-preview-shell">
                  <div className="section-heading compact-heading">
                    <div>
                      <h3>파싱 엔트리</h3>
                      <p>수당 계산에 연결될 실적 행을 확인합니다.</p>
                    </div>
                    <span className="pill neutral">{detail.entries.length}건</span>
                  </div>
                  {detail.entries.length > 0 ? (
                    <div className="data-scroll">
                      <table className="info-table compact-table performance-preview-table">
                        <thead>
                          <tr>
                            <th>사번</th>
                            <th>성명</th>
                            <th>근무일자</th>
                            <th>시간</th>
                            <th>부서</th>
                            <th>구분</th>
                            <th>시급</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.entries.map((entry) => (
                            <tr key={entry.id}>
                              <td>{entry.employeeCode}</td>
                              <td>{entry.employeeName}</td>
                              <td>{entry.workDate}</td>
                              <td>{entry.workHours}</td>
                              <td>{entry.department ?? "-"}</td>
                              <td>{entry.category ?? "-"}</td>
                              <td>{entry.hourlyRate ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="performance-empty-state compact">
                      <strong>파싱된 실적 엔트리가 없습니다.</strong>
                    </div>
                  )}
                </div>

                <div className="performance-action-form">
                  <label className="field">
                    <span>검토 메모</span>
                    <input
                      onChange={(event) => {
                        setApprovalComment(event.target.value);
                      }}
                      placeholder="승인/반려 메모를 남길 수 있습니다."
                      value={approvalComment}
                    />
                  </label>
                  <label className="field">
                    <span>반려 사유</span>
                    <textarea
                      onChange={(event) => {
                        setRejectionReason(event.target.value);
                      }}
                      placeholder="반려 시 사유를 입력합니다."
                      rows={3}
                      value={rejectionReason}
                    />
                  </label>
                  <div className="button-row">
                    <button
                      className="ghost-button"
                      disabled={isProcessing}
                      onClick={() => {
                        void handleReject();
                      }}
                      type="button"
                    >
                      {isProcessing ? "처리 중..." : "반려"}
                    </button>
                    <button
                      className="primary-button"
                      disabled={isProcessing}
                      onClick={() => {
                        void handleApprove();
                      }}
                      type="button"
                    >
                      {isProcessing ? "처리 중..." : "승인"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="performance-empty-state">
                <strong>상세를 볼 승인대기 파일을 선택하세요.</strong>
              </div>
            )}
          </article>

          <article className="surface-card performance-history-card">
            <div className="section-heading compact-heading">
              <div>
                <h3>승인 이력</h3>
                <p>실제 승인/반려 처리 결과가 시간순으로 기록됩니다.</p>
              </div>
            </div>
            <div className="data-scroll">
              <table className="info-table compact-table performance-preview-table">
                <thead>
                  <tr>
                    <th>처리시각</th>
                    <th>파일명</th>
                    <th>결정</th>
                    <th>처리자</th>
                    <th>메모 / 사유</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApprovalHistory.length > 0 ? (
                    filteredApprovalHistory.map((item) => (
                      <tr key={item.id}>
                        <td>{formatDateTime(item.processedAt)}</td>
                        <td>{item.fileName}</td>
                        <td>
                          <span className={`pill ${decisionTone[item.decision]}`}>
                            {decisionLabel[item.decision]}
                          </span>
                        </td>
                        <td>{item.processedByName}</td>
                        <td>{item.rejectionReason ?? item.comment ?? "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>조건에 맞는 승인 이력이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
};
