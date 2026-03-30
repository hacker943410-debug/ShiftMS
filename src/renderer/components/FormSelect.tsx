import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes
} from "react";

interface FormSelectProps {
  "aria-label"?: string;
  className?: string;
  children?: ReactNode;
  disabled?: boolean;
  id?: string;
  name?: string;
  onChange?: SelectHTMLAttributes<HTMLSelectElement>["onChange"];
  selectClassName?: string;
  value?: string | number | readonly string[];
}

interface SelectOptionItem {
  disabled: boolean;
  label: string;
  value: string;
}

const joinClassNames = (...tokens: Array<string | undefined | false>) =>
  tokens.filter((token) => token && token.trim().length > 0).join(" ");

const extractOptionLabel = (children: ReactNode): string =>
  Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }

      if (isValidElement<{ children?: ReactNode }>(child) && child.props.children) {
        return extractOptionLabel(child.props.children);
      }

      return "";
    })
    .join("")
    .trim();

const parseOptions = (children: ReactNode): SelectOptionItem[] =>
  Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child) || child.type !== "option") {
      return [];
    }

    const props = child.props as {
      children?: ReactNode;
      disabled?: boolean;
      value?: string | number;
    };

    return [
      {
        disabled: Boolean(props.disabled),
        label: extractOptionLabel(props.children),
        value: props.value === undefined ? "" : String(props.value)
      }
    ];
  });

export const FormSelect = ({
  "aria-label": ariaLabel,
  children,
  className,
  disabled = false,
  id,
  name,
  onChange,
  selectClassName,
  value
}: FormSelectProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);

  const options = useMemo(() => parseOptions(children), [children]);
  const normalizedValue = Array.isArray(value)
    ? String(value[0] ?? "")
    : value === undefined || value === null
      ? ""
      : String(value);
  const selectedOption =
    options.find((option) => option.value === normalizedValue) ?? options[0] ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const emitChange = (nextValue: string) => {
    if (!onChange || nextValue === normalizedValue) {
      return;
    }

    const syntheticEvent = {
      currentTarget: { value: nextValue },
      target: { value: nextValue }
    } as SelectHTMLAttributes<HTMLSelectElement>["onChange"] extends
      | ((event: infer EventType) => void)
      | undefined
      ? EventType
      : never;

    onChange(syntheticEvent);
  };

  const handleOptionSelect = (nextValue: string, shouldRestoreFocus: boolean) => {
    emitChange(nextValue);
    setIsOpen(false);

    if (shouldRestoreFocus) {
      requestAnimationFrame(() => {
        controlRef.current?.focus({ preventScroll: true });
      });
    }
  };

  const handleControlKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter") {
      event.preventDefault();
      setIsOpen(true);
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      setIsOpen((current) => !current);
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div
      className={joinClassNames("app-select-shell", isOpen && "is-open", className)}
      ref={containerRef}
    >
      <input name={name} type="hidden" value={selectedOption?.value ?? normalizedValue} />
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={joinClassNames("app-select-control", selectClassName)}
        disabled={disabled}
        id={id}
        ref={controlRef}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) {
            setIsOpen((current) => !current);
          }
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onKeyDown={handleControlKeyDown}
        type="button"
      >
        <span
          className={joinClassNames(
            "app-select-value",
            !selectedOption?.label && "app-select-value--placeholder"
          )}
        >
          {selectedOption?.label ?? "선택"}
        </span>
      </button>
      <span aria-hidden="true" className="app-select-edge" />
      <span aria-hidden="true" className="app-select-arrow" />
      {isOpen ? (
        <div
          aria-label={ariaLabel}
          className="app-select-dropdown"
          id={listboxId}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          role="listbox"
        >
          {options.map((option) => {
            const isSelected = option.value === (selectedOption?.value ?? normalizedValue);

            return (
              <button
                aria-selected={isSelected}
                className={joinClassNames(
                  "app-select-option",
                  isSelected && "is-selected",
                  option.disabled && "is-disabled"
                )}
                disabled={option.disabled}
                key={`${option.value}-${option.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  handleOptionSelect(option.value, event.detail === 0);
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                role="option"
                type="button"
              >
                <span className="app-select-option-label">{option.label}</span>
                <span className="app-select-option-badge">{isSelected ? "선택됨" : ""}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
