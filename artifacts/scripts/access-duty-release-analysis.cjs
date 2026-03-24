const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const TABLES = ["사업조직별근무자현황", "직무해제자현황"];
const DEFAULT_DATABASE_PATH = path.resolve(
  process.cwd(),
  "양식샘플",
  "DT사업1팀_교대근무관리DB.accdb"
);
const DEFAULT_OUTPUT_ROOT = path.resolve(process.cwd(), "artifacts", "access-import-poc");

const normalizeText = (value) => String(value ?? "").trim();
const normalizePersonName = (value) => normalizeText(value).replace(/_[A-Z]$/i, "");
const toPowerShellLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;

const ensureDirectory = (targetPath) => {
  fs.mkdirSync(targetPath, { recursive: true });
  return targetPath;
};

const readJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));

const formatTimestamp = (value) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  const second = String(value.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
};

const resolveArgValue = (flagName) => {
  const index = process.argv.findIndex((value) => value === flagName);
  if (index < 0) {
    return undefined;
  }

  return process.argv[index + 1];
};

const isPlaceholderName = (name) => {
  const value = normalizeText(name);

  return (
    value.length === 0 ||
    /^none_/i.test(value) ||
    /^공석/i.test(value) ||
    value === "-" ||
    value.toUpperCase() === "TBD"
  );
};

const normalizeIsoDate = (value) => {
  const matched = String(value ?? "").match(/(\d{4})[-./](\d{2})[-./](\d{2})/);

  if (!matched) {
    return undefined;
  }

  return `${matched[1]}-${matched[2]}-${matched[3]}`;
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
};

const buildWorkforceIndexes = (rows) => {
  const byExact = new Map();
  const byNormalized = new Map();

  rows.forEach((row) => {
    const siteName = normalizeText(row["근무지"]);
    const employeeName = normalizeText(row["직원명"]);
    const groupName = normalizeText(row["그룹명"]);
    const groupNumber = normalizeText(row["그룹번호"]);
    const groupType = normalizeText(row["그룹유형"]);

    if (!siteName || !employeeName || isPlaceholderName(employeeName)) {
      return;
    }

    const exactKey = `${siteName}|${employeeName}|${groupName}|${groupNumber}|${groupType}`;
    const normalizedKey = `${siteName}|${normalizePersonName(employeeName)}`;
    const exactBucket = byExact.get(exactKey) ?? [];
    const normalizedBucket = byNormalized.get(normalizedKey) ?? [];

    exactBucket.push(row);
    normalizedBucket.push(row);

    byExact.set(exactKey, exactBucket);
    byNormalized.set(normalizedKey, normalizedBucket);
  });

  return {
    byExact,
    byNormalized
  };
};

const createMatchSample = (row, matches) => ({
  siteName: normalizeText(row["근무지"]),
  employeeName: normalizeText(row["직원명"]),
  groupName: normalizeText(row["그룹명"]),
  groupNumber: normalizeText(row["그룹번호"]),
  groupType: normalizeText(row["그룹유형"]),
  dutyReleaseDate: normalizeIsoDate(row["직무해제일자"]),
  replacementName: normalizeText(row["직무대체자"]),
  matches: matches.map((item) => ({
    employeeName: normalizeText(item["직원명"]),
    groupName: normalizeText(item["그룹명"]),
    groupNumber: normalizeText(item["그룹번호"]),
    groupType: normalizeText(item["그룹유형"]),
    employeeCode: normalizeText(item["사원번호"])
  }))
});

