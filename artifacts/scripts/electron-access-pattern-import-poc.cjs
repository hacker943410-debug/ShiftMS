const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { _electron: electron } = require("playwright");

const TABLES = ["사업조직현황", "사업조직별패턴"];
const DEFAULT_DATABASE_PATH = path.resolve(
  process.cwd(),
  "양식샘플",
  "DT사업1팀_교대근무관리DB.accdb"
);
const DEFAULT_OUTPUT_ROOT = path.resolve(process.cwd(), "artifacts", "access-import-poc");
const TEAM_COLUMN_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const normalizeText = (value) => String(value ?? "").trim();
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
  const matched = String(value ?? "").match(/(\d{4})[-./](\d{2})[-./](\d{2})/);

  if (!matched) {
    return undefined;
  }

  return `${matched[1]}-${matched[2]}-${matched[3]}`;
};

const normalizeTimeValue = (value) => {
  const matched = String(value ?? "").match(/T(\d{2}):(\d{2})/);

  if (!matched) {
    return undefined;
  }

  return `${matched[1]}:${matched[2]}`;
};

const getTeamLabels = (teamCount) =>
  Array.from({ length: teamCount }, (_, index) => `${String.fromCharCode(65 + index)}조`);

const getShiftLabels = (shiftCount) => {
  if (shiftCount === 1) {
    return ["주간"];
  }

  if (shiftCount === 2) {
    return ["주간", "야간"];
  }

  if (shiftCount === 3) {
    return ["1근", "2근", "3근"];
  }

  return Array.from({ length: shiftCount }, (_, index) => `${index + 1}근`);
};

