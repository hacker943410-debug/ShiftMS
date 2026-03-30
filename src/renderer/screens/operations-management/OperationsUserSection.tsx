import { useState } from "react";

import type { OperationUserSaveInput } from "@shared/bridge/contracts";
import type { UserRecord } from "@shared/domain/model";

interface OperationsUserSectionProps {
  actionError?: string | null;
  isLoading: boolean;
  isActionRunning: boolean;
  users: UserRecord[];
  userRoleLabel: Record<UserRecord["role"], string>;
  userStatusLabel: Record<UserRecord["status"], string>;
  onSaveUser: (input: OperationUserSaveInput) => Promise<void>;
  onDeleteUser: (user: UserRecord) => Promise<void>;
}

interface UserFormState {
  id?: string;
  loginId: string;
  displayName: string;
  role: UserRecord["role"];
  status: UserRecord["status"];
  extensionNumber: string;
  contact: string;
  email: string;
}

const createEmptyUserForm = (): UserFormState => ({
  loginId: "",
  displayName: "",
  role: "operator",
  status: "active",
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
  extensionNumber: user.extensionNumber ?? "",
  contact: user.contact ?? "",
  email: user.email ?? ""
});

export const OperationsUserSection = ({
  actionError,
  isLoading,
  isActionRunning,
  users,
  userRoleLabel,
  userStatusLabel,
  onSaveUser,
  onDeleteUser
}: OperationsUserSectionProps) => {
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState<UserFormState | null>(null);

  const openCreateModal = () => {
    setEditingUser(null);
    setForm(createEmptyUserForm());
  };

  const openEditModal = (user: UserRecord) => {
    setEditingUser(user);
    setForm(createUserFormFromRecord(user));
  };

  const closeModal = () => {
    if (isActionRunning) {
      return;
    }

    setEditingUser(null);
    setForm(null);
  };

  const handleSave = async () => {
    if (!form) {
      return;
    }

    try {
      await onSaveUser({
        id: form.id,
        loginId: form.loginId,
        displayName: form.displayName,
        role: form.role,
        status: form.status,
        extensionNumber: form.extensionNumber || undefined,
        contact: form.contact || undefined,
        email: form.email || undefined
      });

      closeModal();
    } catch {
      // Parent screen surfaces the action error message.
    }
  };

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
                    ? `${editingUser.displayName} 정보를 수정합니다.`
                    : "운영 관리에서 사용할 사용자 정보를 등록합니다."}
                </p>
              </div>
            </div>
            {actionError ? <p className="form-error-text modal-feedback">{actionError}</p> : null}
            <div className="filter-grid two-up">
              <label className="field">
                <span>계정명</span>
                <input
                  onChange={(event) => {
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
                  <option value="operator">사용자</option>
                </select>
              </label>
              <label className="field">
                <span>상태</span>
                <select
                  onChange={(event) => {
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
                <span>내선번호</span>
                <input
                  onChange={(event) => {
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
            <div className="button-row">
              <button className="ghost-button" disabled={isActionRunning} onClick={closeModal} type="button">
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
                {isActionRunning ? "저장 중..." : editingUser ? "저장" : "등록"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
};
