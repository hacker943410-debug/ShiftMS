const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { _electron: electron } = require("playwright");

const TABLES = ["공휴일", "연장근로요율", "사업조직현황"];
const DEFAULT_DATABASE_PATH = path.resolve(
  process.cwd(),
  "양식샘플",
  "DT사업1팀_교대근무관리DB.accdb"
);
const DEFAULT_OUTPUT_ROOT = path.resolve(process.cwd(), "artifacts", "access-import-poc");

const normalizeKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-()/\\[\]{}.:]+/g, "");

const readJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));

const formatCompactDate = (value) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
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

const ensureDirectory = (targetPath) => {
  fs.mkdirSync(targetPath, { recursive: true });
  return targetPath;
};

const toPowerShellLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;

const resolveArgValue = (flagName) => {
  const index = process.argv.findIndex((value) => value === flagName);
  if (index < 0) {
    return undefined;
  }

  return process.argv[index + 1];
};

const findRowValue = (row, candidates) => {
  const entries = Object.entries(row ?? {});
  const normalizedEntries = entries.map(([key, value]) => ({
    key,
    normalizedKey: normalizeKey(key),
    value
  }));

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeKey(candidate);
    const exactMatch = normalizedEntries.find((entry) => entry.normalizedKey === normalizedCandidate);

    if (exactMatch && exactMatch.value !== null && exactMatch.value !== undefined) {
      return exactMatch.value;
    }

    const fuzzyMatch = normalizedEntries.find(
      (entry) =>
        entry.value !== null &&
        entry.value !== undefined &&
        (entry.normalizedKey.includes(normalizedCandidate) ||
          normalizedCandidate.includes(entry.normalizedKey))
    );

    if (fuzzyMatch) {
      return fuzzyMatch.value;
    }
  }

  return undefined;
};

const assertRowValue = (row, candidates, label) => {
  const value = findRowValue(row, candidates);

  if (value === null || value === undefined || String(value).trim().length === 0) {
    throw new Error(`${label} 값을 찾을 수 없습니다. 후보 컬럼: ${candidates.join(", ")}`);
  }

  return value;
};

const normalizeIsoDate = (value) => {
  const matched = String(value ?? "").match(/(\d{4})[-./](\d{2})[-./](\d{2})/);

  if (!matched) {
    throw new Error(`날짜 형식을 해석할 수 없습니다: ${String(value ?? "")}`);
  }

  return `${matched[1]}-${matched[2]}-${matched[3]}`;
};

const normalizeNumber = (value, label) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`${label} 숫자를 해석할 수 없습니다: ${String(value ?? "")}`);
  }

  return numericValue;
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

const resolveRateCategoryCode = (rawCategory) => {
  const normalized = normalizeKey(rawCategory);

  if (normalized.includes("법정공휴일") || normalized.includes("법정휴일") || normalized.includes("공휴일")) {
    return "legal-holiday";
  }

  if (normalized.includes("평대체")) {
    return "weekday-substitute";
  }

  if (normalized.includes("휴대체")) {
    return "holiday-substitute";
  }

  if (normalized.includes("평연장")) {
    return "weekday-overtime";
  }

  if (normalized.includes("휴연장")) {
    return "holiday-overtime";
  }

  throw new Error(`알 수 없는 근로유형입니다: ${rawCategory}`);
};

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
    metadata: readJsonFile(path.join(outputDir, "metadata.json")),
    schemaSummary: readJsonFile(path.join(outputDir, "schema-summary.json"))
  };
};

const buildHolidayCalendars = (rows, sourceVersion) => {
  const itemsByYear = new Map();

  rows.forEach((row) => {
    const holidayDate = normalizeIsoDate(assertRowValue(row, ["날짜", "공휴일날짜"], "공휴일 날짜"));
    const name = String(assertRowValue(row, ["공휴일명", "이름", "명칭"], "공휴일명")).trim();
    const year = Number(holidayDate.slice(0, 4));
    const bucket = itemsByYear.get(year) ?? [];

    bucket.push({
      holidayDate,
      name,
      isSubstitute: name.includes("대체")
    });
    itemsByYear.set(year, bucket);
  });

  return Array.from(itemsByYear.entries())
    .sort(([left], [right]) => left - right)
    .map(([year, items]) => ({
      year,
      sourceName: "access-db",
      sourceVersion,
      items: items.sort((left, right) => left.holidayDate.localeCompare(right.holidayDate))
    }));
};

