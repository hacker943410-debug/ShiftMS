import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";

import type { HolidayItem } from "@shared/domain/model";
import { formatLocalDateInputValue } from "@shared/lib/local-date";

const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

const parseDateValue = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);

const addMonths = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);

const isSameDay = (left: Date | null, right: Date | null) =>
  Boolean(
    left &&
      right &&
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
  );

const createCalendarDays = (viewDate: Date) => {
  const monthStart = startOfMonth(viewDate);
  const firstDayIndex = monthStart.getDay();
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(monthStart.getDate() - firstDayIndex);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });
};

const isOutOfRange = (date: Date, min?: string, max?: string) => {
  const normalized = formatLocalDateInputValue(date);

  if (min && normalized < min) {
    return true;
  }

  if (max && normalized > max) {
    return true;
  }

  return false;
};

interface DateFieldProps {
  className?: string;
  disabled?: boolean;
  id?: string;
  max?: string;
  min?: string;
  name?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

const joinClassNames = (...tokens: Array<string | false | null | undefined>) =>
  tokens.filter((token): token is string => Boolean(token)).join(" ");

export const DateField = ({
  className,
  disabled = false,
  id,
  max,
  min,
  name,
  onChange,
  placeholder = "날짜 선택",
  value
}: DateFieldProps) => {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();
  const today = useMemo(() => new Date(), []);
  const selectedDate = parseDateValue(value);
  const initialViewDate = selectedDate ?? today;
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(startOfMonth(initialViewDate));
  const [holidayNamesByYear, setHolidayNamesByYear] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setViewDate(startOfMonth(parseDateValue(value) ?? today));
  }, [isOpen, today, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) {
        closePopover();
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closePopover();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const targetYear = String(viewDate.getFullYear());

    if (holidayNamesByYear[targetYear]) {
      return;
    }

    let active = true;

    const loadHolidays = async () => {
      const result = await window.appBridge.listHolidayCalendars(Number(targetYear));

      if (!active || !result.ok) {
        return;
      }

      const holidayNameMap = result.data
        .flatMap((calendar) => calendar.items)
        .reduce<Record<string, string>>((accumulator, item: HolidayItem) => {
          accumulator[item.holidayDate] = item.name;
          return accumulator;
        }, {});

      setHolidayNamesByYear((current) => ({
        ...current,
        [targetYear]: holidayNameMap
      }));
    };

    void loadHolidays();

    return () => {
      active = false;
    };
  }, [holidayNamesByYear, isOpen, viewDate]);

  const calendarDays = useMemo(() => createCalendarDays(viewDate), [viewDate]);
  const holidayNames = holidayNamesByYear[String(viewDate.getFullYear())] ?? {};

  const closePopover = () => {
    setIsOpen(false);
    requestAnimationFrame(() => {
      controlRef.current?.focus({ preventScroll: true });
    });
  };

  const openPopover = () => {
    if (disabled) {
      return;
    }

    const nextDate = parseDateValue(value) ?? today;
    setViewDate(startOfMonth(nextDate));
    setIsOpen(true);
  };

  const handleControlKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      openPopover();
    }
  };

  // 고른 날짜는 그 자리에서 확정한다. 예전에는 '확인'을 눌러야 반영돼서, 날짜만 누르고
  // 다른 곳을 클릭하면 고른 날짜가 조용히 취소되고 원래 날짜로 되돌아갔다.
  const commitDate = (nextValue: string) => {
    if (nextValue !== value) {
      onChange(nextValue);
    }

    closePopover();
  };

  const handleSelectDate = (date: Date) => {
    if (isOutOfRange(date, min, max)) {
      return;
    }

    commitDate(formatLocalDateInputValue(date));
  };

  return (
    <div
      className={joinClassNames("date-field-shell", isOpen && "is-open", className)}
      ref={shellRef}
    >
      <input name={name} type="hidden" value={value} />
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="date-field-control"
        disabled={disabled}
        id={id}
        ref={controlRef}
        onClick={(event) => {
          event.stopPropagation();

          if (isOpen) {
            closePopover();
            return;
          }

          openPopover();
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onKeyDown={handleControlKeyDown}
        type="button"
      >
        <span className={joinClassNames("date-field-value", !value && "is-placeholder")}>
          {value || placeholder}
        </span>
        <span aria-hidden="true" className="date-field-icon material-symbols-outlined">
          calendar_month
        </span>
      </button>

      {isOpen ? (
        <div
          aria-modal="false"
          className="date-field-popover"
          id={listboxId}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          role="dialog"
        >
          <div className="date-field-popover-head">
            <button
              aria-label="이전 달"
              className="date-field-nav"
              onClick={() => {
                setViewDate((current) => addMonths(current, -1));
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              type="button"
            >
              {"<"}
            </button>
            <strong>
              {viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월
            </strong>
            <button
              aria-label="다음 달"
              className="date-field-nav"
              onClick={() => {
                setViewDate((current) => addMonths(current, 1));
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              type="button"
            >
              {">"}
            </button>
          </div>

          <div className="date-field-weekdays">
            {dayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="date-field-grid">
            {calendarDays.map((date) => {
              const normalized = formatLocalDateInputValue(date);
              const isSelected = isSameDay(date, selectedDate);
              const isToday = isSameDay(date, today);
              const isMuted = date.getMonth() !== viewDate.getMonth();
              const isDisabled = isOutOfRange(date, min, max);
              const holidayName = holidayNames[normalized];
              const isHoliday = Boolean(holidayName);

              return (
                <button
                  className={joinClassNames(
                    "date-field-day",
                    isSelected && "is-selected",
                    isToday && "is-today",
                    isHoliday && "is-holiday",
                    isMuted && "is-muted",
                    isDisabled && "is-disabled"
                  )}
                disabled={isDisabled}
                key={normalized}
                onClick={() => {
                  handleSelectDate(date);
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                type="button"
              >
                  <span>{date.getDate()}</span>
                  {holidayName && !isMuted ? (
                    <em className="date-field-holiday-name" title={`${normalized} · ${holidayName}`}>
                      {holidayName}
                    </em>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="date-field-footer">
            <button
              className="ghost-button compact-button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const nextToday = new Date();
                setViewDate(startOfMonth(nextToday));
                commitDate(formatLocalDateInputValue(nextToday));
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              type="button"
            >
              오늘
            </button>
            <div className="button-row">
              <button
                className="ghost-button compact-button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  closePopover();
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                type="button"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
