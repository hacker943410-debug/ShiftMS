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
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";
import {
  applyWorkforceWageBulkUpdate,
  previewWorkforceWageBulkUpdate,
  suggestWorkforceWageBulkColumns
} from "./workforce-wage-bulk-update-service";

const createWorkbookFixture = async (
  fileName: string,
  rows: Array<{
    employeeCode?: string;
    siteName: string;
    employeeName: string;
    hourlyRate: string;
  }>
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("시급업데이트");
  const filePath = path.resolve(process.cwd(), "artifacts", "tests", fileName);

  worksheet.getCell("A1").value = "사번";
  worksheet.getCell("B1").value = "근무지명";
  worksheet.getCell("C1").value = "이름";
  worksheet.getCell("D1").value = "시급";

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    if (row.employeeCode) {
      worksheet.getCell(`A${rowNumber}`).value = row.employeeCode;
    }

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
    expect(preview.rows[0]?.savePlan?.newEffectiveTo).toBeUndefined();

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

    expect(rebuilt.rows[0]?.savePlan?.newEffectiveTo).toBe("2026-07-31");
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

  // T-7: the site-and-name key loses anyone whose site was renamed, who transferred, or who has no
  // current assignment. The employee code is the one value that survives all three.
  it("should find a person by employee code when the site in the file is wrong", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const target = listStoredEmployees().find((employee) => employee.name === "김현우");
    const mapping = {
      employeeCodeColumn: "A",
      siteNameColumn: "B",
      employeeNameColumn: "C",
      hourlyRateColumn: "D"
    };
    const filePath = await createWorkbookFixture("workforce-wage-bulk-by-code.xlsx", [
      {
        employeeCode: target!.employeeCode,
        siteName: "보라매DC(구)",
        employeeName: "김현우",
        hourlyRate: "14,100"
      }
    ]);

    const byCode = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-05-01",
      mapping
    });

    expect(byCode.rows[0]?.status).toBe("ready");
    expect(byCode.rows[0]?.employeeId).toBe(target!.id);
    expect(byCode.rows[0]?.note).toContain("현재 배정 근무지");

    // Without the code column the same row is lost, which is the defect this closes.
    const withoutCode = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-05-01",
      mapping: { siteNameColumn: "B", employeeNameColumn: "C", hourlyRateColumn: "D" }
    });

    expect(withoutCode.rows[0]?.status).toBe("employee-not-found");
  });

  // A mistyped code must never raise the wrong person, so the name beside it has to agree.
  it("should refuse a row whose employee code and name disagree", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const target = listStoredEmployees().find((employee) => employee.name === "김현우");
    const filePath = await createWorkbookFixture("workforce-wage-bulk-code-mismatch.xlsx", [
      {
        employeeCode: target!.employeeCode,
        siteName: "보라매DC",
        employeeName: "다른사람",
        hourlyRate: "14,100"
      },
      {
        employeeCode: "EMP-없는사번",
        siteName: "보라매DC",
        employeeName: "김현우",
        hourlyRate: "14,100"
      }
    ]);

    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-05-01",
      mapping: {
        employeeCodeColumn: "A",
        siteNameColumn: "B",
        employeeNameColumn: "C",
        hourlyRateColumn: "D"
      }
    });

    expect(preview.readyCount).toBe(0);
    expect(preview.rows[0]?.status).toBe("employee-code-name-mismatch");
    expect(preview.rows[0]?.note).toContain("김현우");
    expect(preview.rows[1]?.status).toBe("employee-code-not-found");
    expect(preview.rows[1]?.importedEmployeeCode).toBe("EMP-없는사번");
  });

  // Matching by code must not need a site at all - that is what reaches someone with no assignment.
  it("should apply by employee code to a person with no current assignment", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    saveStoredEmployee({
      employeeCode: "EMP-950",
      name: "미배정",
      employmentType: "정규",
      status: "active",
      hireDate: "2020-01-01",
      hourlyRate: 11000
    });

    const unassigned = listStoredEmployees().find((employee) => employee.name === "미배정");
    const mapping = {
      employeeCodeColumn: "A",
      siteNameColumn: "B",
      employeeNameColumn: "C",
      hourlyRateColumn: "D"
    };
    const filePath = await createWorkbookFixture("workforce-wage-bulk-unassigned.xlsx", [
      { employeeCode: "EMP-950", siteName: "", employeeName: "미배정", hourlyRate: "12,800" }
    ]);

    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-05-01",
      mapping
    });

    expect(preview.rows[0]?.status).toBe("ready");

    const summary = await applyWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-05-01",
      mapping,
      expectedPreviewId: preview.previewId
    });

    expect(summary.appliedCount).toBe(1);
    expect(
      listStoredEmployeeWageRates(unassigned!.id).some((rate) => rate.hourlyRate === 12800)
    ).toBe(true);
  });

  // The employee code column is UNIQUE case-sensitively, so "EMP-1" and "emp-1" can both exist.
  // Folding them into one bucket and then checking only that SOMEONE in it had the right name let
  // a leaver satisfy the name check while a different, working person was the one left to be paid.
  it("should never pay a different person when two codes differ only in case", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "인천허브");
    const mapping = {
      employeeCodeColumn: "A",
      siteNameColumn: "B",
      employeeNameColumn: "C",
      hourlyRateColumn: "D"
    };

    saveStoredEmployee({
      employeeCode: "CASE-1",
      name: "김철수",
      employmentType: "정규",
      status: "retired",
      hireDate: "2020-01-01",
      retireDate: "2026-01-31",
      siteId: site?.id,
      shiftGroup: "A조",
      hourlyRate: 11000
    });
    saveStoredEmployee({
      employeeCode: "case-1",
      name: "박영희",
      employmentType: "정규",
      status: "active",
      hireDate: "2020-01-01",
      siteId: site?.id,
      shiftGroup: "A조",
      hourlyRate: 11000
    });

    const bystander = listStoredEmployees().find((employee) => employee.name === "박영희");
    const filePath = await createWorkbookFixture("workforce-wage-bulk-case-clash.xlsx", [
      { employeeCode: "CASE-1", siteName: "인천허브", employeeName: "김철수", hourlyRate: "19,000" }
    ]);

    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping
    });

    // The exact spelling names the leaver, and a leaver gets no raise. 박영희 is not a candidate
    // at any point.
    expect(preview.rows[0]?.status).toBe("employee-retired");
    expect(preview.readyCount).toBe(0);

    await applyWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping,
      expectedPreviewId: preview.previewId
    });

    expect(
      listStoredEmployeeWageRates(bystander!.id).some((rate) => rate.hourlyRate === 19000)
    ).toBe(false);
  });

  // Only the case-folded bucket can answer when the file's spelling matches nobody exactly, and a
  // bucket holding two people is reported rather than guessed at.
  it("should report a case-only employee code clash instead of choosing one", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "인천허브");

    saveStoredEmployee({
      employeeCode: "CLASH-2",
      name: "김철수",
      employmentType: "정규",
      status: "active",
      hireDate: "2020-01-01",
      siteId: site?.id,
      shiftGroup: "A조",
      hourlyRate: 11000
    });
    saveStoredEmployee({
      employeeCode: "clash-2",
      name: "박영희",
      employmentType: "정규",
      status: "active",
      hireDate: "2020-01-01",
      siteId: site?.id,
      shiftGroup: "A조",
      hourlyRate: 11000
    });

    const filePath = await createWorkbookFixture("workforce-wage-bulk-case-report.xlsx", [
      { employeeCode: "Clash-2", siteName: "인천허브", employeeName: "김철수", hourlyRate: "19,000" }
    ]);

    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping: {
        employeeCodeColumn: "A",
        siteNameColumn: "B",
        employeeNameColumn: "C",
        hourlyRateColumn: "D"
      }
    });

    expect(preview.rows[0]?.status).toBe("ambiguous-employee");
    expect(preview.readyCount).toBe(0);
  });

  // Saving cuts short EVERY earlier line crossing the effective date. One added after the preview
  // is invisible in the rows - the current rate and the amounts are unchanged - so the plan has to
  // name the lines it would cut, or an unreviewed past line gets rewritten.
  it("should refuse to apply when an overlapping past wage line appeared after the preview", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "인천허브");
    const mapping = {
      employeeCodeColumn: "A",
      siteNameColumn: "B",
      employeeNameColumn: "C",
      hourlyRateColumn: "D"
    };

    saveStoredEmployee({
      employeeCode: "EMP-960",
      name: "겹침이력",
      employmentType: "정규",
      status: "active",
      hireDate: "2020-01-01",
      siteId: site?.id,
      shiftGroup: "A조",
      hourlyRate: 11000
    });

    const target = listStoredEmployees().find((employee) => employee.name === "겹침이력");
    const filePath = await createWorkbookFixture("workforce-wage-bulk-overlap.xlsx", [
      { employeeCode: "EMP-960", siteName: "인천허브", employeeName: "겹침이력", hourlyRate: "13,600" }
    ]);
    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-06-01",
      mapping
    });

    expect(preview.rows[0]?.status).toBe("ready");

    const plannedCuts = preview.rows[0]?.savePlan?.truncatedRates.length ?? 0;

    // A shadowed past line that crosses the effective date, added behind the preview's back. It
    // does not change the current rate, the amount, or anything else the row displays.
    const shadow = getSqliteDatabase()!.prepare(`
      INSERT INTO wage_rates (id, employee_id, hourly_rate, effective_from, effective_to, reason, created_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?)
    `);

    shadow.run(
      "shadow-rate-1",
      target!.id,
      10500,
      "2019-01-01",
      "미리보기 뒤 손으로 넣은 겹친 이력",
      new Date().toISOString()
    );

    const rebuiltPlanCuts =
      (
        await previewWorkforceWageBulkUpdate({ filePath, effectiveFrom: "2026-06-01", mapping })
      ).rows[0]?.savePlan?.truncatedRates.length ?? 0;

    expect(rebuiltPlanCuts).toBe(plannedCuts + 1);

    await expect(
      applyWorkforceWageBulkUpdate({
        filePath,
        effectiveFrom: "2026-06-01",
        mapping,
        expectedPreviewId: preview.previewId
      })
    ).rejects.toThrow(/미리보기를 다시 만들어/);

    // The line nobody reviewed still runs on: apply cut nothing short.
    const untouched = listStoredEmployeeWageRates(target!.id).find(
      (rate) => rate.id === "shadow-rate-1"
    );

    expect(untouched?.effectiveTo).toBeUndefined();
  });

  // The employee code decides whether people go missing, so it is read off the header row instead
  // of being typed in every time - but only where a header actually names it.
  it("should read the column mapping from the header row", async () => {
    const filePath = await createWorkbookFixture("workforce-wage-bulk-headers.xlsx", [
      { employeeCode: "EMP-1", siteName: "보라매DC", employeeName: "김현우", hourlyRate: "13,600" }
    ]);
    const suggestion = await suggestWorkforceWageBulkColumns({ filePath });

    expect(suggestion.employeeCodeColumn).toBe("A");
    expect(suggestion.siteNameColumn).toBe("B");
    expect(suggestion.employeeNameColumn).toBe("C");
    expect(suggestion.hourlyRateColumn).toBe("D");
  });

  it("should suggest no employee code column when the header row does not name one", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("시급업데이트");
    const filePath = path.resolve(
      process.cwd(),
      "artifacts",
      "tests",
      "workforce-wage-bulk-no-code-header.xlsx"
    );

    // A leading column that is not an employee code must not be taken for one.
    worksheet.getCell("A1").value = "연번";
    worksheet.getCell("B1").value = "근무지명";
    worksheet.getCell("C1").value = "성명";
    worksheet.getCell("D1").value = "통상시급";
    await workbook.xlsx.writeFile(filePath);

    const suggestion = await suggestWorkforceWageBulkColumns({ filePath });

    expect(suggestion.employeeCodeColumn).toBeUndefined();
    expect(suggestion.siteNameColumn).toBe("B");
    expect(suggestion.employeeNameColumn).toBe("C");
    expect(suggestion.hourlyRateColumn).toBe("D");
  });

  // A sheet carrying an old rate beside the new one has two 시급 headers. Taking the first would
  // pick a wage column nobody chose.
  it("should suggest nothing for a field two columns both claim", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("시급업데이트");
    const filePath = path.resolve(
      process.cwd(),
      "artifacts",
      "tests",
      "workforce-wage-bulk-duplicate-header.xlsx"
    );

    worksheet.getCell("A1").value = "사번";
    worksheet.getCell("B1").value = "근무지명";
    worksheet.getCell("C1").value = "이름";
    worksheet.getCell("D1").value = "시급";
    worksheet.getCell("E1").value = "시급";
    await workbook.xlsx.writeFile(filePath);

    const suggestion = await suggestWorkforceWageBulkColumns({ filePath });

    expect(suggestion.hourlyRateColumn).toBeUndefined();
    expect(suggestion.ambiguousFields).toEqual([
      { field: "hourlyRateColumn", columns: ["D", "E"] }
    ]);
    expect(suggestion.employeeCodeColumn).toBe("A");
  });

  // With a gap in the history nothing crosses the effective date, so saving cuts nothing short -
  // the preview must not promise an end date for a change that never happens.
  it("should plan no truncation when the wage history has a gap at the effective date", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "인천허브");
    const mapping = {
      employeeCodeColumn: "A",
      siteNameColumn: "B",
      employeeNameColumn: "C",
      hourlyRateColumn: "D"
    };

    saveStoredEmployee({
      employeeCode: "EMP-970",
      name: "공백이력",
      employmentType: "정규",
      status: "active",
      hireDate: "2020-01-01",
      siteId: site?.id,
      shiftGroup: "A조",
      hourlyRate: 11000
    });

    const target = listStoredEmployees().find((employee) => employee.name === "공백이력");
    const opened = listStoredEmployeeWageRates(target!.id)[0];

    // Close the only line well before the effective date, leaving a gap after it.
    getSqliteDatabase()!
      .prepare("UPDATE wage_rates SET effective_to = ? WHERE id = ?")
      .run("2026-05-31", opened!.id);

    const filePath = await createWorkbookFixture("workforce-wage-bulk-gap.xlsx", [
      { employeeCode: "EMP-970", siteName: "인천허브", employeeName: "공백이력", hourlyRate: "13,600" }
    ]);
    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-07-01",
      mapping
    });

    expect(preview.rows[0]?.status).toBe("ready");
    expect(preview.rows[0]?.savePlan?.mode).toBe("insert");
    expect(preview.rows[0]?.savePlan?.truncatedRates).toEqual([]);

    await applyWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-07-01",
      mapping,
      expectedPreviewId: preview.previewId
    });

    // The old line still ends where it always did.
    expect(
      listStoredEmployeeWageRates(target!.id).find((rate) => rate.id === opened!.id)?.effectiveTo
    ).toBe("2026-05-31");
  });

  // T-23: a wage line cannot apply before the hire date, and the save refuses it. The preview sets
  // such a person aside with the reason rather than letting the whole file fail on them.
  it("sets aside a person hired after the effective date instead of failing the file on them", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "workforce-wage-bulk.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "인천허브");

    saveStoredEmployee({
      employeeCode: "EMP-903",
      name: "신입사원",
      employmentType: "정규",
      status: "active",
      hireDate: "2026-08-01",
      siteId: site?.id,
      shiftGroup: "A조",
      hourlyRate: 11000
    });

    const filePath = await createWorkbookFixture("workforce-wage-bulk-not-hired-yet.xlsx", [
      { siteName: "인천허브", employeeName: "신입사원", hourlyRate: "13,600" }
    ]);
    const mapping = { siteNameColumn: "B", employeeNameColumn: "C", hourlyRateColumn: "D" };

    const beforeHire = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-07-01",
      mapping
    });
    const onHireDate = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-08-01",
      mapping
    });

    expect(beforeHire.rows[0]?.status).toBe("employee-not-hired-yet");
    expect(beforeHire.rows[0]?.statusLabel).toBe("입사 전 제외");
    expect(beforeHire.rows[0]?.note).toContain("입사일(2026-08-01)");
    expect(onHireDate.rows[0]?.status).toBe("ready");
  });
});