const buildAllowanceRateVersions = (rows, fallbackYear, versionToken) => {
  const itemsByYear = new Map();

  rows.forEach((row) => {
    const rawCategory = String(assertRowValue(row, ["근로유형"], "근로유형")).trim();
    const year = Number(findRowValue(row, ["요율정의년도", "정의년도", "년도", "연도"]) ?? fallbackYear);
    const categoryCode = resolveRateCategoryCode(rawCategory);
    const bucket = itemsByYear.get(year) ?? [];

    bucket.push({
      allowanceCode: `${categoryCode}:base`,
      multiplier: normalizeNumber(
        assertRowValue(row, ["기본근로수당요율", "기본요율"], "기본근로수당요율"),
        `${rawCategory} 기본근로수당요율`
      )
    });
    bucket.push({
      allowanceCode: `${categoryCode}:overtime`,
      multiplier: normalizeNumber(
        assertRowValue(row, ["연장근로수당요율", "연장요율"], "연장근로수당요율"),
        `${rawCategory} 연장근로수당요율`
      )
    });
    bucket.push({
      allowanceCode: `${categoryCode}:night`,
      multiplier: normalizeNumber(
        assertRowValue(row, ["야간근로수당요율", "야간요율"], "야간근로수당요율"),
        `${rawCategory} 야간근로수당요율`
      )
    });
    itemsByYear.set(year, bucket);
  });

  const orderedYears = Array.from(itemsByYear.keys()).sort((left, right) => left - right);
  const latestYear = orderedYears[orderedYears.length - 1] ?? fallbackYear;

  return orderedYears.map((year) => ({
    year,
    versionLabel: `ACCDB ${year} ${versionToken}`,
    status: year === latestYear ? "active" : "retired",
    effectiveFrom: `${year}-01-01`,
    effectiveTo: year === latestYear ? undefined : `${year}-12-31`,
    items: itemsByYear.get(year)
  }));
};

const buildSites = (rows) => {
  const siteNames = Array.from(
    new Set(
      rows
        .map((row) => {
          const value = findRowValue(row, ["근무지", "근무지명", "사업조직", "사업조직명", "조직명"]);
          return String(value ?? "").trim();
        })
        .filter((value) => value.length > 0)
    )
  ).sort((left, right) => left.localeCompare(right, "ko"));

  return siteNames.map((name, index) => ({
    siteCode: `ACCESS-${String(index + 1).padStart(3, "0")}`,
    name,
    status: "active",
    timezone: "Asia/Seoul"
  }));
};

const buildSummaryPayload = (input) => ({
  databasePath: input.databasePath,
  exportOutputDir: input.exportOutputDir,
  sourceVersion: input.sourceVersion,
  holidays: input.holidayCalendars.map((calendar) => ({
    year: calendar.year,
    itemCount: calendar.items.length
  })),
  rates: input.allowanceRateVersions.map((version) => ({
    year: version.year,
    versionLabel: version.versionLabel,
    status: version.status,
    itemCount: version.items.length
  })),
  sites: input.sites.map((site) => site.name)
});

