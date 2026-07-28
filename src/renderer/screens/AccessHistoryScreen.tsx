import { useEffect, useMemo, useState } from "react";

import type {
  AccessLogListQuery
} from "@shared/bridge/contracts";
import {
  accessLogActionOptions,
  type AccessLogActionType,
  type AccessLogRecord
} from "@shared/domain/access-log";
import { getRoleLabel } from "@shared/domain/authorization";
import type { UserRecord } from "@shared/domain/model";
import { createTodayDateInputValue } from "@shared/lib/local-date";

import { DateField } from "../components/DateField";
import { FormSelect } from "../components/FormSelect";

const ACCESS_HISTORY_PAGE_SIZE = 200;
const KEYWORD_DEBOUNCE_MS = 250;

const createDateInputValue = createTodayDateInputValue;

const createMonthStartDate = () => {
  const today = createDateInputValue();
  return `${today.slice(0, 8)}01`;
};

const formatDateTime = (value: string) => {
  const target = new Date(value);

  if (Number.isNaN(target.getTime())) {
    return value;
  }

  return target.toLocaleString("ko-KR", {
    hour12: false
  });
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

const resolveLogDetail = (record: AccessLogRecord) => {
  if (record.routeLabel && record.details) {
    return `${record.routeLabel} / ${record.details}`;
  }

  return record.routeLabel ?? record.details ?? "-";
};

// 활동 종류별 색 구분(시안 일치): 삭제/반려/실패=빨강, 되돌리기/중지=주황,
// 로그인/승인/배포/복구=초록, 그 외(조회·저장·출력 등)=파랑.
const resolveActionTone = (
  actionType: AccessLogActionType
): "success" | "info" | "danger" | "warn" => {
  if (/(delete|reject|fail|deactivate|hide-approved)/.test(actionType)) {
    return "danger";
  }

  if (/(return-to-pending|file-watch-stop)/.test(actionType)) {
    return "warn";
  }

  if (/(approve|^sign-in$|publish|account-recovery)/.test(actionType)) {
    return "success";
  }

  return "info";
};

export const AccessHistoryScreen = () => {
  const [logs, setLogs] = useState<AccessLogRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [dateFrom, setDateFrom] = useState(createMonthStartDate());
  const [dateTo, setDateTo] = useState(createDateInputValue());
  const [loginId, setLoginId] = useState("all");
  const [actionType, setActionType] = useState<AccessLogActionType | "all">("all");
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [visibleCount, setVisibleCount] = useState(ACCESS_HISTORY_PAGE_SIZE);

  const query = useMemo<AccessLogListQuery>(
    () => ({
      dateFrom,
      dateTo,
      loginId,
      actionType,
      keyword: debouncedKeyword
    }),
    [actionType, dateFrom, dateTo, debouncedKeyword, loginId]
  );

  // 검색어는 한 글자씩 입력할 때마다 조회하지 않고, 입력이 멈춘 뒤 한 번만 조회한다.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedKeyword(keyword);
    }, KEYWORD_DEBOUNCE_MS);

    return () => {
      clearTimeout(handle);
    };
  }, [keyword]);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const [logResult, usersResult] = await Promise.all([
          window.appBridge.listAccessLogs(query),
          window.appBridge.listOperationUsers()
        ]);

        if (!active) {
          return;
        }

        setLogs(logResult.ok ? logResult.data : []);
        setUsers(usersResult.ok ? usersResult.data : []);

        const messages = [
          logResult.ok ? null : logResult.message,
          usersResult.ok ? null : usersResult.message
        ].filter((message): message is string => Boolean(message));

        setScreenError(messages.length > 0 ? messages.join(" / ") : null);
      } catch (error) {
        if (active) {
          setScreenError(getErrorMessage(error));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [query, refreshKey]);

  // 새 조회 결과가 오면 다시 처음 페이지부터 보여준다.
  useEffect(() => {
    setVisibleCount(ACCESS_HISTORY_PAGE_SIZE);
  }, [logs]);

  const userOptions = useMemo(
    () =>
      [...users]
        .sort((left, right) => left.displayName.localeCompare(right.displayName, "ko"))
        .map((user) => ({
          loginId: user.loginId,
          label: `${user.displayName} (${user.loginId})`
        })),
    [users]
  );

  const visibleLogs = logs.slice(0, visibleCount);
  const remainingLogCount = logs.length - visibleLogs.length;

  return (
    <div className="screen-stack access-history-screen">
      <section className="surface-card access-history-hero-card">
        <div className="section-heading compact-heading">
          <div>
            <h3>활동 이력 관리</h3>
            <p>로그인, 화면 이동, 주요 업무 처리 기록을 날짜와 사용자 기준으로 조회합니다.</p>
          </div>
          <div className="button-row">
            <span className="pill neutral">{logs.length}건</span>
            <button
              className="ghost-button compact-button"
              onClick={() => {
                setRefreshKey((current) => current + 1);
              }}
              type="button"
            >
              새로고침
            </button>
          </div>
        </div>

        <div className="filter-grid access-history-filter-grid">
          <label className="field filter-field access-history-filter-date">
            <span>조회 시작일</span>
            <DateField
              onChange={(value) => {
                setDateFrom(value);
              }}
              value={dateFrom}
            />
          </label>
          <label className="field filter-field access-history-filter-date">
            <span>조회 종료일</span>
            <DateField
              onChange={(value) => {
                setDateTo(value);
              }}
              value={dateTo}
            />
          </label>
          <label className="field filter-field access-history-filter-user">
            <span>사용자</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                setLoginId(event.target.value);
              }}
              selectClassName="top-filter-select"
              value={loginId}
            >
              <option value="all">전체</option>
              {userOptions.map((user) => (
                <option key={user.loginId} value={user.loginId}>
                  {user.label}
                </option>
              ))}
            </FormSelect>
          </label>
          <label className="field filter-field access-history-filter-action">
            <span>액션</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                setActionType(event.target.value as AccessLogActionType | "all");
              }}
              selectClassName="top-filter-select"
              value={actionType}
            >
              <option value="all">전체</option>
              {accessLogActionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </FormSelect>
          </label>
          <label className="field filter-field access-history-filter-keyword">
            <span>검색</span>
            <input
              onChange={(event) => {
                setKeyword(event.target.value);
              }}
              placeholder="사용자 / 액션 / 상세"
              value={keyword}
            />
          </label>
          <button
            className="ghost-button access-history-reset-button"
            onClick={() => {
              setDateFrom(createMonthStartDate());
              setDateTo(createDateInputValue());
              setLoginId("all");
              setActionType("all");
              setKeyword("");
              setDebouncedKeyword("");
              setRefreshKey((current) => current + 1);
            }}
            type="button"
          >
            초기화
          </button>
        </div>

        {screenError ? <p className="form-error-text">{screenError}</p> : null}
      </section>

      <section className="surface-card access-history-table-card">
        <div className="data-scroll">
          <table className="info-table compact-table access-history-table">
            <thead>
              <tr>
                <th>활동시간</th>
                <th>사용자</th>
                <th>권한</th>
                <th>액션내용</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5}>활동 이력을 불러오는 중입니다.</td>
                </tr>
              ) : logs.length > 0 ? (
                <>
                  {visibleLogs.map((record) => (
                    <tr key={record.id}>
                      <td>{formatDateTime(record.occurredAt)}</td>
                      <td>
                        <div className="access-history-user">
                          <strong>{record.displayName}</strong>
                          <span>{record.loginId}</span>
                        </div>
                      </td>
                      <td>{getRoleLabel(record.role)}</td>
                      <td>
                        <span className={`pill ${resolveActionTone(record.actionType)}`}>
                          {record.actionLabel}
                        </span>
                      </td>
                      <td className="access-history-detail">{resolveLogDetail(record)}</td>
                    </tr>
                  ))}
                  {remainingLogCount > 0 ? (
                    <tr>
                      <td className="access-history-more-row" colSpan={5}>
                        <button
                          className="ghost-button compact-button"
                          onClick={() => {
                            setVisibleCount((current) => current + ACCESS_HISTORY_PAGE_SIZE);
                          }}
                          type="button"
                        >
                          더 보기 (남은 {remainingLogCount.toLocaleString("ko-KR")}건)
                        </button>
                      </td>
                    </tr>
                  ) : null}
                </>
              ) : (
                <tr>
                  <td colSpan={5}>현재 필터 조건에 맞는 활동 이력이 없습니다. 필터를 초기화하거나 검색 조건을 변경해 보세요.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
