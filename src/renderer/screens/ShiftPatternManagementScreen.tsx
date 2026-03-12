import { useEffect, useMemo, useState } from "react";

import type {
  AppSettingsUpdateInput,
  AppSettingsSnapshot,
  FileWatchStatusSnapshot
} from "@shared/bridge/contracts";
import type {
  AllowanceRateVersion,
  DocumentTemplateVersion,
  HolidayCalendar,
  TemplateType,
  UserRecord
} from "@shared/domain/model";

const userRoleLabel: Record<UserRecord["role"], string> = {
  admin: "관리자",
  operator: "사용자"
};

const userStatusLabel: Record<UserRecord["status"], string> = {
  active: "사용중",
  inactive: "중지",
  pending: "대기"
};

const templateTypeLabel: Record<TemplateType, string> = {
  schedule: "근무표 양식",
  proposal: "품의서 양식",
  attachment1: "별첨1 양식",
  attachment2: "별첨2 양식"
};

const getMultiplier = (version: AllowanceRateVersion, allowanceCode: string) =>
  version.items.find((item) => item.allowanceCode === allowanceCode)?.multiplier ?? "-";

const fileWatchEventLabel: Record<FileWatchStatusSnapshot["recentEvents"][number]["type"], string> = {
  "file-added": "파일 추가",
  "file-changed": "파일 변경",
  "file-removed": "파일 제거",
  "watcher-error": "감시 오류"
};

const fileWatchDirectoryLabel: Record<
  FileWatchStatusSnapshot["recentEvents"][number]["directoryType"],
  string
> = {
  pending: "승인대기",
  approved: "승인완료",
  unknown: "미확인"
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate()
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
};

const createSettingsForm = (settings?: AppSettingsSnapshot | null): AppSettingsUpdateInput => ({
  holidayApiBaseUrl: settings?.holidayApiBaseUrl ?? "",
  pendingDir: settings?.pendingDir ?? "",
  approvedDir: settings?.approvedDir ?? "",
  scheduleExportDir: settings?.scheduleExportDir ?? ""
});

