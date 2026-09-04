import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import {
  listStoredEmployeeWageRates,
  saveStoredEmployeeWageRate
} from "./employee-history-service";
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

    const mapping = {
      siteNameColumn: "B",
      employeeNameColumn: "C",
      hourlyRateColumn: "D"
    };
    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping
    });
    const summary = await applyWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping,
      expectedPreviewId: preview.previewId
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

  // The leaving date is this project's first non-working day: the schedule draft and the
  // performance parser both refuse work on that date. A raise starting that same day would cover
  // no worked day, so the boundary has to exclude, not include.
  it("should exclude a leaver whose leaving date is exactly the effective date", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "인천허브");

    saveStoredEmployee({
      employeeCode: "EMP-902",
      name: "경계퇴사",
      employmentType: "정규",
      status: "retired",
      hireDate: "2020-01-01",
      retireDate: "2026-07-01",
      siteId: site?.id,
      shiftGroup: "A조",
      hourlyRate: 11000
    });

    const filePath = await createWorkbookFixture("workforce-wage-bulk-boundary.xlsx", [
      { siteName: "인천허브", employeeName: "경계퇴사", hourlyRate: "13,600" }
    ]);

    const sameDay = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-07-01",
      mapping: { siteNameColumn: "B", employeeNameColumn: "C", hourlyRateColumn: "D" }
    });
    const dayBefore = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-06-30",
      mapping: { siteNameColumn: "B", employeeNameColumn: "C", hourlyRateColumn: "D" }
    });

    expect(sameDay.rows[0]?.status).toBe("employee-retired");
    expect(dayBefore.rows[0]?.status).toBe("ready");
  });

  // Apply re-reads the workbook, so editing the same path after previewing used to store rows
  // nobody had reviewed under the reviewed preview's name.
  it("should refuse to apply when the same file changed after the preview", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const targetEmployee = listStoredEmployees().find((employee) => employee.name === "김현우");
    const mapping = {
      siteNameColumn: "B",
      employeeNameColumn: "C",
      hourlyRateColumn: "D"
    };

    await createWorkbookFixture("workforce-wage-bulk-edited.xlsx", [
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "13,600" }
    ]);

    const filePath = path.resolve(
      process.cwd(),
      "artifacts",
      "tests",
      "workforce-wage-bulk-edited.xlsx"
    );
    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping
    });

    expect(preview.rows[0]?.importedHourlyRate).toBe(13600);

    // The operator edits the same file in Excel and saves it, without re-previewing.
    await createWorkbookFixture("workforce-wage-bulk-edited.xlsx", [
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "19,900" }
    ]);

    await expect(
      applyWorkforceWageBulkUpdate({
        filePath,
        effectiveFrom: "2026-04-01",
        mapping,
        expectedPreviewId: preview.previewId
      })
    ).rejects.toThrow(/미리보기를 다시 만들어/);

    // Nothing was written: the raise the operator never saw did not reach anyone.
    const wageRates = listStoredEmployeeWageRates(targetEmployee!.id);

    expect(wageRates.some((rate) => rate.hourlyRate === 19900)).toBe(false);

    // Previewing again makes the new content applicable, and now it is the reviewed one.
    const rebuilt = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping
    });

    expect(rebuilt.previewId).not.toBe(preview.previewId);

    const summary = await applyWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping,
      expectedPreviewId: rebuilt.previewId
    });

    expect(summary.appliedCount).toBe(1);
    expect(listStoredEmployeeWageRates(targetEmployee!.id)[0]?.hourlyRate).toBe(19900);
  });

  // The file is only half of what apply re-reads. A future wage line added in between changes the
  // period the new line gets - the reviewed preview promised "계속", the save would have ended it
  // early - so the fingerprint has to cover the save plan, not just the people and the amounts.
  it("should refuse to apply when a future wage line appeared after the preview", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const targetEmployee = listStoredEmployees().find((employee) => employee.name === "김현우");
    const mapping = {
      siteNameColumn: "B",
      employeeNameColumn: "C",
      hourlyRateColumn: "D"
    };
    const filePath = await createWorkbookFixture("workforce-wage-bulk-future-rate.xlsx", [
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "13,600" }
    ]);

    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping
    });

    expect(preview.rows[0]?.status).toBe("ready");
    // Nothing later on file yet, so the new line would run on.
    expect(preview.rows[0]?.newEffectiveTo).toBeUndefined();

    saveStoredEmployeeWageRate({
      employeeId: targetEmployee!.id,
      hourlyRate: 15000,
      effectiveFrom: "2026-08-01",
      reason: "미리보기 뒤에 등록된 미래 시급"
    });

    await expect(
      applyWorkforceWageBulkUpdate({
        filePath,
        effectiveFrom: "2026-04-01",
        mapping,
        expectedPreviewId: preview.previewId
      })
    ).rejects.toThrow(/미리보기를 다시 만들어/);

    // Previewing again shows the period the save would really produce, and that one applies.
    const rebuilt = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping
    });

    expect(rebuilt.rows[0]?.newEffectiveTo).toBe("2026-07-31");
    expect(rebuilt.previewId).not.toBe(preview.previewId);

    const summary = await applyWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping,
      expectedPreviewId: rebuilt.previewId
    });

    expect(summary.appliedCount).toBe(1);

    const saved = listStoredEmployeeWageRates(targetEmployee!.id).find(
      (rate) => rate.effectiveFrom === "2026-04-01"
    );

    expect(saved?.effectiveTo).toBe("2026-07-31");
  });

  // The other half of the same guarantee: the people themselves can change between the two reads.
  it("should refuse to apply when the matched person left after the preview", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "인천허브");
    const mapping = {
      siteNameColumn: "B",
      employeeNameColumn: "C",
      hourlyRateColumn: "D"
    };

    saveStoredEmployee({
      employeeCode: "EMP-903",
      name: "중간퇴사",
      employmentType: "정규",
      status: "active",
      hireDate: "2020-01-01",
      siteId: site?.id,
      shiftGroup: "A조",
      hourlyRate: 11000
    });

    const filePath = await createWorkbookFixture("workforce-wage-bulk-left-midway.xlsx", [
      { siteName: "인천허브", employeeName: "중간퇴사", hourlyRate: "13,600" }
    ]);
    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping
    });

    expect(preview.rows[0]?.status).toBe("ready");

    const leaver = listStoredEmployees().find((employee) => employee.name === "중간퇴사");

    saveStoredEmployee({
      id: leaver!.id,
      employeeCode: "EMP-903",
      name: "중간퇴사",
      employmentType: "정규",
      status: "retired",
      hireDate: "2020-01-01",
      retireDate: "2026-03-01",
      siteId: site?.id,
      shiftGroup: "A조"
    });

    await expect(
      applyWorkforceWageBulkUpdate({
        filePath,
        effectiveFrom: "2026-04-01",
        mapping,
        expectedPreviewId: preview.previewId
      })
    ).rejects.toThrow(/미리보기를 다시 만들어/);

    expect(
      listStoredEmployeeWageRates(leaver!.id).some((rate) => rate.hourlyRate === 13600)
    ).toBe(false);
  });
});
