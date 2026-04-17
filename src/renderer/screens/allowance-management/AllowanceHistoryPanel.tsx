import { Fragment, type ReactNode } from "react";

import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type {
  AllowanceCalculationStatus,
  AllowanceProposalApprovalRecord
} from "@shared/domain/allowance-workflow";

import { AllowanceEvidencePanel } from "./AllowanceEvidencePanel";
import type {
  AllowanceHistoryGroup,
  AllowanceWorkType
} from "./allowance-management-selectors";

interface AllowanceHistoryPanelProps {
  allowanceStatusClassNameByCode: Record<AllowanceCalculationStatus, string>;
  detailIcon: ReactNode;
  expandedDetailIds: string[];
  expandedSiteNames: string[];
  formatCurrencyValue: (value: number) => string;
  formatDateTimeValue: (value?: string) => string;
  formatDateValue: (value?: string) => string;
  formatHoursValue: (minutes: number) => string;
  getBreakdownSummaryValue: (result: AllowanceCalculationResultRecord) => string;
  getWorkTypeValue: (record: Pick<AllowanceCalculationResultRecord, "workType">) => AllowanceWorkType;
  historyGroups: AllowanceHistoryGroup[];
  isLoading: boolean;
  onOpenProposalApprovalRecord: (record: AllowanceProposalApprovalRecord) => void;
  onToggleExpandedDetail: (rowId: string) => void;
  onToggleExpandedSite: (siteName: string) => void;
  proposalApprovals: AllowanceProposalApprovalRecord[];
  statusLabelByCode: Record<AllowanceCalculationStatus, string>;
  workTypeLabelByType: Record<AllowanceWorkType, string>;
  workTypePillClassNameByType: Record<AllowanceWorkType, string>;
}

