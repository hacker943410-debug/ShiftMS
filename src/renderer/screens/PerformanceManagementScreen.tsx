import { useEffect, useState } from "react";

import type {
  PerformanceFileDetail,
  PerformanceQueueItem
} from "@shared/domain/performance-file";
import { StatusBadge } from "../components/StatusBadge";

export const PerformanceManagementScreen = () => {
  const [items, setItems] = useState<PerformanceQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PerformanceFileDetail | null>(null);

  useEffect(() => {
    void window.appBridge.listPendingFiles().then((result) => {
      if (!result.ok) {
        return;
      }

      setItems(result.data);
      setSelectedId(result.data[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    void window.appBridge.getPendingFileDetail(selectedId).then((result) => {
      if (!result.ok) {
        return;
      }

      setDetail(result.data);
    });
  }, [selectedId]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">실적 관리</p>
          <h3>승인 대기 목록과 원본 파일 상세 미리보기</h3>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-list">
          {items.map((item) => (
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
          ))}
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
        </div>
      </div>
    </section>
  );
};