const analyzeDutyReleaseRows = (workforceRows, dutyReleaseRows) => {
  const indexes = buildWorkforceIndexes(workforceRows);
  const siteStats = new Map();
  const summary = {
    totalRows: dutyReleaseRows.length,
    placeholderRows: 0,
    exactGroupMatchRows: 0,
    normalizedNameMatchRows: 0,
    ambiguousRows: 0,
    unmatchedRows: 0,
    samples: {
      normalizedNameMatchRows: [],
      ambiguousRows: [],
      unmatchedRows: []
    }
  };

  dutyReleaseRows.forEach((row) => {
    const siteName = normalizeText(row["근무지"]);
    const employeeName = normalizeText(row["직원명"]);
    const groupName = normalizeText(row["그룹명"]);
    const groupNumber = normalizeText(row["그룹번호"]);
    const groupType = normalizeText(row["그룹유형"]);
    const stats =
      siteStats.get(siteName) ??
      {
        siteName,
        totalRows: 0,
        placeholderRows: 0,
        exactGroupMatchRows: 0,
        normalizedNameMatchRows: 0,
        ambiguousRows: 0,
        unmatchedRows: 0
      };

    stats.totalRows += 1;

    if (isPlaceholderName(employeeName)) {
      summary.placeholderRows += 1;
      stats.placeholderRows += 1;
      siteStats.set(siteName, stats);
      return;
    }

    const exactKey = `${siteName}|${employeeName}|${groupName}|${groupNumber}|${groupType}`;
    const normalizedKey = `${siteName}|${normalizePersonName(employeeName)}`;
    const exactMatches = indexes.byExact.get(exactKey) ?? [];
    const normalizedMatches = indexes.byNormalized.get(normalizedKey) ?? [];

    if (exactMatches.length === 1) {
      summary.exactGroupMatchRows += 1;
      stats.exactGroupMatchRows += 1;
      siteStats.set(siteName, stats);
      return;
    }

    if (normalizedMatches.length === 1) {
      summary.normalizedNameMatchRows += 1;
      stats.normalizedNameMatchRows += 1;

      if (summary.samples.normalizedNameMatchRows.length < 5) {
        summary.samples.normalizedNameMatchRows.push(createMatchSample(row, normalizedMatches));
      }

      siteStats.set(siteName, stats);
      return;
    }

    if (normalizedMatches.length > 1 || exactMatches.length > 1) {
      summary.ambiguousRows += 1;
      stats.ambiguousRows += 1;

      if (summary.samples.ambiguousRows.length < 5) {
        summary.samples.ambiguousRows.push(
          createMatchSample(row, normalizedMatches.length > 1 ? normalizedMatches : exactMatches)
        );
      }

      siteStats.set(siteName, stats);
      return;
    }

    summary.unmatchedRows += 1;
    stats.unmatchedRows += 1;

    if (summary.samples.unmatchedRows.length < 5) {
      summary.samples.unmatchedRows.push(createMatchSample(row, []));
    }

    siteStats.set(siteName, stats);
  });

  return {
    summary,
    siteStats: Array.from(siteStats.values()).sort((left, right) =>
      left.siteName.localeCompare(right.siteName, "ko")
    )
  };
};

(() => {
  const databasePath = path.resolve(resolveArgValue("--databasePath") ?? DEFAULT_DATABASE_PATH);
  const startedAt = new Date();
  const outputDir = ensureDirectory(
    path.join(DEFAULT_OUTPUT_ROOT, `duty-release-analysis-${formatTimestamp(startedAt)}`)
  );

  if (!fs.existsSync(databasePath)) {
    throw new Error(`Access DB를 찾을 수 없습니다: ${databasePath}`);
  }

  exportAccessTables(databasePath, outputDir);

  const workforceRows = readJsonFile(path.join(outputDir, "tables", "사업조직별근무자현황.json"));
  const dutyReleaseRows = readJsonFile(path.join(outputDir, "tables", "직무해제자현황.json"));
  const analysis = analyzeDutyReleaseRows(workforceRows, dutyReleaseRows);
  const result = {
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    databasePath,
    outputDir,
    ...analysis
  };

  fs.writeFileSync(path.join(outputDir, "analysis-summary.json"), JSON.stringify(result, null, 2), "utf8");

  console.log(
    `ACCESS_DUTY_RELEASE_ANALYSIS_OK exact=${result.summary.exactGroupMatchRows} normalized=${result.summary.normalizedNameMatchRows} unmatched=${result.summary.unmatchedRows} output=${outputDir}`
  );
})();
