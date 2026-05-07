import { useState } from "react";

import type {
  AccountRecoveryKeyRotationResult,
  OperationUserSaveInput
} from "@shared/bridge/contracts";
import {
  getPasswordPolicyErrorMessage,
  isStrongPasswordSatisfied,
  PASSWORD_POLICY_SUMMARY_TEXT
} from "@shared/config/auth-password-policy";
import type { UserRecord } from "@shared/domain/model";

interface OperationsUserSectionProps {
  actionError?: string | null;
  isLoading: boolean;
  isActionRunning: boolean;
  isRecoveryKeyRotating?: boolean;
  users: UserRecord[];
  userRoleLabel: Record<UserRecord["role"], string>;
  userStatusLabel: Record<UserRecord["status"], string>;
  onSaveUser: (input: OperationUserSaveInput) => Promise<void>;
  onDeleteUser: (user: UserRecord) => Promise<void>;
  onRotateAccountRecoveryKey?: () => Promise<AccountRecoveryKeyRotationResult | null>;
}

interface UserFormState {
  id?: string;
  loginId: string;
  displayName: string;
  role: UserRecord["role"];
  status: UserRecord["status"];
  password: string;
  passwordConfirmation: string;
  extensionNumber: string;
  contact: string;
  email: string;
}

const createEmptyUserForm = (): UserFormState => ({
  loginId: "",
  displayName: "",
  role: "operator",
  status: "active",
  password: "",
  passwordConfirmation: "",
  extensionNumber: "",
  contact: "",
  email: ""
});

const createUserFormFromRecord = (user: UserRecord): UserFormState => ({
  id: user.id,
  loginId: user.loginId,
  displayName: user.displayName,
  role: user.role,
  status: user.status,
  password: "",
  passwordConfirmation: "",
  extensionNumber: user.extensionNumber ?? "",
  contact: user.contact ?? "",
  email: user.email ?? ""
});