export const ShiftPatternManagementScreen = () => {
  const [settings, setSettings] = useState<AppSettingsSnapshot | null>(null);
  const [settingsForm, setSettingsForm] = useState<AppSettingsUpdateInput>(createSettingsForm());
  const [fileWatchStatus, setFileWatchStatus] = useState<FileWatchStatusSnapshot | null>(null);
  const [holidayCalendars, setHolidayCalendars] = useState<HolidayCalendar[]>([]);
  const [rateVersions, setRateVersions] = useState<AllowanceRateVersion[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplateVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isWatchActionRunning, setIsWatchActionRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadOperationsData = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      const [
        settingsResult,
        watchStatusResult,
        holidayResult,
        rateResult,
        usersResult,
        templatesResult
      ] = await Promise.all([
        window.appBridge.getAppSettings(),
        window.appBridge.getFileWatchStatus(),
        window.appBridge.listHolidayCalendars(),
        window.appBridge.listAllowanceRateVersions(),
        window.appBridge.listOperationUsers(),
        window.appBridge.listDocumentTemplateVersions()
      ]);

      if (!active) {
        return;
      }

      if (!settingsResult.ok) {
        setErrorMessage(settingsResult.message);
      } else {
        setSettings(settingsResult.data);
        setSettingsForm(createSettingsForm(settingsResult.data));
      }

      if (watchStatusResult.ok) {
        setFileWatchStatus(watchStatusResult.data);
      }

      if (!holidayResult.ok) {
        setErrorMessage(holidayResult.message);
      } else {
        setHolidayCalendars(holidayResult.data);
      }

      if (!rateResult.ok) {
        setErrorMessage(rateResult.message);
      } else {
        setRateVersions(rateResult.data);
      }

      if (!usersResult.ok) {
        setErrorMessage(usersResult.message);
      } else {
        setUsers(usersResult.data);
      }

      if (!templatesResult.ok) {
        setErrorMessage(templatesResult.message);
      } else {
        setTemplates(templatesResult.data);
      }

      setIsLoading(false);
    };

    void loadOperationsData();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;

    const loadFileWatchStatus = async () => {
      const result = await window.appBridge.getFileWatchStatus();

      if (!active || !result.ok) {
        return;
      }

      setFileWatchStatus(result.data);
    };

    void loadFileWatchStatus();

    const intervalId = window.setInterval(() => {
      void loadFileWatchStatus();
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const handleSettingsFieldChange = (
    field: keyof AppSettingsUpdateInput,
    value: string
  ) => {
    setSettingsForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleSaveSettings = async () => {
    setActionError(null);
    setActionMessage(null);
    setIsSaving(true);

    try {
      const result = await window.appBridge.saveAppSettings(settingsForm);

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setSettings(result.data);
      setSettingsForm(createSettingsForm(result.data));
      setActionMessage(
        fileWatchStatus?.isRunning
          ? "운영 경로 설정을 저장했습니다. 감시 재시작 후 새 경로가 적용됩니다."
          : "운영 경로 설정을 저장했습니다."
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "설정 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileWatchAction = async (action: "restart" | "stop") => {
    setActionError(null);
    setActionMessage(null);
    setIsWatchActionRunning(true);

    try {
      const result =
        action === "restart"
          ? await window.appBridge.restartFileWatch()
          : await window.appBridge.stopFileWatch();

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setFileWatchStatus(result.data);
      setActionMessage(
        action === "restart"
          ? "파일 감시를 재시작했습니다."
          : "파일 감시를 중지했습니다."
      );
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "파일 감시 제어 중 오류가 발생했습니다.");
    } finally {
      setIsWatchActionRunning(false);
    }
  };

  const primaryCalendar = holidayCalendars[0] ?? null;

  const rateRows = useMemo(
    () =>
      rateVersions.map((version) => ({
        id: version.id,
        versionLabel: version.versionLabel,
        year: version.year,
        base: getMultiplier(version, "base"),
        overtime: getMultiplier(version, "overtime"),
        night: getMultiplier(version, "night"),
        status: version.status
      })),
    [rateVersions]
  );

  const templateCards = useMemo(
    () =>
      templates
        .slice()
        .sort((left, right) => left.templateType.localeCompare(right.templateType))
        .map((template) => ({
          id: template.id,
          title: templateTypeLabel[template.templateType],
          path: template.sourcePath,
          versionLabel: template.versionLabel
        })),
    [templates]
  );

  return (
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
        <strong>운영 기준정보</strong>
        <span>{settings ? `데이터 경로: ${settings.dataDir}` : "운영 기준정보를 확인합니다."}</span>
      </section>

      {errorMessage ? <p className="form-error-text">{errorMessage}</p> : null}
      {actionError ? <p className="form-error-text">{actionError}</p> : null}
      {actionMessage ? <p className="form-success-text">{actionMessage}</p> : null}

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.0 경로 설정</p>
            <h3>파일 감시 및 출력 경로</h3>
          </div>
          <button
            className="primary-button"
            disabled={isLoading || isSaving}
            onClick={() => {
              void handleSaveSettings();
            }}
            type="button"
          >
            {isSaving ? "저장 중..." : "경로 저장"}
          </button>
        </div>
        <div className="filter-grid two-up">
          <label className="field">
            <span>승인 대기 폴더</span>
            <input
              onChange={(event) => {
                handleSettingsFieldChange("pendingDir", event.target.value);
              }}
              placeholder="승인 대기 폴더 경로"
              value={settingsForm.pendingDir}
            />
          </label>
          <label className="field">
            <span>승인 완료 폴더</span>
            <input
              onChange={(event) => {
                handleSettingsFieldChange("approvedDir", event.target.value);
              }}
              placeholder="승인 완료 폴더 경로"
              value={settingsForm.approvedDir}
            />
          </label>
          <label className="field">
            <span>근무표 내보내기 폴더</span>
            <input
              onChange={(event) => {
                handleSettingsFieldChange("scheduleExportDir", event.target.value);
              }}
              placeholder="근무표 내보내기 경로"
              value={settingsForm.scheduleExportDir}
            />
          </label>
          <label className="field">
            <span>공휴일 API 주소</span>
            <input
              onChange={(event) => {
                handleSettingsFieldChange("holidayApiBaseUrl", event.target.value);
              }}
              placeholder="공휴일 API 주소"
              value={settingsForm.holidayApiBaseUrl}
            />
          </label>
          <label className="field">
            <span>데이터 루트</span>
            <input readOnly value={settings?.dataDir ?? "-"} />
          </label>
          <label className="field">
            <span>DB 경로</span>
            <input readOnly value={settings?.databasePath ?? "-"} />
          </label>
        </div>
      </section>

      <section className="split-grid two-up">
        <article className="surface-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">7.0.1 감시 상태</p>
              <h3>실적 파일 감시 런타임</h3>
            </div>
            <div className="button-row">
              <span className={`pill ${fileWatchStatus?.isRunning ? "info" : "neutral"}`}>
                {fileWatchStatus?.isRunning ? "감시 중" : "중지"}
              </span>
              <button
                className="ghost-button"
                disabled={isLoading || isWatchActionRunning}
                onClick={() => {
                  void handleFileWatchAction("stop");
                }}
                type="button"
              >
                {isWatchActionRunning ? "처리 중..." : "감시 중지"}
              </button>
              <button
                className="primary-button"
                disabled={isLoading || isWatchActionRunning}
                onClick={() => {
                  void handleFileWatchAction("restart");
                }}
                type="button"
              >
                {isWatchActionRunning ? "처리 중..." : "감시 재시작"}
              </button>
            </div>
          </div>
          <div className="filter-grid two-up">
            <label className="field">
              <span>활성 승인 대기 폴더</span>
              <input readOnly value={fileWatchStatus?.pendingDir ?? "-"} />
            </label>
            <label className="field">
              <span>활성 승인 완료 폴더</span>
              <input readOnly value={fileWatchStatus?.approvedDir ?? "-"} />
            </label>
            <label className="field">
              <span>최근 시작 시각</span>
              <input readOnly value={formatDateTime(fileWatchStatus?.lastStartedAt)} />
            </label>
            <label className="field">
              <span>최근 중지 시각</span>
              <input readOnly value={formatDateTime(fileWatchStatus?.lastStoppedAt)} />
            </label>
          </div>
          <p className="field-hint">
            {fileWatchStatus?.lastErrorMessage
              ? `최근 오류: ${fileWatchStatus.lastErrorMessage}`
              : "경로를 바꾼 뒤에는 감시 재시작으로 새 설정을 적용합니다."}
          </p>
        </article>

        <article className="surface-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">7.0.2 최근 감지 이력</p>
              <h3>감시 이벤트 로그</h3>
            </div>
            <span className="pill neutral">{fileWatchStatus?.recentEvents.length ?? 0}건</span>
          </div>
          <div className="data-scroll">
            <table className="info-table">
              <thead>
                <tr>
                  <th>시각</th>
                  <th>이벤트</th>
                  <th>대상</th>
                  <th>파일명</th>
                </tr>
              </thead>
              <tbody>
                {fileWatchStatus?.recentEvents.length ? (
                  fileWatchStatus.recentEvents.map((event, index) => (
                    <tr key={`${event.occurredAt}-${event.filePath}-${index}`}>
                      <td>{formatDateTime(event.occurredAt)}</td>
                      <td>{fileWatchEventLabel[event.type]}</td>
                      <td>{fileWatchDirectoryLabel[event.directoryType]}</td>
                      <td>{event.message ? `${event.fileName} / ${event.message}` : event.fileName}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>기록된 감시 이벤트가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="split-grid two-up">
        <article className="surface-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">7.1 공휴일 관리</p>
              <h3>시스템 DB 등록 공휴일</h3>
            </div>
            <span className="pill info">{primaryCalendar?.year ?? "-"}</span>
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
                {isLoading ? (
                  <tr>
                    <td colSpan={2}>공휴일 정보를 불러오는 중입니다.</td>
                  </tr>
                ) : primaryCalendar?.items.length ? (
                  primaryCalendar.items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.holidayDate}</td>
                      <td>{row.name}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2}>등록된 공휴일 정보가 없습니다.</td>
                  </tr>
                )}
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
            <button className="primary-button" disabled type="button">
              API 연동 예정
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
                <tr>
                  <td>·</td>
                  <td colSpan={2}>
                    {settingsForm.holidayApiBaseUrl
                      ? `외부 API 기준 주소: ${settingsForm.holidayApiBaseUrl}`
                      : "외부 API 설정을 불러오는 중입니다."}
                  </td>
                </tr>
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
              <h3>연도별 수당계산 요율 버전</h3>
            </div>
          </div>
          <div className="data-scroll">
            <table className="info-table">
              <thead>
                <tr>
                  <th>버전</th>
                  <th>기본요율</th>
                  <th>연장요율</th>
                  <th>야간요율</th>
                  <th>정의연도</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5}>요율 정보를 불러오는 중입니다.</td>
                  </tr>
                ) : rateRows.length > 0 ? (
                  rateRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.versionLabel}</td>
                      <td>{row.base}</td>
                      <td>{row.overtime}</td>
                      <td>{row.night}</td>
                      <td>{row.year}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>등록된 요율 버전이 없습니다.</td>
                  </tr>
                )}
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
                {isLoading ? (
                  <tr>
                    <td colSpan={6}>사용자 정보를 불러오는 중입니다.</td>
                  </tr>
                ) : users.length > 0 ? (
                  users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.loginId}</td>
                      <td>{user.displayName}</td>
                      <td>{userRoleLabel[user.role]}</td>
                      <td>{user.contact ?? "-"}</td>
                      <td>{user.email ?? "-"}</td>
                      <td>{userStatusLabel[user.status]}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>등록된 사용자가 없습니다.</td>
                  </tr>
                )}
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
          {isLoading ? (
            <article className="template-card">
              <strong>양식 정보를 불러오는 중입니다.</strong>
              <p>저장된 템플릿 경로를 조회하고 있습니다.</p>
            </article>
          ) : templateCards.length > 0 ? (
            templateCards.map((template) => (
              <article className="template-card" key={template.id}>
                <strong>{template.title}</strong>
                <p>{template.path}</p>
                <button className="ghost-button" type="button">
                  버전 {template.versionLabel}
                </button>
              </article>
            ))
          ) : (
            <article className="template-card">
              <strong>등록된 양식이 없습니다.</strong>
              <p>운영 관리 저장 계약이 추가되면 여기서 양식 버전을 관리합니다.</p>
            </article>
          )}
        </div>
      </section>
    </div>
  );
};
