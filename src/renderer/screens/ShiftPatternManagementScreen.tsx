import {
  operationHolidayRows,
  operationTemplates,
  operationUsers,
  rateTable
} from "../mock-design-data";

export const ShiftPatternManagementScreen = () => (
  <div className="screen-stack">
    <section className="surface-card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">메뉴 7</p>
          <h3>운영 관리</h3>
        </div>
      </div>
      <div className="tab-row">
        <span className="tab-chip active">공휴일 관리</span>
        <span className="tab-chip">요율 관리</span>
        <span className="tab-chip">사용자 관리</span>
        <span className="tab-chip">양식 관리</span>
      </div>
    </section>

    <section className="title-line">
      <strong>요율 설정</strong>
      <span>업무 유형별 기본 및 가산 요율 관리</span>
    </section>

    <section className="split-grid two-up">
      <article className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.1 공휴일 관리</p>
            <h3>시스템 DB 등록 공휴일</h3>
          </div>
          <span className="pill info">2026</span>
        </div>
        <div className="data-scroll">
          <table className="info-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>공휴일명</th>
              </tr>
            </thead>
            <tbody>
              {operationHolidayRows.current.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">외부 API 조회</p>
            <h3>반영 대기 공휴일</h3>
          </div>
          <button className="primary-button" type="button">
            공휴일 API 불러오기
          </button>
        </div>
        <div className="data-scroll">
          <table className="info-table">
            <thead>
              <tr>
                <th>선택</th>
                <th>날짜</th>
                <th>공휴일명</th>
              </tr>
            </thead>
            <tbody>
              {operationHolidayRows.external.map((row) => (
                <tr key={row.date}>
                  <td>□</td>
                  <td>{row.date}</td>
                  <td>{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>

    <section className="split-grid two-up">
      <article className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.2 요율 관리</p>
            <h3>연도별 수당계산 요율</h3>
          </div>
        </div>
        <div className="data-scroll">
          <table className="info-table">
            <thead>
              <tr>
                <th>근로유형</th>
                <th>기본요율</th>
                <th>연장요율</th>
                <th>야간요율</th>
                <th>정의연도</th>
              </tr>
            </thead>
            <tbody>
              {rateTable.map((row) => (
                <tr key={row.workType}>
                  <td>{row.workType}</td>
                  <td>{row.base}</td>
                  <td>{row.overtime}</td>
                  <td>{row.night}</td>
                  <td>{row.year}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.3 사용자 관리</p>
            <h3>권한 및 상태별 사용자 목록</h3>
          </div>
        </div>
        <div className="data-scroll">
          <table className="info-table">
            <thead>
              <tr>
                <th>계정명</th>
                <th>이름</th>
                <th>권한</th>
                <th>연락처</th>
                <th>메일주소</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {operationUsers.map((user) => (
                <tr key={user.loginId}>
                  <td>{user.loginId}</td>
                  <td>{user.name}</td>
                  <td>{user.role}</td>
                  <td>{user.contact}</td>
                  <td>{user.email}</td>
                  <td>{user.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>

    <section className="surface-card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">7.4 양식 관리</p>
          <h3>Excel 템플릿 경로 관리</h3>
        </div>
      </div>
      <div className="template-grid">
        {operationTemplates.map((template) => (
          <article className="template-card" key={template.title}>
            <strong>{template.title}</strong>
            <p>{template.path}</p>
            <button className="ghost-button" type="button">
              파일 변경
            </button>
          </article>
        ))}
      </div>
    </section>
  </div>
);
