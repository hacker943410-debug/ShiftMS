const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { _electron: electron } = require("playwright");

const TABLES = ["사업조직현황", "사업조직별근무자현황", "근무자별시급관리"];
const DEFAULT_DATABASE_PATH = path.resolve(
  process.cwd(),
  "양식샘플",
  "DT사업1팀_교대근무관리DB.accdb"
);
const DEFAULT_OUTPUT_ROOT = path.resolve(process.cwd(), "artifacts", "access-import-poc");

const normalizeText = (value) => String(value ?? "").trim();
const normalizeKey = (value) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[\s_\-()/\\[\]{}.:]+/g, "");
const toPowerShellLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;

const ensureDirectory = (targetPath) => {
  fs.mkdirSync(targetPath, { recursive: true });
  return targetPath;
};

const readJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));

const resolveArgValue = (flagName) => {
  const index = process.argv.findIndex((value) => value === flagName);
  if (index < 0) {
    return undefined;
  }

  return process.argv[index + 1];
};

const formatTimestamp = (value) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  const second = String(value.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
};

const formatCompactDate = (value) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const normalizeIsoDate = (value) => {
  if (!value) {
    return undefined;
  }

  const matched = String(value).match(/(\d{4})[-./](\d{2})[-./](\d{2})/);

  if (!matched) {
    return undefined;
  }

  return `${matched[1]}-${matched[2]}-${matched[3]}`;
};

const buildFallbackDate = (year) => `${year}-01-01`;