export const AllowanceHistoryPanel = ({
  allowanceStatusClassNameByCode,
  detailIcon,
  expandedDetailIds,
  expandedSiteNames,
  formatCurrencyValue,
  formatDateTimeValue,
  formatDateValue,
  formatHoursValue,
  getBreakdownSummaryValue,
  getWorkTypeValue,
  historyGroups,
  isLoading,
  onOpenProposalApprovalRecord,
  onToggleExpandedDetail,
  onToggleExpandedSite,
  proposalApprovals,
  statusLabelByCode,
  workTypeLabelByType,
  workTypePillClassNameByType
}: AllowanceHistoryPanelProps) => (
  <section className="surface-card allowance-history-card">
    <div className="section-heading compact-heading">
      <div>
        <h3>품의 이력</h3>
        <p>수당 승인 상태와 최종 품의 승인 이력을 함께 조회하고 승인된 내용을 다시 확인할 수 있습니다.</p>
      </div>
      <div className="button-row allowance-table-meta">
        <span className="pill neutral">{historyGroups.reduce((sum, group) => sum + group.rows.length, 0)}건</span>
      </div>
    </div>

    <div className="data-scroll">
      <table className="info-table compact-table allowance-results-table allowance-grouped-table">
        <thead>
          <tr>
            <th>관리</th>
            <th>근무지</th>
            <th>이름</th>
            <th>상태</th>
            <th>근로유형</th>
            <th>근무일자</th>
            <th>총 / 기본 / 연장 / 야간</th>
            <th>시급</th>
            <th>총 수당</th>
            <th>이력 정보</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={10}>품의 이력을 불러오는 중입니다.</td>
            </tr>
          ) : historyGroups.length > 0 ? (
            historyGroups.map((group) => {
              const isExpanded = expandedSiteNames.includes(group.siteName);
              return (
                <Fragment key={`${group.siteName}-history`}>
                  <tr className="allowance-summary-row-item">
                    <td className="allowance-manage-cell">
                      <button
                        className={isExpanded ? "allowance-expand-button active" : "allowance-expand-button"}
                        onClick={() => {
                          onToggleExpandedSite(group.siteName);
                        }}
                        type="button"
                      >
                        {isExpanded ? "⌃" : "⌄"}
                      </button>
                    </td>
                    <td className="table-strong">{group.siteName}</td>
                    <td>-</td>
                    <td>
                      <div className="allowance-status-cell">
                        {group.rows.some((row) => row.calculation.status === "pending") ? (
                          <span className={allowanceStatusClassNameByCode.pending}>검토대기</span>
                        ) : null}
                        {group.rows.some((row) => row.calculation.status === "approved") ? (
                          <span className={allowanceStatusClassNameByCode.approved}>승인</span>
                        ) : null}
                        {group.rows.some((row) => row.calculation.status === "rejected") ? (
                          <span className={allowanceStatusClassNameByCode.rejected}>반려</span>
                        ) : null}
                        {group.rows.some((row) => row.calculation.status === "proposal-approved") ? (
                          <span className={allowanceStatusClassNameByCode["proposal-approved"]}>품의승인</span>
                        ) : null}
                      </div>
                    </td>
                    <td>-</td>
                    <td>-</td>
                    <td>{`${formatHoursValue(group.totalWorkMinutes)} / ${formatHoursValue(
                      group.baseWorkMinutes
                    )} / ${formatHoursValue(group.overtimeMinutes)} / ${formatHoursValue(group.nightMinutes)}`}</td>
                    <td>-</td>
                    <td>{formatCurrencyValue(group.totalAllowanceAmount)}</td>
                    <td>-</td>
                  </tr>
                  {isExpanded
                    ? group.rows.map((row) => {
                        const type = getWorkTypeValue(row.calculation);
                        const isDetailExpanded = expandedDetailIds.includes(row.rowId);
                        return (
                          <Fragment key={row.rowId}>
                            <tr className="allowance-detail-row-item">
                              <td className="allowance-manage-cell">
                                <div className="allowance-row-actions">
                                  <button
                                    className={
                                      isDetailExpanded
                                        ? "allowance-row-action-button active"
                                        : "allowance-row-action-button"
                                    }
                                    onClick={() => {
                                      onToggleExpandedDetail(row.rowId);
                                    }}
                                    title="수당 산출 근거 보기"
                                    type="button"
                                  >
                                    {detailIcon}
                                  </button>
                                </div>
                              </td>
                              <td>{row.calculation.siteName}</td>
                              <td>{row.calculation.employeeName}</td>
                              <td>
                                <div className="allowance-status-cell">
                                  <span className={allowanceStatusClassNameByCode[row.calculation.status]}>
                                    {statusLabelByCode[row.calculation.status]}
                                  </span>
                                  {row.calculation.earlyPayoutDate ? (
                                    <span className="allowance-status-pill prepaid">선지급</span>
                                  ) : null}
                                </div>
                              </td>
                              <td>
                                <span className={workTypePillClassNameByType[type]}>
                                  {workTypeLabelByType[type]}
                                </span>
                              </td>
                              <td>{formatDateValue(row.calculation.workDate)}</td>
                              <td>{getBreakdownSummaryValue(row.calculation)}</td>
                              <td>{formatCurrencyValue(row.calculation.hourlyRate)}</td>
                              <td>{formatCurrencyValue(row.calculation.snapshot.totalAllowanceAmount)}</td>
                              <td>
                                <div className="allowance-history-meta">
                                  <span>{`등록 ${formatDateTimeValue(row.registeredAt)}`}</span>
                                  {row.latestReviewedAt ? (
                                    <span>{`검토 ${formatDateTimeValue(row.latestReviewedAt)}`}</span>
                                  ) : null}
                                  {row.proposalApproval ? (
                                    <span>{`품의 ${formatDateTimeValue(row.proposalApproval.approvedAt)}`}</span>
                                  ) : null}
                                  {row.latestExportedAt ? (
                                    <>
                                      <span>{`문서 ${formatDateTimeValue(row.latestExportedAt)}`}</span>
                                      <i
                                        className={`allowance-export-icon ${row.latestOutputFormat === "pdf" ? "pdf" : "excel"}`}
                                      >
                                        {row.latestOutputFormat === "pdf" ? "PDF" : "XLS"}
                                      </i>
                                    </>
                                  ) : (
                                    <span>문서 미출력</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {isDetailExpanded ? (
                              <tr className="allowance-evidence-row">
                                <td colSpan={10}>
                                  <AllowanceEvidencePanel
                                    exportedAt={row.latestExportedAt}
                                    formatCurrencyValue={formatCurrencyValue}
                                    formatDateTimeValue={formatDateTimeValue}
                                    formatDateValue={formatDateValue}
                                    formatHoursValue={formatHoursValue}
                                    outputFormat={row.latestOutputFormat}
                                    proposalApproval={row.proposalApproval}
                                    result={row.calculation}
                                    reviewComment={row.latestReviewComment}
                                    reviewedAt={row.latestReviewedAt}
                                    reviewedByName={row.latestReviewedByName}
                                    statusLabelByCode={statusLabelByCode}
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })
                    : null}
                </Fragment>
              );
            })
          ) : (
            <tr>
              <td colSpan={10}>조건에 맞는 품의 이력이 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>

    <div className="section-heading compact-heading allowance-subhistory-heading">
      <div>
        <h3>품의 승인 기록</h3>
        <p>최종 승인된 품의 묶음과 백업 실행 결과를 확인합니다.</p>
      </div>
      <div className="button-row allowance-table-meta">
        <span className="pill neutral">{proposalApprovals.length}건</span>
      </div>
    </div>

    <div className="data-scroll">
      <table className="info-table compact-table allowance-results-table">
        <thead>
          <tr>
            <th>관리</th>
            <th>대상월</th>
            <th>건수</th>
            <th>인원</th>
            <th>총액</th>
            <th>출력</th>
            <th>승인 정보</th>
            <th>백업 정보</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={8}>품의 승인 기록을 불러오는 중입니다.</td>
            </tr>
          ) : proposalApprovals.length > 0 ? (
            proposalApprovals.map((record) => (
              <tr key={record.id}>
                <td className="allowance-manage-cell">
                  <button
                    className="allowance-row-action-text approve"
                    onClick={() => {
                      onOpenProposalApprovalRecord(record);
                    }}
                    type="button"
                  >
                    미리보기
                  </button>
                </td>
                <td>{record.workMonth}</td>
                <td>{record.calculationCount}건</td>
                <td>{record.employeeCount}명</td>
                <td>{formatCurrencyValue(record.totalAllowanceAmount)}</td>
                <td>{record.outputFormat === "pdf" ? "PDF" : "Excel"}</td>
                <td>{`${record.approvedByName} · ${formatDateTimeValue(record.approvedAt)}`}</td>
                <td>
                  <div className="allowance-history-meta">
                    <span>{formatDateTimeValue(record.backupSummary.createdAt)}</span>
                    {record.backupSummary.warningMessages.length > 0 ? (
                      <span>{`경고 ${record.backupSummary.warningMessages.length}건`}</span>
                    ) : (
                      <span>정상 완료</span>
                    )}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8}>아직 품의 승인 기록이 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </section>
);
