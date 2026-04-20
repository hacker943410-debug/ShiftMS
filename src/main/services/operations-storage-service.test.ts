import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getAllowanceRateEntryCode } from "../../shared/domain/allowance-rate-matrix";
import { isPasswordHashValid } from "./auth-password-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  changeStoredOperationAuthPassword,
  approveStoredDocumentTemplateVersion,
  deleteStoredAllowanceRateVersion,
  deleteStoredHolidayItem,
  deleteStoredDocumentTemplateVersion,
  deleteStoredOperationUser,
  findStoredOperationAuthByLoginId,
  listStoredAllowanceRateHistory,
  listStoredAllowanceRateVersions,
  listStoredApprovedDocumentTemplateVersions,
  listStoredDocumentTemplateHistory,
  listStoredDocumentTemplateVersions,
  listStoredHolidayCalendars,
  listStoredOperationUsers,
  listStoredSiteNameOptions,
  renameStoredHolidayItem,
  replaceStoredHolidayCalendar,
  resolveStoredDefaultDocumentTemplateVersion,
  saveStoredAllowanceRateVersion,
  saveStoredHolidayItem,
  saveStoredOperationUser,
  saveStoredSiteNameOption,
  setStoredDefaultDocumentTemplateVersion,
  saveStoredDocumentTemplateVersion,
  deleteStoredSiteNameOption,
  updateStoredDocumentTemplateOutputFileNamePattern,
  resetOperationsStorageForTest
} from "./operations-storage-service";
import { saveStoredSite } from "./site-storage-service";