const exportAccessTables = (databasePath, outputDir) => {
  const scriptPath = path.resolve(process.cwd(), "scripts", "export-access-db.ps1");
  const args = [
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `& ${toPowerShellLiteral(scriptPath)} -DatabasePath ${toPowerShellLiteral(
      databasePath
    )} -OutputDir ${toPowerShellLiteral(outputDir)} -Tables @(${TABLES.map(toPowerShellLiteral).join(
      ", "
    )}) -IncludeRows`
  ];
  const result = spawnSync("powershell", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true
  });

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Access export failed.\n${details}`);
  }

  return {
    output: result.stdout.trim(),
    metadata: readJsonFile(path.join(outputDir, "metadata.json"))
  };
};

const ensureAuthenticated = async (page) => {
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll("button")];
    return buttons.some((button) => {
      const text = button.textContent?.trim();
      return text === "로그인" || text === "로그아웃";
    });
  }, { timeout: 60000 });

  const logoutButton = page.getByRole("button", { name: "로그아웃", exact: true });

  if ((await logoutButton.count()) > 0) {
    return;
  }

  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForSelector("button:has-text('로그아웃')", { timeout: 60000 });
};

const isPlaceholderName = (name) => {
  const normalizedName = normalizeText(name);

  return (
    normalizedName.length === 0 ||
    /^none_/i.test(normalizedName) ||
    /^공석/i.test(normalizedName) ||
    normalizedName === "-" ||
    normalizedName.toUpperCase() === "TBD"
  );
};

const compareEmployeeRows = (left, right) => {
  const leftGroupType = normalizeText(left["그룹유형"]);
  const rightGroupType = normalizeText(right["그룹유형"]);

  if (leftGroupType !== rightGroupType) {
    if (leftGroupType === "기본") {
      return -1;
    }

    if (rightGroupType === "기본") {
      return 1;
    }
  }

  const leftGroupNumber = Number(left["그룹번호"] ?? Number.MAX_SAFE_INTEGER);
  const rightGroupNumber = Number(right["그룹번호"] ?? Number.MAX_SAFE_INTEGER);

  if (leftGroupNumber !== rightGroupNumber) {
    return leftGroupNumber - rightGroupNumber;
  }

  const leftDate =
    normalizeIsoDate(left["직무적용일자"]) ??
    normalizeIsoDate(left["조직개편일자"]) ??
    "9999-12-31";
  const rightDate =
    normalizeIsoDate(right["직무적용일자"]) ??
    normalizeIsoDate(right["조직개편일자"]) ??
    "9999-12-31";

  return leftDate.localeCompare(rightDate);
};

const buildSiteInputs = (siteRows, employeeRows) => {
  const siteNames = new Set();

  siteRows.forEach((row) => {
    const siteName =
      normalizeText(row["근무지"]) ||
      normalizeText(row["근무지명"]) ||
      normalizeText(row["사업조직"]) ||
      normalizeText(row["사업조직명"]);

    if (siteName) {
      siteNames.add(siteName);
    }
  });

  employeeRows.forEach((row) => {
    const siteName = normalizeText(row["근무지"]);

    if (siteName) {
      siteNames.add(siteName);
    }
  });

  return Array.from(siteNames)
    .sort((left, right) => left.localeCompare(right, "ko"))
    .map((name, index) => ({
      siteCode: `ACCESS-WF-${String(index + 1).padStart(3, "0")}`,
      name,
      status: "active",
      timezone: "Asia/Seoul"
    }));
};

const buildActiveWageMap = (wageRows, sourceYear, sourceVersion) => {
  const byEmployee = new Map();
  const summary = {
    skippedInactive: 0,
    skippedZeroRate: 0,
    skippedMissingCode: 0,
    kept: 0
  };

  wageRows.forEach((row) => {
    const employeeCode = normalizeText(row["사원번호"]);
    const employeeName = normalizeText(row["직원명"]);
    const hourlyRate = Number(row["통상시급"] ?? 0);

    if (row["적용유무"] !== true) {
      summary.skippedInactive += 1;
      return;
    }

    if (!employeeCode || !employeeName) {
      summary.skippedMissingCode += 1;
      return;
    }

    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      summary.skippedZeroRate += 1;
      return;
    }

    const key = `${employeeCode}:${employeeName}`;
    const registeredAt =
      normalizeIsoDate(row["시급등록일시"]) ??
      (Number(row["시급정의년도"]) > 2000
        ? `${Number(row["시급정의년도"])}-01-01`
        : buildFallbackDate(sourceYear));

    const candidate = {
      employeeCode,
      employeeName,
      siteName: normalizeText(row["근무지"]),
      hourlyRate,
      effectiveFrom: registeredAt,
      reason: `Access import ${sourceVersion}`
    };
    const existing = byEmployee.get(key);

    if (!existing || candidate.effectiveFrom > existing.effectiveFrom) {
      byEmployee.set(key, candidate);
    }
  });

  summary.kept = byEmployee.size;

  return {
    byEmployee,
    summary
  };
};

const buildEmployeeImportPayload = (employeeRows, activeWageMap, sourceYear, sourceVersion) => {
  const selectedRowsByEmployee = new Map();
  const summary = {
    totalRows: employeeRows.length,
    skippedPlaceholder: 0,
    skippedMissingCode: 0,
    duplicateRowsCollapsed: 0,
    importedEmployees: 0,
    withoutPositiveActiveWage: 0
  };

  employeeRows.forEach((row) => {
    const employeeCode = normalizeText(row["사원번호"]);
    const employeeName = normalizeText(row["직원명"]);

    if (isPlaceholderName(employeeName)) {
      summary.skippedPlaceholder += 1;
      return;
    }

    if (!employeeCode) {
      summary.skippedMissingCode += 1;
      return;
    }

    const key = `${employeeCode}:${employeeName}`;
    const existing = selectedRowsByEmployee.get(key);

    if (!existing) {
      selectedRowsByEmployee.set(key, row);
      return;
    }

    summary.duplicateRowsCollapsed += 1;

    if (compareEmployeeRows(row, existing) < 0) {
      selectedRowsByEmployee.set(key, row);
    }
  });

  const employees = Array.from(selectedRowsByEmployee.entries())
    .sort(([left], [right]) => left.localeCompare(right, "ko"))
    .map(([key, row]) => {
      const employeeCode = normalizeText(row["사원번호"]);
      const employeeName = normalizeText(row["직원명"]);
      const activeWage = activeWageMap.get(key);
      const groupName = normalizeText(row["그룹명"]);
      const groupNumber = normalizeText(row["그룹번호"]);
      const groupType = normalizeText(row["그룹유형"]);
      const startDate =
        normalizeIsoDate(row["직무적용일자"]) ??
        normalizeIsoDate(row["조직개편일자"]) ??
        activeWage?.effectiveFrom ??
        buildFallbackDate(sourceYear);
      const shiftGroup = groupType === "주말" ? `${groupName}(주말)` : groupName;
      const teamName = groupType === "주말" ? `${groupName}${groupNumber}-주말` : `${groupName}${groupNumber}`;

      if (!activeWage) {
        summary.withoutPositiveActiveWage += 1;
      }

      return {
        employeeCode,
        employeeName,
        siteName: normalizeText(row["근무지"]),
        employeeInput: {
          employeeCode,
          name: employeeName,
          employmentType: "미분류",
          status: row["재직유무"] === false ? "retired" : "active",
          hireDate: startDate
        },
        assignmentInput: {
          siteName: normalizeText(row["근무지"]),
          shiftGroup,
          teamName,
          startDate
        },
        wageRateInput: activeWage
          ? {
              hourlyRate: activeWage.hourlyRate,
              effectiveFrom: activeWage.effectiveFrom,
              reason: activeWage.reason
            }
          : null
      };
    });

  summary.importedEmployees = employees.length;

  return {
    employees,
    summary
  };
};

const buildSummaryPayload = (input) => ({
  databasePath: input.databasePath,
  exportOutputDir: input.exportOutputDir,
  sourceVersion: input.sourceVersion,
  sites: input.sites.map((site) => site.name),
  employees: {
    plannedCount: input.employees.length,
    codes: input.employees.map((employee) => employee.employeeCode)
  }
});

(async () => {
  const databasePath = path.resolve(resolveArgValue("--databasePath") ?? DEFAULT_DATABASE_PATH);
  const outputRoot = path.resolve(resolveArgValue("--outputDir") ?? DEFAULT_OUTPUT_ROOT);
  const startedAt = new Date();
  const runId = `workforce-${formatTimestamp(startedAt)}`;
  const exportOutputDir = ensureDirectory(path.join(outputRoot, runId));
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-access-workforce-poc-"));

  if (!fs.existsSync(databasePath)) {
    throw new Error(`Access DB를 찾을 수 없습니다: ${databasePath}`);
  }

  const exportResult = exportAccessTables(databasePath, exportOutputDir);
  const siteRows = readJsonFile(path.join(exportOutputDir, "tables", "사업조직현황.json"));
  const employeeRows = readJsonFile(path.join(exportOutputDir, "tables", "사업조직별근무자현황.json"));
  const wageRows = readJsonFile(path.join(exportOutputDir, "tables", "근무자별시급관리.json"));
  const databaseStat = fs.statSync(databasePath);
  const sourceVersion = formatCompactDate(databaseStat.mtime);
  const sourceYear = databaseStat.mtime.getFullYear();
  const sites = buildSiteInputs(siteRows, employeeRows);
  const wageMapResult = buildActiveWageMap(wageRows, sourceYear, sourceVersion);
  const employeePayload = buildEmployeeImportPayload(
    employeeRows,
    wageMapResult.byEmployee,
    sourceYear,
    sourceVersion
  );

  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: tempDataDir
    }
  });
  const page = await app.firstWindow();

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await ensureAuthenticated(page);

    const importResult = await page.evaluate(async (input) => {
      const saveBridgeResult = (result, label) => {
        if (!result?.ok) {
          throw new Error(result?.message ?? `${label} bridge 호출에 실패했습니다.`);
        }

        return result.data;
      };

      const importedSites = [];
      for (const site of input.sites) {
        const saved = saveBridgeResult(await window.appBridge.saveSite(site), `근무지 ${site.name}`);
        importedSites.push({
          id: saved.id,
          siteCode: saved.siteCode,
          name: saved.name
        });
      }

      const listedSites = saveBridgeResult(await window.appBridge.listSites(), "근무지 목록");
      const siteIdByName = new Map(listedSites.map((site) => [site.name, site.id]));

      const importedEmployees = [];
      const assignmentChecks = [];
      const wageChecks = [];
      let skippedAssignmentCount = 0;

      for (const employee of input.employees) {
        const savedEmployee = saveBridgeResult(
          await window.appBridge.saveEmployee(employee.employeeInput),
          `직원 ${employee.employeeCode}`
        );

        importedEmployees.push({
          id: savedEmployee.id,
          employeeCode: savedEmployee.employeeCode,
          name: savedEmployee.name,
          siteName: employee.siteName
        });

        const siteId = siteIdByName.get(employee.siteName);

        if (!siteId) {
          skippedAssignmentCount += 1;
          continue;
        }

        const assignment = saveBridgeResult(
          await window.appBridge.saveEmployeeAssignment({
            employeeId: savedEmployee.id,
            siteId,
            shiftGroup: employee.assignmentInput.shiftGroup,
            teamName: employee.assignmentInput.teamName,
            startDate: employee.assignmentInput.startDate
          }),
          `배정 ${employee.employeeCode}`
        );

        const assignmentHistory = saveBridgeResult(
          await window.appBridge.listEmployeeAssignments(savedEmployee.id),
          `배정 조회 ${employee.employeeCode}`
        );
        assignmentChecks.push({
          employeeCode: savedEmployee.employeeCode,
          matched: assignmentHistory.some(
            (item) =>
              item.id === assignment.id &&
              item.siteName === employee.siteName &&
              item.shiftGroup === employee.assignmentInput.shiftGroup
          )
        });

        if (!employee.wageRateInput) {
          continue;
        }

        const wageRate = saveBridgeResult(
          await window.appBridge.saveEmployeeWageRate({
            employeeId: savedEmployee.id,
            hourlyRate: employee.wageRateInput.hourlyRate,
            effectiveFrom: employee.wageRateInput.effectiveFrom,
            reason: employee.wageRateInput.reason
          }),
          `시급 ${employee.employeeCode}`
        );

        const wageHistory = saveBridgeResult(
          await window.appBridge.listEmployeeWageRates(savedEmployee.id),
          `시급 조회 ${employee.employeeCode}`
        );
        wageChecks.push({
          employeeCode: savedEmployee.employeeCode,
          matched: wageHistory.some(
            (item) =>
              item.id === wageRate.id &&
              Number(item.hourlyRate) === Number(employee.wageRateInput.hourlyRate) &&
              item.effectiveFrom === employee.wageRateInput.effectiveFrom
          )
        });
      }

      const listedEmployees = saveBridgeResult(await window.appBridge.listEmployees(), "직원 목록");
      const importedEmployeeChecks = input.employees.map((employee) => ({
        employeeCode: employee.employeeCode,
        matched: listedEmployees.some(
          (item) => item.employeeCode === employee.employeeCode && item.name === employee.employeeName
        )
      }));

      return {
        importedSites,
        importedEmployees,
        importedEmployeeChecks,
        assignmentChecks,
        wageChecks,
        skippedAssignmentCount,
        listedEmployeeCount: listedEmployees.length
      };
    }, {
      sites,
      employees: employeePayload.employees
    });

    const failedEmployee = importResult.importedEmployeeChecks.find((item) => item.matched !== true);
    if (failedEmployee) {
      throw new Error(`직원 목록 검증에 실패했습니다. employeeCode=${failedEmployee.employeeCode}`);
    }

    const failedAssignment = importResult.assignmentChecks.find((item) => item.matched !== true);
    if (failedAssignment) {
      throw new Error(`배정 검증에 실패했습니다. employeeCode=${failedAssignment.employeeCode}`);
    }

    const failedWage = importResult.wageChecks.find((item) => item.matched !== true);
    if (failedWage) {
      throw new Error(`시급 검증에 실패했습니다. employeeCode=${failedWage.employeeCode}`);
    }

    const summary = {
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      ...buildSummaryPayload({
        databasePath,
        exportOutputDir,
        sourceVersion,
        sites,
        employees: employeePayload.employees
      }),
      sourceStats: {
        employeeRows: employeeRows.length,
        wageRows: wageRows.length,
        employeeRuleSummary: employeePayload.summary,
        wageRuleSummary: wageMapResult.summary
      },
      exportResult: {
        provider: exportResult.metadata.provider,
        tableCount: exportResult.metadata.tableCount,
        tables: exportResult.metadata.tables
      },
      importResult,
      tempDataDir
    };

    fs.writeFileSync(
      path.join(exportOutputDir, "import-summary.json"),
      JSON.stringify(summary, null, 2),
      "utf8"
    );

    console.log(
      `ACCESS_WORKFORCE_IMPORT_POC_OK employees=${employeePayload.employees.length} wageImports=${importResult.wageChecks.length} sites=${sites.length} output=${exportOutputDir}`
    );
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
