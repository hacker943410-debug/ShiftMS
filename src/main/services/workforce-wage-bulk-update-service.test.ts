import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { listStoredEmployeeWageRates } from "./employee-history-service";
import {
  listStoredEmployees,
  resetEmployeeStorageForTest,
  saveStoredEmployee
} from "./employee-storage-service";
import { listStoredSites } from "./site-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  applyWorkforceWageBulkUpdate,
  previewWorkforceWageBulkUpdate
} from "./workforce-wage-bulk-update-service";

const createWorkbookFixture = async (
  fileName: string,
  rows: Array<{ siteName: string; employeeName: string; hourlyRate: string }>
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("시급업데이트");
  const filePath = path.resolve(process.cwd(), "artifacts", "tests", fileName);

  worksheet.getCell("B1").value = "근무지명";
  worksheet.getCell("C1").value = "이름";
  worksheet.getCell("D1").value = "시급";

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    worksheet.getCell(`B${rowNumber}`).value = row.siteName;
    worksheet.getCell(`C${rowNumber}`).value = row.employeeName;
    worksheet.getCell(`D${rowNumber}`).value = row.hourlyRate;
  });

  await workbook.xlsx.writeFile(filePath);

  return filePath;
};

describe("workforce-wage-bulk-update-service", () => {
  afterEach(() => {
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should preview applicable and skipped wage update rows from an imported workbook", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const filePath = await createWorkbookFixture("workforce-wage-bulk-preview.xlsx", [
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "13,600" },
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "13,600" },
      { siteName: "동탄센터", employeeName: "이수민", hourlyRate: "13,200" },
      { siteName: "보라매DC", employeeName: "없는사람", hourlyRate: "12,500" },
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "시급오류" }
    ]);

    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping: {
        siteNameColumn: "B",
        employeeNameColumn: "C",
        hourlyRateColumn: "D"
      }
    });

    expect(preview.readyCount).toBe(1);
    expect(preview.skippedCount).toBe(4);
    expect(preview.rows[0]?.status).toBe("ready");
    expect(preview.rows[1]?.status).toBe("duplicate-entry");
    expect(preview.rows[2]?.status).toBe("same-rate");
    expect(preview.rows[3]?.status).toBe("employee-not-found");
    expect(preview.rows[4]?.status).toBe("invalid-hourly-rate");
  });

  it("should apply only ready wage update rows and append history", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const targetEmployee = listStoredEmployees().find((employee) => employee.name === "김현우");

    expect(targetEmployee).toBeDefined();

    const filePath = await createWorkbookFixture("workforce-wage-bulk-apply.xlsx", [
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "13,600" },
      { siteName: "동탄센터", employeeName: "이수민", hourlyRate: "13,200" }
    ]);

    const summary = await applyWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping: {
        siteNameColumn: "B",
        employeeNameColumn: "C",
        hourlyRateColumn: "D"
      }
    });

    const wageRates = listStoredEmployeeWageRates(targetEmployee!.id);

    expect(summary.appliedCount).toBe(1);
    expect(summary.skippedCount).toBe(1);
    expect(summary.rows[0]?.status).toBe("applied");
    expect(wageRates[0]?.hourlyRate).toBe(13600);
    expect(wageRates[0]?.effectiveFrom).toBe("2026-04-01");
    expect(wageRates[1]?.effectiveTo).toBe("2026-03-31");
  });

  // A leaver used to knock a same-named colleague out of the raise: the ambiguity check ran before
  // the retirement check, so both were dropped as "동일 인력 중복".
  it("should raise the working colleague when a same-named leaver shares the site", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const active = listStoredEmployees().find((employee) => employee.name === "김현우");

    // Same name, same site, already gone before the effective date.
    saveStoredEmployee({
      employeeCode: "EMP-900",
      name: "김현우",
      employmentType: "정규",
      status: "retired",
      hireDate: "2020-01-01",
      retireDate: "2026-01-31",
      siteId: site?.id,
      shiftGroup: "A조",
      hourlyRate: 11000
    });

    const filePath = await createWorkbookFixture("workforce-wage-bulk-namesake.xlsx", [
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "13,600" }
    ]);

    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping: { siteNameColumn: "B", employeeNameColumn: "C", hourlyRateColumn: "D" }
    });

    expect(preview.rows[0]?.status).toBe("ready");
    expect(preview.rows[0]?.employeeId).toBe(active!.id);
  });

  // "적용일 기준 퇴사" is what the note promised, but the code excluded anyone whose status is
  // retired today — so a backdated raise never reached someone who worked through that period.
  it("should include a leaver whose last day is on or after the effective date", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "인천허브");

    saveStoredEmployee({
      employeeCode: "EMP-901",
      name: "퇴사예정",
      employmentType: "정규",
      status: "retired",
      hireDate: "2020-01-01",
      retireDate: "2026-08-31",
      siteId: site?.id,
      shiftGroup: "A조",
      hourlyRate: 11000
    });

    const filePath = await createWorkbookFixture("workforce-wage-bulk-leaver.xlsx", [
      { siteName: "인천허브", employeeName: "퇴사예정", hourlyRate: "13,600" }
    ]);

    const worked = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-07-01",
      mapping: { siteNameColumn: "B", employeeNameColumn: "C", hourlyRateColumn: "D" }
    });
    const afterLeaving = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-09-01",
      mapping: { siteNameColumn: "B", employeeNameColumn: "C", hourlyRateColumn: "D" }
    });

    // Still working on 7/1, already gone on 9/1.
    expect(worked.rows[0]?.status).toBe("ready");
    expect(afterLeaving.rows[0]?.status).toBe("employee-retired");
  });
});
