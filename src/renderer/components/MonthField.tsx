import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";

const monthLabels = Array.from({ length: 12 }, (_, index) => `${index + 1}월`);

const pad = (value: number) => String(value).padStart(2, "0");

const formatYearMonthValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

const parseYearMonthValue = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month] = value.split("-").map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1, 12, 0, 0, 0);
};

const startOfYear = (date: Date) => new Date(date.getFullYear(), 0, 1, 12, 0, 0, 0);

const addYears = (date: Date, amount: number) =>
  new Date(date.getFullYear() + amount, 0, 1, 12, 0, 0, 0);

const isSameMonth = (left: Date | null, right: Date | null) =>
  Boolean(
    left &&
      right &&
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth()
  );

const isOutOfRange = (yearMonth: string, min?: string, max?: string) => {
  if (min && yearMonth < min) {
    return true;
  }

  if (max && yearMonth > max) {
    return true;
  }

  return false;
};

const formatDisplayValue = (value: string) => {
  const date = parseYearMonthValue(value);

  if (!date) {
    return "";
  }

  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
};

interface MonthFieldProps {
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

export const MonthField = ({
  className,
  disabled = false,
  id,
  max,
  min,
  name,
  onChange,
  placeholder = "월 선택",
  value
}: MonthFieldProps) => {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();
  const today = useMemo(() => new Date(), []);
  const selectedMonth = parseYearMonthValue(value);
  const initialViewDate = selectedMonth ?? today;
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(startOfYear(initialViewDate));

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setViewDate(startOfYear(parseYearMonthValue(value) ?? today));
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

    const nextDate = parseYearMonthValue(value) ?? today;
    setViewDate(startOfYear(nextDate));
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

  // 날짜 선택칸과 같은 규칙: 고른 달은 그 자리에서 확정한다.
  const commitYearMonth = (nextValue: string) => {
    if (nextValue !== value) {
      onChange(nextValue);
    }

    closePopover();
  };

  const handleSelectMonth = (monthIndex: number) => {
    const nextValue = `${viewDate.getFullYear()}-${pad(monthIndex + 1)}`;

    if (isOutOfRange(nextValue, min, max)) {
      return;
    }

    commitYearMonth(nextValue);
  };

  return (
    <div
      className={joinClassNames("date-field-shell", "month-field-shell", isOpen && "is-open", className)}
      ref={shellRef}
    >
      <input name={name} type="hidden" value={value} />
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="date-field-control month-field-control"
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
          {formatDisplayValue(value) || placeholder}
        </span>
        <span aria-hidden="true" className="date-field-icon month-field-icon">
          월
        </span>
      </button>

      {isOpen ? (
        <div
          aria-modal="false"
          className="date-field-popover month-field-popover"
          id={listboxId}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          role="dialog"
        >
          <div className="date-field-popover-head month-field-popover-head">
            <button
              className="date-field-nav"
              onClick={() => {
                setViewDate((current) => addYears(current, -1));
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              type="button"
            >
              {"<"}
            </button>
            <strong>{viewDate.getFullYear()}년</strong>
            <button
              className="date-field-nav"
              onClick={() => {
                setViewDate((current) => addYears(current, 1));
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

          <div className="month-field-grid">
            {monthLabels.map((label, monthIndex) => {
              const monthDate = new Date(viewDate.getFullYear(), monthIndex, 1, 12, 0, 0, 0);
              const normalized = formatYearMonthValue(monthDate);
              const isSelected = isSameMonth(monthDate, selectedMonth);
              const isCurrentMonth = isSameMonth(monthDate, today);
              const isDisabled = isOutOfRange(normalized, min, max);

              return (
                <button
                  className={joinClassNames(
                    "month-field-month",
                    isSelected && "is-selected",
                    isCurrentMonth && "is-current",
                    isDisabled && "is-disabled"
                  )}
                  disabled={isDisabled}
                  key={normalized}
                  onClick={() => {
                    handleSelectMonth(monthIndex);
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  type="button"
                >
                  {label}
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
                setViewDate(startOfYear(today));
                commitYearMonth(formatYearMonthValue(today));
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              type="button"
            >
              이번 달
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
