import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";

type QuestionDialogVariant = "primary" | "danger";

interface QuestionDialogInputOptions {
  label: string;
  initialValue?: string;
  placeholder?: string;
  multiline?: boolean;
}

export interface QuestionDialogOptions {
  title: string;
  message: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: QuestionDialogVariant;
  hideCancel?: boolean;
  input?: QuestionDialogInputOptions;
}

export interface QuestionDialogResult {
  confirmed: boolean;
  inputValue?: string;
}

interface ActiveQuestionDialog extends QuestionDialogOptions {
  inputValue: string;
}

interface QuestionDialogModalProps {
  dialog: ActiveQuestionDialog;
  onCancel: () => void;
  onConfirm: () => void;
  onInputChange: (value: string) => void;
}

const getConfirmButtonClassName = (variant?: QuestionDialogVariant) =>
  variant === "danger" ? "danger-button" : "primary-button";

const QuestionDialogModal = ({
  dialog,
  onCancel,
  onConfirm,
  onInputChange
}: QuestionDialogModalProps) => {
  const titleId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      if (dialog.input) {
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      confirmButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [dialog.title, Boolean(dialog.input)]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="modal-overlay question-dialog-overlay" onKeyDown={handleKeyDown}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal-card"
        role="dialog"
      >
        <div className="section-heading compact-heading">
          <div className="modal-heading-copy">
            <strong id={titleId}>{dialog.title}</strong>
            <p className="question-dialog-message">{dialog.message}</p>
          </div>
        </div>

        {dialog.description ? (
          <p className="field-hint question-dialog-message">{dialog.description}</p>
        ) : null}

        {dialog.input ? (
          <label className="field" htmlFor={inputId}>
            <span>{dialog.input.label}</span>
            {dialog.input.multiline ? (
              <textarea
                id={inputId}
                onChange={(event) => {
                  onInputChange(event.target.value);
                }}
                placeholder={dialog.input.placeholder}
                ref={(element) => {
                  inputRef.current = element;
                }}
                value={dialog.inputValue}
              />
            ) : (
              <input
                id={inputId}
                onChange={(event) => {
                  onInputChange(event.target.value);
                }}
                placeholder={dialog.input.placeholder}
                ref={(element) => {
                  inputRef.current = element;
                }}
                value={dialog.inputValue}
              />
            )}
          </label>
        ) : null}

        <div className="button-row question-dialog-actions">
          {dialog.hideCancel ? null : (
            <button className="ghost-button" onClick={onCancel} type="button">
              {dialog.cancelLabel ?? "취소"}
            </button>
          )}
          <button
            className={getConfirmButtonClassName(dialog.confirmVariant)}
            onClick={onConfirm}
            ref={confirmButtonRef}
            type="button"
          >
            {dialog.confirmLabel ?? "확인"}
          </button>
        </div>
      </section>
    </div>
  );
};

export const useQuestionDialog = () => {
  const [dialog, setDialog] = useState<ActiveQuestionDialog | null>(null);
  const resolverRef = useRef<((result: QuestionDialogResult) => void) | null>(null);

  const resolveDialog = useCallback((result: QuestionDialogResult) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setDialog(null);
  }, []);

  const askQuestion = useCallback((options: QuestionDialogOptions) => {
    resolverRef.current?.({ confirmed: false });

    return new Promise<QuestionDialogResult>((resolve) => {
      resolverRef.current = resolve;
      setDialog({
        ...options,
        inputValue: options.input?.initialValue ?? ""
      });
    });
  }, []);

  const questionDialog = dialog ? (
    <QuestionDialogModal
      dialog={dialog}
      onCancel={() => {
        resolveDialog({ confirmed: false, inputValue: dialog.inputValue });
      }}
      onConfirm={() => {
        resolveDialog({ confirmed: true, inputValue: dialog.inputValue });
      }}
      onInputChange={(inputValue) => {
        setDialog((current) => (current ? { ...current, inputValue } : current));
      }}
    />
  ) : null;

  useEffect(
    () => () => {
      resolverRef.current?.({ confirmed: false });
      resolverRef.current = null;
    },
    []
  );

  return {
    askQuestion,
    questionDialog
  };
};
