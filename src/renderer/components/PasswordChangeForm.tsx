import { type FormEvent, useState } from "react";

import {
  getPasswordPolicyChecks,
  getPasswordPolicyErrorMessage,
  PASSWORD_POLICY_SUMMARY_TEXT
} from "@shared/config/auth-password-policy";

interface PasswordChangeFormProps {
  cancelLabel: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (input: { currentPassword: string; nextPassword: string }) => Promise<boolean>;
  onSuccess?: () => void;
  submitLabel: string;
  submittingLabel: string;
}

export const PasswordChangeForm = ({
  cancelLabel,
  errorMessage,
  isSubmitting,
  onCancel,
  onSubmit,
  onSuccess,
  submitLabel,
  submittingLabel
}: PasswordChangeFormProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [nextPasswordConfirmation, setNextPasswordConfirmation] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const passwordPolicyChecks = getPasswordPolicyChecks(nextPassword);
  const isPasswordPolicySatisfied = passwordPolicyChecks.every((check) => check.met);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    if (currentPassword.trim().length === 0) {
      setValidationError("현재 비밀번호를 입력해주세요.");
      return;
    }

    if (!isPasswordPolicySatisfied) {
      setValidationError(getPasswordPolicyErrorMessage("새로운 비밀번호"));
      return;
    }

    if (currentPassword === nextPassword) {
      setValidationError("새로운 비밀번호는 현재 비밀번호와 달라야 합니다.");
      return;
    }

    if (nextPassword !== nextPasswordConfirmation) {
      setValidationError("새로운 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    const changed = await onSubmit({
      currentPassword,
      nextPassword
    });

    if (!changed) {
      return;
    }

    setCurrentPassword("");
    setNextPassword("");
    setNextPasswordConfirmation("");
    onSuccess?.();
  };

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>현재 비밀번호</span>
        <input
          autoComplete="current-password"
          disabled={isSubmitting}
          onChange={(event) => {
            setValidationError(null);
            setCurrentPassword(event.target.value);
          }}
          type="password"
          value={currentPassword}
        />
      </label>
      <label className="field">
        <span>새로운 비밀번호</span>
        <input
          autoComplete="new-password"
          disabled={isSubmitting}
          onChange={(event) => {
            setValidationError(null);
            setNextPassword(event.target.value);
          }}
          type="password"
          value={nextPassword}
        />
      </label>
      <div aria-live="polite" className="password-policy-card">
        <strong>비밀번호 정책</strong>
        <p>{PASSWORD_POLICY_SUMMARY_TEXT}</p>
        <ul className="password-policy-list">
          {passwordPolicyChecks.map((check) => (
            <li
              className={check.met ? "is-met" : "is-pending"}
              data-rule-key={check.key}
              key={check.key}
            >
              <span className="password-policy-indicator">{check.met ? "충족" : "미충족"}</span>
              <span>{check.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <label className="field">
        <span>새로운 비밀번호 확인</span>
        <input
          autoComplete="new-password"
          disabled={isSubmitting}
          onChange={(event) => {
            setValidationError(null);
            setNextPasswordConfirmation(event.target.value);
          }}
          type="password"
          value={nextPasswordConfirmation}
        />
      </label>
      {validationError ? <p className="form-error-text">{validationError}</p> : null}
      {errorMessage ? <p className="form-error-text">{errorMessage}</p> : null}
      <div className="button-row">
        <button className="ghost-button" disabled={isSubmitting} onClick={onCancel} type="button">
          {cancelLabel}
        </button>
        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
};
