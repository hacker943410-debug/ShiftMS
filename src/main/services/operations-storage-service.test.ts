import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  approveStoredDocumentTemplateVersion,
  deleteStoredDocumentTemplateVersion,
  listStoredAllowanceRateVersions,
  listStoredApprovedDocumentTemplateVersions,
  listStoredDocumentTemplateHistory,
  listStoredDocumentTemplateVersions,
  listStoredHolidayCalendars,
  listStoredOperationUsers,
  resolveStoredDefaultDocumentTemplateVersion,
  setStoredDefaultDocumentTemplateVersion,
  saveStoredDocumentTemplateVersion,
  updateStoredDocumentTemplateOutputFileNamePattern,
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
    expect(templates.filter((template) => template.templateType === "schedule")).toHaveLength(2);
    expect(templates.every((template) => template.status === "approved")).toBe(true);
    expect(resolveStoredDefaultDocumentTemplateVersion("schedule")?.versionLabel).toBe("근무표 양식 1");
    expect(listStoredDocumentTemplateHistory()).toHaveLength(0);
  });

  it("should support filtering by year and template type", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "operations.test.sqlite")
    });

    const holidayCalendars = listStoredHolidayCalendars(2026);
    const rateVersions = listStoredAllowanceRateVersions(2027);
    const attachmentTemplates = listStoredDocumentTemplateVersions("attachment1");
    const scheduleTemplates = listStoredDocumentTemplateVersions("schedule");

    expect(holidayCalendars).toHaveLength(1);
    expect(rateVersions).toHaveLength(1);
    expect(rateVersions[0]?.versionLabel).toBe("2027.1");
    expect(attachmentTemplates).toHaveLength(1);
    expect(attachmentTemplates[0]?.templateType).toBe("attachment1");
    expect(scheduleTemplates.every((template) => template.status === "approved")).toBe(true);
    expect(scheduleTemplates.map((template) => template.versionLabel)).toEqual([
      "근무표 양식 1",
      "근무표 양식 2"
    ]);
  });

  it("should save, approve, and delete document template versions", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "operations.test.sqlite")
    });

    expect(listStoredDocumentTemplateVersions("schedule")).toHaveLength(2);

    const saved = saveStoredDocumentTemplateVersion({
      templateType: "schedule",
      versionLabel: "테스트 양식",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "근무표_템플릿1.xlsx"),
      status: "pending",
      profileSchemaVersion: "1",
      profile: {
        kind: "generic",
        primarySheetName: "교대 근무 계획표",
        fieldMappings: {
          sheetName: "교대 근무 계획표"
        }
      },
      validation: {
        sourceFileName: "근무표_템플릿1.xlsx",
        primarySheetName: "교대 근무 계획표",
        sheetNames: ["교대 근무 계획표"],
        titleCandidates: [],
        canProceed: true,
        messages: ["ok"]
      }
    });

    expect(saved.status).toBe("pending");
    expect(saved.isDefault).toBe(false);
    expect(listStoredApprovedDocumentTemplateVersions("schedule").some((template) => template.id === saved.id)).toBe(false);

    const approved = approveStoredDocumentTemplateVersion(saved.id);

    expect(approved.status).toBe("approved");
    expect(approved.isDefault).toBe(false);
    expect(listStoredApprovedDocumentTemplateVersions("schedule").some((template) => template.id === saved.id)).toBe(true);

    const switched = setStoredDefaultDocumentTemplateVersion(saved.id);

    expect(switched.isDefault).toBe(true);
    expect(resolveStoredDefaultDocumentTemplateVersion("schedule")?.id).toBe(saved.id);

    deleteStoredDocumentTemplateVersion(saved.id);

    expect(listStoredDocumentTemplateVersions("schedule").some((template) => template.id === saved.id)).toBe(false);
    expect(resolveStoredDefaultDocumentTemplateVersion("schedule")?.versionLabel).toBe("근무표 양식 1");

    const history = listStoredDocumentTemplateHistory("schedule");

    expect(history.map((item) => item.actionType)).toEqual(
      expect.arrayContaining(["registered", "approved", "set-default", "deleted"])
    );
    expect(history[0]?.detail).toBeTruthy();
  });

  it("should update document template output file name patterns", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "operations.test.sqlite")
    });

    const target = listStoredDocumentTemplateVersions("schedule")[0];

    expect(target).toBeDefined();
    if (!target) {
      return;
    }

    const updated = updateStoredDocumentTemplateOutputFileNamePattern({
      templateId: target.id,
      outputFileNamePattern: "스케줄_{scheduleMonth}.xlsx"
    });

    expect(updated.outputFileNamePattern).toBe("스케줄_{scheduleMonth}.xlsx");
    expect(
      listStoredDocumentTemplateHistory("schedule").some(
        (item) =>
          item.actionType === "updated" &&
          item.detail?.includes("출력 파일명 규칙을 변경했습니다.") === true
      )
    ).toBe(true);
  });
});
