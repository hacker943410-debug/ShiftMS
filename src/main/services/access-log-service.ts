import { randomUUID } from "node:crypto";

import type {
  AccessLogRecord,
  AccessLogActionType
} from "../../shared/domain/access-log";
import type { AuthSession } from "../../shared/domain/model";
import type {
  AccessLogListQuery,
  AccessLogRecordInput
} from "../../shared/bridge/contracts";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

const accessLogStore: AccessLogRecord[] = [];

const toAccessLogRecord = (row: Record<string, unknown>): AccessLogRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
  loginId: String(row.login_id),
  displayName: String(row.display_name),
  role: String(row.role) as AuthSession["role"],
  actionType: String(row.action_type) as AccessLogActionType,
  actionLabel: String(row.action_label),
  routeKey: row.route_key ? String(row.route_key) : undefined,
  routeLabel: row.route_label ? String(row.route_label) : undefined,
  details: row.details ? String(row.details) : undefined,
  occurredAt: String(row.occurred_at)
});

const sortAccessLogs = (rows: AccessLogRecord[]) =>
  [...rows].sort(
    (left, right) =>
      right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id)
  );

export const recordAccessLog = (
  input: AccessLogRecordInput,
  session: Pick<AuthSession, "displayName" | "loginId" | "role" | "userId">
): AccessLogRecord => {
  const nextRecord: AccessLogRecord = {
    id: randomUUID(),
    userId: session.userId,
    loginId: session.loginId,
    displayName: session.displayName,
    role: session.role,
    actionType: input.actionType,
    actionLabel: input.actionLabel,
    routeKey: input.routeKey?.trim() || undefined,
    routeLabel: input.routeLabel?.trim() || undefined,
    details: input.details?.trim() || undefined,
    occurredAt: new Date().toISOString()
  };
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.prepare(`
      INSERT INTO access_logs (
        id,
        user_id,
        login_id,
        display_name,
        role,
        action_type,
        action_label,
        route_key,
        route_label,
        details,
        occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nextRecord.id,
      nextRecord.userId,
      nextRecord.loginId,
      nextRecord.displayName,
      nextRecord.role,
      nextRecord.actionType,
      nextRecord.actionLabel,
      nextRecord.routeKey ?? null,
      nextRecord.routeLabel ?? null,
      nextRecord.details ?? null,
      nextRecord.occurredAt
    );

    return nextRecord;
  }

  accessLogStore.push(nextRecord);
  return nextRecord;
};

export const listAccessLogs = (query?: AccessLogListQuery): AccessLogRecord[] => {
  const database = getSqliteDatabase();
  const normalizedKeyword = query?.keyword?.trim().toLowerCase() ?? "";

  if (database && isSqliteStorageReady()) {
    const whereClauses: string[] = [];
    const params: Array<string> = [];

    if (query?.dateFrom) {
      whereClauses.push("substr(occurred_at, 1, 10) >= ?");
      params.push(query.dateFrom);
    }

    if (query?.dateTo) {
      whereClauses.push("substr(occurred_at, 1, 10) <= ?");
      params.push(query.dateTo);
    }

    if (query?.loginId && query.loginId !== "all") {
      whereClauses.push("login_id = ?");
      params.push(query.loginId);
    }

    if (query?.actionType && query.actionType !== "all") {
      whereClauses.push("action_type = ?");
      params.push(query.actionType);
    }

    if (normalizedKeyword) {
      whereClauses.push(`
        (
          lower(display_name) LIKE ?
          OR lower(login_id) LIKE ?
          OR lower(action_label) LIKE ?
          OR lower(COALESCE(route_label, '')) LIKE ?
          OR lower(COALESCE(details, '')) LIKE ?
        )
      `);
      const keywordLike = `%${normalizedKeyword}%`;
      params.push(keywordLike, keywordLike, keywordLike, keywordLike, keywordLike);
    }

    const rows = database.prepare(`
      SELECT *
      FROM access_logs
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ""}
      ORDER BY occurred_at DESC, id DESC
    `).all(...params) as Array<Record<string, unknown>>;

    return rows.map(toAccessLogRecord);
  }

  return sortAccessLogs(
    accessLogStore.filter((row) => {
      if (query?.dateFrom && row.occurredAt.slice(0, 10) < query.dateFrom) {
        return false;
      }
      if (query?.dateTo && row.occurredAt.slice(0, 10) > query.dateTo) {
        return false;
      }
      if (query?.loginId && query.loginId !== "all" && row.loginId !== query.loginId) {
        return false;
      }
      if (query?.actionType && query.actionType !== "all" && row.actionType !== query.actionType) {
        return false;
      }
      if (!normalizedKeyword) {
        return true;
      }

      return [
        row.displayName,
        row.loginId,
        row.actionLabel,
        row.routeLabel ?? "",
        row.details ?? ""
      ].some((value) => value.toLowerCase().includes(normalizedKeyword));
    })
  );
};

export const resetAccessLogStateForTest = () => {
  accessLogStore.splice(0, accessLogStore.length);

  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM access_logs;");
  }
};
