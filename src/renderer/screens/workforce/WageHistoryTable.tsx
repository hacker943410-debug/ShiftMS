import type { WageRateRecord } from "../../../shared/domain/model";
import type { WageHistoryIssue } from "./wage-rate-timeline";

export interface WageHistoryTableProps {
  wageRates: WageRateRecord[];
  issues?: WageHistoryIssue[];
  editingWageRateId?: string | null;
  disabled?: boolean;
  loading?: boolean;
  onCorrect: (rate: WageRateRecord) => void;
  onDelete: (rate: WageRateRecord) => void;
}

const formatDate = (value?: string) => {
  if (!value) {
    return "-";
  }
  return value.replace(/-/g, ".");
};

const formatHourlyRate = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return `${value.toLocaleString("ko-KR")}원`;
};

export const WageHistoryTable = ({
  wageRates,
  issues = [],
  editingWageRateId,
  disabled = false,
  loading = false,
  onCorrect,
  onDelete
}: WageHistoryTableProps) => {
  const getIssuesForRate = (rateId: string) =>
    issues.filter((issue) => issue.rateId === rateId);

  return (
    <div className="wage-history-table-shell" role="region" tabIndex={0} aria-label="시급변경이력 표">
      <table className="wage-history-table">
        <thead>
          <tr>
            <th scope="col">적용 시작일</th>
            <th scope="col">적용 종료일</th>
            <th scope="col">통상시급</th>
            <th scope="col">변경 사유</th>
            <th scope="col">상태·문제</th>
            <th scope="col">관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="wage-history-table-empty">
              <td colSpan={6}>시급변경이력을 불러오는 중입니다.</td>
            </tr>
          ) : wageRates.length === 0 ? (
            <tr className="wage-history-table-empty">
              <td colSpan={6}>등록된 시급변경이력이 없습니다.</td>
            </tr>
          ) : (
            wageRates.map((rate) => {
              const rateIssues = getIssuesForRate(rate.id);
              const isEditing = editingWageRateId === rate.id;

              return (
                <tr
                  key={rate.id}
                  className={`wage-history-row ${isEditing ? "is-editing" : ""}`}
                >
                  <td className="wage-history-cell-date">
                    {formatDate(rate.effectiveFrom)}
                  </td>
                  <td className="wage-history-cell-date">
                    {rate.effectiveTo ? formatDate(rate.effectiveTo) : "계속"}
                  </td>
                  <td className="wage-history-cell-rate">
                    {formatHourlyRate(rate.hourlyRate)}
                  </td>
                  <td className="wage-history-cell-reason">
                    {rate.reason?.trim() ? rate.reason.trim() : "-"}
                  </td>
                  <td className="wage-history-cell-issues">
                    {rateIssues.length > 0 ? (
                      <div className="wage-history-issue-list">
                        {rateIssues.map((issue) => (
                          <span className="wage-history-issue-tag" key={issue.id}>
                            {issue.message}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="wage-history-status-normal">정상</span>
                    )}
                  </td>
                  <td className="wage-history-cell-actions">
                    <div className="wage-history-actions">
                      <button
                        type="button"
                        className="ghost-button wage-history-action-button"
                        aria-label={`${rate.effectiveFrom} 정정`}
                        disabled={disabled}
                        onClick={() => onCorrect(rate)}
                      >
                        정정
                      </button>
                      <button
                        type="button"
                        className="ghost-button wage-history-action-button wage-history-action-delete"
                        aria-label={`${rate.effectiveFrom} 삭제`}
                        disabled={disabled}
                        onClick={() => onDelete(rate)}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
