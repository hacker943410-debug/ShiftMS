import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import type {
  AppSettingsSnapshot,
  AppSettingsUpdateInput,
  FileWatchStatusSnapshot
} from "@shared/bridge/contracts";
import type {
  PerformanceAlert,
  PerformanceApprovalRecord,
  PerformanceEntryRecord,
  PerformanceFileDetail,
  PerformanceQueueItem
} from "@shared/domain/performance-file";

const queueStatusLabel: Record<PerformanceQueueItem["status"], string> = {
  pending: "검토 중",
  parsed: "파싱완료",
  approved: "승인완료",
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

const workTypeLabel: Record<PerformanceEntryRecord["section"], string> = {
  "legal-holiday": "법정휴일근무",
  substitute: "대체근무",
  overtime: "연장근무"
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

const createSettingsDraft = (settings?: AppSettingsSnapshot | null): AppSettingsUpdateInput => ({
  holidayApiBaseUrl: settings?.holidayApiBaseUrl ?? "",
  pendingDir: settings?.pendingDir ?? "",
  approvedDir: settings?.approvedDir ?? "",
  scheduleExportDir: settings?.scheduleExportDir ?? ""
});

const toHourText = (minutes: number) => {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
};

const getWorkSummary = (entry: Pick<
  PerformanceEntryRecord,
  "totalWorkMinutes" | "baseWorkMinutes" | "overtimeMinutes" | "nightMinutes" | "breakMinutes"
>) =>
  `총 ${toHourText(entry.totalWorkMinutes)} / 기본 ${toHourText(entry.baseWorkMinutes)} / 연장 ${toHourText(entry.overtimeMinutes)} / 야간 ${toHourText(entry.nightMinutes)} / 휴게 ${toHourText(entry.breakMinutes)}`;

const getAlertButtonLabel = (alerts: PerformanceAlert[]) =>
  alerts.length > 0 ? `오류 ${alerts.length}건` : "-";

const EntrySectionTable = ({
  entries,
  isProcessing,
  onApprove,
  onOpenAlerts,
  processingEntryId,
  allowApprove
}: {
  entries: PerformanceEntryRecord[];
  isProcessing: boolean;
  onApprove: (entry: PerformanceEntryRecord) => void;
  onOpenAlerts: (title: string, alerts: PerformanceAlert[]) => void;
  processingEntryId: string | null;
  allowApprove: boolean;
}) => (
  <div className="data-scroll">
    <table className="info-table compact-table performance-preview-table">
      <thead>
        <tr>
          <th>날짜</th>
          <th>이름</th>
          <th>근로유형</th>
          <th>근무시간</th>
          <th>사유</th>
          <th>증적자료</th>
          <th>상태</th>
          <th>알림</th>
          <th>관리</th>
        </tr>
      </thead>
      <tbody>
        {entries.length > 0 ? (
          entries.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.workDate}</td>
              <td>{entry.employeeName}</td>
              <td>{workTypeLabel[entry.section]}</td>
              <td>{getWorkSummary(entry)}</td>
              <td>{entry.reason ?? "-"}</td>
              <td>{entry.evidence ?? "-"}</td>
              <td>
                <span className={`pill ${entry.status === "approved" ? "info" : "warn"}`}>
                  {entry.status === "approved" ? "승인" : "미승인"}
                </span>
              </td>
              <td>
                {entry.alerts.length > 0 ? (
                  <button
                    className="ghost-button compact-button"
                    onClick={() => {
                      onOpenAlerts(`${entry.workDate} ${entry.employeeName}`, entry.alerts);
                    }}
                    type="button"
                  >
                    {getAlertButtonLabel(entry.alerts)}
                  </button>
                ) : (
                  "-"
                )}
              </td>
              <td>
                <button
                  className="primary-button compact-button"
                  disabled={!allowApprove || isProcessing || entry.status === "approved"}
                  onClick={() => {
                    onApprove(entry);
                  }}
                  type="button"
                >
                  {!allowApprove
                    ? "조회전용"
                    : processingEntryId === entry.id
                      ? "승인 중..."
                      : entry.status === "approved"
                        ? "승인됨"
                        : "승인"}
                </button>
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={9}>표시할 실적 행이 없습니다.</td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

export const PerformanceManagementScreen = () => {
  const [settings, setSettings] = useState<AppSettingsSnapshot | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AppSettingsUpdateInput>(createSettingsDraft());
  const [fileWatchStatus, setFileWatchStatus] = useState<FileWatchStatusSnapshot | null>(null);
  const [performanceFiles, setPerformanceFiles] = useState<PerformanceQueueItem[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<PerformanceApprovalRecord[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PerformanceFileDetail | null>(null);
  const [monthFilter, setMonthFilter] = useState(createCurrentMonthValue());
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved">("pending");
  const [keyword, setKeyword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingEntryId, setProcessingEntryId] = useState<string | null>(null);
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isWatchActionRunning, setIsWatchActionRunning] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<{ title: string; alerts: PerformanceAlert[] } | null>(
    null
  );
  const [refreshKey, setRefreshKey] = useState(0);

  const deferredKeyword = useDeferredValue(keyword);

  useEffect(() => {
    let active = true;

    const loadOverview = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const [settingsResult, watchStatusResult, filesResult, historyResult] = await Promise.all([
          window.appBridge.getAppSettings(),
          window.appBridge.getFileWatchStatus(),
          window.appBridge.listPerformanceFiles({
            status: statusFilter,
            scheduleMonth: monthFilter
          }),
          window.appBridge.listApprovalHistory()
        ]);

        if (!active) {
          return;
        }

        if (settingsResult.ok) {
          setSettings(settingsResult.data);
          setSettingsDraft(createSettingsDraft(settingsResult.data));
        }

        if (watchStatusResult.ok) {
          setFileWatchStatus(watchStatusResult.data);
        }

        if (filesResult.ok) {
          setPerformanceFiles(filesResult.data);
        }

        if (historyResult.ok) {
          setApprovalHistory(historyResult.data);
        }

        const errors = [
          settingsResult.ok ? null : settingsResult.message,
          watchStatusResult.ok ? null : watchStatusResult.message,
          filesResult.ok ? null : filesResult.message,
          historyResult.ok ? null : historyResult.message
        ].filter((message): message is string => Boolean(message));

        setScreenError(errors.length > 0 ? errors.join(" / ") : null);
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
  }, [monthFilter, refreshKey, statusFilter]);

  useEffect(() => {
    const pendingIdSet = new Set(performanceFiles.map((item) => item.id));

    if (performanceFiles.length === 0) {
      setSelectedFileId(null);
      return;
    }

    if (!selectedFileId || !pendingIdSet.has(selectedFileId)) {
      setSelectedFileId(performanceFiles[0]!.id);
    }
  }, [performanceFiles, selectedFileId]);

  useEffect(() => {
    let active = true;

    const loadDetail = async () => {
      if (!selectedFileId) {
        setDetail(null);
        return;
      }

      setIsLoadingDetail(true);

      try {
        const detailResult = await window.appBridge.getPerformanceFileDetail({
          fileId: selectedFileId,
          status: statusFilter,
          scheduleMonth: monthFilter
        });

        if (!active) {
          return;
        }

        if (!detailResult.ok) {
          setActionError(detailResult.message);
          setDetail(null);
          return;
        }

        setDetail(detailResult.data);
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
  }, [monthFilter, refreshKey, selectedFileId, statusFilter]);

  const filteredPerformanceFiles = useMemo(() => {
    const normalizedKeyword = deferredKeyword.trim().toLowerCase();

    return performanceFiles.filter((item) => {
      if (monthFilter && item.scheduleMonth && item.scheduleMonth !== monthFilter) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return (
        item.fileName.toLowerCase().includes(normalizedKeyword) ||
        item.siteName.toLowerCase().includes(normalizedKeyword) ||
        item.detailLabel.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [deferredKeyword, monthFilter, performanceFiles]);

  const filteredApprovalHistory = useMemo(() => {
    const normalizedKeyword = deferredKeyword.trim().toLowerCase();

    return approvalHistory.filter((item) => {
      if (monthFilter && !item.workDate.startsWith(monthFilter)) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return (
        item.fileName.toLowerCase().includes(normalizedKeyword) ||
        item.employeeName.toLowerCase().includes(normalizedKeyword) ||
        item.processedByName.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [approvalHistory, deferredKeyword, monthFilter]);

  const groupedEntries = useMemo(() => {
    const source = detail?.entries ?? [];

    return {
      holiday: source.filter((entry) => entry.section === "legal-holiday"),
      substitute: source.filter((entry) => entry.section === "substitute"),
      overtime: source.filter((entry) => entry.section === "overtime")
    };
  }, [detail]);

  const handleApprove = async (entry: PerformanceEntryRecord) => {
    if (!detail) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingEntryId(entry.id);

    try {
      const result = await window.appBridge.approvePendingFile({
        fileId: detail.id,
        entryId: entry.id
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage(
        `${entry.employeeName} ${workTypeLabel[entry.section]} 실적을 승인했습니다.`
      );
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingEntryId(null);
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

  const handleSelectDirectory = async (field: "pendingDir" | "approvedDir") => {
    setActionError(null);
    setActionMessage(null);
    setIsSelectingDirectory(true);

    try {
      const result = await window.appBridge.selectDirectory({
        defaultPath: settingsDraft[field],
        title: field === "pendingDir" ? "승인 대기 폴더 선택" : "승인 완료 폴더 선택",
        buttonLabel: "폴더 선택"
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      if (!result.data) {
        return;
      }

      setSettingsDraft((current) => ({
        ...current,
        [field]: result.data
      }));
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSelectingDirectory(false);
    }
  };

  const handleSaveDirectories = async () => {
    if (!settings) {
      setActionError("경로 설정을 저장할 수 없습니다.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsSavingSettings(true);

    try {
      const result = await window.appBridge.saveAppSettings({
        holidayApiBaseUrl: settings.holidayApiBaseUrl,
        pendingDir: settingsDraft.pendingDir,
        approvedDir: settingsDraft.approvedDir,
        scheduleExportDir: settings.scheduleExportDir
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setSettings(result.data);
      setSettingsDraft(createSettingsDraft(result.data));
      setActionMessage("실적 파일 경로를 저장했습니다.");
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="screen-stack performance-screen">
      <section className="surface-card performance-page-card">
        <div className="section-heading compact-heading">
          <div>
            <h3>실적 관리</h3>
            <p>반환된 근무표 파일을 컨테이너로 불러오고, 인원별 실적을 승인합니다.</p>
          </div>
          <div className="button-row">
            <span className={`pill ${statusFilter === "pending" ? "warn" : "info"}`}>
              {statusFilter === "pending" ? "승인대기" : "승인완료"} {performanceFiles.length}건
            </span>
            <span className="pill neutral">승인 이력 {approvalHistory.length}건</span>
          </div>
        </div>

        <div className="performance-section">
          <strong>파일 경로 설정</strong>
          <div className="filter-grid two-up performance-path-grid">
            <div className="field field-with-action">
              <span>승인 대기 폴더</span>
              <div className="field-action-row">
                <input readOnly value={settingsDraft.pendingDir || "-"} />
                <button
                  className="ghost-button"
                  disabled={isSelectingDirectory || isSavingSettings}
                  onClick={() => {
                    void handleSelectDirectory("pendingDir");
                  }}
                  type="button"
                >
                  {isSelectingDirectory ? "선택 중..." : "폴더 선택"}
                </button>
              </div>
            </div>
            <div className="field field-with-action">
              <span>승인 완료 폴더</span>
              <div className="field-action-row">
                <input readOnly value={settingsDraft.approvedDir || "-"} />
                <button
                  className="ghost-button"
                  disabled={isSelectingDirectory || isSavingSettings}
                  onClick={() => {
                    void handleSelectDirectory("approvedDir");
                  }}
                  type="button"
                >
                  {isSelectingDirectory ? "선택 중..." : "폴더 선택"}
                </button>
              </div>
            </div>
          </div>
          <div className="button-row" style={{ marginTop: "12px" }}>
            <span className={`pill ${fileWatchStatus?.isRunning ? "info" : "neutral"}`}>
              {fileWatchStatus?.isRunning ? "감시 중" : "감시 중지"}
            </span>
            <button
              className="ghost-button compact-button"
              disabled={isSavingSettings || isSelectingDirectory}
              onClick={() => {
                void handleSaveDirectories();
              }}
              type="button"
            >
              {isSavingSettings ? "저장 중..." : "경로 저장"}
            </button>
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
        </div>

        <div className="performance-section">
          <strong>필터</strong>
          <div className="filter-grid performance-filter-grid performance-filter-grid-balanced">
            <label className="field filter-field performance-filter-field">
              <span>조회구분</span>
              <select
                onChange={(event) => {
                  setStatusFilter(event.target.value as "pending" | "approved");
                }}
                value={statusFilter}
              >
                <option value="pending">승인대기</option>
                <option value="approved">승인완료</option>
              </select>
            </label>
            <label className="field filter-field performance-filter-field">
              <span>접수월</span>
              <input
                onChange={(event) => {
                  setMonthFilter(event.target.value);
                }}
                type="month"
                value={monthFilter}
              />
            </label>
            <label className="field filter-field performance-filter-field performance-filter-search-field">
              <span>검색</span>
              <input
                onChange={(event) => {
                  setKeyword(event.target.value);
                }}
                placeholder="파일명/근무지/이름 검색"
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
              <h3>파일 컨테이너</h3>
              <p>접수월과 근무지 기준으로 반환된 근무표 파일을 확인합니다.</p>
            </div>
          </div>

          <div className="data-scroll">
              <table className="info-table compact-table performance-table">
              <thead>
                <tr>
                  <th>파일명</th>
                  <th>접수월</th>
                  <th>근무지</th>
                  <th>승인 진행</th>
                  <th>알림</th>
                  <th>상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7}>실적 파일을 불러오는 중입니다.</td>
                  </tr>
                ) : filteredPerformanceFiles.length > 0 ? (
                  filteredPerformanceFiles.map((item) => (
                    <tr
                      className={item.id === selectedFileId ? "selected" : ""}
                      key={item.id}
                      onClick={() => {
                        startTransition(() => {
                          setSelectedFileId(item.id);
                        });
                      }}
                    >
                      <td className="table-strong">{item.fileName}</td>
                      <td>{item.scheduleMonth || "-"}</td>
                      <td>{item.siteName || "-"}</td>
                      <td>
                        {item.approvedEntryCount}/{item.entryCount}
                      </td>
                      <td>{item.warningCount > 0 ? `${item.warningCount}건` : "-"}</td>
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
                          {item.id === selectedFileId ? "열림" : "펼치기"}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>
                      조건에 맞는 {statusFilter === "pending" ? "승인대기" : "승인완료"} 실적 파일이 없습니다.
                    </td>
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
                <h3>실적 상세</h3>
                <p>
                  법정휴일, 대체근무, 연장근무 순으로 인원별 실적을 확인합니다.
                  {statusFilter === "approved"
                    ? " 승인완료 파일은 승인완료 폴더의 선택 월 경로를 기준으로 조회합니다."
                    : ""}
                </p>
              </div>
            </div>

            {isLoadingDetail ? (
              <div className="performance-empty-state">
                <strong>실적 상세를 불러오는 중입니다.</strong>
              </div>
            ) : detail ? (
              <>
                <div className="performance-meta-grid">
                  <div className="performance-meta-item">
                    <span>파일명</span>
                    <strong>{detail.fileName}</strong>
                  </div>
                  <div className="performance-meta-item">
                    <span>접수월 / 근무지</span>
                    <strong>
                      {detail.scheduleMonth || "-"} / {detail.siteName || "-"}
                    </strong>
                  </div>
                  <div className="performance-meta-item">
                    <span>행 / 열 / 크기</span>
                    <strong>
                      {detail.rowCount}행 / {detail.columnCount}열 / {formatFileSize(detail.fileSize)}
                    </strong>
                  </div>
                  <div className="performance-meta-item">
                    <span>승인 진행</span>
                    <strong>
                      {detail.approvedEntryCount}/{detail.entryCount}
                    </strong>
                  </div>
                </div>

                {detail.alerts.length > 0 ? (
                  <div className="performance-alert-strip">
                    {detail.alerts.map((alert) => (
                      <button
                        className={`pill ${alert.severity === "error" ? "danger" : "warn"}`}
                        key={`${detail.id}-${alert.message}`}
                        onClick={() => {
                          setAlertModal({
                            title: `${detail.fileName} 알림`,
                            alerts: detail.alerts
                          });
                        }}
                        type="button"
                      >
                        {alert.message}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="performance-preview-shell">
                  <div className="section-heading compact-heading">
                    <div>
                      <h3>법정휴일근무</h3>
                      <p>공휴일 행과 변경 전/후 계획 비교 기준</p>
                    </div>
                    <span className="pill neutral">{groupedEntries.holiday.length}건</span>
                  </div>
                  <EntrySectionTable
                    entries={groupedEntries.holiday}
                    allowApprove={statusFilter === "pending"}
                    isProcessing={isProcessing}
                    onApprove={(entry) => {
                      void handleApprove(entry);
                    }}
                    onOpenAlerts={(title, alerts) => {
                      setAlertModal({ title, alerts });
                    }}
                    processingEntryId={processingEntryId}
                  />
                </div>

                <div className="performance-preview-shell">
                  <div className="section-heading compact-heading">
                    <div>
                      <h3>대체근무</h3>
                      <p>대체근무자 투입 이력 표 기준</p>
                    </div>
                    <span className="pill neutral">{groupedEntries.substitute.length}건</span>
                  </div>
                  <EntrySectionTable
                    entries={groupedEntries.substitute}
                    allowApprove={statusFilter === "pending"}
                    isProcessing={isProcessing}
                    onApprove={(entry) => {
                      void handleApprove(entry);
                    }}
                    onOpenAlerts={(title, alerts) => {
                      setAlertModal({ title, alerts });
                    }}
                    processingEntryId={processingEntryId}
                  />
                </div>

                <div className="performance-preview-shell">
                  <div className="section-heading compact-heading">
                    <div>
                      <h3>연장근무</h3>
                      <p>연장근무 시간 입력 표 기준</p>
                    </div>
                    <span className="pill neutral">{groupedEntries.overtime.length}건</span>
                  </div>
                  <EntrySectionTable
                    entries={groupedEntries.overtime}
                    allowApprove={statusFilter === "pending"}
                    isProcessing={isProcessing}
                    onApprove={(entry) => {
                      void handleApprove(entry);
                    }}
                    onOpenAlerts={(title, alerts) => {
                      setAlertModal({ title, alerts });
                    }}
                    processingEntryId={processingEntryId}
                  />
                </div>
              </>
            ) : (
              <div className="performance-empty-state">
                <strong>펼쳐볼 실적 파일을 선택하세요.</strong>
              </div>
            )}
          </article>

          <article className="surface-card performance-history-card">
            <div className="section-heading compact-heading">
              <div>
                <h3>승인 이력</h3>
                <p>인원별 승인 결과를 시간순으로 확인합니다.</p>
              </div>
            </div>
            <div className="data-scroll">
              <table className="info-table compact-table performance-preview-table">
                <thead>
                  <tr>
                    <th>처리시각</th>
                    <th>파일명</th>
                    <th>날짜</th>
                    <th>이름</th>
                    <th>유형</th>
                    <th>처리자</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApprovalHistory.length > 0 ? (
                    filteredApprovalHistory.map((item) => (
                      <tr key={item.id}>
                        <td>{formatDateTime(item.processedAt)}</td>
                        <td>{item.fileName}</td>
                        <td>{item.workDate}</td>
                        <td>{item.employeeName}</td>
                        <td>{workTypeLabel[item.workType === "holiday" ? "legal-holiday" : item.workType === "substitute" ? "substitute" : "overtime"]}</td>
                        <td>{item.processedByName}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>조건에 맞는 승인 이력이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </aside>
      </section>

      {alertModal ? (
        <div className="modal-overlay">
          <section aria-modal="true" className="modal-card performance-alert-modal" role="dialog">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong>{alertModal.title}</strong>
                <p>상세 알림을 확인합니다.</p>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setAlertModal(null);
                }}
                type="button"
              >
                닫기
              </button>
            </div>
            <div className="performance-alert-list">
              {alertModal.alerts.map((alert) => (
                <p
                  className={alert.severity === "error" ? "form-error-text" : "field-hint"}
                  key={`${alertModal.title}-${alert.message}`}
                >
                  {alert.message}
                </p>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};
