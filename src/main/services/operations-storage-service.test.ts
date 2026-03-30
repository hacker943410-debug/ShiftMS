import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getAllowanceRateEntryCode } from "../../shared/domain/allowance-rate-matrix";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  approveStoredDocumentTemplateVersion,
  deleteStoredAllowanceRateVersion,
  deleteStoredHolidayItem,
  deleteStoredDocumentTemplateVersion,
  deleteStoredOperationUser,
  listStoredAllowanceRateVersions,
  listStoredApprovedDocumentTemplateVersions,
  listStoredDocumentTemplateHistory,
  listStoredDocumentTemplateVersions,
  listStoredHolidayCalendars,
  listStoredOperationUsers,
  renameStoredHolidayItem,
  replaceStoredHolidayCalendar,
  resolveStoredDefaultDocumentTemplateVersion,
  saveStoredAllowanceRateVersion,
  saveStoredHolidayItem,
  saveStoredOperationUser,
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
    expect(users.find((user) => user.loginId === "operator")?.extensionNumber).toBe("7251");
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

  it("should add, rename, delete, and replace stored holiday items", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "operations.test.sqlite")
    });

    const savedCalendar = saveStoredHolidayItem({
      year: 2026,
      holidayDate: "2026-06-01",
      name: "창립기념일"
    });
    const savedItem = savedCalendar.items.find((item) => item.holidayDate === "2026-06-01");

    expect(savedItem?.name).toBe("창립기념일");
    expect(() =>
      saveStoredHolidayItem({
        year: 2026,
        holidayDate: "2026-06-01",
        name: "중복"
      })
    ).toThrowError("같은 날짜의 공휴일이 이미 등록되어 있습니다.");

    if (!savedItem) {
      return;
    }

    const renamedCalendar = renameStoredHolidayItem({
      holidayItemId: savedItem.id,
      name: "회사 창립기념일"
    });

    expect(
      renamedCalendar.items.find((item) => item.id === savedItem.id)?.name
    ).toBe("회사 창립기념일");

    const deletedCalendar = deleteStoredHolidayItem({
      holidayItemId: savedItem.id
    });

    expect(deletedCalendar.items.some((item) => item.id === savedItem.id)).toBe(false);

    const replacedCalendar = replaceStoredHolidayCalendar({
      year: 2026,
      sourceName: "holiday-api",
      sourceVersion: "2026.api",
      items: [
        {
          holidayDate: "2026-01-01",
          name: "신정",
          isSubstitute: false
        },
        {
          holidayDate: "2026-08-15",
          name: "광복절",
          isSubstitute: false
        }
      ]
    });

    expect(replacedCalendar.items.map((item) => item.holidayDate)).toEqual([
      "2026-01-01",
      "2026-08-15"
    ]);
    expect(listStoredHolidayCalendars(2026)[0]?.sourceName).toBe("holiday-api");
  });

  it("should save update and delete allowance rate versions", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "operations.test.sqlite")
    });

    const created = saveStoredAllowanceRateVersion({
      year: 2028,
      versionLabel: "2028.1",
      status: "draft",
      effectiveFrom: "2028-01-01",
      items: [
        { allowanceCode: getAllowanceRateEntryCode("legal-holiday", "base"), multiplier: 1.8 },
        { allowanceCode: getAllowanceRateEntryCode("legal-holiday", "overtime"), multiplier: 1.8 },
        { allowanceCode: getAllowanceRateEntryCode("legal-holiday", "night"), multiplier: 1.8 },
        { allowanceCode: getAllowanceRateEntryCode("weekday-substitute", "base"), multiplier: 1.4 },
        { allowanceCode: getAllowanceRateEntryCode("weekday-substitute", "overtime"), multiplier: 2.1 },
        { allowanceCode: getAllowanceRateEntryCode("weekday-substitute", "night"), multiplier: 2.6 },
        { allowanceCode: getAllowanceRateEntryCode("holiday-substitute", "base"), multiplier: 1.5 },
        { allowanceCode: getAllowanceRateEntryCode("holiday-substitute", "overtime"), multiplier: 2.2 },
        { allowanceCode: getAllowanceRateEntryCode("holiday-substitute", "night"), multiplier: 2.7 },
        { allowanceCode: getAllowanceRateEntryCode("weekday-overtime", "base"), multiplier: 0 },
        { allowanceCode: getAllowanceRateEntryCode("weekday-overtime", "overtime"), multiplier: 1.7 },
        { allowanceCode: getAllowanceRateEntryCode("weekday-overtime", "night"), multiplier: 2.2 },
        { allowanceCode: getAllowanceRateEntryCode("holiday-overtime", "base"), multiplier: 0.1 },
        { allowanceCode: getAllowanceRateEntryCode("holiday-overtime", "overtime"), multiplier: 0.2 },
        { allowanceCode: getAllowanceRateEntryCode("holiday-overtime", "night"), multiplier: 0.3 }
      ]
    });

    expect(created.year).toBe(2028);
    expect(
      created.items.find(
        (item) => item.allowanceCode === getAllowanceRateEntryCode("legal-holiday", "base")
      )?.multiplier
    ).toBe(1.8);

    const updated = saveStoredAllowanceRateVersion({
      id: created.id,
      year: 2028,
      versionLabel: "2028.1-수정",
      status: "active",
      effectiveFrom: "2028-01-01",
      effectiveTo: "2028-12-31",
      items: [
        { allowanceCode: getAllowanceRateEntryCode("legal-holiday", "base"), multiplier: 2 },
        { allowanceCode: getAllowanceRateEntryCode("legal-holiday", "overtime"), multiplier: 2 },
        { allowanceCode: getAllowanceRateEntryCode("legal-holiday", "night"), multiplier: 2 },
        { allowanceCode: getAllowanceRateEntryCode("weekday-substitute", "base"), multiplier: 1.6 },
        { allowanceCode: getAllowanceRateEntryCode("weekday-substitute", "overtime"), multiplier: 2.3 },
        { allowanceCode: getAllowanceRateEntryCode("weekday-substitute", "night"), multiplier: 2.8 },
        { allowanceCode: getAllowanceRateEntryCode("holiday-substitute", "base"), multiplier: 1.7 },
        { allowanceCode: getAllowanceRateEntryCode("holiday-substitute", "overtime"), multiplier: 2.4 },
        { allowanceCode: getAllowanceRateEntryCode("holiday-substitute", "night"), multiplier: 2.9 },
        { allowanceCode: getAllowanceRateEntryCode("weekday-overtime", "base"), multiplier: 0 },
        { allowanceCode: getAllowanceRateEntryCode("weekday-overtime", "overtime"), multiplier: 1.9 },
        { allowanceCode: getAllowanceRateEntryCode("weekday-overtime", "night"), multiplier: 2.4 },
        { allowanceCode: getAllowanceRateEntryCode("holiday-overtime", "base"), multiplier: 0.4 },
        { allowanceCode: getAllowanceRateEntryCode("holiday-overtime", "overtime"), multiplier: 0.5 },
        { allowanceCode: getAllowanceRateEntryCode("holiday-overtime", "night"), multiplier: 0.6 }
      ]
    });

    expect(updated.versionLabel).toBe("2028.1-수정");
    expect(updated.status).toBe("active");
    expect(
      updated.items.find(
        (item) => item.allowanceCode === getAllowanceRateEntryCode("weekday-overtime", "night")
      )?.multiplier
    ).toBe(2.4);

    deleteStoredAllowanceRateVersion(created.id);

    expect(listStoredAllowanceRateVersions(2028)).toHaveLength(0);
  });

  it("should create, update, and delete stored operation users", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "operations.test.sqlite")
    });

    const created = saveStoredOperationUser({
      loginId: "operator-secondary",
      displayName: "추가 운영담당",
      role: "operator",
      status: "active",
      extensionNumber: "7311",
      contact: "010-1234-5678",
      email: "operator-secondary@company.local"
    });

    expect(created.id).toContain("user-");
    expect(created.loginId).toBe("operator-secondary");
    expect(created.extensionNumber).toBe("7311");

    const updated = saveStoredOperationUser({
      id: created.id,
      loginId: "operator-main",
      displayName: "운영담당 수정",
      role: "operator",
      status: "inactive",
      extensionNumber: "7322",
      contact: "010-9999-0000",
      email: "operator-main@company.local"
    });

    expect(updated.loginId).toBe("operator-main");
    expect(updated.status).toBe("inactive");
    expect(updated.extensionNumber).toBe("7322");

    expect(() =>
      saveStoredOperationUser({
        loginId: "admin",
        displayName: "중복 운영담당",
        role: "operator",
        status: "active"
      })
    ).toThrowError("같은 계정명이 이미 등록되어 있습니다.");

    expect(() =>
      saveStoredOperationUser({
        id: "user-admin",
        loginId: "admin",
        displayName: "관리자",
        role: "operator",
        status: "active"
      })
    ).toThrowError("최소 1명의 관리자 계정은 유지해야 합니다.");

    expect(() => deleteStoredOperationUser("user-admin")).toThrowError(
      "최소 1명의 관리자 계정은 유지해야 합니다."
    );

    deleteStoredOperationUser("user-pending-review");

    expect(listStoredOperationUsers().some((user) => user.id === "user-pending-review")).toBe(false);
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