(async () => {
  const databasePath = path.resolve(resolveArgValue("--databasePath") ?? DEFAULT_DATABASE_PATH);
  const outputRoot = path.resolve(resolveArgValue("--outputDir") ?? DEFAULT_OUTPUT_ROOT);
  const startedAt = new Date();
  const runId = formatTimestamp(startedAt);
  const exportOutputDir = ensureDirectory(path.join(outputRoot, runId));
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-access-import-poc-"));

  if (!fs.existsSync(databasePath)) {
    throw new Error(`Access DB를 찾을 수 없습니다: ${databasePath}`);
  }

  const exportResult = exportAccessTables(databasePath, exportOutputDir);
  const holidayRows = readJsonFile(path.join(exportOutputDir, "tables", "공휴일.json"));
  const rateRows = readJsonFile(path.join(exportOutputDir, "tables", "연장근로요율.json"));
  const siteRows = readJsonFile(path.join(exportOutputDir, "tables", "사업조직현황.json"));
  const databaseStat = fs.statSync(databasePath);
  const sourceVersion = formatCompactDate(databaseStat.mtime);
  const fallbackYear = databaseStat.mtime.getFullYear();
  const holidayCalendars = buildHolidayCalendars(holidayRows, sourceVersion);
  const allowanceRateVersions = buildAllowanceRateVersions(rateRows, fallbackYear, sourceVersion);
  const sites = buildSites(siteRows);

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

    const payload = {
      holidayCalendars,
      allowanceRateVersions,
      sites
    };
    const importResult = await page.evaluate(async (input) => {
      const saveBridgeResult = (result, label) => {
        if (!result?.ok) {
          throw new Error(result?.message ?? `${label} bridge 호출에 실패했습니다.`);
        }

        return result.data;
      };

      const importedHolidays = [];
      for (const calendar of input.holidayCalendars) {
        const saved = saveBridgeResult(
          await window.appBridge.replaceHolidayCalendar(calendar),
          `공휴일 ${calendar.year}`
        );
        importedHolidays.push({
          year: saved.year,
          itemCount: saved.items.length
        });
      }

      const importedRateVersions = [];
      for (const version of input.allowanceRateVersions) {
        const saved = saveBridgeResult(
          await window.appBridge.saveAllowanceRateVersion(version),
          `요율 ${version.year}`
        );
        importedRateVersions.push({
          id: saved.id,
          year: saved.year,
          versionLabel: saved.versionLabel,
          status: saved.status,
          itemCount: saved.items.length
        });
      }

      const importedSites = [];
      for (const site of input.sites) {
        const saved = saveBridgeResult(await window.appBridge.saveSite(site), `근무지 ${site.name}`);
        importedSites.push({
          id: saved.id,
          siteCode: saved.siteCode,
          name: saved.name
        });
      }

      const holidayChecks = [];
      for (const calendar of input.holidayCalendars) {
        const listed = saveBridgeResult(
          await window.appBridge.listHolidayCalendars(calendar.year),
          `공휴일 목록 ${calendar.year}`
        );
        holidayChecks.push({
          year: calendar.year,
          matched: listed.some(
            (entry) =>
              entry.sourceName === "access-db" &&
              entry.items.length === calendar.items.length &&
              calendar.items.every((item) =>
                entry.items.some(
                  (stored) => stored.holidayDate === item.holidayDate && stored.name === item.name
                )
              )
          )
        });
      }

      const rateChecks = [];
      for (const version of input.allowanceRateVersions) {
        const listed = saveBridgeResult(
          await window.appBridge.listAllowanceRateVersions(version.year),
          `요율 목록 ${version.year}`
        );
        rateChecks.push({
          year: version.year,
          matched: listed.some(
            (entry) =>
              entry.versionLabel === version.versionLabel &&
              entry.items.some(
                (item) =>
                  item.allowanceCode === "weekday-substitute:base" &&
                  version.items.some(
                    (candidate) =>
                      candidate.allowanceCode === "weekday-substitute:base" &&
                      Number(candidate.multiplier) === Number(item.multiplier)
                  )
              )
          )
        });
      }

      const listedSites = saveBridgeResult(await window.appBridge.listSites(), "근무지 목록");
      const siteChecks = input.sites.map((site) => ({
        name: site.name,
        matched: listedSites.some((entry) => entry.name === site.name)
      }));

      return {
        importedHolidays,
        importedRateVersions,
        importedSites,
        holidayChecks,
        rateChecks,
        siteChecks,
        listedSiteCount: listedSites.length
      };
    }, payload);

    const failedHolidayYear = importResult.holidayChecks.find((item) => item.matched !== true);
    if (failedHolidayYear) {
      throw new Error(`공휴일 검증에 실패했습니다. year=${failedHolidayYear.year}`);
    }

    const failedRateYear = importResult.rateChecks.find((item) => item.matched !== true);
    if (failedRateYear) {
      throw new Error(`요율 검증에 실패했습니다. year=${failedRateYear.year}`);
    }

    const failedSite = importResult.siteChecks.find((item) => item.matched !== true);
    if (failedSite) {
      throw new Error(`근무지 검증에 실패했습니다. name=${failedSite.name}`);
    }

    const summary = {
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      ...buildSummaryPayload({
        databasePath,
        exportOutputDir,
        sourceVersion,
        holidayCalendars,
        allowanceRateVersions,
        sites
      }),
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
      `ACCESS_IMPORT_POC_OK holidays=${holidayCalendars.length} rateVersions=${allowanceRateVersions.length} sites=${sites.length} output=${exportOutputDir}`
    );
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
