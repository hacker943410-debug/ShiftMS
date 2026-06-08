import { existsSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import type {
  SitePatternImportAnalysis,
  SitePatternImportAnalyzeInput,
  SitePatternImportDatePreview,
  SitePatternImportDraftSuggestion,
  SitePatternImportGroup,
  SitePatternImportMismatch,
  SitePatternImportSkippedWorker,
  SitePatternImportSuggestedCycle,
  SitePatternImportSuggestedTeam,
  SitePatternImportWorkerPreview
} from "../../shared/bridge/contracts";
import {
  classifySequencePatternGroups,
  detectSequencePattern
} from "../../shared/domain/site-pattern-detection";
import {
  buildShiftPatternDutySlotMap,
  getShiftPatternSymbols
} from "../../shared/domain/shift-pattern-compression";

interface ParsedWorkerRow {
  name: string;
  groupKey: string;
  codes: string[];
  order: number;
}

interface ParsedWorkerGroup {
  name: string;
  codes: string[];
  order: number;
  headcount: number;
  sourceNames: string[];
}

const SUPPORTED_EXTENSIONS = new Set([".xlsx", ".xlsm"]);
const OFF_DUTY_CODES = new Set(["", "O", "OFF", "X", "휴", "휴무"]);
const DEFAULT_SHIFT_TIMES = [
  "07:00 - 19:00",
  "19:00 - 07:00",
  "06:00 - 14:00",
  "14:00 - 22:00",
  "22:00 - 06:00",
  "09:00 - 17:00"
];

const normalizeText = (value: string | null | undefined) => value?.trim() ?? "";

const selectDominantCode = (tokens: string[]) => {
  const counts = new Map<string, number>();
  let dominantToken = "";
  let dominantCount = -1;

  tokens.forEach((token) => {
    const normalizedToken = normalizeText(token);

    if (!normalizedToken) {
      return;
    }

    const nextCount = (counts.get(normalizedToken) ?? 0) + 1;
    counts.set(normalizedToken, nextCount);

    if (nextCount > dominantCount) {
      dominantToken = normalizedToken;
      dominantCount = nextCount;
    }
  });

  return dominantToken;
};

const createDateValue = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;

const formatConfidencePercentage = (value: number) => `${(value * 100).toFixed(1)}%`;

const collectUniqueCodes = (workers: SitePatternImportWorkerPreview[]) => {
  const uniqueCodes: string[] = [];
  const seenCodes = new Set<string>();

  workers.forEach((worker) => {
    worker.codes.forEach((code) => {
      const normalizedCode = normalizeText(code);

      if (!normalizedCode || seenCodes.has(normalizedCode)) {
        return;
      }

      seenCodes.add(normalizedCode);
      uniqueCodes.push(normalizedCode);
    });
  });

  return uniqueCodes;
};

const buildAnalysisReport = (input: {
  startDate: string;
  endDate: string;
  totalDays: number;
  workerCount: number;
  holidayCount: number;
  detectedGroupCount: number;
  uniqueCodes: string[];
  groups: SitePatternImportGroup[];
  warningMessages: string[];
  skippedWorkers: SitePatternImportSkippedWorker[];
}) => {
  const lines = [
    "══════════════════════════════════════════",
    "  근무 사이클 패턴 분석 결과",
    "══════════════════════════════════════════",
    "",
    `  분석 기간: ${input.startDate} ~ ${input.endDate}`,
    `  총 일수: ${input.totalDays}일`,
    `  분석 행 수: ${input.workerCount}개`,
    `  공휴일 표기: ${input.holidayCount}일`,
    `  발견된 사이클 그룹: ${input.detectedGroupCount}개`,
    `  고유 근무코드: ${
      input.uniqueCodes.length > 0 ? input.uniqueCodes.join(", ") : "(없음)"
    }`,
    ""
  ];

  input.groups.forEach((group, groupIndex) => {
    lines.push("──────────────────────────────────────────");
    lines.push(`  [그룹 ${group.groupId}]`);
    lines.push(`  사이클 패턴: ${group.cycleDisplay}`);
    lines.push(`  사이클 길이: ${group.cycleLength}일`);
    lines.push(`  소속 항목: ${group.members.map((member) => member.name).join(", ")}`);
    lines.push(`  기준일: ${input.startDate}`);
    lines.push("");
    lines.push("  항목 | Offset | 신뢰도 | 불일치");

    group.members
      .slice()
      .sort((left, right) => left.offset - right.offset || left.name.localeCompare(right.name, "ko"))
      .forEach((member) => {
        lines.push(
          `  ${member.name} | ${member.offset} | ${formatConfidencePercentage(
            member.confidence
          )} | ${member.mismatchCount}건`
        );
      });

    if (groupIndex < input.groups.length - 1) {
      lines.push("");
    }
  });

  if (input.warningMessages.length > 0) {
    lines.push("");
    lines.push("경고");
    lines.push("──────────────────────────────────────────");
    input.warningMessages.forEach((message) => {
      lines.push(`- ${message}`);
    });
  }

  if (input.skippedWorkers.length > 0) {
    lines.push("");
    lines.push("분석 제외");
    lines.push("──────────────────────────────────────────");
    input.skippedWorkers.forEach((worker) => {
      lines.push(`- ${worker.name}: ${worker.reason}`);
    });
  }

  return lines.join("\n");
};

const getTeamLabels = (teamCount: number) =>
  Array.from({ length: teamCount }, (_, index) => `${String.fromCharCode(65 + index)}조`);

const buildDefaultShiftTimes = (shiftCount: number) =>
  Array.from({ length: shiftCount }, (_, index) => DEFAULT_SHIFT_TIMES[index] ?? "09:00 - 17:00");

const excelSerialDateToIso = (serialValue: number) => {
  if (!Number.isFinite(serialValue) || serialValue <= 0) {
    return null;
  }

  const utcDate = new Date(Date.UTC(1899, 11, 30) + Math.round(serialValue * 86400000));

  return Number.isNaN(utcDate.getTime()) ? null : createDateValue(utcDate);
};

const parseDateStringToIso = (value: string) => {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  const normalizedToken = normalizedValue.replace(/[./]/g, "-");
  const matched = normalizedToken.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (!matched) {
    return null;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(utcDate.getTime()) ||
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return createDateValue(utcDate);
};

const parseWorksheetDate = (cell: ExcelJS.Cell) => {
  const cellValue = cell.value;

  if (cellValue instanceof Date) {
    return createDateValue(
      new Date(
        Date.UTC(cellValue.getFullYear(), cellValue.getMonth(), cellValue.getDate())
      )
    );
  }

  if (typeof cellValue === "number") {
    return excelSerialDateToIso(cellValue);
  }

  if (
    cellValue &&
    typeof cellValue === "object" &&
    "result" in cellValue &&
    typeof cellValue.result === "number"
  ) {
    return excelSerialDateToIso(cellValue.result);
  }

  return parseDateStringToIso(cell.text);
};

const readWorkbook = async (filePath: string) => {
  if (!existsSync(filePath)) {
    throw new Error("선택한 Excel 파일을 찾을 수 없습니다.");
  }

  if (!SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw new Error("Excel 파일은 .xlsx 또는 .xlsm 형식만 지원합니다.");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  if (workbook.worksheets.length === 0) {
    throw new Error("워크시트가 없는 Excel 파일입니다.");
  }

  return workbook;
};

const getWorkingCodes = (cycle: string[]) =>
  Array.from(
    new Set(cycle.map((token) => normalizeText(token)).filter((token) => !OFF_DUTY_CODES.has(token.toUpperCase())))
  );

const resolveShiftCount = (cycle: string[]) => Math.max(getWorkingCodes(cycle).length, 1);

const buildPatternStringFromCycle = (cycle: string[]) => {
  const workingCodes = getWorkingCodes(cycle);
  const shiftCount = Math.max(workingCodes.length, 1);
  const symbols = getShiftPatternSymbols(shiftCount);
  const slotByCode = buildShiftPatternDutySlotMap(workingCodes, shiftCount);
  const symbolByCode = new Map(
    workingCodes.map((code, index) => [
      code,
      symbols[slotByCode.get(code) ?? index] ?? String(index + 1)
    ])
  );

  return cycle
    .map((token) => {
      const normalizedToken = normalizeText(token);

      if (OFF_DUTY_CODES.has(normalizedToken.toUpperCase())) {
        return "휴";
      }

      return symbolByCode.get(normalizedToken) ?? "휴";
    })
    .join("");
};

const buildGroupedWorkerRows = (rows: ParsedWorkerRow[]) => {
  const groupedRows = new Map<string, ParsedWorkerRow[]>();

  rows.forEach((row) => {
    const currentRows = groupedRows.get(row.groupKey) ?? [];
    currentRows.push(row);
    groupedRows.set(row.groupKey, currentRows);
  });

  return Array.from(groupedRows.entries())
    .map(([groupKey, groupRows]) => {
      const orderedRows = groupRows.slice().sort((left, right) => left.order - right.order);
      const columnCount = Math.max(...orderedRows.map((row) => row.codes.length), 0);

      return {
        name: groupKey,
        codes: Array.from({ length: columnCount }, (_, index) =>
          selectDominantCode(orderedRows.map((row) => row.codes[index] ?? ""))
        ),
        order: orderedRows[0]?.order ?? 0,
        headcount: orderedRows.length,
        sourceNames: orderedRows.map((row) => row.name)
      } satisfies ParsedWorkerGroup;
    })
    .sort((left, right) => left.order - right.order);
};

const parseWorksheet = async (input: SitePatternImportAnalyzeInput) => {
  const workbook = await readWorkbook(input.filePath);
  const worksheet = workbook.worksheets[0]!;
  const firstHeader = normalizeText(worksheet.getCell(1, 1).text);

  if (firstHeader !== "날짜") {
    throw new Error("템플릿 형식이 올바르지 않습니다. 1행 A열은 '날짜'여야 합니다.");
  }

  const dates: SitePatternImportDatePreview[] = [];
  let columnIndex = 2;

  while (true) {
    const dateCell = worksheet.getCell(1, columnIndex);
    const parsedDate = parseWorksheetDate(dateCell);

    if (!parsedDate) {
      break;
    }

    dates.push({
      date: parsedDate,
      weekday: normalizeText(worksheet.getCell(2, columnIndex).text),
      holidayName: normalizeText(worksheet.getCell(3, columnIndex).text) || undefined
    });
    columnIndex += 1;
  }

  if (dates.length < 2) {
    throw new Error("유효한 날짜가 2개 이상 필요합니다.");
  }

  const warningMessages: string[] = [];
  const skippedWorkers = new Map<string, string>();
  const rowNameCounts = new Map<string, number>();
  const parsedRows: ParsedWorkerRow[] = [];

  for (let rowNumber = 4; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const workerName = normalizeText(worksheet.getCell(rowNumber, 1).text);

    if (!workerName) {
      break;
    }

    const codes = dates.map((_, index) =>
      normalizeText(worksheet.getCell(rowNumber, index + 2).text)
    );

    if (codes.every((code) => code.length === 0)) {
      skippedWorkers.set(workerName, "근무코드가 모두 비어 있어 분석에서 제외했습니다.");
      continue;
    }

    const duplicateCount = (rowNameCounts.get(workerName) ?? 0) + 1;
    rowNameCounts.set(workerName, duplicateCount);

    parsedRows.push({
      name: duplicateCount === 1 ? workerName : `${workerName} (${duplicateCount})`,
      groupKey: workerName,
      codes,
      order: rowNumber
    });
  }

  if (parsedRows.length === 0) {
    throw new Error("분석할 근무 행 데이터가 없습니다.");
  }

  for (let index = 1; index < dates.length; index += 1) {
    const previous = new Date(`${dates[index - 1]!.date}T00:00:00Z`);
    const current = new Date(`${dates[index]!.date}T00:00:00Z`);
    const diffInDays = Math.round((current.getTime() - previous.getTime()) / 86400000);

    if (diffInDays !== 1) {
      warningMessages.push(
        `날짜가 연속되지 않습니다. ${dates[index - 1]!.date} 다음이 ${dates[index]!.date}입니다.`
      );
    }
  }

  return {
    fileName: path.basename(input.filePath),
    filePath: input.filePath,
    sheetName: worksheet.name,
    dates,
    warningMessages,
    previewRows: parsedRows
      .sort((left, right) => left.order - right.order)
      .map((worker) => ({
        name: worker.name,
        codes: worker.codes
      })) satisfies SitePatternImportWorkerPreview[],
    skippedWorkers
  };
};

const buildSuggestedTeams = (groups: SitePatternImportGroup[]) => {
  const extractedTeams: Array<Omit<SitePatternImportSuggestedTeam, "teamLabel">> = [];

  groups.forEach((group) => {
    group.teamSuggestions
      .slice()
      .sort((left, right) => left.offset - right.offset)
      .forEach((team) => {
        extractedTeams.push({
          cycleKey: group.cycleKey,
          index: team.offset,
          maxHeadcount: team.headcount,
          memberNames: team.memberNames
        });
      });
  });

  if (groups.length > 4) {
    throw new Error("감지된 Cycle이 4개를 초과해 현재 화면에 자동 반영할 수 없습니다.");
  }

  if (extractedTeams.length > 8) {
    throw new Error("감지된 조가 8개를 초과해 현재 화면에 자동 반영할 수 없습니다.");
  }

  return extractedTeams.map((team, index) => ({
    teamLabel: getTeamLabels(extractedTeams.length)[index] ?? `${index + 1}조`,
    ...team
  }));
};

const buildDraftSuggestion = (
  groups: SitePatternImportGroup[],
  startDate: string
): SitePatternImportDraftSuggestion => {
  const teams = buildSuggestedTeams(groups);
  const teamCount = Math.max(teams.length, 2);
  const teamLabels = getTeamLabels(teamCount);
  const normalizedTeams = teams.map((team, index) => ({
    ...team,
    teamLabel: teamLabels[index] ?? team.teamLabel
  }));

  if (teams.length === 1) {
    normalizedTeams.push({
      teamLabel: teamLabels[1] ?? "B조",
      cycleKey: groups[0]?.cycleKey ?? "cycle-1",
      index: 0,
      maxHeadcount: 0,
      memberNames: []
    });
  }

  const cycles = groups.map((group) => {
    const shiftCount = resolveShiftCount(group.cycleCodes);

    if (shiftCount > 6) {
      throw new Error("6개를 초과하는 근무코드는 현재 자동 등록에서 지원하지 않습니다.");
    }

    const teamIndexes = teamLabels.map((teamLabel) => ({
      teamLabel,
      index:
        normalizedTeams.find(
          (team) => team.teamLabel === teamLabel && team.cycleKey === group.cycleKey
        )?.index ?? 0
    }));

    return {
      cycleKey: group.cycleKey,
      name: `Cycle ${group.groupId}`,
      shiftCount,
      patternString: buildPatternStringFromCycle(group.cycleCodes),
      patternStartDate: startDate,
      breakMinutes: 60,
      shiftTimes: buildDefaultShiftTimes(shiftCount),
      teamIndexes,
      sourceCycleCodes: group.cycleCodes
    } satisfies SitePatternImportSuggestedCycle;
  });

  return {
    teamCount,
    cycleCount: cycles.length,
    poolEnabled: false,
    poolTimeRange: "09:00 - 18:00",
    poolBreakMinutes: 60,
    cycles,
    teams: normalizedTeams
  };
};

export const analyzeSitePatternImport = async (
  input: SitePatternImportAnalyzeInput
): Promise<SitePatternImportAnalysis> => {
  const parsed = await parseWorksheet(input);
  const groupedRows = buildGroupedWorkerRows(
    parsed.previewRows.map((worker, index) => ({
      name: worker.name,
      groupKey: worker.name.replace(/ \(\d+\)$/, ""),
      codes: worker.codes,
      order: index
    }))
  );
  const groupedRowByName = new Map(groupedRows.map((row) => [row.name, row]));
  const uniqueCodes = collectUniqueCodes(parsed.previewRows);
  const holidayCount = parsed.dates.filter((date) => Boolean(date.holidayName)).length;
  const detectedGroups = classifySequencePatternGroups(
    groupedRows.map((worker) => {
      const pattern = detectSequencePattern(worker.codes, {
        minConfidence: input.minConfidence ?? 0.7
      });

      if (!pattern) {
        parsed.skippedWorkers.set(worker.name, "반복 패턴을 찾지 못했습니다.");
      }

      return {
        name: worker.name,
        pattern
      };
    })
  );

  if (detectedGroups.length === 0) {
    throw new Error("탐지된 패턴이 없습니다.");
  }

  const groups: SitePatternImportGroup[] = detectedGroups.map((group) => {
    const members = group.members.map((member) => {
      const groupedRow = groupedRowByName.get(member.name);
      const sequence = groupedRow?.codes ?? [];
      const mismatchIndices = Array.from(
        new Set(
          (groupedRow?.sourceNames ?? [member.name]).flatMap((sourceName) => {
            const sourceSequence =
              parsed.previewRows.find((row) => row.name === sourceName)?.codes ?? sequence;

            return sourceSequence.flatMap((actualCode, index) => {
              const cycleIndex =
                ((index + member.offset) % group.cycleLength + group.cycleLength) % group.cycleLength;
              const expectedCode = group.cycle[cycleIndex] ?? "";

              return normalizeText(actualCode) === normalizeText(expectedCode) ? [] : [index];
            });
          })
        )
      ).sort((left, right) => left - right);
      const mismatches = mismatchIndices.map((index) => {
        const datePreview = parsed.dates[index];
        const cycleIndex =
          ((index + member.offset) % group.cycleLength + group.cycleLength) % group.cycleLength;
        const expectedCode = group.cycle[cycleIndex] ?? "";

        return {
          index,
          cycleIndex,
          date: datePreview?.date ?? "",
          weekday: datePreview?.weekday ?? "",
          holidayName: datePreview?.holidayName,
          actualCode: sequence[index] ?? "",
          expectedCode
        } satisfies SitePatternImportMismatch;
      });

      return {
        name: member.name,
        offset: member.offset,
        confidence: member.confidence,
        mismatchCount: mismatchIndices.length,
        mismatches
      };
    });

    const teamSuggestions = Array.from(
      members.reduce((map, member) => {
        const groupedRow = groupedRowByName.get(member.name);
        const current = map.get(member.offset) ?? {
          headcount: 0,
          memberNames: [] as string[]
        };

        current.headcount += groupedRow?.headcount ?? 1;
        current.memberNames.push(...(groupedRow?.sourceNames ?? [member.name]));
        map.set(member.offset, current);
        return map;
      }, new Map<number, { headcount: number; memberNames: string[] }>())
    )
      .sort((left, right) => left[0] - right[0])
      .map(([offset, suggestion]) => ({
        offset,
        headcount: suggestion.headcount,
        memberNames: suggestion.memberNames
      }));

    return {
      groupId: group.groupId,
      cycleKey: `cycle-${group.groupId}`,
      cycleLength: group.cycleLength,
      cycleCodes: group.cycle,
      cycleDisplay: group.cycle.map((token) => normalizeText(token) || "-").join(" "),
      shiftCount: resolveShiftCount(group.cycle),
      members,
      teamSuggestions
    };
  });

  const suggestion = buildDraftSuggestion(groups, parsed.dates[0]!.date);

  if (suggestion.teamCount !== groups.reduce((sum, group) => sum + group.teamSuggestions.length, 0)) {
    parsed.warningMessages.push("단일 조 감지로 인해 화면 최소값에 맞춰 빈 조가 추가될 수 있습니다.");
  }

  const skippedWorkers = Array.from(parsed.skippedWorkers.entries()).map(([name, reason]) => ({
    name,
    reason
  }));
  const analysisReport = buildAnalysisReport({
    startDate: parsed.dates[0]!.date,
    endDate: parsed.dates[parsed.dates.length - 1]!.date,
    totalDays: parsed.dates.length,
    workerCount: parsed.previewRows.length,
    holidayCount,
    detectedGroupCount: groups.length,
    uniqueCodes,
    groups,
    warningMessages: parsed.warningMessages,
    skippedWorkers
  });

  return {
    fileName: parsed.fileName,
    filePath: parsed.filePath,
    sheetName: parsed.sheetName,
    startDate: parsed.dates[0]!.date,
    endDate: parsed.dates[parsed.dates.length - 1]!.date,
    totalDays: parsed.dates.length,
    workerCount: parsed.previewRows.length,
    holidayCount,
    detectedGroupCount: groups.length,
    uniqueCodes,
    analysisReport,
    warningMessages: parsed.warningMessages,
    skippedWorkers,
    dates: parsed.dates,
    previewRows: parsed.previewRows,
    groups,
    suggestion
  };
};
