import { FormSelect } from "../../components/FormSelect";
import { MonthField } from "../../components/MonthField";
import type { DashboardFilterState, DashboardPeriodMode } from "./useDashboardFilterState";

export type DashboardExportFormat = "xlsx" | "pdf";

interface DashboardSiteOption {
  id: string;
  label: string;
}

interface DashboardExportActionGroupProps {
  disabled?: boolean;
  exportTargetLabel: string;
  exportingFormat: DashboardExportFormat | null;
  onExport: (format: DashboardExportFormat) => void;
}

interface DashboardNoticeProps {
  message: string;
  title?: string;
}

interface DashboardControlPanelNotice {
  message: string;
  title: string;
}

interface DashboardControlPanelProps {
  allOptionValue: string;
  availableYears: string[];
  draftFilters: DashboardFilterState;
  employeeOptions: string[];
  exportDisabled: boolean;
  exportingFormat: DashboardExportFormat | null;
  notices: DashboardControlPanelNotice[];
  onEmployeeNameChange: (value: string) => void;
  onEndYearMonthChange: (value: string) => void;
  onExportDashboardReport: (format: DashboardExportFormat) => void;
  onMonthChange: (value: string) => void;
  onPeriodModeChange: (value: DashboardPeriodMode) => void;
  onSiteIdChange: (value: string) => void;
  onStartYearMonthChange: (value: string) => void;
  onYearChange: (value: string) => void;
  siteOptions: DashboardSiteOption[];
}

const DashboardExportIconButton = ({
  format,
  isDisabled,
  isExporting,
  label,
  onExport
}: {
  format: DashboardExportFormat;
  isDisabled?: boolean;
  isExporting: boolean;
  label: string;
  onExport: () => void;
}) => (
  <button
    aria-label={label}
    className={`icon-button dashboard-export-icon-button ${format === "pdf" ? "is-pdf" : "is-excel"}${isExporting ? " is-busy" : ""}`}
    disabled={isExporting || isDisabled}
    onClick={onExport}
    title={label}
    type="button"
  >
    <span aria-hidden="true" className={`dashboard-export-icon ${format}`} />
  </button>
);

export const DashboardExportActionGroup = ({
  disabled,
  exportTargetLabel,
  exportingFormat,
  onExport
}: DashboardExportActionGroupProps) => (
  <div className="dashboard-export-action-group">
    <DashboardExportIconButton
      format="pdf"
      isDisabled={disabled}
      isExporting={exportingFormat === "pdf"}
      label={`${exportTargetLabel} PDF 내보내기`}
      onExport={() => {
        onExport("pdf");
      }}
    />
    <DashboardExportIconButton
      format="xlsx"
      isDisabled={disabled}
      isExporting={exportingFormat === "xlsx"}
      label={`${exportTargetLabel} Excel 내보내기`}
      onExport={() => {
        onExport("xlsx");
      }}
    />
  </div>
);

export const DashboardNotice = ({
  message,
  title = "데이터 안내"
}: DashboardNoticeProps) => (
  <section className="surface-card dashboard-notice">
    <strong>{title}</strong>
    <span>{message}</span>
  </section>
);

export const DashboardControlPanel = ({
  allOptionValue,
  availableYears,
  draftFilters,
  employeeOptions,
  exportDisabled,
  exportingFormat,
  notices,
  onEmployeeNameChange,
  onEndYearMonthChange,
  onExportDashboardReport,
  onMonthChange,
  onPeriodModeChange,
  onSiteIdChange,
  onStartYearMonthChange,
  onYearChange,
  siteOptions
}: DashboardControlPanelProps) => (
  <>
    <section className="dashboard-v2-header">
      <div>
        <h1>교대근무 및 수당 관리 시스템 - 대시보드</h1>
      </div>
      <div className="dashboard-v2-header-actions">
        <span className="dashboard-v2-export-label">전체 내보내기</span>
        <DashboardExportActionGroup
          disabled={exportDisabled}
          exportTargetLabel="대시보드 전체"
          exportingFormat={exportingFormat}
          onExport={onExportDashboardReport}
        />
      </div>
    </section>

    <section className="surface-card dashboard-v2-filter-panel">
      <div className="filter-grid dashboard-v2-filter-grid">
        <label className="field dashboard-v2-field">
          <span>조회 방식</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onPeriodModeChange(
                event.target.value === "range" ? "range" : "single"
              );
            }}
            selectClassName="top-filter-select"
            value={draftFilters.periodMode}
          >
            <option value="single">연도/월 기준</option>
            <option value="range">기간 직접 지정</option>
          </FormSelect>
        </label>
        {draftFilters.periodMode === "single" ? (
          <>
            <label className="field dashboard-v2-field">
              <span>조회 연도</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  onYearChange(event.target.value);
                }}
                selectClassName="top-filter-select"
                value={draftFilters.year}
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </FormSelect>
            </label>
            <label className="field dashboard-v2-field">
              <span>조회 월</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  onMonthChange(event.target.value);
                }}
                selectClassName="top-filter-select"
                value={draftFilters.month}
              >
                <option value={allOptionValue}>전체</option>
                {Array.from({ length: 12 }, (_, index) => {
                  const monthValue = String(index + 1).padStart(2, "0");

                  return (
                    <option key={monthValue} value={monthValue}>
                      {index + 1}월
                    </option>
                  );
                })}
              </FormSelect>
            </label>
          </>
        ) : (
          <>
            <label className="field dashboard-v2-field">
              <span>시작 월</span>
              <MonthField
                className="dashboard-v2-month-input"
                onChange={onStartYearMonthChange}
                value={draftFilters.startYearMonth}
              />
            </label>
            <label className="field dashboard-v2-field">
              <span>종료 월</span>
              <MonthField
                className="dashboard-v2-month-input"
                onChange={onEndYearMonthChange}
                value={draftFilters.endYearMonth}
              />
            </label>
          </>
        )}
        <label className="field dashboard-v2-field">
          <span>근무지</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onSiteIdChange(event.target.value);
            }}
            selectClassName="top-filter-select"
            value={draftFilters.siteId}
          >
            {siteOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </FormSelect>
        </label>
        <label className="field dashboard-v2-field">
          <span>이름</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onEmployeeNameChange(event.target.value);
            }}
            selectClassName="top-filter-select"
            value={draftFilters.employeeName}
          >
            {employeeOptions.map((employeeName) => (
              <option key={employeeName} value={employeeName}>
                {employeeName === allOptionValue ? "전체" : employeeName}
              </option>
            ))}
          </FormSelect>
        </label>
      </div>
    </section>

    {notices.map((notice) => (
      <DashboardNotice key={`${notice.title}:${notice.message}`} message={notice.message} title={notice.title} />
    ))}
  </>
);
