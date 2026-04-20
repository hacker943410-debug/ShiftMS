export const DEFAULT_ADMIN_BOOTSTRAP_PASSWORD = "1234";
export const MIN_BOOTSTRAP_PASSWORD_LENGTH = 4;
export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_POLICY_SUMMARY_TEXT =
  `영문 대문자, 영문 소문자, 숫자, 특수문자를 포함한 ${MIN_PASSWORD_LENGTH}자 이상`;

export const PASSWORD_POLICY_RULES = [
  {
    key: "min-length",
    label: `${MIN_PASSWORD_LENGTH}자 이상`,
    test: (password: string) => password.length >= MIN_PASSWORD_LENGTH
  },
  {
    key: "uppercase",
    label: "영문 대문자 포함",
    test: (password: string) => /[A-Z]/.test(password)
  },
  {
    key: "lowercase",
    label: "영문 소문자 포함",
    test: (password: string) => /[a-z]/.test(password)
  },
  {
    key: "number",
    label: "숫자 포함",
    test: (password: string) => /\d/.test(password)
  },
  {
    key: "special",
    label: "특수문자 포함",
    test: (password: string) => /[^A-Za-z0-9\s]/.test(password)
  }
] as const;

export type PasswordPolicyRuleKey = (typeof PASSWORD_POLICY_RULES)[number]["key"];

export interface PasswordPolicyCheck {
  key: PasswordPolicyRuleKey;
  label: string;
  met: boolean;
}

export const getPasswordPolicyChecks = (password: string): PasswordPolicyCheck[] =>
  PASSWORD_POLICY_RULES.map((rule) => ({
    key: rule.key,
    label: rule.label,
    met: rule.test(password)
  }));

export const isStrongPasswordSatisfied = (password: string) =>
  getPasswordPolicyChecks(password).every((check) => check.met);

export const getPasswordPolicyErrorMessage = (label = "비밀번호") =>
  `${label}는 ${PASSWORD_POLICY_SUMMARY_TEXT}이어야 합니다.`;
