import { useEffect, useMemo, useState } from "react";

import type { EmployeeRecord, SiteRecord } from "@shared/domain/model";
import { FilterToolbar } from "../components/FilterToolbar";
import { StatusBadge } from "../components/StatusBadge";

const statusOptions = ["전체", "근무 중", "휴직", "퇴사"];

const toStatusLabel = (status: EmployeeRecord["status"]) => {
  switch (status) {
    case "active":
      return "근무 중";
    case "leave":
      return "휴직";
    case "retired":
      return "퇴사";
    default:
      return status;
  }
};

const toStatusTone = (status: EmployeeRecord["status"]) => {
  switch (status) {
    case "active":
      return "good" as const;
    case "leave":
      return "warn" as const;
    case "retired":
      return "bad" as const;
    default:
      return "info" as const;
  }
};

const toStatusValue = (label: string): EmployeeRecord["status"] | undefined => {
  switch (label) {
    case "근무 중":
      return "active";
    case "휴직":
      return "leave";
    case "퇴사":
      return "retired";
    default:
      return undefined;
  }
};

const formatHourlyRate = (hourlyRate?: number) =>
  typeof hourlyRate === "number" ? `₩${hourlyRate.toLocaleString()}` : "-";

export const WorkforceManagementScreen = () => {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedStatus, setSelectedStatus] = useState(statusOptions[0]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    employeeCode: "",
    name: "",
    employmentType: "정규",
    status: "active" as EmployeeRecord["status"],
    hireDate: "",
    siteId: "",
    shiftGroup: "",
    hourlyRate: ""
  });

  const loadEmployees = async (query?: {
    keyword?: string;
    status?: EmployeeRecord["status"];
  }) => {
    const result = await window.appBridge.listEmployees(query);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setEmployees(result.data);
  };

  const loadSites = async () => {
    const result = await window.appBridge.listSites();

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setSites(result.data);
  };

  useEffect(() => {
    void loadSites();
    void loadEmployees();
  }, []);

  useEffect(() => {
    void loadEmployees({
      keyword,
      status: toStatusValue(selectedStatus)
    });
  }, [keyword, selectedStatus]);

  const visibleEmployees = useMemo(() => employees, [employees]);

  const handleSave = async () => {
    if (!form.employeeCode.trim() || !form.name.trim()) {
      setErrorMessage("사번과 이름을 입력해야 합니다.");
      return;
    }

    const normalizedHourlyRate = form.hourlyRate.trim();
    const parsedHourlyRate =
      normalizedHourlyRate.length > 0 ? Number(normalizedHourlyRate) : undefined;

    if (
      normalizedHourlyRate.length > 0 &&
      (!Number.isFinite(parsedHourlyRate) || Number(parsedHourlyRate) <= 0)
    ) {
      setErrorMessage("시급은 0보다 큰 숫자로 입력해야 합니다.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await window.appBridge.saveEmployee({
        employeeCode: form.employeeCode.trim(),
        name: form.name.trim(),
        employmentType: form.employmentType.trim() || "정규",
        status: form.status,
        hireDate: form.hireDate || undefined,
        siteId: form.siteId || undefined,
        shiftGroup: form.shiftGroup.trim() || undefined,
        hourlyRate: parsedHourlyRate
      });

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      setForm({
        employeeCode: "",
        name: "",
        employmentType: "정규",
        status: "active",
        hireDate: "",
        siteId: "",
        shiftGroup: "",
        hourlyRate: ""
      });
      await loadEmployees({
        keyword,
        status: toStatusValue(selectedStatus)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <FilterToolbar
        description="이름, 사번, 상태 기준으로 직원과 현재 배정 근무지/시급 정보를 함께 조회합니다."
        keyword={keyword}
        onKeywordChange={setKeyword}
        onOptionChange={setSelectedStatus}
        options={statusOptions}
        placeholder="이름 또는 사번 검색"
        selectedOption={selectedStatus}
        title="인력 관리 조회"
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">인력 등록</p>
            <h3>직원 기본정보와 현재 근무지/시급을 함께 등록합니다</h3>
          </div>
          <StatusBadge
            label={`${employees.length}명 조회`}
            tone="info"
          />
        </div>

        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}

        <div className="action-grid">
          <label className="form-field">
            <span>사번</span>
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, employeeCode: event.target.value }))
              }
              placeholder="예: EMP-100"
              value={form.employeeCode}
            />
          </label>
          <label className="form-field">
            <span>이름</span>
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="예: 최민아"
              value={form.name}
            />
          </label>
          <label className="form-field">
            <span>고용형태</span>
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, employmentType: event.target.value }))
              }
              placeholder="예: 정규"
              value={form.employmentType}
            />
          </label>
          <label className="form-field">
            <span>상태</span>
            <select
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as EmployeeRecord["status"]
                }))
              }
              value={form.status}
            >
              <option value="active">근무 중</option>
              <option value="leave">휴직</option>
              <option value="retired">퇴사</option>
            </select>
          </label>
          <label className="form-field">
            <span>입사일</span>
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, hireDate: event.target.value }))
              }
              placeholder="YYYY-MM-DD"
              value={form.hireDate}
            />
          </label>
          <label className="form-field">
            <span>현재 근무지</span>
            <select
              onChange={(event) =>
                setForm((current) => ({ ...current, siteId: event.target.value }))
              }
              value={form.siteId}
            >
              <option value="">선택 안 함</option>
              {sites.map((site) => (
                <option
                  key={site.id}
                  value={site.id}
                >
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>근무조</span>
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, shiftGroup: event.target.value }))
              }
              placeholder="예: A조"
              value={form.shiftGroup}
            />
          </label>
          <label className="form-field">
            <span>통상시급</span>
            <input
              inputMode="numeric"
              onChange={(event) =>
                setForm((current) => ({ ...current, hourlyRate: event.target.value }))
              }
              placeholder="예: 12800"
              value={form.hourlyRate}
            />
          </label>
        </div>

        <div className="action-row">
          <button
            className="primary-button"
            disabled={isSubmitting}
            onClick={() => {
              void handleSave();
            }}
            type="button"
          >
            인력 등록
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">인력 목록</p>
            <h3>저장된 직원 기준정보와 현재 배정 현황</h3>
          </div>
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
                <th>고용형태</th>
                <th>상태</th>
                <th>입사일</th>
                <th>등록일시</th>
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.name}</td>
                  <td>{employee.employeeCode}</td>
                  <td>{employee.currentSiteName ?? "-"}</td>
                  <td>{employee.currentShiftGroup ?? "-"}</td>
                  <td>{formatHourlyRate(employee.currentHourlyRate)}</td>
                  <td>{employee.employmentType}</td>
                  <td>
                    <StatusBadge
                      label={toStatusLabel(employee.status)}
                      tone={toStatusTone(employee.status)}
                    />
                  </td>
                  <td>{employee.hireDate ?? "-"}</td>
                  <td>{employee.createdAt}</td>
                </tr>
              ))}
              {visibleEmployees.length === 0 ? (
                <tr>
                  <td colSpan={9}>조건에 맞는 직원이 없습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
