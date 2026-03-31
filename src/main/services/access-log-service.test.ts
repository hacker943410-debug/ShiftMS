import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { testAdminSession } from "./performance-test-helpers";
import {
  closeSqliteStorage,
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";
import {
  listAccessLogs,
  recordAccessLog,
  resetAccessLogStateForTest
} from "./access-log-service";

describe("access-log-service", () => {
  afterEach(() => {
    resetAccessLogStateForTest();
    closeSqliteStorage();
    resetSqliteStorageForTest();
  });

  it("stores access logs in sqlite and filters them by user, action, keyword, and date", () => {
    const dbPath = path.resolve(process.cwd(), "artifacts", "tests", "access-log-service.test.sqlite");
    initializeSqliteStorage({ dbPath });

    const adminLog = recordAccessLog(
      {
        actionType: "sign-in",
        actionLabel: "로그인",
        details: "관리자 로그인"
      },
      testAdminSession
    );
    const routeLog = recordAccessLog(
      {
        actionType: "route-view",
        actionLabel: "화면 이동",
        routeKey: "allowance-management",
        routeLabel: "수당 관리",
        details: "수당 산출 현황"
      },
      testAdminSession
    );
    const userLog = recordAccessLog(
      {
        actionType: "sign-out",
        actionLabel: "로그아웃",
        details: "사용자 로그아웃"
      },
      {
        userId: "user-2",
        loginId: "worker01",
        displayName: "일반사용자",
        role: "operator"
      }
    );

    const database = getSqliteDatabase();

    expect(database).not.toBeNull();

    database!.prepare("UPDATE access_logs SET occurred_at = ? WHERE id = ?").run(
      "2026-03-30T09:00:00.000Z",
      adminLog.id
    );
    database!.prepare("UPDATE access_logs SET occurred_at = ? WHERE id = ?").run(
      "2026-03-31T09:15:00.000Z",
      routeLog.id
    );
    database!.prepare("UPDATE access_logs SET occurred_at = ? WHERE id = ?").run(
      "2026-03-31T10:00:00.000Z",
      userLog.id
    );

    const allLogs = listAccessLogs();
    expect(allLogs.map((record) => record.id)).toEqual([userLog.id, routeLog.id, adminLog.id]);

    const byLoginId = listAccessLogs({ loginId: "admin", actionType: "all" });
    expect(byLoginId.map((record) => record.id)).toEqual([routeLog.id, adminLog.id]);

    const byAction = listAccessLogs({ actionType: "route-view" });
    expect(byAction.map((record) => record.id)).toEqual([routeLog.id]);

    const byKeyword = listAccessLogs({ keyword: "수당" });
    expect(byKeyword.map((record) => record.id)).toEqual([routeLog.id]);

    const byDate = listAccessLogs({
      dateFrom: "2026-03-31",
      dateTo: "2026-03-31"
    });
    expect(byDate.map((record) => record.id)).toEqual([userLog.id, routeLog.id]);
  });
});
