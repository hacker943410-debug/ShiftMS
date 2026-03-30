import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { listStoredEmployeeWageRates } from "./employee-history-service";
import { listStoredEmployees, resetEmployeeStorageForTest } from "./employee-storage-service";
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
});
