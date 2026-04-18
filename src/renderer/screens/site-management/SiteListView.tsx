import type { RefObject } from "react";

import type { SiteRecord } from "@shared/domain/model";

interface SiteListSummary {
  totalSites: number;
  activeSites: number;
  poolSites: number;
  assignedEmployees: number;
}

interface SiteListViewRowBase {
  site: Pick<
    SiteRecord,
    "id" | "name" | "customerName" | "siteCode" | "status"
  >;
  cycleSummaries: Array<{
    cycleKey: string;
    name: string;
    patternString: string;
    patternStartDate?: string;
  }>;
  shiftDefinitions: Array<{
    label: string;
    timeRange: string;
    cycleName?: string;
  }>;
  teamStatusItems: Array<{
    headcount: number;
    label: string;
  }>;
  workType: string;
  poolEnabled: boolean;
}

interface SiteListViewProps<Row extends SiteListViewRowBase> {
  canManageSiteRegistration: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  isLoading: boolean;
  onOpenDetail: (row: Row) => void;
  onOpenPatternImport: () => void;
  onOpenRegistration: () => void;
  rows: Row[];
  screenError: string | null;
  siteListSummary: SiteListSummary;
}

const truncatePatternSummary = (value: string, maxLength = 15) => {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed || "-";
  }

  return `${trimmed.slice(0, maxLength)}...`;
};

export const SiteListView = <Row extends SiteListViewRowBase>({
  canManageSiteRegistration,
  headingRef,
  isLoading,
  onOpenDetail,
  onOpenPatternImport,
  onOpenRegistration,
  rows,
  screenError,
  siteListSummary,
}: SiteListViewProps<Row>) => (
  <section className="surface-card site-list-shell">
    <div className="section-heading compact-heading">
      <div>
        <h3 ref={headingRef} tabIndex={-1}>
          근무지 관리
        </h3>
        <p>저장된 근무지와 활성 패턴, 현재 인력 배치 상태를 확인합니다.</p>
      </div>
      <div className="button-row">
        {canManageSiteRegistration ? (
          <>
            <button
              className="ghost-button"
              onClick={onOpenPatternImport}
              type="button"
            >
              패턴 적용된 근무지 추가
            </button>
            <button
              className="primary-button"
              onClick={onOpenRegistration}
              type="button"
            >
              근무지 등록
            </button>
          </>
        ) : (
          <span className="site-field-note">기준정보 수정 권한 필요</span>
        )}
      </div>
    </div>

    {screenError ? <p className="form-error-text">{screenError}</p> : null}

    <section className="site-step-summary-grid">
      <article className="surface-card site-step-summary-card emphasis">
        <span>등록 근무지</span>
        <strong>{siteListSummary.totalSites}개</strong>
        <em>저장된 근무지 전체</em>
      </article>
      <article className="surface-card site-step-summary-card">
        <span>운영중 근무지</span>
        <strong>{siteListSummary.activeSites}개</strong>
        <em>현재 활성 상태 기준</em>
      </article>
      <article className="surface-card site-step-summary-card">
        <span>Pool 운영</span>
        <strong>{siteListSummary.poolSites}개</strong>
        <em>Pool 별도 운영 포함</em>
      </article>
      <article className="surface-card site-step-summary-card">
        <span>배정 인원</span>
        <strong>{siteListSummary.assignedEmployees}명</strong>
        <em>목록에 표시되는 총 배정 수</em>
      </article>
    </section>

    <div className="data-scroll">
      <table className="info-table site-list-table">
        <colgroup>
          <col className="site-list-col-site" />
          <col className="site-list-col-pattern" />
          <col className="site-list-col-structure" />
          <col className="site-list-col-teams" />
          <col className="site-list-col-status" />
          <col className="site-list-col-action" />
        </colgroup>
        <thead>
          <tr>
            <th>근무지</th>
            <th>Cycle · 패턴</th>
            <th>운영 구조</th>
            <th>조 현황</th>
            <th>상태</th>
            <th>액션</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={6}>근무지 정보를 불러오는 중입니다.</td>
            </tr>
          ) : rows.length > 0 ? (
            rows.map((row) => (
              <tr key={row.site.id}>
                <td className="site-site-cell">
                  <div className="site-list-primary">
                    <strong>{row.site.name}</strong>
                    <span>
                      {row.site.customerName
                        ? `${row.site.customerName} · ${row.site.siteCode}`
                        : row.site.siteCode}
                    </span>
                  </div>
                </td>
                <td className="site-pattern-cell">
                  <div className="site-cycle-summary-list">
                    {row.cycleSummaries.length > 0 ? (
                      row.cycleSummaries.map((cycle) => (
                        <div
                          className="site-cycle-summary-item"
                          key={`${row.site.id}-${cycle.cycleKey}`}
                        >
                          <strong>{cycle.name}</strong>
                          <span title={cycle.patternString}>
                            {truncatePatternSummary(cycle.patternString)}
                          </span>
                          <em>시작일 {cycle.patternStartDate ?? "-"}</em>
                        </div>
                      ))
                    ) : (
                      <div className="site-pattern-empty">
                        <strong>등록된 Cycle이 없습니다.</strong>
                        <span>패턴을 먼저 등록해야 합니다.</span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="site-worktype-cell">
                  <div className="site-list-structure">
                    <strong>{row.workType}</strong>
                    <span>
                      {row.shiftDefinitions.length > 0
                        ? `${row.shiftDefinitions.length}개 근무시간 세트`
                        : "근무시간 미등록"}
                    </span>
                    {row.shiftDefinitions.slice(0, 2).map((definition) => (
                      <em
                        key={`${row.site.id}-${definition.cycleName ?? "default"}-${definition.label}`}
                      >
                        {definition.cycleName
                          ? `${definition.cycleName} · `
                          : ""}
                        {definition.label} {definition.timeRange}
                      </em>
                    ))}
                  </div>
                </td>
                <td className="site-team-cell">
                  {row.teamStatusItems.length > 0 ? (
                    <div className="site-team-stack">
                      <span className="site-team-total">
                        총{" "}
                        {row.teamStatusItems.reduce(
                          (sum, item) => sum + item.headcount,
                          0,
                        )}
                        명 배정
                      </span>
                      <div className="site-team-summary">
                        {row.teamStatusItems.map((item) => (
                          <span
                            className="site-team-chip"
                            key={`${row.site.id}-${item.label}`}
                          >
                            <em>{item.label}</em>
                            <strong>{item.headcount}명</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span className="site-team-empty">배정 인력 없음</span>
                  )}
                </td>
                <td className="site-status-cell">
                  <div className="site-status-stack">
                    <span
                      className={
                        row.site.status === "active"
                          ? "pill info"
                          : "pill neutral"
                      }
                    >
                      {row.site.status === "active" ? "운영중" : "중지"}
                    </span>
                    <em>{row.poolEnabled ? "Pool 운영" : "Pool 없음"}</em>
                  </div>
                </td>
                <td className="site-action-cell">
                  <div className="site-action-stack">
                    <button
                      className="icon-button"
                      onClick={() => {
                        onOpenDetail(row);
                      }}
                      type="button"
                    >
                      상세 보기
                    </button>
                    <span>Cycle {row.cycleSummaries.length}개</span>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6}>등록된 근무지가 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </section>
);
