import { Fragment, type ReactNode, type RefObject } from "react";

import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type {
  AllowanceApprovalRecord,
  AllowanceCalculationStatus,
  AllowanceProposalApprovalRecord
} from "@shared/domain/allowance-workflow";

import { AllowanceEvidencePanel } from "./AllowanceEvidencePanel";
import type {
  AllowanceOverviewGroup,
  AllowanceWorkType
} from "./allowance-management-selectors";

interface AllowanceOverviewReviewRequest {
  calculationIds: string[];
  decision: AllowanceApprovalRecord["decision"];
  scopeLabel: string;
  syncPerformanceSiteReject?: boolean;
}

interface AllowanceOverviewResultsPanelProps {
  allowanceStatusClassNameByCode: Record<AllowanceCalculationStatus, string>;
  detailIcon: ReactNode;
  earlyPayoutIcon: ReactNode;
  expandedDetailIds: string[];
  expandedSiteNames: string[];
  formatCurrencyValue: (value: number) => string;
  formatDateTimeValue: (value?: string) => string;
  formatDateValue: (value?: string) => string;
  formatHoursValue: (minutes: number) => string;
  getBreakdownSummaryValue: (result: AllowanceCalculationResultRecord) => string;
  getWorkTypeValue: (record: Pick<AllowanceCalculationResultRecord, "workType">) => AllowanceWorkType;
  isLoading: boolean;
  isOverviewDetailExpanded: boolean;
  isOverviewDistributionExpanded: boolean;
  isProcessing: boolean;
  latestApprovalByCalculationId: Map<string, AllowanceApprovalRecord>;
  latestProposalApprovalByCalculationId: Map<string, AllowanceProposalApprovalRecord>;
  onOpenEarlyPayoutEditor: (result: AllowanceCalculationResultRecord) => void;
  onOverviewKeywordChange: (value: string) => void;
  onReviewCalculations: (input: AllowanceOverviewReviewRequest) => Promise<void> | void;
  onToggleExpandedDetail: (rowId: string) => void;
  onToggleExpandedSite: (siteName: string) => void;
  onToggleOverviewLayoutMode: () => void;
  overviewGroups: AllowanceOverviewGroup[];
  overviewKeyword: string;
  overviewKeywordInputRef: RefObject<HTMLInputElement | null>;
  processingKey: string | null;
  statusLabelByCode: Record<AllowanceCalculationStatus, string>;
  workTypeLabelByType: Record<AllowanceWorkType, string>;
  workTypePillClassNameByType: Record<AllowanceWorkType, string>;
}

