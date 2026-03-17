import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { saveStoredEmployeeAssignment } from "./employee-history-service";
import { saveStoredEmployee } from "./employee-storage-service";
import {
  listStoredMonthlySchedules,
  resetMonthlyScheduleStorageForTest,
  saveStoredMonthlySchedule
} from "./monthly-schedule-storage-service";
import { listStoredDocumentTemplateVersions } from "./operations-storage-service";
import { previewMonthlySchedulePlan } from "./schedule-plan-preview-service";
import {
  listStoredShiftPatterns,
  saveStoredShiftPattern
} from "./shift-pattern-storage-service";
import { listStoredSites } from "./site-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

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

describe("schedule-plan-preview-service", () => {
  afterEach(() => {
    resetMonthlyScheduleStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should build a template1 preview from a stored monthly schedule", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-preview.test.sqlite")
    });

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 1"
    );
    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = createAssignedEmployee({
      employeeCode: "EMP-T1-A",
      name: "가람",
      siteId: site!.id,
      shiftGroup: "A조"
    });

    saveStoredMonthlySchedule({
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
        },
        {
          employeeCode: employee.employeeCode,
          teamLabel: "A조",
          workDate: "2024-10-28",
          dutyCode: "N",
          startTime: "18:00",
          endTime: "06:00",
          breakMinutes: 90
        }
      ]
    });

    const savedSchedule = listStoredMonthlySchedules(site!.id)[0];
    const preview = await previewMonthlySchedulePlan(savedSchedule.id);

    expect(preview?.siteName).toBe("보라매DC");
    expect(preview?.templateSheetName).toBe("교대 근무 계획표");
    expect(preview?.updates).toEqual(
      expect.arrayContaining([
        { address: "C3", value: "보라매DC" },
        { address: "W6", value: new Date(2024, 9, 1) },
        { address: "C33", value: new Date(2024, 9, 27) },
        { address: "D34", value: "A" },
        { address: "F33", value: new Date(2024, 9, 28) },
        { address: "G36", value: "A" },
        { address: "Y38", value: new Date(2024, 9, 27) },
        { address: "Z38", value: employee.name },
        { address: "Y39", value: new Date(2024, 9, 28) },
        { address: "AH39", value: employee.name }
      ])
    );
  });

  it("should build a template2 preview with day, night, and off slots", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-preview.test.sqlite")
    });

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 2"
    );
    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = saveStoredShiftPattern({
      siteId: site!.id,
      name: "보라매 6조 2교대 테스트",
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
        employeeCode: "EMP-T2-A",
        name: "가람",
        siteId: site!.id,
        shiftGroup: "A조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-T2-B",
        name: "나래",
        siteId: site!.id,
        shiftGroup: "B조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-T2-C",
        name: "다온",
        siteId: site!.id,
        shiftGroup: "C조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-T2-D",
        name: "라온",
        siteId: site!.id,
        shiftGroup: "D조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-T2-E",
        name: "마루",
        siteId: site!.id,
        shiftGroup: "E조"
      }),
      createAssignedEmployee({
        employeeCode: "EMP-T2-F",
        name: "바다",
        siteId: site!.id,
        shiftGroup: "F조"
      })
    ];

    saveStoredMonthlySchedule({
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

    const savedSchedule = listStoredMonthlySchedules(site!.id).find(
      (item) => item.patternId === pattern.id
    );
    const preview = await previewMonthlySchedulePlan(savedSchedule!.id);

    expect(preview?.updates).toEqual(
      expect.arrayContaining([
        { address: "I9", value: new Date(2024, 9, 1) },
        { address: "I10", value: "A" },
        { address: "J10", value: "B" },
        { address: "K10", value: "C" },
        { address: "J13", value: "D" },
        { address: "J14", value: "E" },
        { address: "J15", value: "F" },
        { address: "Y12", value: new Date(2024, 9, 1) },
        { address: "Z12", value: employees[0]!.name },
        { address: "AA12", value: employees[1]!.name },
        { address: "AB12", value: employees[2]!.name },
        { address: "AL12", value: employees[3]!.name }
      ])
    );
  });

  it("should reject template2 when the schedule contains unsupported evening shifts", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-preview.test.sqlite")
    });

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 2"
    );
    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = createAssignedEmployee({
      employeeCode: "EMP-T2-EVENING",
      name: "도윤",
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
          workDate: "2024-10-01",
          dutyCode: "E",
          startTime: "14:00",
          endTime: "22:00",
          breakMinutes: 60
        }
      ]
    });

    await expect(previewMonthlySchedulePlan(saved.id)).rejects.toThrow(
      "선택한 배포 양식은 E 근무를 지원하지 않습니다."
    );
  });
});