const createDateOffsetValue = (offsetDays: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

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
    expect(users.find((user) => user.loginId === "reviewer")?.role).toBe("reviewer");
    expect(findStoredOperationAuthByLoginId("admin")?.mustChangePassword).toBe(true);
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

    const targetYear = new Date().getFullYear() + 5;

    const created = saveStoredAllowanceRateVersion({
      year: targetYear,
      versionLabel: `${targetYear}.1`,
      status: "draft",
      effectiveFrom: `${targetYear}-01-01`,
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

    expect(created.year).toBe(targetYear);
    expect(
      created.items.find(
        (item) => item.allowanceCode === getAllowanceRateEntryCode("legal-holiday", "base")
      )?.multiplier
    ).toBe(1.8);

    const updated = saveStoredAllowanceRateVersion({
      id: created.id,
      year: targetYear,
      versionLabel: `${targetYear}.1-수정`,
      status: "active",
      effectiveFrom: `${targetYear}-01-01`,
      effectiveTo: `${targetYear}-12-31`,
      changeReason: "최종 적용 테스트",
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

    expect(updated.versionLabel).toBe(`${targetYear}.1-수정`);
    expect(updated.status).toBe("active");
    expect(updated.changeReason).toBe("최종 적용 테스트");
    expect(
      updated.items.find(
        (item) => item.allowanceCode === getAllowanceRateEntryCode("weekday-overtime", "night")
      )?.multiplier
    ).toBe(2.4);
    expect(
      listStoredAllowanceRateVersions().filter((version) => version.status === "active")
    ).toHaveLength(1);
    expect(
      listStoredAllowanceRateHistory()
        .filter((history) => history.rateVersionId === created.id)
        .map((history) => [history.actionType, history.reason])
    ).toEqual([
      ["applied", "최종 적용 테스트"],
      ["registered", "신규 등록"]
    ]);

    deleteStoredAllowanceRateVersion(created.id);

    expect(listStoredAllowanceRateVersions(targetYear)).toHaveLength(0);
  });

  it("should block moving an existing allowance rate start date before today", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "operations.test.sqlite")
    });

    const futureEffectiveFrom = createDateOffsetValue(14);
    const futureEffectiveTo = createDateOffsetValue(90);
    const pastDate = createDateOffsetValue(-1);
    const targetYear = Number(futureEffectiveFrom.slice(0, 4));

    const created = saveStoredAllowanceRateVersion({
      year: targetYear,
      versionLabel: `${targetYear}.effective-lock`,
      status: "draft",
      effectiveFrom: futureEffectiveFrom,
      effectiveTo: futureEffectiveTo,
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

    expect(() =>
      saveStoredAllowanceRateVersion({
        id: created.id,
        year: created.year,
        versionLabel: created.versionLabel,
        status: created.status,
        effectiveFrom: pastDate,
        effectiveTo: created.effectiveTo,
        changeReason: "과거 시작일 변경 시도",
        items: created.items.map((item) => ({
          allowanceCode: item.allowanceCode,
          multiplier: item.multiplier,
          roundingPolicy: item.roundingPolicy
        }))
      })
    ).toThrowError("요율 수정 시 적용 시작일은 오늘 이전으로 변경할 수 없습니다.");
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
      password: "Operator-Pass-123!",
      extensionNumber: "7311",
      contact: "010-1234-5678",
      email: "operator-secondary@company.local"
    });

    expect(created.id).toContain("user-");
    expect(created.loginId).toBe("operator-secondary");
    expect(created.role).toBe("operator");
    expect(created.extensionNumber).toBe("7311");
    expect(
      isPasswordHashValid(
        "Operator-Pass-123!",
        findStoredOperationAuthByLoginId("operator-secondary")?.passwordHash ?? ""
      )
    ).toBe(true);
    expect(findStoredOperationAuthByLoginId("operator-secondary")?.mustChangePassword).toBe(true);

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
    expect(
      isPasswordHashValid(
        "Operator-Pass-123!",
        findStoredOperationAuthByLoginId("operator-main")?.passwordHash ?? ""
      )
    ).toBe(true);

    saveStoredOperationUser({
      id: created.id,
      loginId: "operator-main",
      displayName: "?댁쁺?대떦 ?섏젙",
      role: "operator",
      status: "inactive",
      password: "Operator-Reset-456!",
      extensionNumber: "7322",
      contact: "010-9999-0000",
      email: "operator-main@company.local"
    });

    expect(
      isPasswordHashValid(
        "Operator-Reset-456!",
        findStoredOperationAuthByLoginId("operator-main")?.passwordHash ?? ""
      )
    ).toBe(true);
    expect(findStoredOperationAuthByLoginId("operator-main")?.mustChangePassword).toBe(true);

    const changedPasswordUser = changeStoredOperationAuthPassword({
      userId: created.id,
      nextPassword: "Operator-Final-789!"
    });

    expect(changedPasswordUser.mustChangePassword).toBe(false);
    expect(
      isPasswordHashValid(
        "Operator-Final-789!",
        findStoredOperationAuthByLoginId("operator-main")?.passwordHash ?? ""
      )
    ).toBe(true);
    expect(findStoredOperationAuthByLoginId("operator-main")?.mustChangePassword).toBe(false);

    const reviewer = saveStoredOperationUser({
      loginId: "reviewer-active",
      displayName: "승인 담당",
      role: "reviewer",
      status: "active",
      password: "Reviewer-Pass-123!"
    });

    expect(reviewer.role).toBe("reviewer");

    const planner = saveStoredOperationUser({
      loginId: "planner-active",
      displayName: "계획 담당",
      role: "planner",
      status: "active",
      password: "Planner-Pass-123!"
    });

    expect(planner.role).toBe("planner");

    expect(() =>
      saveStoredOperationUser({
        loginId: "admin",
        displayName: "중복 운영담당",
        role: "operator",
        status: "active",
        password: "Duplicate-Pass-123!"
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

  it("should create, update, delete, and protect site name options", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "operations.test.sqlite")
    });

    expect(listStoredSiteNameOptions().some((option) => option.name === "SK telecom")).toBe(true);

    const created = saveStoredSiteNameOption({
      name: "테스트 사이트"
    });

    expect(created.name).toBe("테스트 사이트");
    expect(created.usageCount).toBe(0);

    const updated = saveStoredSiteNameOption({
      id: created.id,
      name: "테스트 사이트 수정"
    });

    expect(updated.name).toBe("테스트 사이트 수정");

    expect(() =>
      saveStoredSiteNameOption({
        name: "테스트 사이트 수정"
      })
    ).toThrowError("같은 사이트 명이 이미 등록되어 있습니다.");

    saveStoredSite({
      siteCode: "SITE-OPTION-USED",
      name: "사이트 명 사용 근무지",
      customerName: updated.name,
      status: "active",
      timezone: "Asia/Seoul"
    });

    expect(
      listStoredSiteNameOptions().find((option) => option.id === updated.id)?.usageCount
    ).toBe(1);
    expect(() =>
      deleteStoredSiteNameOption({
        optionId: updated.id
      })
    ).toThrowError("현재 근무지에서 사용하는 사이트 명은 삭제할 수 없습니다.");

    const deletable = saveStoredSiteNameOption({
      name: "삭제 가능한 사이트"
    });

    deleteStoredSiteNameOption({
      optionId: deletable.id
    });

    expect(listStoredSiteNameOptions().some((option) => option.id === deletable.id)).toBe(false);
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
      profileSchemaVersion: "2",
      validation: {
        sourceFileName: "근무표_템플릿1.xlsx",
        primarySheetName: "교대 근무 계획표",
        sheetNames: ["교대 근무 계획표"],
        titleCandidates: [],
        canProceed: true,
        canvasSnapshot: null,
        messages: ["ok"],
        detectedZones: [],
        inspectionWarnings: [],
        suggestedLabels: []
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
