import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { saveStoredAppSettings } from "./app-settings-storage-service";
import { saveStoredEmployeeAssignment } from "./employee-history-service";
import { saveStoredEmployee } from "./employee-storage-service";
import {
  resetMonthlyScheduleStorageForTest,
  saveStoredMonthlySchedule
} from "./monthly-schedule-storage-service";
import { listStoredDocumentTemplateVersions } from "./operations-storage-service";
import { exportMonthlySchedulePlan } from "./schedule-plan-export-service";
import {
  listStoredShiftPatterns,
  saveStoredShiftPattern
} from "./shift-pattern-storage-service";
import { listStoredSites } from "./site-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testOutputDir = path.resolve(process.cwd(), "artifacts", "tests", "schedule-exports");

const expectCellDate = (value: unknown, year: number, month: number, day: number) => {
  expect(value).toBeInstanceOf(Date);

  const dateValue = value as Date;

  expect(dateValue.getFullYear()).toBe(year);
  expect(dateValue.getMonth()).toBe(month - 1);
  expect(dateValue.getDate()).toBe(day);
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

describe("schedule-plan-export-service", () => {
  afterEach(() => {
    resetMonthlyScheduleStorageForTest();
    resetSqliteStorageForTest();
    rmSync(testOutputDir, { recursive: true, force: true });
  });

  it("should export a template1 schedule workbook file from stored monthly data", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 1"
    );
    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = createAssignedEmployee({
      employeeCode: "EMP-EXP-T1",
      name: "가람",
      siteId: site!.id,
      shiftGroup: "A조"
    });
    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2026-03",
      patternId: pattern!.id,
      generatedBy: "admin",
      templateVersionId: template!.id,
      items: [
        {
          employeeCode: employee.employeeCode,
          teamLabel: "A조",
          workDate: "2026-03-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          employeeCode: employee.employeeCode,
          teamLabel: "A조",
          workDate: "2026-03-02",
          dutyCode: "N",
          startTime: "18:00",
          endTime: "06:00",
          breakMinutes: 90
        }
      ]
    });

    const exported = await exportMonthlySchedulePlan({
      scheduleId: saved.id,
      userDataPath: process.cwd(),
      outputDir: testOutputDir
    });

    expect(exported).not.toBeNull();
    expect(existsSync(exported!.outputPath)).toBe(true);
    expect(exported?.templateVersionLabel).toBe("근무표 양식 1");
    expect(exported?.outputFileName).toBe("2026_3_보라매DC.xlsx");
    expect(path.dirname(exported!.outputPath)).toBe(
      path.resolve(testOutputDir, "2026년", "3월")
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exported!.outputPath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    expect(worksheet.getCell("C3").value).toBe("보라매DC");
    expectCellDate(worksheet.getCell("W6").value, 2026, 3, 1);
    expectCellDate(worksheet.getCell("C9").value, 2026, 3, 1);
    expectCellDate(worksheet.getCell("F9").value, 2026, 3, 2);
    expect(worksheet.getCell("D10").value).toBe("A");
    expect(worksheet.getCell("G12").value).toBe("A");
    expectCellDate(worksheet.getCell("Y12").value, 2026, 3, 1);
    expectCellDate(worksheet.getCell("Y13").value, 2026, 3, 2);
    expectCellDate(worksheet.getCell("Y14").value, 2026, 3, 3);
    expect(worksheet.getCell("Z12").fill).toEqual(
      expect.objectContaining({
        type: "pattern",
        pattern: "solid",
        fgColor: expect.objectContaining({ argb: "FFFFD1D1" })
      })
    );
    expect(worksheet.getCell("AX12").fill).toEqual(
      expect.objectContaining({
        type: "pattern",
        pattern: "solid",
        fgColor: expect.objectContaining({ argb: "FFFFD1D1" })
      })
    );
    expect(worksheet.getCell("C9").fill).toEqual(
      expect.objectContaining({
        type: "pattern",
        pattern: "solid",
        fgColor: expect.objectContaining({ argb: "FFFFD1D1" })
      })
    );
    expect(worksheet.getCell("F9").fill).toEqual(
      expect.objectContaining({
        type: "pattern",
        pattern: "solid",
        fgColor: expect.objectContaining({ argb: "FFFFFFFF" })
      })
    );
    expect(worksheet.getCell("Y13").fill).toEqual(
      expect.objectContaining({
        type: "pattern",
        pattern: "solid",
        fgColor: expect.objectContaining({ argb: "FFFFFFFF" })
      })
    );
    expect(worksheet.getCell("Y14").fill).toEqual(
      expect.objectContaining({
        type: "pattern",
        pattern: "solid",
        fgColor: expect.objectContaining({ argb: "FFF2F2F2" })
      })
    );
  });

  it("should export a template2 schedule workbook using the selected layout", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 2"
    );
    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = saveStoredShiftPattern({
      siteId: site!.id,
      name: "보라매 6조 2교대 export 테스트",
      teamCount: 6,
      patternCode: "DNXXXX",
      startIndexRule: "team-sequence",
      patternStartDate: "2024-09-01",
      status: "active",
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
        { stepIndex: 2, dutyCode: "X", breakMinutes: 0 },
        { stepIndex: 3, dutyCode: "X", breakMinutes: 0 },
        { stepIndex: 4, dutyCode: "X", breakMinutes: 0 },
        { stepIndex: 5, dutyCode: "X", breakMinutes: 0 }
      ],
      teamIndexes: Array.from({ length: 6 }, (_, index) => ({
        teamLabel: `${String.fromCharCode(65 + index)}조`,
        index
      })),
      cycles: [
        {
          cycleKey: "cycle-1",
          name: "Cycle 1",
          order: 0,
          shiftCount: 2,
          patternCode: "DNXXXX",
          patternStartDate: "2024-09-01",
          steps: [
            { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
            { stepIndex: 1, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
            { stepIndex: 2, dutyCode: "X", breakMinutes: 0 },
            { stepIndex: 3, dutyCode: "X", breakMinutes: 0 },
            { stepIndex: 4, dutyCode: "X", breakMinutes: 0 },
            { stepIndex: 5, dutyCode: "X", breakMinutes: 0 }
          ],
          teamIndexes: Array.from({ length: 6 }, (_, index) => ({
            teamLabel: `${String.fromCharCode(65 + index)}조`,
            index
          }))
        }
      ],
      teamCycleAssignments: Array.from({ length: 6 }, (_, index) => ({
        teamLabel: `${String.fromCharCode(65 + index)}조`,
        cycleKey: "cycle-1"
      })),
      poolEnabled: false,
      poolBreakMinutes: 0
    });
    const employees = [
      createAssignedEmployee({
        employeeCode: "EMP-EXP-T2-A",
        name: "가람",
        siteId: site!.id,
        shiftGroup: "A조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-EXP-T2-B",
        name: "나래",
        siteId: site!.id,
        shiftGroup: "B조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-EXP-T2-C",
        name: "다온",
        siteId: site!.id,
        shiftGroup: "C조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-EXP-T2-D",
        name: "라온",
        siteId: site!.id,
        shiftGroup: "D조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-EXP-T2-E",
        name: "마루",
        siteId: site!.id,
        shiftGroup: "E조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-EXP-T2-F",
        name: "바다",
        siteId: site!.id,
        shiftGroup: "F조"
      })
    ];
    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2024-10",
      patternId: pattern.id,
      generatedBy: "admin",
      templateVersionId: template!.id,
      items: [
        {
          employeeCode: employees[0]!.employeeCode,
          teamLabel: "A조",
          workDate: "2024-10-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          employeeCode: employees[1]!.employeeCode,
          teamLabel: "B조",
          workDate: "2024-10-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          employeeCode: employees[2]!.employeeCode,
          teamLabel: "C조",
          workDate: "2024-10-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          employeeCode: employees[3]!.employeeCode,
          teamLabel: "D조",
          workDate: "2024-10-01",
          dutyCode: "N",
          startTime: "18:00",
          endTime: "06:00",
          breakMinutes: 90
        }
      ]
    });

    const exported = await exportMonthlySchedulePlan({
      scheduleId: saved.id,
      userDataPath: process.cwd(),
      outputDir: testOutputDir
    });

    expect(exported).not.toBeNull();
    expect(existsSync(exported!.outputPath)).toBe(true);
    expect(exported?.templateVersionLabel).toBe("근무표 양식 2");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exported!.outputPath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    expectCellDate(worksheet.getCell("I9").value, 2024, 10, 1);
    expect(worksheet.getCell("I10").value).toBe("A");
    expect(worksheet.getCell("J10").value).toBe("B");
    expect(worksheet.getCell("K10").value).toBe("C");
    expect(worksheet.getCell("J13").value).toBe("D");
    expect(worksheet.getCell("J14").value).toBe("E");
    expect(worksheet.getCell("J15").value).toBe("F");
    expect(worksheet.getCell("Z12").value).toBe(employees[0]!.name);
    expect(worksheet.getCell("AA12").value).toBe(employees[1]!.name);
    expect(worksheet.getCell("AB12").value).toBe(employees[2]!.name);
    expect(worksheet.getCell("AL12").value).toBe(employees[3]!.name);
  });

  it("should use the stored schedule export directory when no output override is provided", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(testOutputDir, "..", "pending"),
        approvedDir: path.resolve(testOutputDir, "..", "approved"),
        scheduleExportDir: testOutputDir,
        allowanceProposalExportDir: path.resolve(testOutputDir, "..", "allowance", "proposal"),
        allowanceAttachment1ExportDir: path.resolve(testOutputDir, "..", "allowance", "attachment1"),
        allowanceAttachment2ExportDir: path.resolve(testOutputDir, "..", "allowance", "attachment2"),
        migrationFilePath: ""
      },
      {
        userDataPath: process.cwd()
      }
    );

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 1"
    );
    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = createAssignedEmployee({
      employeeCode: "EMP-EXP-DIR",
      name: "하늘",
      siteId: site!.id,
      shiftGroup: "A조"
    });
    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2024-10",
      patternId: pattern!.id,
      generatedBy: "admin",
      templateVersionId: template!.id,
      items: [
        {
          employeeCode: employee.employeeCode,
          teamLabel: "A조",
          workDate: "2024-10-27",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      ]
    });

    const exported = await exportMonthlySchedulePlan({
      scheduleId: saved.id,
      userDataPath: process.cwd()
    });

    expect(exported).not.toBeNull();
    expect(path.dirname(exported!.outputPath)).toBe(
      path.resolve(testOutputDir, "2024년", "10월")
    );
    expect(existsSync(exported!.outputPath)).toBe(true);
  });
});
