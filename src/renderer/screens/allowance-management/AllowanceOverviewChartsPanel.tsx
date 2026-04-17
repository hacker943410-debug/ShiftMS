import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  AllowanceWorkType,
  SiteDistributionRow,
  WorkTypeDistribution,
  WorkTypeSegment
} from "./allowance-management-selectors";

interface AllowanceOverviewChartsPanelProps {
  activeDonutSegment: WorkTypeSegment | null;
  activeDonutType: AllowanceWorkType | null;
  formatCurrencyValue: (value: number) => string;
  hoveredDistributionSite: string | null;
  isLoading: boolean;
  isOverviewDistributionExpanded: boolean;
  onActiveDonutTypeChange: (value: AllowanceWorkType | null) => void;
  onDistributionHoverChange: (value: string | null) => void;
  onDonutPointerMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onToggleDistributionExpanded: () => void;
  siteDistribution: SiteDistributionRow[];
  totalAllowanceAmount: number;
  visibleResultsCount: number;
  workTypeDistribution: WorkTypeDistribution;
}

const formatHours = (minutes: number) => `${Number((minutes / 60).toFixed(2))}h`;

const AllowanceEmptyState = ({ message }: { message: string }) => (
  <div className="allowance-empty-state">
    <strong>{message}</strong>
  </div>
);

export const AllowanceOverviewChartsPanel = ({
  activeDonutSegment,
  activeDonutType,
  formatCurrencyValue,
  hoveredDistributionSite,
  isLoading,
  isOverviewDistributionExpanded,
  onActiveDonutTypeChange,
  onDistributionHoverChange,
  onDonutPointerMove,
  onToggleDistributionExpanded,
  siteDistribution,
  totalAllowanceAmount,
  visibleResultsCount,
  workTypeDistribution
}: AllowanceOverviewChartsPanelProps) => (
  <aside className="allowance-left-column allowance-left-column-modern">
    <article className="surface-card allowance-visual-card">
      <div className="section-heading compact-heading">
        <div>
          <h3>사업장별 수당 분포</h3>
          <p>단위: 원</p>
        </div>
        <div className="allowance-overview-heading-actions">
          <button className="ghost-button compact-button" onClick={onToggleDistributionExpanded} type="button">
            {isOverviewDistributionExpanded ? "기본 보기" : "좌측 펼치기"}
          </button>
        </div>
      </div>

      {siteDistribution.length > 0 ? (
        <div className="allowance-distribution-list">
          {siteDistribution.map((row) => (
            <div
              className="allowance-distribution-item"
              key={row.siteName}
              onMouseEnter={() => {
                onDistributionHoverChange(row.siteName);
              }}
              onMouseLeave={() => {
                onDistributionHoverChange(null);
              }}
            >
              <div className="allowance-distribution-copy">
                <strong>{row.siteName}</strong>
                <span>{formatCurrencyValue(row.amount)}</span>
              </div>
              <div className="allowance-distribution-track">
                <div
                  className="allowance-distribution-bar"
                  style={{ width: `${Math.max(row.ratio * 100, 8)}%` }}
                />
              </div>
              <div
                className={
                  hoveredDistributionSite === row.siteName
                    ? "allowance-distribution-detail visible"
                    : "allowance-distribution-detail"
                }
              >
                <span>{formatHours(row.totalWorkMinutes)}</span>
                <span>{row.employeeCount}명</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <AllowanceEmptyState
          message={isLoading ? "수당 결과를 불러오는 중입니다." : "표시할 산출 결과가 없습니다."}
        />
      )}

      <div className="allowance-total-box">
        <span>전체 수당 합계</span>
        <strong>{formatCurrencyValue(totalAllowanceAmount)}</strong>
        <em>{visibleResultsCount}건 산출</em>
      </div>
    </article>

    <article className="surface-card allowance-visual-card">
      <div className="section-heading compact-heading">
        <div>
          <h3>수당 유형별 비중</h3>
          <p>근로유형별 지급액 기준</p>
        </div>
      </div>

      {workTypeDistribution.grandTotalAmount > 0 ? (
        <>
          <div
            className="allowance-donut-chart"
            onMouseLeave={() => {
              onActiveDonutTypeChange(null);
            }}
            onMouseMove={onDonutPointerMove}
            style={{
              background: `conic-gradient(
                #5b88ff 0deg ${(workTypeDistribution.totals.substitute.amount / workTypeDistribution.grandTotalAmount) * 360}deg,
                #ffb648 ${(workTypeDistribution.totals.substitute.amount / workTypeDistribution.grandTotalAmount) * 360}deg ${((workTypeDistribution.totals.substitute.amount + workTypeDistribution.totals.overtime.amount) / workTypeDistribution.grandTotalAmount) * 360}deg,
                #ff7f94 ${((workTypeDistribution.totals.substitute.amount + workTypeDistribution.totals.overtime.amount) / workTypeDistribution.grandTotalAmount) * 360}deg 360deg
              )`
            }}
          >
            <div className="allowance-donut-center">
              <strong>
                {activeDonutType && activeDonutSegment
                  ? formatHours(activeDonutSegment.minutes)
                  : `${workTypeDistribution.dominantRatio}%`}
              </strong>
              <span>
                {activeDonutType && activeDonutSegment
                  ? `${activeDonutSegment.label} · ${activeDonutSegment.percentage}%`
                  : "최대 비중"}
              </span>
              {activeDonutType && activeDonutSegment ? (
                <em>{formatCurrencyValue(activeDonutSegment.amount)}</em>
              ) : null}
            </div>
          </div>
          <div className="allowance-legend-row">
            {workTypeDistribution.segments.map((segment) => (
              <span
                className="allowance-legend-item"
                key={segment.type}
                onMouseEnter={() => {
                  onActiveDonutTypeChange(segment.type);
                }}
                onMouseLeave={() => {
                  onActiveDonutTypeChange(null);
                }}
              >
                <i style={{ background: segment.color }} />
                {segment.label} {segment.percentage}%
              </span>
            ))}
          </div>
        </>
      ) : (
        <AllowanceEmptyState message="비중을 표시할 수당 결과가 없습니다." />
      )}
    </article>
  </aside>
);