const requirePatternCompression = () => {
  const modulePath = path.resolve(
    process.cwd(),
    "dist-electron",
    "shared",
    "domain",
    "shift-pattern-compression.js"
  );

  if (!fs.existsSync(modulePath)) {
    throw new Error(
      `공용 패턴 파서를 찾을 수 없습니다: ${modulePath}\n먼저 npm run build:electron 을 실행하세요.`
    );
  }

  return require(modulePath);
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

const buildSiteInputs = (siteRows, patternRows) => {
  const siteNames = new Set();

  siteRows.forEach((row) => {
    const siteName = normalizeText(row["근무지"]);

    if (siteName) {
      siteNames.add(siteName);
    }
  });

  patternRows.forEach((row) => {
    const siteName = normalizeText(row["근무지"]);

    if (siteName) {
      siteNames.add(siteName);
    }
  });

  return Array.from(siteNames)
    .sort((left, right) => left.localeCompare(right, "ko"))
    .map((name, index) => ({
      siteCode: `ACCESS-PT-${String(index + 1).padStart(3, "0")}`,
      name,
      status: "active",
      timezone: "Asia/Seoul"
    }));
};

const parseWorkType = (value) => {
  const normalized = normalizeText(value);
  const matched = normalized.match(/(\d+)\s*조\s*(\d+)\s*교대/);

  if (!matched) {
    return null;
  }

  return {
    teamCount: Number(matched[1]),
    shiftCount: Number(matched[2]),
    normalizedWorkType: normalized.replace(/\s+/g, "")
  };
};

const buildSiteConfigByName = (siteRows) => {
  const map = new Map();

  siteRows.forEach((row) => {
    const siteName = normalizeText(row["근무지"]);
    const workType = parseWorkType(row["근무형태"]);

    if (!siteName) {
      return;
    }

    const shiftTimes = [];
    const breakMinutes = [];

    for (let index = 1; index <= 6; index += 1) {
      const startTime = normalizeTimeValue(row[`근무시작시간${index}`]);
      const endTime = normalizeTimeValue(row[`근무종료시간${index}`]);

      if (!startTime || !endTime) {
        continue;
      }

      const rawBreakHours = Number(row[`휴게시간${index}`] ?? 0);
      shiftTimes.push(`${startTime} - ${endTime}`);
      breakMinutes.push(
        Number.isFinite(rawBreakHours) && rawBreakHours >= 0 ? Math.round(rawBreakHours * 60) : 0
      );
    }

    if (shiftTimes.length === 0) {
      return;
    }

    map.set(siteName, {
      siteName,
      declaredWorkType: workType?.normalizedWorkType,
      declaredShiftCount: workType?.shiftCount,
      declaredTeamCount: workType?.teamCount,
      availableShiftCount: shiftTimes.length,
      shiftTimes,
      breakMinutes,
      teamCapacity: Number.isInteger(Number(row["투입정원"])) ? Number(row["투입정원"]) : undefined
    });
  });

  return map;
};

const buildPatternGroups = (patternRows) => {
  const groups = new Map();

  patternRows.forEach((row) => {
    const siteName = normalizeText(row["근무지"]);
    const patternStartDate = normalizeIsoDate(row["패턴시작날짜"]);
    const workType = parseWorkType(row["근무유형"]);
    const patternString = normalizeText(row["근무시작패턴"]);

    if (!siteName || !patternStartDate || !workType || !patternString) {
      return;
    }

    const key = `${siteName}|${patternStartDate}|${workType.normalizedWorkType}`;
    const bucket =
      groups.get(key) ??
      {
        siteName,
        patternStartDate,
        workType: workType.normalizedWorkType,
        teamCount: workType.teamCount,
        shiftCount: workType.shiftCount,
        rows: []
      };

    bucket.rows.push(row);
    groups.set(key, bucket);
  });

  return Array.from(groups.values()).sort((left, right) =>
    `${left.siteName}|${left.patternStartDate}`.localeCompare(
      `${right.siteName}|${right.patternStartDate}`,
      "ko"
    )
  );
};

const buildPatternImportPayload = (siteRows, patternRows, sourceVersion) => {
  const { parseCompressedShiftPatternString } = requirePatternCompression();
  const siteConfigByName = buildSiteConfigByName(siteRows);
  const groups = buildPatternGroups(patternRows);
  const patterns = [];
  const skippedGroups = [];
  const overriddenGroups = [];

  groups.forEach((group) => {
    const siteConfig = siteConfigByName.get(group.siteName);

    if (!siteConfig) {
      skippedGroups.push({
        siteName: group.siteName,
        workType: group.workType,
        patternStartDate: group.patternStartDate,
        reason: "사업조직현황에서 시간대 정의를 찾을 수 없음"
      });
      return;
    }

    if (siteConfig.availableShiftCount < group.shiftCount) {
      skippedGroups.push({
        siteName: group.siteName,
        workType: group.workType,
        patternStartDate: group.patternStartDate,
        reason: `시간대 슬롯 부족(site=${siteConfig.availableShiftCount}개, pattern=${group.shiftCount}교대)`
      });
      return;
    }

    if (
      siteConfig.declaredShiftCount &&
      siteConfig.declaredShiftCount !== group.shiftCount
    ) {
      overriddenGroups.push({
        siteName: group.siteName,
        declaredWorkType: siteConfig.declaredWorkType ?? `${siteConfig.declaredShiftCount}교대`,
        patternWorkType: group.workType,
        patternStartDate: group.patternStartDate,
        reason: "사업조직별패턴 교대 수를 우선 적용"
      });
    }

    const shiftLabels = getShiftLabels(group.shiftCount);
    const teamLabels = getTeamLabels(group.teamCount);
    const cycles = [];
    const assignments = [];
    let hasParseError = false;

    group.rows.forEach((row, rowIndex) => {
      if (hasParseError) {
        return;
      }

      const patternString = normalizeText(row["근무시작패턴"]);
      const parsedPattern = parseCompressedShiftPatternString(
        patternString,
        group.shiftCount,
        shiftLabels
      );

      if (parsedPattern.invalidTokens.length > 0 || parsedPattern.tokens.length === 0) {
        skippedGroups.push({
          siteName: group.siteName,
          workType: group.workType,
          patternStartDate: group.patternStartDate,
          reason: `압축 패턴 해석 실패: ${Array.from(new Set(parsedPattern.invalidTokens)).join(", ")}`
        });
        hasParseError = true;
        return;
      }

      const symbolIndexBySymbol = new Map(
        parsedPattern.symbolEntries.map((entry, index) => [entry.symbol, index])
      );
      const symbolEntryBySymbol = new Map(
        parsedPattern.symbolEntries.map((entry) => [entry.symbol, entry])
      );
      const steps = parsedPattern.tokens.map((token, stepIndex) => {
        if (token === "휴") {
          return {
            stepIndex,
            dutyCode: "X",
            breakMinutes: 0
          };
        }

        const symbolIndex = symbolIndexBySymbol.get(token) ?? 0;
        const entry = symbolEntryBySymbol.get(token);
        const [startTime = "", endTime = ""] = String(siteConfig.shiftTimes[symbolIndex] ?? "")
          .split("-")
          .map((item) => item.trim());

        return {
          stepIndex,
          dutyCode: entry?.dutyCode ?? `S${symbolIndex + 1}`,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          breakMinutes: siteConfig.breakMinutes[symbolIndex] ?? 0
        };
      });

      const cycleKey = `cycle-${rowIndex + 1}`;
      const assignedTeamLabels = TEAM_COLUMN_LABELS.filter(
        (label) => row[label] !== null && row[label] !== undefined
      ).map((label) => `${label}조`);

      assignedTeamLabels.forEach((teamLabel) => {
        assignments.push({
          teamLabel,
          cycleKey
        });
      });

      cycles.push({
        cycleKey,
        name: group.rows.length > 1 ? `Cycle ${rowIndex + 1}` : "Cycle 1",
        order: rowIndex,
        shiftCount: group.shiftCount,
        patternCode: steps.map((step) => step.dutyCode).join(""),
        patternStartDate: group.patternStartDate,
        steps,
        teamIndexes: teamLabels.map((teamLabel, teamIndex) => ({
          teamLabel,
          index: Number(row[teamLabel[0]]) || teamIndex
        }))
      });
    });

    if (hasParseError || cycles.length === 0) {
      return;
    }

    const firstCycle = cycles[0];
    const assignedTeams = new Set(assignments.map((item) => item.teamLabel));
    teamLabels.forEach((teamLabel) => {
      if (!assignedTeams.has(teamLabel)) {
        assignments.push({
          teamLabel,
          cycleKey: firstCycle.cycleKey
        });
      }
    });

    patterns.push({
      siteName: group.siteName,
      workType: group.workType,
      patternStartDate: group.patternStartDate,
      patternInput: {
        name: `ACCDB | ${group.siteName} | ${group.workType}`,
        teamCount: group.teamCount,
        patternCode: firstCycle.patternCode,
        startIndexRule: `access-import-${sourceVersion}`,
        patternStartDate: group.patternStartDate,
        status: "active",
        steps: firstCycle.steps,
        teamIndexes: firstCycle.teamIndexes,
        cycles,
        teamCycleAssignments: assignments,
        teamCapacities:
          typeof siteConfig.teamCapacity === "number" && siteConfig.teamCapacity > 0
            ? teamLabels.map((teamLabel) => ({
                teamLabel,
                maxHeadcount: siteConfig.teamCapacity
              }))
            : undefined,
        poolEnabled: false
      }
    });
  });

  return {
    patterns,
    skippedGroups,
    overriddenGroups
  };
};

const buildSummaryPayload = (input) => ({
  databasePath: input.databasePath,
  exportOutputDir: input.exportOutputDir,
  sourceVersion: input.sourceVersion,
  plannedPatterns: input.patterns.map((pattern) => ({
    siteName: pattern.siteName,
    workType: pattern.workType,
    cycleCount: pattern.patternInput.cycles.length
  })),
  skippedGroups: input.skippedGroups
  ,
  overriddenGroups: input.overriddenGroups
});

(async () => {
  const databasePath = path.resolve(resolveArgValue("--databasePath") ?? DEFAULT_DATABASE_PATH);
  const outputRoot = path.resolve(resolveArgValue("--outputDir") ?? DEFAULT_OUTPUT_ROOT);
  const startedAt = new Date();
  const runId = `pattern-${formatTimestamp(startedAt)}`;
  const exportOutputDir = ensureDirectory(path.join(outputRoot, runId));
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-access-pattern-poc-"));

  if (!fs.existsSync(databasePath)) {
    throw new Error(`Access DB를 찾을 수 없습니다: ${databasePath}`);
  }

  const exportResult = exportAccessTables(databasePath, exportOutputDir);
  const siteRows = readJsonFile(path.join(exportOutputDir, "tables", "사업조직현황.json"));
  const patternRows = readJsonFile(path.join(exportOutputDir, "tables", "사업조직별패턴.json"));
  const databaseStat = fs.statSync(databasePath);
  const sourceVersion = formatCompactDate(databaseStat.mtime);
  const sites = buildSiteInputs(siteRows, patternRows);
  const patternPayload = buildPatternImportPayload(siteRows, patternRows, sourceVersion);

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

      const existingSites = saveBridgeResult(await window.appBridge.listSites(), "근무지 목록");
      const existingSiteByName = new Map(existingSites.map((site) => [site.name, site]));
      const siteIdByName = new Map();
      const importedSites = [];

      for (const site of input.sites) {
        const existing = existingSiteByName.get(site.name);
        const saved = saveBridgeResult(
          await window.appBridge.saveSite(
            existing
              ? {
                  id: existing.id,
                  siteCode: existing.siteCode,
                  name: site.name,
                  status: site.status,
                  timezone: site.timezone
                }
              : site
          ),
          `근무지 ${site.name}`
        );
        siteIdByName.set(saved.name, saved.id);
        importedSites.push({
          id: saved.id,
          siteCode: saved.siteCode,
          name: saved.name
        });
      }

      const importedPatterns = [];
      const patternChecks = [];
      let skippedMissingSiteCount = 0;

      for (const pattern of input.patterns) {
        const siteId = siteIdByName.get(pattern.siteName);

        if (!siteId) {
          skippedMissingSiteCount += 1;
          continue;
        }

        const saved = saveBridgeResult(
          await window.appBridge.saveShiftPattern({
            ...pattern.patternInput,
            siteId
          }),
          `패턴 ${pattern.patternInput.name}`
        );

        importedPatterns.push({
          id: saved.id,
          siteId: saved.siteId,
          siteName: pattern.siteName,
          name: saved.name,
          cycleCount: saved.cycles.length,
          teamCount: saved.teamCount
        });

        const listed = saveBridgeResult(
          await window.appBridge.listShiftPatterns(siteId),
          `패턴 조회 ${pattern.siteName}`
        );

        patternChecks.push({
          siteName: pattern.siteName,
          name: saved.name,
          matched: listed.some(
            (item) =>
              item.id === saved.id &&
              item.name === saved.name &&
              item.cycles.length === pattern.patternInput.cycles.length
          )
        });
      }

      return {
        importedSites,
        importedPatterns,
        patternChecks,
        skippedMissingSiteCount
      };
    }, {
      sites,
      patterns: patternPayload.patterns
    });

    const summary = {
      ok: true,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      exportOutputDir,
      tempDataDir,
      sourceVersion,
      exportMetadata: exportResult.metadata,
      requestedSiteCount: sites.length,
      requestedPatternCount: patternPayload.patterns.length,
      skippedGroups: patternPayload.skippedGroups,
      overriddenGroups: patternPayload.overriddenGroups,
      skippedMissingSiteCount: importResult.skippedMissingSiteCount,
      importedSiteCount: importResult.importedSites.length,
      importedPatternCount: importResult.importedPatterns.length,
      importedPatterns: importResult.importedPatterns,
      patternChecks: importResult.patternChecks,
      preflight: buildSummaryPayload({
        databasePath,
        exportOutputDir,
        sourceVersion,
        patterns: patternPayload.patterns,
        skippedGroups: patternPayload.skippedGroups,
        overriddenGroups: patternPayload.overriddenGroups
      })
    };

    fs.writeFileSync(
      path.join(exportOutputDir, "import-summary.json"),
      JSON.stringify(summary, null, 2),
      "utf8"
    );

    const failedChecks = summary.patternChecks.filter((item) => !item.matched);

    if (failedChecks.length > 0) {
      throw new Error(
        `패턴 재조회 검증에 실패했습니다: ${failedChecks
          .map((item) => `${item.siteName}/${item.name}`)
          .join(", ")}`
      );
    }

    console.log(
      `ACCESS_PATTERN_IMPORT_POC_OK patterns=${summary.importedPatternCount} skipped=${summary.skippedGroups.length} output=${exportOutputDir}`
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
