import { useEffect, useMemo, useState } from "react";

import type { SiteRecord } from "@shared/domain/model";
import { FilterToolbar } from "../components/FilterToolbar";
import { StatusBadge } from "../components/StatusBadge";

const statusOptions = ["전체", "운영 중", "비활성"];

const toStatusLabel = (status: SiteRecord["status"]) =>
  status === "active" ? "운영 중" : "비활성";

const toStatusTone = (status: SiteRecord["status"]) =>
  status === "active" ? "good" : "warn";

export const SiteManagementScreen = () => {
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedStatus, setSelectedStatus] = useState(statusOptions[0]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    siteCode: "",
    name: "",
    status: "active" as SiteRecord["status"],
    timezone: "Asia/Seoul"
  });

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
  }, []);

  const filteredSites = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return sites.filter((site) => {
      const statusMatches =
        selectedStatus === "전체" || toStatusLabel(site.status) === selectedStatus;
      const keywordMatches =
        normalizedKeyword.length === 0 ||
        site.name.toLowerCase().includes(normalizedKeyword) ||
        site.siteCode.toLowerCase().includes(normalizedKeyword);

      return statusMatches && keywordMatches;
    });
  }, [keyword, selectedStatus, sites]);

  const handleSave = async () => {
    if (!form.siteCode.trim() || !form.name.trim()) {
      setErrorMessage("근무지 코드와 이름을 입력해야 합니다.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await window.appBridge.saveSite({
        siteCode: form.siteCode.trim(),
        name: form.name.trim(),
        status: form.status,
        timezone: form.timezone.trim() || "Asia/Seoul"
      });

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      setForm({
        siteCode: "",
        name: "",
        status: "active",
        timezone: "Asia/Seoul"
      });
      await loadSites();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <FilterToolbar
        description="근무지 상태와 코드/이름 검색을 SQLite 저장소 기준으로 바로 확인합니다."
        keyword={keyword}
        onKeywordChange={setKeyword}
        onOptionChange={setSelectedStatus}
        options={statusOptions}
        placeholder="근무지명 또는 코드 검색"
        selectedOption={selectedStatus}
        title="근무지 관리 조회"
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">근무지 등록</p>
            <h3>SQLite 기준정보 저장소에 근무지를 등록합니다</h3>
          </div>
          <StatusBadge
            label={`${sites.length}개 근무지`}
            tone="info"
          />
        </div>

        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}

        <div className="action-grid">
          <label className="form-field">
            <span>근무지 코드</span>
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, siteCode: event.target.value }))
              }
              placeholder="예: SITE-GMP"
              value={form.siteCode}
            />
          </label>
          <label className="form-field">
            <span>근무지명</span>
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="예: 김포센터"
              value={form.name}
            />
          </label>
          <label className="form-field">
            <span>상태</span>
            <select
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as SiteRecord["status"]
                }))
              }
              value={form.status}
            >
              <option value="active">운영 중</option>
              <option value="inactive">비활성</option>
            </select>
          </label>
          <label className="form-field">
            <span>시간대</span>
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, timezone: event.target.value }))
              }
              placeholder="Asia/Seoul"
              value={form.timezone}
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
            근무지 등록
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">근무지 목록</p>
            <h3>저장된 근무지 기준정보</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>근무지명</th>
                <th>코드</th>
                <th>시간대</th>
                <th>상태</th>
                <th>등록일시</th>
              </tr>
            </thead>
            <tbody>
              {filteredSites.map((site) => (
                <tr key={site.id}>
                  <td>{site.name}</td>
                  <td>{site.siteCode}</td>
                  <td>{site.timezone}</td>
                  <td>
                    <StatusBadge
                      label={toStatusLabel(site.status)}
                      tone={toStatusTone(site.status)}
                    />
                  </td>
                  <td>{site.createdAt}</td>
                </tr>
              ))}
              {filteredSites.length === 0 ? (
                <tr>
                  <td colSpan={5}>조건에 맞는 근무지가 없습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
