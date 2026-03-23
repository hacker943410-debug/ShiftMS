import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";

import type { HolidayItem } from "@shared/domain/model";

const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

const pad = (value: number) => String(value).padStart(2, "0");

const formatDateValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

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
  const normalized = formatDateValue(date);

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
  const listboxId = useId();
  const today = useMemo(() => new Date(), []);
  const selectedDate = parseDateValue(value);
  const initialViewDate = selectedDate ?? today;
  const [isOpen, setIsOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const [viewDate, setViewDate] = useState(startOfMonth(initialViewDate));
  const [holidayNamesByYear, setHolidayNamesByYear] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setDraftValue(value);
    setViewDate(startOfMonth(parseDateValue(value) ?? today));
  }, [isOpen, today, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) {
        setDraftValue(value);
        setIsOpen(false);
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraftValue(value);
        setIsOpen(false);
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

  const draftDate = parseDateValue(draftValue);
  const calendarDays = useMemo(() => createCalendarDays(viewDate), [viewDate]);
  const holidayNames = holidayNamesByYear[String(viewDate.getFullYear())] ?? {};

  const openPopover = () => {
    if (disabled) {
      return;
    }

    const nextDate = parseDateValue(value) ?? today;
    setDraftValue(value);
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

  const handleConfirm = () => {
    onChange(draftValue);
    setIsOpen(false);
  };

  const handleSelectDate = (date: Date) => {
    if (isOutOfRange(date, min, max)) {
      return;
    }

    const nextValue = formatDateValue(date);
    setDraftValue(nextValue);
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
        onClick={() => {
          if (isOpen) {
            setDraftValue(value);
            setIsOpen(false);
            return;
          }

          openPopover();
        }}
        onKeyDown={handleControlKeyDown}
        type="button"
      >
        <span className={joinClassNames("date-field-value", !value && "is-placeholder")}>
          {value || placeholder}
        </span>
        <span aria-hidden="true" className="date-field-icon">
          []
        </span>
      </button>

      {isOpen ? (
        <div aria-modal="false" className="date-field-popover" id={listboxId} role="dialog">
          <div className="date-field-popover-head">
            <button
              className="date-field-nav"
              onClick={() => {
                setViewDate((current) => addMonths(current, -1));
              }}
              type="button"
            >
              {"<"}
            </button>
            <strong>
              {viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월
            </strong>
            <button
              className="date-field-nav"
              onClick={() => {
                setViewDate((current) => addMonths(current, 1));
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
              const normalized = formatDateValue(date);
              const isSelected = isSameDay(date, draftDate);
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
              onClick={() => {
                const nextToday = new Date();
                setViewDate(startOfMonth(nextToday));
                setDraftValue(formatDateValue(nextToday));
              }}
              type="button"
            >
              오늘
            </button>
            <div className="button-row">
              <button
                className="ghost-button compact-button"
                onClick={() => {
                  setDraftValue(value);
                  setIsOpen(false);
                }}
                type="button"
              >
                취소
              </button>
              <button
                className="primary-button compact-button"
                onClick={handleConfirm}
                type="button"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
