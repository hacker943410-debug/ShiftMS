import type { UserRecord } from "../../shared/domain/model";

export const seededOperationUsers: UserRecord[] = [
  {
    id: "user-admin",
    loginId: "admin",
    displayName: "관리자",
    role: "admin",
    status: "active",
    extensionNumber: "7250",
    contact: "010-1111-2222",
    email: "admin@company.local",
    createdAt: "2026-01-01T09:00:00+09:00",
    updatedAt: "2026-01-01T09:00:00+09:00"
  },
  {
    id: "user-operator",
    loginId: "operator",
    displayName: "운영담당",
    role: "operator",
    status: "active",
    extensionNumber: "7251",
    contact: "010-2222-3333",
    email: "operator@company.local",
    createdAt: "2026-01-01T09:00:00+09:00",
    updatedAt: "2026-01-01T09:00:00+09:00"
  },
  {
    id: "user-pending-review",
    loginId: "reviewer",
    displayName: "승인담당",
    role: "reviewer",
    status: "pending",
    extensionNumber: "7252",
    contact: "010-3333-4444",
    email: "reviewer@company.local",
    createdAt: "2026-01-03T09:00:00+09:00",
    updatedAt: "2026-01-03T09:00:00+09:00"
  }
];
