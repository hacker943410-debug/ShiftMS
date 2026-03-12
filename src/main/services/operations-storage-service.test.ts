import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  listStoredAllowanceRateVersions,
  listStoredDocumentTemplateVersions,
  listStoredHolidayCalendars,
  listStoredOperationUsers,
  resetOperationsStorageForTest
} from "./operations-storage-service";

describe("operations-storage-service", () => {
  afterEach(() => {
    resetOperationsStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should seed and list operations reference data", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "operations.test.sqlite")
    });

    const calendars = listStoredHolidayCalendars();
    const rateVersions = listStoredAllowanceRateVersions();
    const users = listStoredOperationUsers();
    const templates = listStoredDocumentTemplateVersions();

    expect(calendars).toHaveLength(1);
    expect(calendars[0]?.items.some((item) => item.name === "삼일절")).toBe(true);
    expect(rateVersions.some((version) => version.versionLabel === "2026.2")).toBe(true);
    expect(users.some((user) => user.loginId === "admin")).toBe(true);
    expect(templates.some((template) => template.templateType === "schedule")).toBe(true);
  });

  it("should support filtering by year and template type", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "operations.test.sqlite")
    });

    const holidayCalendars = listStoredHolidayCalendars(2026);
    const rateVersions = listStoredAllowanceRateVersions(2027);
    const attachmentTemplates = listStoredDocumentTemplateVersions("attachment1");

    expect(holidayCalendars).toHaveLength(1);
    expect(rateVersions).toHaveLength(1);
    expect(rateVersions[0]?.versionLabel).toBe("2027.1");
    expect(attachmentTemplates).toHaveLength(1);
    expect(attachmentTemplates[0]?.templateType).toBe("attachment1");
  });
});
