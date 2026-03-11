import { useEffect, useMemo, useState } from "react";

import type {
  EmployeeRecord,
  MonthlyScheduleRecord,
  ShiftPatternRecord,
  SiteRecord
} from "@shared/domain/model";
import type { SchedulePlanPreviewRecord } from "@shared/domain/schedule-plan";
import type { SchedulePlanExportRecord } from "@shared/domain/schedule-plan";
import { FilterToolbar } from "../components/FilterToolbar";
import { StatusBadge } from "../components/StatusBadge";

const siteFilterOptions = ["전체"];

const parseScheduleItems = (input: string) =>
  input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [employeeCode, workDate, dutyCode, startTime, endTime, breakMinutes] = line
        .split(",")
        .map((value) => value.trim());

      return {
        employeeCode,
        workDate,
        dutyCode,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        breakMinutes: Number(breakMinutes || "0")
      };
    });

const buildSiteOptions = (sites: SiteRecord[]) => [
  ...siteFilterOptions,
  ...sites.map((site) => site.name)
];

export const ScheduleManagementScreen = () => {
  const [schedules, setSchedules] = useState<MonthlyScheduleRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [patterns, setPatterns] = useState<ShiftPatternRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [planPreview, setPlanPreview] = useState<SchedulePlanPreviewRecord | null>(null);
  const [exportResult, setExportResult] = useState<SchedulePlanExportRecord | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selectedSiteFilter, setSelectedSiteFilter] = useState(siteFilterOptions[0]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    siteId: "",
    patternId: "",
    scheduleMonth: "2026-04",
    generatedBy: "admin",
    itemsText: "EMP-001,2026-04-01,D,06:00,18:00,60\nEMP-001,2026-04-02,D,06:00,18:00,60"
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

  const loadSchedules = async (siteId?: string) => {
    const result = await window.appBridge.listMonthlySchedules(siteId);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setSchedules(result.data);
  };

  const loadPatterns = async (siteId?: string) => {
    const result = await window.appBridge.listShiftPatterns(siteId);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setPatterns(result.data);
    setForm((current) => ({
      ...current,
      patternId:
        current.patternId && result.data.some((pattern) => pattern.id === current.patternId)
          ? current.patternId
          : result.data[0]?.id || ""
    }));
  };

  const loadEmployees = async (siteId?: string) => {
    const result = await window.appBridge.listEmployees(siteId ? { siteId } : undefined);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setEmployees(result.data);
  };

  useEffect(() => {
    void loadSites();
    void loadSchedules();
  }, []);

  useEffect(() => {
    if (!form.siteId) {
      return;
    }

    void loadPatterns(form.siteId);
    void loadEmployees(form.siteId);
  }, [form.siteId]);

  useEffect(() => {
    const targetSiteId =
      selectedSiteFilter === "전체"
        ? undefined
        : sites.find((site) => site.name === selectedSiteFilter)?.id;

    void loadSchedules(targetSiteId);
  }, [selectedSiteFilter, sites]);

  const filteredSchedules = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return schedules.filter((schedule) => {
      if (normalizedKeyword.length === 0) {
        return true;
      }

      return (
        schedule.siteName?.toLowerCase().includes(normalizedKeyword) ||
        schedule.patternName?.toLowerCase().includes(normalizedKeyword) ||
        schedule.scheduleMonth.toLowerCase().includes(normalizedKeyword) ||
        schedule.items.some(
          (item) =>
            item.employeeCode?.toLowerCase().includes(normalizedKeyword) ||
            item.employeeName?.toLowerCase().includes(normalizedKeyword)
        )
      );
    });
  }, [keyword, schedules]);

  const availableEmployees = useMemo(
    () => employees.map((employee) => `${employee.employeeCode} · ${employee.name}`).join(", "),
    [employees]
  );

  const handleSave = async () => {
    if (!form.siteId || !form.patternId || !form.scheduleMonth.trim()) {
      setErrorMessage("근무지, 패턴, 배포월을 입력해야 합니다.");
      return;
    }

    const items = parseScheduleItems(form.itemsText);
    const hasInvalidItem = items.some(
      (item) =>
        !item.employeeCode ||
        !item.workDate ||
        !item.dutyCode ||
        !Number.isFinite(item.breakMinutes) ||
        item.breakMinutes < 0
    );

    if (items.length === 0 || hasInvalidItem) {
      setErrorMessage(
        "배정 항목은 `사번,근무일,근무코드,시작,종료,휴게분` 형식으로 한 줄씩 입력해야 합니다."
      );
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await window.appBridge.saveMonthlySchedule({
        siteId: form.siteId,
        patternId: form.patternId,
        scheduleMonth: form.scheduleMonth.trim(),
        generatedBy: form.generatedBy.trim() || "admin",
        items
      });

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      await loadSchedules(form.siteId);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePreview = async (scheduleId: string) => {
    setErrorMessage(null);
    setIsPreviewLoading(true);
    setSelectedScheduleId(scheduleId);

    try {
      const result = await window.appBridge.previewMonthlySchedulePlan(scheduleId);

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      setPlanPreview(result.data);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleExport = async (scheduleId: string) => {
    setErrorMessage(null);
    setIsExporting(true);
    setSelectedScheduleId(scheduleId);

    try {
      const result = await window.appBridge.exportMonthlySchedulePlan(scheduleId);

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      setExportResult(result.data);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <FilterToolbar
        description="근무지별 월간 배정 묶음과 배정 항목을 SQLite 기준으로 저장하고 조회합니다."
        keyword={keyword}
        onKeywordChange={setKeyword}
        onOptionChange={setSelectedSiteFilter}
        options={buildSiteOptions(sites)}
        placeholder="근무지, 패턴, 사번 검색"
        selectedOption={selectedSiteFilter}
        title="근무표 배포 관리"
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">배정 등록</p>
            <h3>월간 배정 묶음과 배정 항목을 함께 저장합니다</h3>
          </div>
          <StatusBadge
            label={`${schedules.length}개 배정`}
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
            <span>근무 패턴</span>
            <select
              onChange={(event) =>
                setForm((current) => ({ ...current, patternId: event.target.value }))
              }
              value={form.patternId}
            >
              <option value="">선택 안 함</option>
              {patterns.map((pattern) => (
                <option
                  key={pattern.id}
                  value={pattern.id}
                >
                  {pattern.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>배포월</span>
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, scheduleMonth: event.target.value }))
              }
              placeholder="YYYY-MM"
              value={form.scheduleMonth}
            />
          </label>
          <label className="form-field">
            <span>생성자</span>
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, generatedBy: event.target.value }))
              }
              placeholder="예: admin"
              value={form.generatedBy}
            />
          </label>
          <label className="form-field">
            <span>배정 항목</span>
            <textarea
              className="textarea-field"
              onChange={(event) =>
                setForm((current) => ({ ...current, itemsText: event.target.value }))
              }
              rows={8}
              value={form.itemsText}
            />
          </label>
        </div>

        <p className="helper-copy">
          입력 형식: `사번,근무일,근무코드,시작,종료,휴게분`
          {availableEmployees ? ` / 현재 근무지 인력: ${availableEmployees}` : ""}
        </p>

        <div className="action-row">
          <button
            className="primary-button"
            disabled={isSubmitting}
            onClick={() => {
              void handleSave();
            }}
            type="button"
          >
            배정 저장
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">배정 목록</p>
            <h3>저장된 월간 배정 묶음</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>배포월</th>
                <th>근무지</th>
                <th>패턴</th>
                <th>생성자</th>
                <th>항목 수</th>
                <th>대표 항목</th>
                <th>미리보기</th>
                <th>파일 생성</th>
                <th>생성일시</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td>{schedule.scheduleMonth}</td>
                  <td>{schedule.siteName ?? "-"}</td>
                  <td>{schedule.patternName ?? "-"}</td>
                  <td>{schedule.generatedBy}</td>
                  <td>{schedule.items.length}건</td>
                  <td>
                    {schedule.items
                      .slice(0, 2)
                      .map((item) => `${item.employeeCode} ${item.workDate} ${item.dutyCode}`)
                      .join(" / ") || "-"}
                  </td>
                  <td>
                    <button
                      className="secondary-button"
                      disabled={isPreviewLoading && selectedScheduleId === schedule.id}
                      onClick={() => {
                        void handlePreview(schedule.id);
                      }}
                      type="button"
                    >
                      {isPreviewLoading && selectedScheduleId === schedule.id
                        ? "불러오는 중"
                        : "셀 미리보기"}
                    </button>
                  </td>
                  <td>
                    <button
                      className="primary-button"
                      disabled={isExporting && selectedScheduleId === schedule.id}
                      onClick={() => {
                        void handleExport(schedule.id);
                      }}
                      type="button"
                    >
                      {isExporting && selectedScheduleId === schedule.id
                        ? "생성 중"
                        : "엑셀 생성"}
                    </button>
                  </td>
                  <td>{schedule.generatedAt}</td>
                </tr>
              ))}
              {filteredSchedules.length === 0 ? (
                <tr>
                  <td colSpan={9}>조건에 맞는 월간 배정이 없습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Excel 미리보기</p>
            <h3>샘플 템플릿 기준 셀 업데이트 목록</h3>
          </div>
          {planPreview ? (
            <StatusBadge
              label={`${planPreview.updateCount}개 셀`}
              tone="info"
            />
          ) : null}
        </div>

        {planPreview ? (
          <>
            <p className="helper-copy">
              {planPreview.siteName} / {planPreview.scheduleMonth} / {planPreview.patternName} /
              시트 {planPreview.templateSheetName}
            </p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>셀 주소</th>
                    <th>입력 값</th>
                  </tr>
                </thead>
                <tbody>
                  {planPreview.updates.map((update) => (
                    <tr key={`${update.address}-${update.value}`}>
                      <td>{update.address}</td>
                      <td>{update.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="helper-copy">
            배정 목록에서 `셀 미리보기`를 눌러 템플릿 반영 결과를 확인합니다.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Excel 생성 결과</p>
            <h3>배포용 xlsx 파일 생성 경로</h3>
          </div>
          {exportResult ? (
            <StatusBadge
              label={`${exportResult.updateCount}개 셀 반영`}
              tone="good"
            />
          ) : null}
        </div>

        {exportResult ? (
          <>
            <p className="helper-copy">
              생성 파일: {exportResult.outputFileName} / 생성 시각: {exportResult.exportedAt}
            </p>
            <p className="helper-copy">저장 경로: {exportResult.outputPath}</p>
          </>
        ) : (
          <p className="helper-copy">
            배정 목록에서 `엑셀 생성`을 눌러 템플릿 파일을 실제 xlsx로 저장합니다.
          </p>
        )}
      </section>
    </>
  );
};