export const OperationsUserSection = ({
  actionError,
  isLoading,
  isActionRunning,
  isRecoveryKeyRotating = false,
  users,
  userRoleLabel,
  userStatusLabel,
  onSaveUser,
  onDeleteUser,
  onRotateAccountRecoveryKey
}: OperationsUserSectionProps) => {
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState<UserFormState | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [recoveryKeyResult, setRecoveryKeyResult] =
    useState<AccountRecoveryKeyRotationResult | null>(null);

  const handleRotateRecoveryKey = async () => {
    if (!onRotateAccountRecoveryKey) {
      return;
    }

    const result = await onRotateAccountRecoveryKey();

    if (result) {
      setRecoveryKeyResult(result);
    }
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setValidationError(null);
    setForm(createEmptyUserForm());
  };

  const openEditModal = (user: UserRecord) => {
    setEditingUser(user);
    setValidationError(null);
    setForm(createUserFormFromRecord(user));
  };

  const closeModal = () => {
    if (isActionRunning) {
      return;
    }

    setEditingUser(null);
    setValidationError(null);
    setForm(null);
  };

  const handleSave = async () => {
    if (!form) {
      return;
    }

    if (!editingUser && form.password.length === 0) {
      setValidationError("초기 비밀번호를 입력해주세요.");
      return;
    }

    if (form.password.length > 0 || form.passwordConfirmation.length > 0) {
      if (!isStrongPasswordSatisfied(form.password)) {
        setValidationError(
          getPasswordPolicyErrorMessage(editingUser ? "비밀번호" : "초기 비밀번호")
        );
        return;
      }

      if (form.password !== form.passwordConfirmation) {
        setValidationError("비밀번호 확인이 일치하지 않습니다.");
        return;
      }
    }

    setValidationError(null);

    try {
      await onSaveUser({
        id: form.id,
        loginId: form.loginId,
        displayName: form.displayName,
        role: form.role,
        status: form.status,
        password: form.password || undefined,
        extensionNumber: form.extensionNumber || undefined,
        contact: form.contact || undefined,
        email: form.email || undefined
      });

      closeModal();
    } catch {
      // Parent screen surfaces the action error message.
    }
  };

  const modalError = validationError ?? actionError ?? null;
  const passwordLabel = editingUser ? "새 비밀번호" : "초기 비밀번호";

  return (
    <>
      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.3 사용자 관리</p>
            <h3>권한 및 상태별 사용자 목록</h3>
          </div>
          <div className="button-row">
            <span className="pill neutral">{users.length}명</span>
            <button
              className="ghost-button"
              disabled={isLoading || isActionRunning || isRecoveryKeyRotating}
              onClick={() => {
                void handleRotateRecoveryKey();
              }}
              type="button"
            >
              {isRecoveryKeyRotating ? "복구키 발급 중..." : "계정복구키 발급"}
            </button>
            <button
              className="primary-button"
              disabled={isLoading || isActionRunning}
              onClick={openCreateModal}
              type="button"
            >
              신규 사용자 추가
            </button>
          </div>
        </div>
        <div className="data-scroll">
          <table className="info-table">
            <thead>
              <tr>
                <th>계정명</th>
                <th>이름</th>
                <th>권한</th>
                <th>내선번호</th>
                <th>연락처</th>
                <th>메일주소</th>
                <th>상태</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8}>사용자 정보를 불러오는 중입니다.</td>
                </tr>
              ) : users.length > 0 ? (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.loginId}</td>
                    <td>{user.displayName}</td>
                    <td>{userRoleLabel[user.role]}</td>
                    <td>{user.extensionNumber ?? "-"}</td>
                    <td>{user.contact ?? "-"}</td>
                    <td>{user.email ?? "-"}</td>
                    <td>{userStatusLabel[user.status]}</td>
                    <td>
                      <div className="button-row">
                        <button
                          className="ghost-button compact-button"
                          disabled={isActionRunning}
                          onClick={() => {
                            openEditModal(user);
                          }}
                          type="button"
                        >
                          수정
                        </button>
                        <button
                          className="danger-button compact-button"
                          disabled={isActionRunning}
                          onClick={() => {
                            void onDeleteUser(user);
                          }}
                          type="button"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>등록된 사용자가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {form ? (
        <div className="modal-overlay">
          <section className="modal-card operations-edit-modal">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong>{editingUser ? "사용자 수정" : "신규 사용자 추가"}</strong>
                <p>
                  {editingUser
                    ? `${editingUser.displayName} 정보와 로그인 비밀번호를 관리합니다.`
                    : "운영 관리에서 사용할 사용자 계정과 초기 비밀번호를 등록합니다."}
                </p>
              </div>
            </div>
            {modalError ? <p className="form-error-text modal-feedback">{modalError}</p> : null}
            <div className="filter-grid two-up">
              <label className="field">
                <span>계정명</span>
                <input
                  onChange={(event) => {
                    setValidationError(null);
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            loginId: event.target.value
                          }
                        : current
                    );
                  }}
                  value={form.loginId}
                />
              </label>
              <label className="field">
                <span>이름</span>
                <input
                  onChange={(event) => {
                    setValidationError(null);
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            displayName: event.target.value
                          }
                        : current
                    );
                  }}
                  value={form.displayName}
                />
              </label>
              <label className="field">
                <span>권한</span>
                <select
                  onChange={(event) => {
                    setValidationError(null);
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            role: event.target.value as UserRecord["role"]
                          }
                        : current
                    );
                  }}
                  value={form.role}
                >
                  <option value="admin">관리자</option>
                  <option value="planner">계획 담당</option>
                  <option value="reviewer">승인 담당</option>
                  <option value="operator">사용자</option>
                </select>
              </label>
              <label className="field">
                <span>상태</span>
                <select
                  onChange={(event) => {
                    setValidationError(null);
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            status: event.target.value as UserRecord["status"]
                          }
                        : current
                    );
                  }}
                  value={form.status}
                >
                  <option value="active">사용중</option>
                  <option value="inactive">중지</option>
                  <option value="pending">대기</option>
                </select>
              </label>
              <label className="field">
                <span>{passwordLabel}</span>
                <input
                  autoComplete="new-password"
                  onChange={(event) => {
                    setValidationError(null);
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            password: event.target.value
                          }
                        : current
                    );
                  }}
                  placeholder={editingUser ? "비워두면 유지" : "예: Abcd1234!"}
                  type="password"
                  value={form.password}
                />
              </label>
              <label className="field">
                <span>{editingUser ? "새 비밀번호 확인" : "초기 비밀번호 확인"}</span>
                <input
                  autoComplete="new-password"
                  onChange={(event) => {
                    setValidationError(null);
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            passwordConfirmation: event.target.value
                          }
                        : current
                    );
                  }}
                  placeholder={editingUser ? "재설정 시에만 입력" : "비밀번호를 다시 입력"}
                  type="password"
                  value={form.passwordConfirmation}
                />
              </label>
              <label className="field">
                <span>내선번호</span>
                <input
                  onChange={(event) => {
                    setValidationError(null);
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            extensionNumber: event.target.value
                          }
                        : current
                    );
                  }}
                  value={form.extensionNumber}
                />
              </label>
              <label className="field">
                <span>연락처</span>
                <input
                  onChange={(event) => {
                    setValidationError(null);
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            contact: event.target.value
                          }
                        : current
                    );
                  }}
                  value={form.contact}
                />
              </label>
              <label className="field">
                <span>메일주소</span>
                <input
                  onChange={(event) => {
                    setValidationError(null);
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            email: event.target.value
                          }
                        : current
                    );
                  }}
                  value={form.email}
                />
              </label>
            </div>
            <p className="field-hint">
              비밀번호는 {PASSWORD_POLICY_SUMMARY_TEXT} 형식으로 입력합니다.{" "}
              {editingUser
                ? "비워두면 기존 해시를 유지합니다."
                : "신규 사용자는 초기 비밀번호가 있어야 로그인할 수 있습니다."}
            </p>
            <div className="button-row">
              <button
                className="ghost-button"
                disabled={isActionRunning}
                onClick={closeModal}
                type="button"
              >
                닫기
              </button>
              <button
                className="primary-button"
                disabled={isActionRunning}
                onClick={() => {
                  void handleSave();
                }}
                type="button"
              >
                {isActionRunning ? "저장 중.." : editingUser ? "저장" : "등록"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {recoveryKeyResult ? (
        <div className="modal-overlay">
          <section aria-modal="true" className="modal-card account-recovery-modal" role="dialog">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong>계정복구키 발급 완료</strong>
                <p>아래 키는 다시 조회할 수 없습니다. 관리자 보관 위치에 별도로 기록하세요.</p>
              </div>
            </div>
            <label className="field">
              <span>대상 계정</span>
              <input readOnly value={recoveryKeyResult.adminLoginId} />
            </label>
            <label className="field">
              <span>계정복구키</span>
              <input readOnly value={recoveryKeyResult.recoveryKey} />
            </label>
            <p className="field-hint">
              로그인 화면의 계정복구 버튼을 누른 뒤 이 키를 입력하면 admin 계정의 임시 비밀번호가 발급됩니다.
            </p>
            <p className="field-hint">발급일: {recoveryKeyResult.issuedAt}</p>
            <div className="button-row question-dialog-actions">
              <button
                className="primary-button"
                onClick={() => {
                  setRecoveryKeyResult(null);
                }}
                type="button"
              >
                확인
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
};
