const performanceRows = [
  ["김철수", "서울 본사", "대체근무", "2024-10-24", "09:00 - 18:00", "대기"],
  ["이영희", "강남 지점", "연장근무", "2024-10-24", "18:00 - 21:00", "승인"],
  ["박지민", "부산 공장", "휴일근무", "2024-10-20", "09:00 - 18:00", "대기"],
  ["최동해", "서울 본사", "통상근무", "2024-10-24", "09:00 - 18:00", "승인"]
];

export const PerformanceManagementScreen = () => (
  <div className="screen-stack performance-screen">
    <section className="surface-card performance-page-card">
      <div className="section-heading compact-heading">
        <div>
          <h3>실적 관리</h3>
        </div>
        <div className="button-row">
          <span className="icon-square" />
          <span className="icon-square" />
        </div>
      </div>

      <div className="performance-section">
        <strong>파일 경로 설정</strong>
        <div className="filter-grid two-up">
          <label className="field">
            <span>승인 대기 폴더</span>
            <input readOnly value={"C:\\Projects\\Performance\\Pending"} />
          </label>
          <label className="field">
            <span>승인 완료 폴더</span>
            <input readOnly value={"C:\\Projects\\Performance\\Approved"} />
          </label>
        </div>
      </div>

      <div className="performance-section">
        <strong>상세 필터</strong>
        <div className="filter-grid performance-filter-grid">
          <label className="field filter-field filter-field-sm">
            <span>상태</span>
            <input readOnly value="전체" />
          </label>
          <label className="field filter-field filter-field-sm">
            <span>연도</span>
            <input readOnly value="2024년" />
          </label>
          <label className="field filter-field filter-field-xs">
            <span>월</span>
            <input readOnly value="10월" />
          </label>
          <div className="button-row align-end">
            <button className="ghost-button compact-button" type="button">
              전체 펼치기
            </button>
            <button className="primary-button compact-button" type="button">
              일괄승인
            </button>
          </div>
        </div>
      </div>

      <div className="data-scroll">
        <table className="info-table performance-table">
          <thead>
            <tr>
              <th>선택</th>
              <th>성명</th>
              <th>사업장</th>
              <th>근무구분</th>
              <th>날짜</th>
              <th>시작/종료 시간</th>
              <th>승인상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {performanceRows.map((row) => (
              <tr key={`${row[0]}-${row[3]}`}>
                <td>□</td>
                <td>{row[0]}</td>
                <td>{row[1]}</td>
                <td>
                  <span className={`pill ${row[2] === "대체근무" ? "info" : row[2] === "연장근무" ? "warn" : row[2] === "휴일근무" ? "danger" : "neutral"}`}>
                    {row[2]}
                  </span>
                </td>
                <td>{row[3]}</td>
                <td>{row[4]}</td>
                <td>{row[5]}</td>
                <td>∨</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="button-row spread performance-footer-actions">
        <button className="ghost-button" type="button">
          뒤로가기
        </button>
        <div className="button-row">
          <button className="ghost-button" type="button">
            취소
          </button>
          <button className="primary-button" type="button">
            일괄승인
          </button>
        </div>
      </div>
    </section>
  </div>
);
