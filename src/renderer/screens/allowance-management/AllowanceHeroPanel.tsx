import { FormSelect } from "../../components/FormSelect";

type AllowanceViewMode = "overview" | "history";
type WorkTypeFilter = "all" | "substitute" | "overtime" | "holiday";
type EmployeeCurrentStatusFilter = "all" | "active" | "leave" | "retired";
type AllowanceHistoryStatusFilter = "all" | "pending" | "approved" | "rejected" | "proposal-approved";

const employeeCurrentStatusLabel: Record<EmployeeCurrentStatusFilter, string> = {
  all: "전체",
  active: "재직중",
  leave: "휴직",
  retired: "퇴사"
};

interface AllowanceHeroPanelProps {
  actionError: string | null;
  actionMessage: string | null;
  availableYears: string[];
  canManageAllowanceApprovals: boolean;
  calculatedEmployeeCount: number;
  displayedRateVersionLabel: string;
  documentExportsCount: number;
  exportableResultsCount: number;
  historyCurrentStatus: EmployeeCurrentStatusFilter;
  historyEmployee: string;
  historyEmployeeOptions: string[];
  historyMonth: string;
  historySite: string;
  historySiteOptions: string[];
  historyStatus: AllowanceHistoryStatusFilter;
  historyWorkType: WorkTypeFilter;
  historyYear: string;
  isProcessing: boolean;
  onExportDocuments: (format: "pdf" | "xlsx") => void;
  onHistoryCurrentStatusChange: (value: EmployeeCurrentStatusFilter) => void;
  onHistoryEmployeeChange: (value: string) => void;
  onHistoryMonthChange: (value: string) => void;
  onHistoryReset: () => void;
  onHistorySiteChange: (value: string) => void;
  onHistoryStatusChange: (value: AllowanceHistoryStatusFilter) => void;
  onHistoryWorkTypeChange: (value: WorkTypeFilter) => void;
  onHistoryYearChange: (value: string) => void;
  onOpenProposalGuide: () => void;
  onOpenProposalPreview: () => void;
  onOverviewMonthChange: (value: string) => void;
  onOverviewReset: () => void;
  onOverviewSiteChange: (value: string) => void;
  onOverviewYearChange: (value: string) => void;
  onViewModeChange: (mode: AllowanceViewMode) => void;
  overviewMonth: string;
  overviewSite: string;
  overviewSiteOptions: string[];
  overviewYear: string;
  processingKey: string | null;
  proposalApprovalsCount: number;
  proposalCandidateResultsCount: number;
  resultsCount: number;
  screenError: string | null;
  viewMode: AllowanceViewMode;
  visibleStatusSummary: {
    approved: number;
    pending: number;
    rejected: number;
    "proposal-approved": number;
  };
}

const monthOptions = Array.from({ length: 12 }, (_, index) => {
  const month = String(index + 1).padStart(2, "0");
  return { label: `${Number(month)}월`, value: month };
});

