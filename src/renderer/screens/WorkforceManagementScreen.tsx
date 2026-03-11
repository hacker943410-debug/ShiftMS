import { useState } from "react";

const employeeRows = [
  {
    no: 1,
    employeeCode: "240101",
    grade: "사원",
    name: "김민준",
    siteName: "서울 본사",
    shiftName: "A조",
    currentStatus: "재직",
    hourlyRate: "10,500원",
    role: "팀원",
    workPeriod: "2년 1개월",
    avatar: "KMJ"
  },
  {
    no: 2,
    employeeCode: "240102",
    grade: "대리",
    name: "박지민",
    siteName: "부산 지사",
    shiftName: "B조",
    currentStatus: "휴직",
    hourlyRate: "12,800원",
    role: "조장",
    workPeriod: "3년 4개월",
    avatar: "PJM"
  },
  {
    no: 3,
    employeeCode: "240103",
    grade: "사원",
    name: "이서연",
    siteName: "서울 본사",
    shiftName: "A조",
    currentStatus: "재직",
    hourlyRate: "10,500원",
    role: "팀원",
    workPeriod: "1년 2개월",
    avatar: "LSY"
  },
  {
    no: 4,
    employeeCode: "240104",
    grade: "과장",
    name: "최영희",
    siteName: "대구 지사",
    shiftName: "C조",
    currentStatus: "파견",
    hourlyRate: "16,000원",
    role: "관리",
    workPeriod: "6년 0개월",
    avatar: "CYH"
  },
  {
    no: 5,
    employeeCode: "240105",
    grade: "사원",
    name: "정하늘",
    siteName: "서울 본사",
    shiftName: "B조",
    currentStatus: "재직",
    hourlyRate: "10,500원",
    role: "생산",
    workPeriod: "9개월",
    avatar: "JHN"
  },
  {
    no: 6,
    employeeCode: "240106",
    grade: "주임",
    name: "윤서준",
    siteName: "광주 지사",
    shiftName: "A조",
    currentStatus: "재직",
    hourlyRate: "13,200원",
    role: "조장",
    workPeriod: "4년 8개월",
    avatar: "YSJ"
  }
];

const selectedEmployee = {
  employeeCode: "2024001",
  name: "김철수",
  hireDate: "2023.01.01",
  assignmentDate: "2023.01.01",
  siteName: "서울 본사",
  shiftName: "A조",
  status: "근무 중",
  releaseDate: "",
  hourlyRate: "#,##0원",
  workHistory: [
    "2023.01.01 근무지: 서울 본사, 근무조명: A조 변경",
    "2023.03.15 근무조명: B조 변경",
    "2023.06.20 근무지: 서울 본사, 근무조명: A조 변경"
  ],
  wageHistory: [
    "2023.01.01 시급: 15,000원",
    "2023.06.01 시급: 15,500원",
    "2024.01.01 시급: 16,000원"
  ]
};

