import { FilterToolbar } from "../components/FilterToolbar";
import { StatusBadge } from "../components/StatusBadge";

const workforceRows = [
  {
    name: "김현우",
    employeeCode: "EMP-001",
    site: "보라매DC",
    shiftGroup: "A조",
    hourlyRate: "₩12,800",
    status: { tone: "good" as const, label: "근무 중" }
  },
  {
    name: "이수민",
    employeeCode: "EMP-014",
    site: "동탄센터",
    shiftGroup: "B조",
    hourlyRate: "₩13,200",
    status: { tone: "warn" as const, label: "이동 예정" }
  },
  {
    name: "박정호",
    employeeCode: "EMP-023",
    site: "인천허브",
    shiftGroup: "야간조",
    hourlyRate: "₩14,100",
    status: { tone: "info" as const, label: "승인 대기" }
  }
];

export const WorkforceManagementScreen = () => (
  <>
    <FilterToolbar
      description="인력 검색, 근무지 구분, 상태 확인을 한 줄에서 처리하는 기본 필터 바입니다."
      options={["전체", "근무 중", "이동 예정", "승인 대기"]}
      placeholder="이름 또는 사번 검색"
      title="인력 관리 조회"
    />

    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">인력 목록</p>
          <h3>배정 상태와 시급 이력을 확인하는 기본 테이블</h3>
        </div>
        <button
          className="primary-button"
          type="button"
        >
          인력 등록
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>사번</th>
              <th>근무지</th>
              <th>근무조</th>
              <th>통상시급</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {workforceRows.map((row) => (
              <tr key={row.employeeCode}>
                <td>{row.name}</td>
                <td>{row.employeeCode}</td>
                <td>{row.site}</td>
                <td>{row.shiftGroup}</td>
                <td>{row.hourlyRate}</td>
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
