import { useEffect, useMemo, useState } from "react";

import type { ShiftPatternRecord, SiteRecord } from "@shared/domain/model";
import { FilterToolbar } from "../components/FilterToolbar";
import { StatusBadge } from "../components/StatusBadge";

const statusOptions = ["전체", "운영 중", "비활성"];

const toStatusLabel = (status: ShiftPatternRecord["status"]) =>
  status === "active" ? "운영 중" : "비활성";

const toStatusTone = (status: ShiftPatternRecord["status"]) =>
  status === "active" ? "good" : "warn";

const buildStepSummary = (pattern: ShiftPatternRecord) =>
  pattern.steps.map((step) => `${step.stepIndex + 1}.${step.dutyCode}`).join(" / ");

const parseStepLines = (input: string) =>
  input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const [dutyCode, startTime, endTime, breakMinutes] = line.split(",").map((value) => value.trim());

      return {
        stepIndex: index,
        dutyCode,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        breakMinutes: Number(breakMinutes || "0")
      };
    });

export const ShiftPatternManagementScreen = () => {
  const [patterns, setPatterns] = useState<ShiftPatternRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedStatus, setSelectedStatus] = useState(statusOptions[0]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    siteId: "",
    name: "",
    patternCode: "",
    startIndexRule: "team-sequence",
    status: "active" as ShiftPatternRecord["status"],
    stepsText: "D,06:00,18:00,60\nD,06:00,18:00,60\nN,18:00,06:00,90\nN,18:00,06:00,90\nX,,,0\nX,,,0"
  });

  const loadSites = async () => {
    const result = await window.appBridge.listSites();

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setSites(result.data);
    setForm((current) => ({
      ...current,
      siteId: current.siteId || result.data[0]?.id || ""
    }));
  };

  const loadPatterns = async () => {
    const result = await window.appBridge.listShiftPatterns();

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setPatterns(result.data);
  };

  useEffect(() => {
    void loadSites();
    void loadPatterns();
  }, []);

  const visiblePatterns = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return patterns.filter((pattern) => {
      const statusMatches =
        selectedStatus === "전체" || toStatusLabel(pattern.status) === selectedStatus;
      const site = sites.find((item) => item.id === pattern.siteId);
      const keywordMatches =
        normalizedKeyword.length === 0 ||
        pattern.name.toLowerCase().includes(normalizedKeyword) ||
        pattern.patternCode.toLowerCase().includes(normalizedKeyword) ||
        site?.name.toLowerCase().includes(normalizedKeyword);

      return statusMatches && keywordMatches;
    });
  }, [keyword, patterns, selectedStatus, sites]);

  const handleSave = async () => {
    if (!form.siteId || !form.name.trim() || !form.patternCode.trim()) {
      setErrorMessage("근무지, 패턴명, 패턴 코드를 입력해야 합니다.");
      return;
    }

    const steps = parseStepLines(form.stepsText);
    const hasInvalidStep = steps.some(
      (step) => !step.dutyCode || !Number.isFinite(step.breakMinutes) || step.breakMinutes < 0
    );

    if (steps.length === 0 || hasInvalidStep) {
      setErrorMessage("스텝 정의는 `근무코드,시작시각,종료시각,휴게분` 형식으로 입력해야 합니다.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await window.appBridge.saveShiftPattern({
        siteId: form.siteId,
        name: form.name.trim(),
        patternCode: form.patternCode.trim(),
        startIndexRule: form.startIndexRule.trim() || "team-sequence",
        status: form.status,
        steps
      });

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      setForm((current) => ({
        ...current,
        name: "",
        patternCode: "",
        startIndexRule: "team-sequence"
      }));
      await loadPatterns();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <FilterToolbar
        description="근무지별 근무 패턴 코드와 스텝 정의를 SQLite 기준정보로 관리합니다."
        keyword={keyword}
        onKeywordChange={setKeyword}
        onOptionChange={setSelectedStatus}
        options={statusOptions}
        placeholder="패턴명, 코드, 근무지 검색"
        selectedOption={selectedStatus}
        title="근무 패턴 관리"
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">패턴 등록</p>
            <h3>근무지별 패턴 코드와 스텝 정의를 저장합니다</h3>
          </div>
          <StatusBadge
            label={`${patterns.length}개 패턴`}
            tone="info"
          />
        </div>

        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}

        <div className="action-grid">
          <label className="form-field">
            <span>근무지</span>
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
            <span>패턴명</span>
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="예: 보라매 4조 2교대"
              value={form.name}
            />
          </label>
          <label className="form-field">
            <span>패턴 코드</span>
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, patternCode: event.target.value }))
              }
              placeholder="예: DDNNXX"
              value={form.patternCode}
            />
          </label>
          <label className="form-field">
            <span>시작 index 규칙</span>
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, startIndexRule: event.target.value }))
              }
              placeholder="예: team-sequence"
              value={form.startIndexRule}
            />
          </label>
          <label className="form-field">
            <span>상태</span>
            <select
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as ShiftPatternRecord["status"]
                }))
              }
              value={form.status}
            >
              <option value="active">운영 중</option>
              <option value="inactive">비활성</option>
            </select>
          </label>
          <label className="form-field">
            <span>스텝 정의</span>
            <textarea
              className="textarea-field"
              onChange={(event) =>
                setForm((current) => ({ ...current, stepsText: event.target.value }))
              }
              placeholder="근무코드,시작시각,종료시각,휴게분"
              rows={6}
              value={form.stepsText}
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
            패턴 등록
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">패턴 목록</p>
            <h3>저장된 근무 패턴 기준정보</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>패턴명</th>
                <th>근무지</th>
                <th>패턴 코드</th>
                <th>사이클</th>
                <th>시작 규칙</th>
                <th>스텝 요약</th>
                <th>상태</th>
                <th>등록일시</th>
              </tr>
            </thead>
            <tbody>
              {visiblePatterns.map((pattern) => {
                const site = sites.find((item) => item.id === pattern.siteId);

                return (
                  <tr key={pattern.id}>
                    <td>{pattern.name}</td>
                    <td>{site?.name ?? "-"}</td>
                    <td>{pattern.patternCode}</td>
                    <td>{pattern.cycleLength}일</td>
                    <td>{pattern.startIndexRule}</td>
                    <td>{buildStepSummary(pattern)}</td>
                    <td>
                      <StatusBadge
                        label={toStatusLabel(pattern.status)}
                        tone={toStatusTone(pattern.status)}
                      />
                    </td>
                    <td>{pattern.createdAt}</td>
                  </tr>
                );
              })}
              {visiblePatterns.length === 0 ? (
                <tr>
                  <td colSpan={8}>조건에 맞는 근무 패턴이 없습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
