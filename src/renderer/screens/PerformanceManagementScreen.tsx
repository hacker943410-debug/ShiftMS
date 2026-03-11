import { useEffect, useState } from "react";

import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type {
  PerformanceApprovalRecord,
  PerformanceFileDetail,
  PerformanceQueueItem
} from "@shared/domain/performance-file";
import { StatusBadge } from "../components/StatusBadge";

const formatDecisionLabel = (decision: PerformanceApprovalRecord["decision"]) =>
  decision === "approved" ? "승인" : "반려";

export const PerformanceManagementScreen = () => {
  const [items, setItems] = useState<PerformanceQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PerformanceFileDetail | null>(null);
  const [history, setHistory] = useState<PerformanceApprovalRecord[]>([]);
  const [calculationResults, setCalculationResults] = useState<AllowanceCalculationResultRecord[]>([]);
  const [rejectionReason, setRejectionReason] = useState("");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadQueue = async (preferredId?: string | null) => {
    const result = await window.appBridge.listPendingFiles();

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setItems(result.data);
    setSelectedId((currentId) => {
      if (preferredId && result.data.some((item) => item.id === preferredId)) {
        return preferredId;
      }

      if (currentId && result.data.some((item) => item.id === currentId)) {
        return currentId;
      }

      return result.data[0]?.id ?? null;
    });
  };

  const loadHistory = async () => {
    const result = await window.appBridge.listApprovalHistory();

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setHistory(result.data);
  };

  const loadCalculationResults = async () => {
    const result = await window.appBridge.listCalculationResults();

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setCalculationResults(result.data);
  };

  useEffect(() => {
    void Promise.all([loadQueue(), loadHistory(), loadCalculationResults()]);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    void window.appBridge.getPendingFileDetail(selectedId).then((result) => {
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      setDetail(result.data);
    });
  }, [selectedId]);

  const handleApprove = async () => {
    if (!detail) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await window.appBridge.approvePendingFile({
        fileId: detail.id,
        comment: comment.trim() || undefined
      });

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      setComment("");
      setRejectionReason("");
      await Promise.all([loadQueue(), loadHistory()]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!detail) {
      return;
    }

    const normalizedReason = rejectionReason.trim();

    if (!normalizedReason) {
      setErrorMessage("반려 사유를 입력해야 합니다.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await window.appBridge.rejectPendingFile({
        fileId: detail.id,
        rejectionReason: normalizedReason,
        comment: comment.trim() || undefined
      });

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      setComment("");
      setRejectionReason("");
      await Promise.all([loadQueue(), loadHistory()]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunCalculation = async (fileId: string) => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await window.appBridge.runApprovedCalculation(fileId);

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      await loadCalculationResults();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">실적 관리</p>
          <h3>승인 대기 목록, 상세 미리보기, 최근 처리 이력</h3>
        </div>
        <StatusBadge
          label={items.length > 0 ? `대기 ${items.length}건` : "대기 없음"}
          tone={items.length > 0 ? "warn" : "good"}
        />
      </div>

      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}

      <div className="detail-grid">
        <div className="detail-list">
          {items.length > 0 ? (
            items.map((item) => (
              <button
                key={item.id}
                className={item.id === selectedId ? "detail-list-item active" : "detail-list-item"}
                onClick={() => setSelectedId(item.id)}
                type="button"
              >
                <strong>{item.fileName}</strong>
                <span>{item.detailLabel}</span>
                <StatusBadge
                  label={item.status}
                  tone={item.status === "pending" ? "warn" : "info"}
                />
              </button>
            ))
          ) : (
            <div className="detail-empty">
              <strong>승인 대기 파일이 없습니다.</strong>
              <span>최근 승인/반려 이력은 우측 패널에서 계속 확인할 수 있습니다.</span>
            </div>
          )}
        </div>

        <div className="detail-panel">
          {detail ? (
            <>
              <div className="detail-summary">
                <h4>{detail.fileName}</h4>
                <p>{detail.filePath}</p>
              </div>

              <div className="detail-meta">
                <div><span>템플릿</span><strong>{detail.templateKind}</strong></div>
                <div><span>시트</span><strong>{detail.sheetName || "-"}</strong></div>
                <div><span>행/열</span><strong>{detail.rowCount} / {detail.columnCount}</strong></div>
                <div><span>중복 키</span><strong>{detail.duplicateKey}</strong></div>
              </div>

              {detail.latestApproval ? (
                <div className="detail-banner">
                  <strong>{formatDecisionLabel(detail.latestApproval.decision)} 완료</strong>
                  <span>
                    {detail.latestApproval.processedByName} · {detail.latestApproval.processedAt}
                  </span>
                </div>
              ) : (
                <div className="action-card">
                  <div className="action-card-header">
                    <strong>승인 처리</strong>
                    <span>검토 메모는 선택, 반려 사유는 필수입니다.</span>
                  </div>
                  <div className="action-grid">
                    <label className="form-field">
                      <span>검토 메모</span>
                      <input
                        onChange={(event) => setComment(event.target.value)}
                        placeholder="예: 1차 확인 완료"
                        type="text"
                        value={comment}
                      />
                    </label>
                    <label className="form-field">
                      <span>반려 사유</span>
                      <input
                        onChange={(event) => setRejectionReason(event.target.value)}
                        placeholder="예: 근무시간 값 확인 필요"
                        type="text"
                        value={rejectionReason}
                      />
                    </label>
                  </div>
                  <div className="action-row">
                    <button
                      className="primary-button"
                      disabled={isSubmitting}
                      onClick={() => {
                        void handleApprove();
                      }}
                      type="button"
                    >
                      승인
                    </button>
                    <button
                      className="secondary-button"
                      disabled={isSubmitting}
                      onClick={() => {
                        void handleReject();
                      }}
                      type="button"
                    >
                      반려
                    </button>
                  </div>
                </div>
              )}

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>필드</th>
                      <th>값</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.previewRows.length > 0 ? (
                      Object.entries(detail.previewRows[0]).map(([key, value]) => (
                        <tr key={key}>
                          <td>{key}</td>
                          <td>{String(value)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2}>표시 가능한 미리보기 행이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="hero-copy">선택된 파일이 없습니다.</p>
          )}

          <div className="history-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">최근 처리</p>
                <h4>승인 이력</h4>
              </div>
            </div>

            {history.length > 0 ? (
              <div className="history-list">
                {history.map((record) => (
                  <div
                    key={record.id}
                    className="history-item"
                  >
                    <div className="history-title-row">
                      <strong>{record.fileName}</strong>
                      <StatusBadge
                        label={formatDecisionLabel(record.decision)}
                        tone={record.decision === "approved" ? "good" : "bad"}
                      />
                    </div>
                    <span>{record.processedByName} · {record.processedAt}</span>
                    {record.rejectionReason ? <p>반려 사유: {record.rejectionReason}</p> : null}
                    {record.comment ? <p>메모: {record.comment}</p> : null}
                    {record.decision === "approved" ? (
                      <div className="action-row">
                        <button
                          className="secondary-button"
                          disabled={isSubmitting}
                          onClick={() => {
                            void handleRunCalculation(record.fileId);
                          }}
                          type="button"
                        >
                          계산 실행
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="hero-copy">아직 저장된 승인 이력이 없습니다.</p>
            )}
          </div>

          <div className="history-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">계산 결과</p>
                <h4>최근 수당 계산</h4>
              </div>
            </div>

            {calculationResults.length > 0 ? (
              <div className="history-list">
                {calculationResults.map((record) => (
                  <div
                    key={record.id}
                    className="history-item"
                  >
                    <div className="history-title-row">
                      <strong>{record.fileName}</strong>
                      <StatusBadge
                        label={`${record.snapshot.totalAllowanceAmount.toLocaleString()}원`}
                        tone="good"
                      />
                    </div>
                    <span>
                      {record.employeeName} · {record.workDate} · {record.rateVersionLabel}
                    </span>
                    <p>
                      기본 {record.snapshot.breakdown.baseWorkMinutes}분 / 연장{" "}
                      {record.snapshot.breakdown.overtimeMinutes}분 / 야간{" "}
                      {record.snapshot.breakdown.nightMinutes}분
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hero-copy">아직 실행된 수당 계산 결과가 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
