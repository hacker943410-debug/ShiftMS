import { useEffect, useMemo, useState } from "react";

import type { HolidayCalendar, HolidayItem } from "@shared/domain/model";

import { showActionResultDialog } from "../../components/action-result-dialog";
import { DateField } from "../../components/DateField";
import { useQuestionDialog } from "../../components/QuestionDialog";
import { useDialogDismiss } from "../../components/useDialogDismiss";

interface OperationsHolidaySectionProps {
  isLoading: boolean;
  primaryCalendar: HolidayCalendar | null;
  holidayApiBaseUrl: string;
  selectedYear: number;
  /** 입력이 멈춘 뒤의 디바운스된 연도. 외부 API 공휴일 조회는 이 값으로만 한다. */
  lookupYear: number;
  onYearChange: (year: number) => void;
  onStoredCalendarChange: (calendar: HolidayCalendar | null) => void;
}

type HolidayDragSource = "stored" | "api";

interface HolidayDragPayload {
  source: HolidayDragSource;
  item: HolidayItem;
}

const sortHolidayItems = (items: HolidayItem[]) =>
  [...items].sort((left, right) => left.holidayDate.localeCompare(right.holidayDate));

export const OperationsHolidaySection = ({
  isLoading,
  primaryCalendar,
  holidayApiBaseUrl,
  selectedYear,
  lookupYear,
  onYearChange,
  onStoredCalendarChange
}: OperationsHolidaySectionProps) => {
  const [apiItems, setApiItems] = useState<HolidayItem[]>([]);
  const [isApiLoading, setIsApiLoading] = useState(false);
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingHolidayItem, setEditingHolidayItem] = useState<HolidayItem | null>(null);
  const [newHolidayDate, setNewHolidayDate] = useState(`${selectedYear}-01-01`);
  const [newHolidayName, setNewHolidayName] = useState("");
  const [renameHolidayName, setRenameHolidayName] = useState("");
  const [dragPayload, setDragPayload] = useState<HolidayDragPayload | null>(null);
  const { askQuestion, questionDialog } = useQuestionDialog();

  const { dialogRef: createDialogRef, onKeyDown: onCreateKeyDown } = useDialogDismiss<HTMLDivElement>({
    isOpen: isCreateModalOpen,
    onDismiss: () => {
      setIsCreateModalOpen(false);
    }
  });
  const { dialogRef: renameDialogRef, onKeyDown: onRenameKeyDown } = useDialogDismiss<HTMLDivElement>({
    isOpen: editingHolidayItem !== null,
    onDismiss: () => {
      setEditingHolidayItem(null);
      setRenameHolidayName("");
    }
  });

  const storedItems = useMemo(
    () => sortHolidayItems(primaryCalendar?.items ?? []),
    [primaryCalendar?.items]
  );
  const syncSummary = useMemo(() => {
    const storedDates = new Set(storedItems.map((item) => item.holidayDate));
    const apiDates = new Set(apiItems.map((item) => item.holidayDate));
    const sharedCount = storedItems.filter((item) => apiDates.has(item.holidayDate)).length;
    const storedOnlyCount = storedItems.filter((item) => !apiDates.has(item.holidayDate)).length;
    const apiOnlyCount = apiItems.filter((item) => !storedDates.has(item.holidayDate)).length;
    const isMatched = storedOnlyCount === 0 && apiOnlyCount === 0;

    return {
      apiOnlyCount,
      isMatched,
      sharedCount,
      statusDetail: isMatched
        ? `${sharedCount}건이 저장 목록과 API 목록에 모두 있습니다.`
        : `저장만 ${storedOnlyCount}건 · API만 ${apiOnlyCount}건입니다.`,
      statusLabel: isMatched ? "일치" : "확인 필요",
      storedOnlyCount
    };
  }, [apiItems, storedItems]);

  // year 시점을 인자로 받고, isActive() 로 늦게 도착한 옛 응답을 폐기한다.
  const loadApiItems = async (year: number, isActive: () => boolean = () => true) => {
    setLocalError(null);
    setLocalMessage(null);
    setIsApiLoading(true);

    try {
      const result = await window.appBridge.fetchHolidayApiItems(year);

      if (!isActive()) {
        return;
      }

      if (!result.ok) {
        setLocalError(result.message);
        return;
      }

      setApiItems(sortHolidayItems(result.data));
      setLocalMessage(`${year}년 API 공휴일 목록을 불러왔습니다.`);
    } catch (error) {
      if (isActive()) {
        setLocalError(
          error instanceof Error ? error.message : "공휴일 API 조회 중 오류가 발생했습니다."
        );
      }
    } finally {
      if (isActive()) {
        setIsApiLoading(false);
      }
    }
  };

  useEffect(() => {
    setNewHolidayDate(`${selectedYear}-01-01`);
  }, [selectedYear]);

  // 외부 API 공휴일 목록은 입력이 멈춘 뒤의 lookupYear 로만 조회한다(키 입력마다 호출 방지).
  // active 가드로 늦게 온 옛 연도 응답이 최신 결과를 덮어쓰지 않게 한다.
  useEffect(() => {
    let active = true;

    void loadApiItems(lookupYear, () => active);

    return () => {
      active = false;
    };
  }, [lookupYear]);

  const handleCreateHoliday = async () => {
    setLocalError(null);
    setLocalMessage(null);
    setIsActionRunning(true);

    try {
      const result = await window.appBridge.addHolidayItem({
        year: selectedYear,
        holidayDate: newHolidayDate,
        name: newHolidayName
      });

      if (!result.ok) {
        setLocalError(result.message);
        return;
      }

      onStoredCalendarChange(result.data);
      setIsCreateModalOpen(false);
      setNewHolidayName("");
      setLocalMessage("공휴일을 저장했습니다.");
      await showActionResultDialog(askQuestion, {
        title: "공휴일 저장 완료",
        message: "공휴일을 저장했습니다."
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "공휴일 저장 중 오류가 발생했습니다.");
    } finally {
      setIsActionRunning(false);
    }
  };

  const handleRenameHoliday = async () => {
    if (!editingHolidayItem) {
      return;
    }

    setLocalError(null);
    setLocalMessage(null);
    setIsActionRunning(true);

    try {
      const result = await window.appBridge.renameHolidayItem({
        holidayItemId: editingHolidayItem.id,
        name: renameHolidayName
      });

      if (!result.ok) {
        setLocalError(result.message);
        return;
      }

      onStoredCalendarChange(result.data);
      setEditingHolidayItem(null);
      setRenameHolidayName("");
      setLocalMessage("공휴일명을 수정했습니다.");
      await showActionResultDialog(askQuestion, {
        title: "공휴일 수정 완료",
        message: "공휴일명을 수정했습니다."
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "공휴일명 수정 중 오류가 발생했습니다.");
    } finally {
      setIsActionRunning(false);
    }
  };

  const handleMoveToStored = async (item: HolidayItem) => {
    if (storedItems.some((storedItem) => storedItem.holidayDate === item.holidayDate)) {
      setLocalError("같은 날짜의 공휴일이 이미 등록되어 있어 이동할 수 없습니다.");
      return;
    }

    setLocalError(null);
    setLocalMessage(null);
    setIsActionRunning(true);

    try {
      const result = await window.appBridge.addHolidayItem({
        year: selectedYear,
        holidayDate: item.holidayDate,
        name: item.name,
        isSubstitute: item.isSubstitute
      });

      if (!result.ok) {
        setLocalError(result.message);
        return;
      }

      onStoredCalendarChange(result.data);
      setLocalMessage("공휴일을 저장 목록에 반영했습니다. API 원본 목록은 그대로 유지됩니다.");
      await showActionResultDialog(askQuestion, {
        title: "공휴일 반영 완료",
        message: "공휴일을 저장 목록에 반영했습니다.",
        description: "API 원본 목록은 그대로 유지됩니다."
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "공휴일 이동 중 오류가 발생했습니다.");
    } finally {
      setIsActionRunning(false);
    }
  };

  const handleMoveToApi = async (item: HolidayItem) => {
    setLocalError(null);
    setLocalMessage(null);
    setIsActionRunning(true);

    try {
      const result = await window.appBridge.deleteHolidayItem({
        holidayItemId: item.id
      });

      if (!result.ok) {
        setLocalError(result.message);
        return;
      }

      onStoredCalendarChange(result.data);
      setLocalMessage("공휴일을 저장 목록에서 제거했습니다. API 원본 목록은 변경되지 않습니다.");
      await showActionResultDialog(askQuestion, {
        title: "공휴일 제거 완료",
        message: "공휴일을 저장 목록에서 제거했습니다.",
        description: "API 원본 목록은 변경되지 않습니다."
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "공휴일 이동 중 오류가 발생했습니다.");
    } finally {
      setIsActionRunning(false);
    }
  };

  const handleDrop = async (target: HolidayDragSource) => {
    if (!dragPayload || dragPayload.source === target) {
      return;
    }

    if (target === "stored") {
      await handleMoveToStored(dragPayload.item);
    } else {
      await handleMoveToApi(dragPayload.item);
    }

    setDragPayload(null);
  };

  const handleReplaceAll = async () => {
    if (apiItems.length === 0) {
      setLocalError("반영할 API 공휴일이 없습니다.");
      return;
    }

    const confirmed = await askQuestion({
      title: "공휴일 전체 반영 확인",
      message: `${selectedYear}년 저장 공휴일을 모두 삭제하고 API 목록으로 새로 반영하시겠습니까?`,
      confirmLabel: "반영",
      confirmVariant: "danger"
    });

    if (!confirmed.confirmed) {
      return;
    }

    setLocalError(null);
    setLocalMessage(null);
    setIsActionRunning(true);

    try {
      const result = await window.appBridge.replaceHolidayCalendar({
        year: selectedYear,
        sourceName: "holiday-api",
        sourceVersion: `${selectedYear}.api`,
        items: apiItems.map((item) => ({
          holidayDate: item.holidayDate,
          name: item.name,
          isSubstitute: item.isSubstitute
        }))
      });

      if (!result.ok) {
        setLocalError(result.message);
        return;
      }

      onStoredCalendarChange(result.data);
      setLocalMessage("API 공휴일을 모두 반영했습니다.");
      await showActionResultDialog(askQuestion, {
        title: "공휴일 전체 반영 완료",
        message: "API 공휴일을 모두 반영했습니다."
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "공휴일 전체 반영 중 오류가 발생했습니다.");
    } finally {
      setIsActionRunning(false);
    }
  };

  return (
    <>
      {questionDialog}

      {localError ? <p className="form-error-text">{localError}</p> : null}
      {localMessage ? <p className="form-success-text">{localMessage}</p> : null}

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">공휴일 관리</p>
            <h3>저장 공휴일과 API 공휴일 동기화</h3>
          </div>
          <div className="button-row">
            <label className="field holiday-year-field">
              <span>대상 연도</span>
              <input
                max={2100}
                min={2020}
                onBlur={(event) => {
                  // 입력을 마치면 허용 범위(2020~2100)로 보정한다.
                  const parsed = Number(event.target.value);

                  if (!Number.isNaN(parsed)) {
                    onYearChange(Math.min(2100, Math.max(2020, Math.trunc(parsed))));
                  }
                }}
                onChange={(event) => {
                  const nextYear = Number(event.target.value);

                  if (!Number.isNaN(nextYear)) {
                    onYearChange(nextYear);
                  }
                }}
                type="number"
                value={selectedYear}
              />
            </label>
            <button
              className="ghost-button"
              disabled={isActionRunning}
              onClick={() => {
                setIsCreateModalOpen(true);
              }}
              type="button"
            >
              신규 등록
            </button>
            <button
              className="ghost-button"
              disabled={isApiLoading || isActionRunning}
              onClick={() => {
                void loadApiItems(selectedYear);
              }}
              type="button"
            >
              {isApiLoading ? "조회 중..." : "API 다시 조회"}
            </button>
            <button
              className="primary-button"
              disabled={isApiLoading || isActionRunning || apiItems.length === 0}
              onClick={() => {
                void handleReplaceAll();
              }}
              type="button"
            >
              모두 반영
            </button>
          </div>
        </div>
        <p className="field-hint">
          좌우 테이블은 드래그앤드롭으로 이동할 수 있습니다. 같은 날짜가 이미 존재하면 이동되지 않습니다.
        </p>
        <p className="field-hint">
          API 주소: {holidayApiBaseUrl || "저장된 공휴일 API 주소가 없습니다."}
        </p>
        <div className="operations-summary-strip operations-summary-strip--compact">
          <article className="operations-summary-card" data-tone="accent">
            <span>대상 연도</span>
            <strong>{selectedYear}년</strong>
            <em>현재 저장 목록과 API 원본을 같은 연도로 비교합니다.</em>
          </article>
          <article className="operations-summary-card" data-tone={syncSummary.sharedCount > 0 ? "ok" : "accent"}>
            <span>같이 있는 날짜</span>
            <strong>{syncSummary.sharedCount}건</strong>
            <em>저장 목록과 API 목록에 동시에 존재하는 공휴일입니다.</em>
          </article>
          <article
            className="operations-summary-card"
            data-tone={syncSummary.storedOnlyCount > 0 ? "warn" : "ok"}
          >
            <span>저장만 있음</span>
            <strong>{syncSummary.storedOnlyCount}건</strong>
            <em>운영 기준에는 남아 있지만 API 원본에는 없는 날짜입니다.</em>
          </article>
          <article
            className="operations-summary-card"
            data-tone={syncSummary.apiOnlyCount > 0 ? "warn" : "ok"}
          >
            <span>API만 있음</span>
            <strong>{syncSummary.apiOnlyCount}건</strong>
            <em>새로 반영할지 검토가 필요한 외부 원본 날짜입니다.</em>
          </article>
        </div>
        <div className="operations-sync-banner" data-tone={syncSummary.isMatched ? "ok" : "warn"}>
          <strong>
            {syncSummary.isMatched
              ? "저장 목록과 API 목록이 일치합니다."
              : "저장 목록과 API 목록에 차이가 있습니다."}
          </strong>
          <span>{syncSummary.statusDetail}</span>
        </div>
      </section>

      <section className="split-grid two-up holiday-panel-grid">
        <article
          className="surface-card holiday-drop-zone"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            void handleDrop("stored");
          }}
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">저장 목록</p>
              <h3>현재 저장된 공휴일</h3>
            </div>
            <span className="pill info">{storedItems.length}건</span>
          </div>
          <div className="data-scroll">
            <table className="info-table holiday-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>공휴일명</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={3}>공휴일 정보를 불러오는 중입니다.</td>
                  </tr>
                ) : storedItems.length > 0 ? (
                  storedItems.map((row) => (
                    <tr
                      draggable={!isActionRunning}
                      key={row.id}
                      onDragStart={() => {
                        setDragPayload({
                          source: "stored",
                          item: row
                        });
                      }}
                      onDragEnd={() => {
                        setDragPayload(null);
                      }}
                    >
                      <td>{row.holidayDate}</td>
                      <td>{row.name}</td>
                      <td>
                        <div className="button-row holiday-action-row">
                          <button
                            className="ghost-button compact-button"
                            disabled={isActionRunning}
                            draggable={false}
                            onClick={() => {
                              setEditingHolidayItem(row);
                              setRenameHolidayName(row.name);
                            }}
                            onMouseDown={(event) => {
                              event.stopPropagation();
                            }}
                            type="button"
                          >
                            수정
                          </button>
                          <button
                            className="ghost-button compact-button"
                            disabled={isActionRunning}
                            draggable={false}
                            onClick={() => {
                              void handleMoveToApi(row);
                            }}
                            onMouseDown={(event) => {
                              event.stopPropagation();
                            }}
                            type="button"
                          >
                            제거
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>등록된 공휴일 정보가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article
          className="surface-card holiday-drop-zone"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            void handleDrop("api");
          }}
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">API 목록</p>
              <h3>API로 받아온 공휴일</h3>
            </div>
            <span className="pill neutral">{apiItems.length}건</span>
          </div>
          <div className="data-scroll">
            <table className="info-table holiday-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>공휴일명</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {isApiLoading ? (
                  <tr>
                    <td colSpan={3}>API 공휴일을 불러오는 중입니다.</td>
                  </tr>
                ) : apiItems.length > 0 ? (
                  apiItems.map((row) => (
                    <tr
                      draggable={!isActionRunning}
                      key={row.id}
                      onDragStart={() => {
                        setDragPayload({
                          source: "api",
                          item: row
                        });
                      }}
                      onDragEnd={() => {
                        setDragPayload(null);
                      }}
                    >
                      <td>{row.holidayDate}</td>
                      <td>{row.name}</td>
                      <td>
                        <div className="button-row holiday-action-row">
                          <button
                            className="ghost-button compact-button"
                            disabled={isActionRunning}
                            draggable={false}
                            onClick={() => {
                              void handleMoveToStored(row);
                            }}
                            onMouseDown={(event) => {
                              event.stopPropagation();
                            }}
                            type="button"
                          >
                            반영
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>API에서 불러온 공휴일이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {isCreateModalOpen ? (
        <div className="modal-overlay">
          <div
            aria-labelledby="holiday-create-title"
            aria-modal="true"
            className="modal-card holiday-create-modal"
            onKeyDown={onCreateKeyDown}
            ref={createDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="section-heading">
              <div className="modal-heading-copy">
                <strong id="holiday-create-title">공휴일 신규 등록</strong>
                <p>{selectedYear}년 공휴일을 수동으로 직접 입력합니다.</p>
              </div>
              <button
                className="ghost-button"
                onClick={() => {
                  setIsCreateModalOpen(false);
                }}
                type="button"
              >
                닫기
              </button>
            </div>
            <div className="filter-grid two-up">
              <label className="field">
                <span>공휴일 날짜</span>
                <DateField
                  onChange={setNewHolidayDate}
                  value={newHolidayDate}
                />
              </label>
              <label className="field">
                <span>공휴일명</span>
                <input
                  onChange={(event) => {
                    setNewHolidayName(event.target.value);
                  }}
                  placeholder="예: 창립기념일"
                  value={newHolidayName}
                />
              </label>
            </div>
            <div className="button-row">
              <button
                className="ghost-button"
                onClick={() => {
                  setIsCreateModalOpen(false);
                }}
                type="button"
              >
                취소
              </button>
              <button
                className="primary-button"
                disabled={isActionRunning}
                onClick={() => {
                  void handleCreateHoliday();
                }}
                type="button"
              >
                {isActionRunning ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingHolidayItem ? (
        <div className="modal-overlay">
          <div
            aria-labelledby="holiday-rename-title"
            aria-modal="true"
            className="modal-card holiday-create-modal"
            onKeyDown={onRenameKeyDown}
            ref={renameDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="section-heading">
              <div className="modal-heading-copy">
                <strong id="holiday-rename-title">공휴일명 수정</strong>
                <p>{editingHolidayItem.holidayDate} 공휴일명을 변경합니다.</p>
              </div>
              <button
                className="ghost-button"
                onClick={() => {
                  setEditingHolidayItem(null);
                  setRenameHolidayName("");
                }}
                type="button"
              >
                닫기
              </button>
            </div>
            <div className="filter-grid">
              <label className="field">
                <span>공휴일명</span>
                <input
                  onChange={(event) => {
                    setRenameHolidayName(event.target.value);
                  }}
                  placeholder="예: 삼일절"
                  value={renameHolidayName}
                />
              </label>
            </div>
            <div className="button-row">
              <button
                className="ghost-button"
                onClick={() => {
                  setEditingHolidayItem(null);
                  setRenameHolidayName("");
                }}
                type="button"
              >
                취소
              </button>
              <button
                className="primary-button"
                disabled={isActionRunning}
                onClick={() => {
                  void handleRenameHoliday();
                }}
                type="button"
              >
                {isActionRunning ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