export const AllowanceHeroPanel = ({
  actionError,
  actionMessage,
  availableYears,
  canManageAllowanceApprovals,
  calculatedEmployeeCount,
  displayedRateVersionLabel,
  documentExportsCount,
  exportableResultsCount,
  historyCurrentStatus,
  historyEmployee,
  historyEmployeeOptions,
  historyMonth,
  historySite,
  historySiteOptions,
  historyStatus,
  historyWorkType,
  historyYear,
  isProcessing,
  onExportDocuments,
  onHistoryCurrentStatusChange,
  onHistoryEmployeeChange,
  onHistoryMonthChange,
  onHistoryReset,
  onHistorySiteChange,
  onHistoryStatusChange,
  onHistoryWorkTypeChange,
  onHistoryYearChange,
  onOpenProposalGuide,
  onOpenProposalPreview,
  onOverviewMonthChange,
  onOverviewReset,
  onOverviewSiteChange,
  onOverviewYearChange,
  onViewModeChange,
  overviewMonth,
  overviewSite,
  overviewSiteOptions,
  overviewYear,
  processingKey,
  proposalApprovalsCount,
  proposalCandidateResultsCount,
  resultsCount,
  screenError,
  viewMode,
  visibleStatusSummary
}: AllowanceHeroPanelProps) => (
  <section className="surface-card allowance-hero-card">
    <div className="button-row spread allowance-hero-row">
      <div className="allowance-title-block">
        <div>
          <h3>수당 관리</h3>
          <p>산출 결과 검토, 수당 승인, 품의 승인, 문서 출력과 마감 이력을 한 흐름으로 관리합니다.</p>
        </div>
      </div>

      <div className="button-row allowance-action-row">
        <button className="ghost-button compact-button allowance-export-button" onClick={onOpenProposalGuide} type="button">
          품의 승인 가이드
        </button>
        {canManageAllowanceApprovals ? (
          <button
            className="primary-button compact-button allowance-export-button"
            disabled={proposalCandidateResultsCount === 0 || isProcessing}
            onClick={onOpenProposalPreview}
            type="button"
          >
            {processingKey === "proposal-preview" ? "품의 준비 중..." : "품의 승인"}
          </button>
        ) : null}
        <button
          className="primary-button compact-button allowance-export-button"
          disabled={exportableResultsCount === 0 || isProcessing}
          onClick={() => {
            onExportDocuments("pdf");
          }}
          type="button"
        >
          <span className="allowance-export-icon pdf">PDF</span>
          {processingKey === "export:pdf" ? "PDF 출력 중..." : "PDF 출력"}
        </button>
        <button
          className="ghost-button compact-button allowance-export-button"
          disabled={exportableResultsCount === 0 || isProcessing}
          onClick={() => {
            onExportDocuments("xlsx");
          }}
          type="button"
        >
          <span className="allowance-export-icon excel">XLS</span>
          {processingKey === "export:xlsx" ? "Excel 출력 중..." : "Excel 출력"}
        </button>
      </div>
    </div>

    <div className="allowance-view-tabs">
      <button
        className={viewMode === "overview" ? "allowance-view-tab active" : "allowance-view-tab"}
        onClick={() => {
          onViewModeChange("overview");
        }}
        type="button"
      >
        수당 산출 현황
      </button>
      <button
        className={viewMode === "history" ? "allowance-view-tab active" : "allowance-view-tab"}
        onClick={() => {
          onViewModeChange("history");
        }}
        type="button"
      >
        품의 이력
      </button>
    </div>

    {viewMode === "overview" ? (
      <div className="allowance-toolbar">
        <label className="field filter-field allowance-filter-year">
          <span>연도</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onOverviewYearChange(event.target.value);
            }}
            selectClassName="top-filter-select"
            value={overviewYear}
          >
            <option value="all">전체</option>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}년
              </option>
            ))}
          </FormSelect>
        </label>
        <label className="field filter-field allowance-filter-month">
          <span>월</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onOverviewMonthChange(event.target.value);
            }}
            selectClassName="top-filter-select"
            value={overviewMonth}
          >
            <option value="">전체</option>
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </FormSelect>
        </label>
        <label className="field filter-field allowance-filter-site allowance-site-select">
          <span>근무지</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onOverviewSiteChange(event.target.value);
            }}
            selectClassName="top-filter-select"
            value={overviewSite}
          >
            <option value="all">전체 근무지</option>
            {overviewSiteOptions.map((siteName) => (
              <option key={siteName} value={siteName}>
                {siteName}
              </option>
            ))}
          </FormSelect>
        </label>
        <button className="ghost-button allowance-reset-button" onClick={onOverviewReset} type="button">
          초기화
        </button>
      </div>
    ) : (
      <div className="allowance-toolbar allowance-toolbar-history">
        <label className="field filter-field allowance-filter-site allowance-site-select">
          <span>근무지</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onHistorySiteChange(event.target.value);
            }}
            selectClassName="top-filter-select"
            value={historySite}
          >
            <option value="all">전체</option>
            {historySiteOptions.map((siteName) => (
              <option key={siteName} value={siteName}>
                {siteName}
              </option>
            ))}
          </FormSelect>
        </label>
        <label className="field filter-field allowance-filter-year">
          <span>연도</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onHistoryYearChange(event.target.value);
            }}
            selectClassName="top-filter-select"
            value={historyYear}
          >
            <option value="all">전체</option>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}년
              </option>
            ))}
          </FormSelect>
        </label>
        <label className="field filter-field allowance-filter-month">
          <span>월</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onHistoryMonthChange(event.target.value);
            }}
            selectClassName="top-filter-select"
            value={historyMonth}
          >
            <option value="">전체</option>
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </FormSelect>
        </label>
        <label className="field filter-field allowance-filter-work-type">
          <span>근로유형</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onHistoryWorkTypeChange(event.target.value as WorkTypeFilter);
            }}
            selectClassName="top-filter-select"
            value={historyWorkType}
          >
            <option value="all">전체</option>
            <option value="substitute">대체근무</option>
            <option value="overtime">연장근무</option>
            <option value="holiday">휴일근무</option>
          </FormSelect>
        </label>
        <label className="field filter-field allowance-filter-work-type">
          <span>상태</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onHistoryStatusChange(event.target.value as AllowanceHistoryStatusFilter);
            }}
            selectClassName="top-filter-select"
            value={historyStatus}
          >
            <option value="all">전체</option>
            <option value="pending">검토대기</option>
            <option value="approved">승인</option>
            <option value="rejected">반려</option>
            <option value="proposal-approved">품의승인</option>
          </FormSelect>
        </label>
        <label className="field filter-field allowance-filter-current-status">
          <span>현재상태</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onHistoryCurrentStatusChange(event.target.value as EmployeeCurrentStatusFilter);
            }}
            selectClassName="top-filter-select"
            value={historyCurrentStatus}
          >
            {Object.entries(employeeCurrentStatusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </FormSelect>
        </label>
        <label className="field filter-field allowance-filter-employee allowance-site-select">
          <span>직원명</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onHistoryEmployeeChange(event.target.value);
            }}
            selectClassName="top-filter-select"
            value={historyEmployee}
          >
            <option value="all">전체</option>
            {historyEmployeeOptions.map((employeeName) => (
              <option key={employeeName} value={employeeName}>
                {employeeName}
              </option>
            ))}
          </FormSelect>
        </label>
        <button className="ghost-button allowance-reset-button" onClick={onHistoryReset} type="button">
          초기화
        </button>
      </div>
    )}

    <div className="allowance-hero-meta">
      <span className="pill neutral">산출 {resultsCount}건</span>
      <span className="pill info">검토대기 {visibleStatusSummary.pending}건</span>
      <span className="pill info">승인 {visibleStatusSummary.approved}건</span>
      <span className="pill warn">반려 {visibleStatusSummary.rejected}건</span>
      <span className="pill neutral">품의승인 {visibleStatusSummary["proposal-approved"]}건</span>
      <span className="pill info">대상 인원 {calculatedEmployeeCount}명</span>
      <span className="pill warn">문서 출력 {documentExportsCount}건</span>
      <span className="pill neutral">품의 이력 {proposalApprovalsCount}건</span>
      <span className="pill neutral">적용 요율 {displayedRateVersionLabel}</span>
    </div>

    {screenError ? <p className="form-error-text">{screenError}</p> : null}
    {actionError ? <p className="form-error-text">{actionError}</p> : null}
    {actionMessage ? <p className="form-success-text">{actionMessage}</p> : null}
  </section>
);