export const WorkforceManagementScreen = () => {
  const [showDetail, setShowDetail] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  if (showDetail) {
    return (
      <div className="screen-stack workforce-detail-screen">
        <section className="detail-page-shell">
          <div className="detail-backdrop-panel">
            <div className="detail-backdrop-copy">
              <p>인력 상세 정보</p>
              <strong>{selectedEmployee.name}</strong>
              <span>
                {selectedEmployee.siteName} / {selectedEmployee.shiftName}
              </span>
            </div>
          </div>

          <div className="detail-info-column">
            <div className="detail-info-card">
              <div className="detail-static-item">
                <span>사원번호</span>
                <strong>{selectedEmployee.employeeCode}</strong>
              </div>
              <div className="detail-static-item">
                <span>이름</span>
                <strong>{selectedEmployee.name}</strong>
              </div>
              <div className="detail-static-item">
                <span>입사일</span>
                <strong>{selectedEmployee.hireDate}</strong>
              </div>
              <div className="detail-static-item">
                <span>직무적용일</span>
                <strong>{selectedEmployee.assignmentDate}</strong>
              </div>
              <div className="detail-static-item">
                <span>근무지</span>
                <strong>{selectedEmployee.siteName}</strong>
              </div>
              <div className="detail-static-item">
                <span>근무조명</span>
                <strong>{selectedEmployee.shiftName}</strong>
              </div>
              <div className="detail-static-item">
                <span>상태</span>
                <strong>{selectedEmployee.status}</strong>
              </div>
            </div>
          </div>

          <div className="detail-edit-column">
            <div className="detail-edit-card">
              <h3>직무해제일/예정일</h3>
              <input readOnly value="YYYY.MM.DD" />
              <h3>통상시급</h3>
              <input readOnly value={selectedEmployee.hourlyRate} />
              <div className="detail-tip-box">
                <strong>입력 안내</strong>
                <span>입력은 숫자만, 출력은 자동으로 '#,##0원' 포맷을 적용합니다.</span>
              </div>
              <div className="button-row">
                <button className="primary-button" type="button">
                  수정
                </button>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setShowDetail(false);
                  }}
                  type="button"
                >
                  뒤로가기
                </button>
              </div>
            </div>
          </div>

          <div className="detail-history-column">
            <div className="detail-history-box">
              <h3>근무변경이력</h3>
              <div className="timeline-list">
                {selectedEmployee.workHistory.map((history) => (
                  <div className="timeline-item" key={history}>
                    <span className="timeline-dot" />
                    <p>{history}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="detail-history-box">
              <h3>시급변경이력</h3>
              <div className="timeline-list">
                {selectedEmployee.wageHistory.map((history) => (
                  <div className="timeline-item" key={history}>
                    <span className="timeline-dot" />
                    <p>{history}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="screen-stack">
      <section className="surface-card workforce-header-card">
        <div className="section-heading compact-heading">
          <div>
            <h3>근무 인력 관리</h3>
            <p>사원 명부 및 교대근무 현황</p>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              setShowCreateModal(true);
            }}
            type="button"
          >
            신규 인력 등록
          </button>
        </div>

        <div className="filter-grid workforce-filter-grid">
          <label className="field">
            <span>근무지</span>
            <input readOnly value="전체" />
          </label>
          <label className="field">
            <span>현재상태</span>
            <input readOnly value="재직" />
          </label>
          <label className="field">
            <span>처리결과</span>
            <input readOnly value="전체" />
          </label>
          <label className="field workforce-search-field">
            <span>검색</span>
            <input readOnly value="이름/사원번호 검색" />
          </label>
        </div>

        <div className="data-scroll">
          <table className="info-table workforce-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>사원번호</th>
                <th>직급</th>
                <th>이름</th>
                <th>근무지</th>
                <th>조이름</th>
                <th>현재상태</th>
                <th>통상시급</th>
                <th>역할</th>
                <th>근무기간</th>
                <th>프로필</th>
              </tr>
            </thead>
            <tbody>
              {employeeRows.map((row) => (
                <tr key={row.employeeCode}>
                  <td>{row.no}</td>
                  <td>{row.employeeCode}</td>
                  <td>{row.grade}</td>
                  <td className="table-strong">{row.name}</td>
                  <td>{row.siteName}</td>
                  <td>{row.shiftName}</td>
                  <td>
                    <span
                      className={`pill ${
                        row.currentStatus === "재직"
                          ? "info"
                          : row.currentStatus === "휴직"
                            ? "warn"
                            : "neutral"
                      }`}
                    >
                      {row.currentStatus}
                    </span>
                  </td>
                  <td>{row.hourlyRate}</td>
                  <td>{row.role}</td>
                  <td>{row.workPeriod}</td>
                  <td>
                    <button
                      aria-label={`${row.name} 상세 보기`}
                      className="profile-trigger"
                      onClick={() => {
                        setShowDetail(true);
                      }}
                      title={`${row.name} 상세 보기`}
                      type="button"
                    >
                      <span className="profile-avatar">{row.avatar}</span>
                      <span className="profile-name">{row.name}</span>
                      <span className="profile-actions icon-view" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination-row">
          <span>«</span>
          <span>‹</span>
          <strong>1</strong>
          <span>2</span>
          <span>3</span>
          <span>4</span>
          <span>5</span>
          <span>›</span>
          <span>»</span>
        </div>
      </section>

      {showCreateModal ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <h3>신규 인력 등록</h3>
                <p>UI 기준 검토용 등록 팝업입니다. 필드 구성과 배치만 먼저 확정합니다.</p>
              </div>
            </div>
            <div className="filter-grid two-up">
              <label className="field">
                <span>사원번호</span>
                <input readOnly value="2024007" />
              </label>
              <label className="field">
                <span>직급</span>
                <input readOnly value="사원" />
              </label>
              <label className="field">
                <span>이름</span>
                <input readOnly value="이름 입력" />
              </label>
              <label className="field">
                <span>생년월일</span>
                <input readOnly value="YYYY-MM-DD" />
              </label>
              <label className="field">
                <span>입사일</span>
                <input readOnly value="YYYY-MM-DD" />
              </label>
              <label className="field">
                <span>통상시급</span>
                <input readOnly value="숫자 입력" />
              </label>
            </div>
            <div className="button-row">
              <button className="primary-button" type="button">
                저장
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  setShowCreateModal(false);
                }}
                type="button"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