export const AllowanceOverviewResultsPanel = ({
  allowanceStatusClassNameByCode,
  detailIcon,
  earlyPayoutIcon,
  expandedDetailIds,
  expandedSiteNames,
  formatCurrencyValue,
  formatDateTimeValue,
  formatDateValue,
  formatHoursValue,
  getBreakdownSummaryValue,
  getWorkTypeValue,
  isLoading,
  isOverviewDetailExpanded,
  isOverviewDistributionExpanded,
  isProcessing,
  latestApprovalByCalculationId,
  latestProposalApprovalByCalculationId,
  onOpenEarlyPayoutEditor,
  onOverviewKeywordChange,
  onReviewCalculations,
  onToggleExpandedDetail,
  onToggleExpandedSite,
  onToggleOverviewLayoutMode,
  overviewGroups,
  overviewKeyword,
  overviewKeywordInputRef,
  processingKey,
  statusLabelByCode,
  workTypeLabelByType,
  workTypePillClassNameByType
}: AllowanceOverviewResultsPanelProps) => (
  <article className="surface-card allowance-table-card allowance-table-card-modern">
    <div className="section-heading compact-heading">
      <div>
        <h3>상세 수당 내역</h3>
        <p>
          {isOverviewDistributionExpanded
            ? "좌측 확대 상태에서는 근무지 합계만 요약해서 보여줍니다."
            : "근무지별 합계와 상세 행을 접어 보며 확인합니다."}
        </p>
      </div>
      <div className="allowance-overview-heading-actions">
        <label className="field allowance-inline-search">
          <span>직원명 검색</span>
          <input
            onChange={(event) => {
              onOverviewKeywordChange(event.target.value);
            }}
            placeholder="직원명 / 근무지 / 파일명"
            ref={overviewKeywordInputRef}
            value={overviewKeyword}
          />
        </label>
        <button className="ghost-button compact-button" onClick={onToggleOverviewLayoutMode} type="button">
          {isOverviewDetailExpanded ? "기본 보기" : "우측 펼치기"}
        </button>
      </div>
    </div>

    <div className="data-scroll">
      {isOverviewDistributionExpanded ? (
        <table className="info-table compact-table allowance-results-table allowance-summary-only-table">
          <thead>
            <tr>
              <th>근무지</th>
              <th>총 / 기본 / 연장 / 야간</th>
              <th>총 수당</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={3}>수당 계산 결과를 불러오는 중입니다.</td>
              </tr>
            ) : overviewGroups.length > 0 ? (
              overviewGroups.map((group) => (
                <tr className="allowance-summary-row-item" key={`${group.siteName}-summary-only`}>
                  <td className="table-strong">{group.siteName}</td>
                  <td>{`${formatHoursValue(group.totalWorkMinutes)} / ${formatHoursValue(
                    group.baseWorkMinutes
                  )} / ${formatHoursValue(group.overtimeMinutes)} / ${formatHoursValue(group.nightMinutes)}`}</td>
                  <td>{formatCurrencyValue(group.totalAllowanceAmount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3}>조건에 맞는 수당 산출 결과가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      ) : (
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
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9}>수당 계산 결과를 불러오는 중입니다.</td>
              </tr>
            ) : overviewGroups.length > 0 ? (
              overviewGroups.map((group) => {
                const isExpanded = expandedSiteNames.includes(group.siteName);
                const siteApprovableRows = group.rows.filter(
                  (row) => row.status !== "approved" && row.status !== "proposal-approved"
                );
                const siteRejectableRows = group.rows.filter(
                  (row) => row.status === "pending" || row.status === "approved"
                );
                const isSiteRejectLockedByProposalApproval = group.proposalApprovedCount > 0;
                const siteApproveProcessingKey = `review:approved:${siteApprovableRows[0]?.id ?? ""}`;
                const siteRejectProcessingKey = `review:rejected:${siteRejectableRows[0]?.id ?? ""}`;

                return (
                  <Fragment key={`${group.siteName}-overview`}>
                    <tr className="allowance-summary-row-item">
                      <td className="allowance-manage-cell">
                        <div className="allowance-row-actions summary">
                          <button
                            className={isExpanded ? "allowance-expand-button active" : "allowance-expand-button"}
                            onClick={() => {
                              onToggleExpandedSite(group.siteName);
                            }}
                            type="button"
                          >
                            {isExpanded ? "⌃" : "⌄"}
                          </button>
                          <button
                            className="allowance-row-action-text approve"
                            disabled={isProcessing || siteApprovableRows.length === 0}
                            onClick={() => {
                              void onReviewCalculations({
                                calculationIds: siteApprovableRows.map((row) => row.id),
                                decision: "approved",
                                scopeLabel: `${group.siteName} 근무지`
                              });
                            }}
                            type="button"
                          >
                            {processingKey === siteApproveProcessingKey ? "승인 중..." : "근무지 승인"}
                          </button>
                          <button
                            className="allowance-row-action-text reject"
                            disabled={
                              isProcessing ||
                              siteRejectableRows.length === 0 ||
                              isSiteRejectLockedByProposalApproval
                            }
                            onClick={() => {
                              void onReviewCalculations({
                                calculationIds: siteRejectableRows.map((row) => row.id),
                                decision: "rejected",
                                scopeLabel: `${group.siteName} 근무지`,
                                syncPerformanceSiteReject: true
                              });
                            }}
                            title={
                              isSiteRejectLockedByProposalApproval
                                ? "품의승인 완료 수당이 있어 근무지 반려할 수 없습니다."
                                : siteRejectableRows.length === 0
                                  ? "검토대기/승인 상태 수당이 없어 근무지 반려할 수 없습니다."
                                  : "근무지 수당을 반려하고 실적 재승인 흐름으로 되돌립니다."
                            }
                            type="button"
                          >
                            {processingKey === siteRejectProcessingKey ? "반려 확인 중..." : "근무지 반려"}
                          </button>
                        </div>
                      </td>
                      <td className="table-strong">{group.siteName}</td>
                      <td>-</td>
                      <td>
                        <div className="allowance-status-cell">
                          {group.pendingCount > 0 ? (
                            <span className={allowanceStatusClassNameByCode.pending}>
                              검토대기 {group.pendingCount}
                            </span>
                          ) : null}
                          {group.approvedCount > 0 ? (
                            <span className={allowanceStatusClassNameByCode.approved}>
                              승인 {group.approvedCount}
                            </span>
                          ) : null}
                          {group.rejectedCount > 0 ? (
                            <span className={allowanceStatusClassNameByCode.rejected}>
                              반려 {group.rejectedCount}
                            </span>
                          ) : null}
                          {group.proposalApprovedCount > 0 ? (
                            <span className={allowanceStatusClassNameByCode["proposal-approved"]}>
                              품의승인 {group.proposalApprovedCount}
                            </span>
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
                    </tr>
                    {isExpanded
                      ? group.rows.map((result) => {
                          const type = getWorkTypeValue(result);
                          const isDetailExpanded = expandedDetailIds.includes(result.id);
                          const latestApproval = latestApprovalByCalculationId.get(result.id);
                          const proposalApproval = latestProposalApprovalByCalculationId.get(result.id);

                          return (
                            <Fragment key={result.id}>
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
                                        onToggleExpandedDetail(result.id);
                                      }}
                                      title="수당 산출 근거 보기"
                                      type="button"
                                    >
                                      {detailIcon}
                                    </button>
                                    <button
                                      className={
                                        result.earlyPayoutDate
                                          ? "allowance-row-action-button prepaid active"
                                          : "allowance-row-action-button prepaid"
                                      }
                                      onClick={() => {
                                        onOpenEarlyPayoutEditor(result);
                                      }}
                                      title="퇴직자 선지급 설정"
                                      type="button"
                                    >
                                      {earlyPayoutIcon}
                                    </button>
                                    <button
                                      className="allowance-row-action-text approve"
                                      disabled={
                                        isProcessing ||
                                        result.status === "approved" ||
                                        result.status === "proposal-approved"
                                      }
                                      onClick={() => {
                                        void onReviewCalculations({
                                          calculationIds: [result.id],
                                          decision: "approved",
                                          scopeLabel: `${result.employeeName} 수당`
                                        });
                                      }}
                                      type="button"
                                    >
                                      승인
                                    </button>
                                  </div>
                                </td>
                                <td>{result.siteName}</td>
                                <td>{result.employeeName}</td>
                                <td>
                                  <div className="allowance-status-cell">
                                    <span className={allowanceStatusClassNameByCode[result.status]}>
                                      {statusLabelByCode[result.status]}
                                    </span>
                                    {result.earlyPayoutDate ? (
                                      <span className="allowance-status-pill prepaid">선지급</span>
                                    ) : null}
                                  </div>
                                </td>
                                <td>
                                  <span className={workTypePillClassNameByType[type]}>
                                    {workTypeLabelByType[type]}
                                  </span>
                                </td>
                                <td>{formatDateValue(result.workDate)}</td>
                                <td>{getBreakdownSummaryValue(result)}</td>
                                <td>{formatCurrencyValue(result.hourlyRate)}</td>
                                <td>{formatCurrencyValue(result.snapshot.totalAllowanceAmount)}</td>
                              </tr>
                              {isDetailExpanded ? (
                                <tr className="allowance-evidence-row">
                                  <td colSpan={9}>
                                    <AllowanceEvidencePanel
                                      formatCurrencyValue={formatCurrencyValue}
                                      formatDateTimeValue={formatDateTimeValue}
                                      formatDateValue={formatDateValue}
                                      formatHoursValue={formatHoursValue}
                                      proposalApproval={proposalApproval}
                                      result={result}
                                      reviewComment={latestApproval?.comment}
                                      reviewedAt={latestApproval?.processedAt}
                                      reviewedByName={latestApproval?.processedByName}
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
                <td colSpan={9}>조건에 맞는 수당 산출 결과가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  </article>
);
