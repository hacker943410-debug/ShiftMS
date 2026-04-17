import {
  DashboardExportActionGroup,
  type DashboardExportFormat
} from "./DashboardControlPanel";

type DashboardBusinessCategory = "substitute" | "overtime" | "legalHoliday";

interface DashboardTopPerformerItem {
  employeeName: string;
  siteName: string;
  minutes: number;
  allowanceAmount: number;
}

const rankingTabItems: Array<{ key: DashboardBusinessCategory; label: string }> = [
  { key: "legalHoliday", label: "법정휴일" },
  { key: "substitute", label: "대체근무" },
  { key: "overtime", label: "연장근무" }
];

const currencyFormatter = new Intl.NumberFormat("ko-KR");

const formatHoursShortFromMinutes = (minutes: number) => `${(minutes / 60).toFixed(1)}h`;
const formatCurrency = (amount: number) => `${currencyFormatter.format(Math.round(amount))}원`;

export const DashboardRankingTable = ({
  activeCategory,
  exportingFormat,
  isExportDisabled,
  items,
  onSelectCategory,
  onExport
}: {
  activeCategory: DashboardBusinessCategory;
  exportingFormat: DashboardExportFormat | null;
  isExportDisabled?: boolean;
  items: DashboardTopPerformerItem[];
  onSelectCategory: (category: DashboardBusinessCategory) => void;
  onExport: (format: DashboardExportFormat) => void;
}) => (
  <>
    <div className="dashboard-v2-ranking-header">
      <div className="dashboard-v2-card-header">
        <h3>근무 유형별 상위 인원 (Top 10)</h3>
        <div className="dashboard-v2-card-actions">
          <span className="dashboard-v2-unit-note">단위: 원</span>
          <DashboardExportActionGroup
            disabled={isExportDisabled}
            exportTargetLabel="근무 유형별 상위 인원"
            exportingFormat={exportingFormat}
            onExport={onExport}
          />
        </div>
      </div>
      <div aria-label="근무 유형 상위 인원 탭" className="dashboard-v2-ranking-tabs" role="tablist">
        {rankingTabItems.map((tab) => (
          <button
            aria-selected={activeCategory === tab.key}
            className={`dashboard-v2-ranking-tab${activeCategory === tab.key ? " is-active" : ""}`}
            key={tab.key}
            onClick={() => {
              onSelectCategory(tab.key);
            }}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
    <div className="dashboard-v2-ranking-stage">
      <table className="dashboard-v2-ranking-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>근무지</th>
            <th>근무시간</th>
            <th>지급 수당</th>
          </tr>
        </thead>
        <tbody>
          {items.length > 0 ? (
            items.map((item) => (
              <tr key={`${item.employeeName}-${item.siteName}`}>
                <td>{item.employeeName}</td>
                <td>{item.siteName}</td>
                <td>{formatHoursShortFromMinutes(item.minutes)}</td>
                <td>{formatCurrency(item.allowanceAmount)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4}>
                {rankingTabItems.find((tab) => tab.key === activeCategory)?.label ?? "선택한"} 데이터가
                없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </>
);
