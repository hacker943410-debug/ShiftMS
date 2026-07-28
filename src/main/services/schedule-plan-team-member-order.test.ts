import { rmSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { saveStoredEmployeeAssignment } from "./employee-history-service";
import { listStoredEmployees, saveStoredEmployee } from "./employee-storage-service";
import {
  listStoredMonthlySchedules,
  resetMonthlyScheduleStorageForTest,
  saveStoredMonthlySchedule
} from "./monthly-schedule-storage-service";
import { listStoredDocumentTemplateVersions } from "./operations-storage-service";
import { exportMonthlySchedulePlan } from "./schedule-plan-export-service";
import { previewMonthlySchedulePlan } from "./schedule-plan-preview-service";
import { listStoredShiftPatterns } from "./shift-pattern-storage-service";
import { listStoredSites } from "./site-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testOutputDir = path.resolve(
  process.cwd(),
  "artifacts",
  "tests",
  "schedule-team-member-order"
);

// There is no 조장 flag in the product. The operator arranges the team so the leader sits
// first, so the published plan must preserve that arrangement. Names are picked so the
// roster order and the Korean alphabetical order disagree and the leader would land in the
// MIDDLE if the export re-sorted by name — the originally reported symptom.
const TEAM_A_MEMBERS = [
  { employeeCode: "EMP-ORD-1", name: "박조장" }, // leader, roster position 1
  { employeeCode: "EMP-ORD-2", name: "김일번" }, // roster position 2
  { employeeCode: "EMP-ORD-3", name: "홍삼번" } // roster position 3
];

// Second team for the mixed-team slot. Alphabetically these interleave with team A
// (강비둘 < 김일번 < 박조장 < 이비조), so a name sort cannot accidentally pass.
const TEAM_B_MEMBERS = [
  { employeeCode: "EMP-ORD-4", name: "이비조" }, // leader, roster position 1
  { employeeCode: "EMP-ORD-5", name: "강비둘" } // roster position 2
];

const createAssignedEmployee = (input: {
  employeeCode: string;
  name: string;
  siteId: string;
  shiftGroup: string;
  sortOrder: number;
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
    sortOrder: input.sortOrder,
    startDate: "2024-01-01"
  });

  return employee;
};

const seedTeamSchedule = (teams: { teamLabel: string; members: typeof TEAM_A_MEMBERS }[]) => {
  initializeSqliteStorage({
    dbPath: path.resolve(
      process.cwd(),
      "artifacts",
      "tests",
      "schedule-plan-team-member-order.test.sqlite"
    )
  });

  const template = listStoredDocumentTemplateVersions("schedule").find(
    (item) => item.versionLabel === "근무표 양식 1"
  );
  const site = listStoredSites().find((item) => item.name === "보라매DC");
  const pattern = listStoredShiftPatterns(site?.id)[0];

  teams.forEach((team) => {
    team.members.forEach((member, index) => {
      createAssignedEmployee({
        employeeCode: member.employeeCode,
        name: member.name,
        siteId: site!.id,
        shiftGroup: team.teamLabel,
        sortOrder: index
      });
    });
  });

  const saved = saveStoredMonthlySchedule({
    siteId: site!.id,
    scheduleMonth: "2026-03",
    patternId: pattern!.id,
    generatedBy: "admin",
    templateVersionId: template!.id,
    items: teams.flatMap((team) =>
      team.members.map((member, index) => ({
        employeeCode: member.employeeCode,
        teamLabel: team.teamLabel,
        sortOrder: index,
        workDate: "2026-03-01",
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      }))
    )
  });

  return { saved, site: site!, template: template! };
};

const NAME_CELLS = ["Z12", "AA12", "AB12", "AC12"];

const readPreviewNameOrder = (updates: { address: string; value?: unknown }[]) =>
  NAME_CELLS.map((address) => updates.find((update) => update.address === address)?.value);

describe("schedule plan export — team member row order", () => {
  afterEach(() => {
    resetMonthlyScheduleStorageForTest();
    resetSqliteStorageForTest();
    rmSync(testOutputDir, { recursive: true, force: true });
  });

  it("keeps the operator-arranged order in storage (what the on-screen calendar shows)", () => {
    const { saved, site } = seedTeamSchedule([{ teamLabel: "A조", members: TEAM_A_MEMBERS }]);

    const storedAssignmentOrder = listStoredEmployees({ siteId: site.id })
      .filter((employee) => employee.employeeCode.startsWith("EMP-ORD-"))
      .slice()
      .sort(
        (left, right) =>
          (left.currentAssignmentOrder ?? 0) - (right.currentAssignmentOrder ?? 0)
      )
      .map((employee) => employee.name);

    const stored = listStoredMonthlySchedules(site.id).find((item) => item.id === saved.id);
    const storedItemOrder = stored!.items
      .filter((item) => item.workDate === "2026-03-01")
      .map((item) => item.employeeName);

    expect(storedAssignmentOrder).toEqual(["박조장", "김일번", "홍삼번"]);
    expect(storedItemOrder).toEqual(["박조장", "김일번", "홍삼번"]);
  });

  it("publishes team members in the arranged order, leader first — not Korean alphabetical", async () => {
    const { saved } = seedTeamSchedule([{ teamLabel: "A조", members: TEAM_A_MEMBERS }]);

    const preview = await previewMonthlySchedulePlan(saved.id);
    const rosterSummary = preview!.updates.find((update) => update.address === "B7")?.value;

    expect(readPreviewNameOrder(preview!.updates)).toEqual(["박조장", "김일번", "홍삼번", "-"]);
    expect(String(rosterSummary)).toContain("A: 박조장, 김일번, 홍삼번");

    const exported = await exportMonthlySchedulePlan({
      scheduleId: saved.id,
      userDataPath: process.cwd(),
      outputDir: testOutputDir
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exported!.outputPath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    // The published file is what the operator actually receives — assert it, not just the preview.
    expect(NAME_CELLS.map((address) => worksheet.getCell(address).value)).toEqual([
      "박조장",
      "김일번",
      "홍삼번",
      "-"
    ]);
    expect(String(worksheet.getCell("B7").value)).toContain("A: 박조장, 김일번, 홍삼번");
  });

  it("groups a mixed-team slot by team first, then by the arranged order inside each team", async () => {
    const { saved } = seedTeamSchedule([
      { teamLabel: "A조", members: TEAM_A_MEMBERS.slice(0, 2) },
      { teamLabel: "B조", members: TEAM_B_MEMBERS }
    ]);

    const preview = await previewMonthlySchedulePlan(saved.id);

    // Alphabetical would be 강비둘, 김일번, 박조장, 이비조 — every position differs.
    expect(readPreviewNameOrder(preview!.updates)).toEqual([
      "박조장",
      "김일번",
      "이비조",
      "강비둘"
    ]);
  });
});
