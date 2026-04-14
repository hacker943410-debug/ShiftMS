import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { approveManagedDocumentTemplateVersion, inspectDocumentTemplateImport, saveManagedDocumentTemplateVersion } from "./document-template-management-service";
import { previewDocumentTemplateFile } from "./document-template-preview-service";
import { saveStoredEmployeeAssignment } from "./employee-history-service";
import { saveStoredEmployee } from "./employee-storage-service";
import { resetMonthlyScheduleStorageForTest, saveStoredMonthlySchedule } from "./monthly-schedule-storage-service";
import { resetOperationsStorageForTest } from "./operations-storage-service";
import { exportMonthlySchedulePlan } from "./schedule-plan-export-service";
import { listStoredShiftPatterns } from "./shift-pattern-storage-service";
import { listStoredSites } from "./site-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRootBase = path.resolve(process.cwd(), "artifacts", "tests", "template-management-workflow");
const allocatedTestRoots: string[] = [];

const createTestPaths = () => {
  const rootDir = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  allocatedTestRoots.push(rootDir);

  return {
    rootDir,
    dbPath: path.resolve(rootDir, "template-management-workflow.test.sqlite"),
    userDataPath: path.resolve(rootDir, "user-data"),
    previewPath: path.resolve(rootDir, "preview", "schedule-preview.xlsx"),
    exportDir: path.resolve(rootDir, "exports")
  };
};

const createAssignedEmployee = (input: {
  employeeCode: string;
  name: string;
  siteId: string;
  shiftGroup: string;
}) => {
  const employee = saveStoredEmployee({
    employeeCode: input.employeeCode,
    name: input.name,
    employmentType: "정규",
    status: "active",
    hireDate: "2024-01-01"
  });

  saveStoredEmployeeAssignment({
    employeeId: employee.id,
    siteId: input.siteId,
    shiftGroup: input.shiftGroup,
    startDate: "2024-01-01"
  });

  return employee;
};

describe("template-management workflow", () => {
  afterEach(() => {
    resetMonthlyScheduleStorageForTest();
    resetOperationsStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      rmSync(rootDir, { recursive: true, force: true });
    });
  });

  it("should import, save, approve, preview, and export a schedule template end-to-end", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({
      dbPath: paths.dbPath
    });

    const sourcePath = path.resolve(process.cwd(), "양식샘플", "근무표_템플릿1.xlsx");
    const inspection = await inspectDocumentTemplateImport({
      templateType: "schedule",
      sourcePath
    });

    expect(inspection.canProceed).toBe(true);
    expect(inspection.profile.kind).toBe("schedule");

    const saved = saveManagedDocumentTemplateVersion(
      {
        templateType: "schedule",
        versionLabel: "근무표 워크플로 테스트",
        sourcePath,
        managedFileName: "근무표_워크플로_운영본.xlsx",
        profileSchemaVersion: "2",
        profile: inspection.profile,
        validation: inspection
      },
      {
        userDataPath: paths.userDataPath
      }
    );

    expect(saved.status).toBe("pending");
    expect(existsSync(saved.sourcePath)).toBe(true);

    const approved = approveManagedDocumentTemplateVersion(saved.id);

    expect(approved.status).toBe("approved");
    expect(approved.profile?.kind).toBe("schedule");
    expect(approved.profile).toBeDefined();

    if (!approved.profile) {
      return;
    }

    await previewDocumentTemplateFile(
      {
        templateType: approved.templateType,
        versionLabel: approved.versionLabel,
        sourcePath: approved.sourcePath,
        profile: approved.profile
      },
      {
        outputPath: paths.previewPath
      }
    );

    expect(existsSync(paths.previewPath)).toBe(true);

    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = createAssignedEmployee({
      employeeCode: "EMP-TEMPLATE-WORKFLOW",
      name: "양식검증",
      siteId: site!.id,
      shiftGroup: "A조"
    });
    const schedule = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2026-03",
      patternId: pattern!.id,
      generatedBy: "admin",
      templateVersionId: approved.id,
      items: [
        {
          employeeCode: employee.employeeCode,
          teamLabel: "A조",
          workDate: "2026-03-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      ]
    });

    const exported = await exportMonthlySchedulePlan({
      scheduleId: schedule.id,
      userDataPath: paths.userDataPath,
      outputDir: paths.exportDir
    });

    expect(exported).not.toBeNull();
    expect(exported?.templateVersionId).toBe(approved.id);
    expect(exported?.templateVersionLabel).toBe("근무표 워크플로 테스트");
    expect(existsSync(exported!.outputPath)).toBe(true);
  });
});
