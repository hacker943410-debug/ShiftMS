import { FilterToolbar } from "../components/FilterToolbar";
import { StatusBadge } from "../components/StatusBadge";

const siteRows = [
  {
    name: "보라매DC",
    pattern: "DDNNXX",
    headcount: "42명",
    pendingFiles: "4건",
    status: { tone: "good" as const, label: "운영 중" }
  },
  {
    name: "동탄센터",
    pattern: "DDDXNNX",
    headcount: "38명",
    pendingFiles: "7건",
    status: { tone: "warn" as const, label: "패턴 점검" }
  },
  {
    name: "인천허브",
    pattern: "NNXXDD",
    headcount: "46명",
    pendingFiles: "2건",
    status: { tone: "info" as const, label: "정상 수신" }
  }
];

export const SiteManagementScreen = () => (
  <>
    <FilterToolbar
      description="근무지 상태, 패턴 문자열, 승인 대기 파일 수를 기준으로 근무지 운영 현황을 빠르게 점검합니다."
      options={["전체", "운영 중", "패턴 점검", "정상 수신"]}
      placeholder="근무지명 검색"
      title="근무지 관리 조회"
    />

    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">근무지 목록</p>
          <h3>패턴과 실적 수신 상태를 함께 보는 기본 테이블</h3>
        </div>
        <button
          className="primary-button"
          type="button"
        >
          근무지 등록
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>근무지</th>
              <th>패턴 문자열</th>
              <th>배정 인원</th>
              <th>승인 대기 파일</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {siteRows.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{row.pattern}</td>
                <td>{row.headcount}</td>
                <td>{row.pendingFiles}</td>
                <td>
                  <StatusBadge
                    label={row.status.label}
                    tone={row.status.tone}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </>
);
