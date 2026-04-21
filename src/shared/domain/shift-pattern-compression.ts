import type { ShiftPatternStepInput } from "../bridge/contracts";

const OFF_DUTY_CODES = new Set(["X", "OFF", "O"]);
const PATTERN_SEPARATOR_REGEX = /[\s,\-_/|]/g;

export interface ShiftPatternSymbolEntry {
  symbol: string;
  aliases: string[];
  label: string;
  dutyCode: string;
}

export interface ParsedShiftPatternString {
  normalizedPattern: string;
  expandedPatternString: string;
  tokens: string[];
  invalidTokens: string[];
  cycleLabels: string[];
  symbolEntries: ShiftPatternSymbolEntry[];
}

interface RepeatParseResult {
  count: number;
  nextIndex: number;
  invalidTokens: string[];
}

interface SequenceParseResult {
  tokens: string[];
  invalidTokens: string[];
  nextIndex: number;
  closed: boolean;
}

const normalizeAliasToken = (value: string) => value.trim().toUpperCase();

const normalizeDutyCode = (value: string) => value.trim().toUpperCase();

export const normalizeShiftPatternStringInput = (value: string) =>
  value.replace(PATTERN_SEPARATOR_REGEX, "");

export const getShiftPatternDutyCodes = (shiftCount: number) => {
  if (shiftCount === 2) {
    return ["D", "N"];
  }

  return Array.from({ length: shiftCount }, (_, index) => String.fromCharCode(65 + index));
};

export const getShiftPatternSymbols = (shiftCount: number) => {
  if (shiftCount <= 1) {
    return ["주"];
  }

  if (shiftCount === 2) {
    return ["주", "야"];
  }

  if (shiftCount === 3) {
    return ["주", "석", "야"];
  }

  return Array.from({ length: shiftCount }, (_, index) => String(index + 1));
};

export const getShiftPatternDisplayLabels = (shiftCount: number) => {
  if (shiftCount <= 1) {
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

const getCanonicalShiftSlot = (dutyCode: string, shiftCount: number) => {
  const normalizedCode = normalizeDutyCode(dutyCode);

  if (shiftCount <= 1) {
    return 0;
  }

  if (
    normalizedCode === "D" ||
    normalizedCode === "A" ||
    normalizedCode === "1" ||
    normalizedCode === "S1"
  ) {
    return 0;
  }

  if (shiftCount === 2) {
    if (
      normalizedCode === "N" ||
      normalizedCode === "B" ||
      normalizedCode === "2" ||
      normalizedCode === "S2"
    ) {
      return 1;
    }

    return null;
  }

  if (
    normalizedCode === "E" ||
    normalizedCode === "B" ||
    normalizedCode === "2" ||
    normalizedCode === "S2"
  ) {
    return 1;
  }

  if (
    normalizedCode === "N" ||
    normalizedCode === "C" ||
    normalizedCode === "3" ||
    normalizedCode === "S3"
  ) {
    return 2;
  }

  if (/^S\d+$/i.test(normalizedCode)) {
    const slot = Number(normalizedCode.slice(1)) - 1;
    return slot >= 0 && slot < shiftCount ? slot : null;
  }

  if (/^\d+$/.test(normalizedCode)) {
    const slot = Number(normalizedCode) - 1;
    return slot >= 0 && slot < shiftCount ? slot : null;
  }

  if (/^[A-Z]$/.test(normalizedCode)) {
    const slot = normalizedCode.charCodeAt(0) - 65;
    return slot >= 0 && slot < shiftCount ? slot : null;
  }

  return null;
};

const getNormalizedWorkingDutyCodes = (dutyCodes: string[]) => {
  const seen = new Set<string>();

  return dutyCodes.flatMap((dutyCode) => {
    const normalizedCode = normalizeDutyCode(dutyCode);

    if (!normalizedCode || OFF_DUTY_CODES.has(normalizedCode) || seen.has(normalizedCode)) {
      return [];
    }

    seen.add(normalizedCode);
    return [normalizedCode];
  });
};

export const buildShiftPatternDutySlotMap = (dutyCodes: string[], shiftCount: number) => {
  const normalizedWorkingCodes = getNormalizedWorkingDutyCodes(dutyCodes);
  const normalizedShiftCount = Math.max(Math.min(shiftCount, normalizedWorkingCodes.length || 1), 1);
  const slotByCode = new Map<string, number>();
  const usedSlots = new Set<number>();

  normalizedWorkingCodes.forEach((dutyCode) => {
    const slot = getCanonicalShiftSlot(dutyCode, normalizedShiftCount);

    if (slot === null || usedSlots.has(slot)) {
      return;
    }

    slotByCode.set(dutyCode, slot);
    usedSlots.add(slot);
  });

  normalizedWorkingCodes.forEach((dutyCode) => {
    if (slotByCode.has(dutyCode)) {
      return;
    }

    const nextAvailableSlot = Array.from({ length: normalizedShiftCount }, (_, index) => index).find(
      (slot) => !usedSlots.has(slot)
    );
    const slot = nextAvailableSlot ?? Math.max(normalizedShiftCount - 1, 0);

    slotByCode.set(dutyCode, slot);
    usedSlots.add(slot);
  });

  return slotByCode;
};

export const buildShiftPatternDutyLabelMap = (dutyCodes: string[], shiftCount: number) => {
  const labels = getShiftPatternDisplayLabels(shiftCount);
  const slotByCode = buildShiftPatternDutySlotMap(dutyCodes, shiftCount);

  return new Map(
    Array.from(slotByCode.entries()).map(([dutyCode, slot]) => [
      dutyCode,
      labels[slot] ?? `${slot + 1}근`,
    ])
  );
};

export const buildShiftPatternSymbolEntries = (shiftCount: number, shiftLabels: string[]) => {
  const symbols = getShiftPatternSymbols(shiftCount);
  const dutyCodes = getShiftPatternDutyCodes(shiftCount);

  return symbols.map((symbol, index) => {
    const dutyCode = dutyCodes[index] ?? `S${index + 1}`;
    const digitAlias = String(index + 1);
    const aliases = new Set([symbol, digitAlias, dutyCode, dutyCode.toLowerCase()]);

    if (shiftCount === 1) {
      aliases.add("주");
      aliases.add("D");
      aliases.add("d");
    }

    if (shiftCount === 2) {
      if (index === 0) {
        aliases.add("주");
      }

      if (index === 1) {
        aliases.add("야");
      }
    }

    if (shiftCount === 3) {
      if (index === 0) {
        aliases.add("주");
        aliases.add("D");
        aliases.add("d");
      }

      if (index === 1) {
        aliases.add("석");
        aliases.add("E");
        aliases.add("e");
      }

      if (index === 2) {
        aliases.add("야");
        aliases.add("N");
        aliases.add("n");
      }
    }

    return {
      symbol,
      aliases: Array.from(aliases),
      label: shiftLabels[index] ?? `${index + 1}근`,
      dutyCode
    } satisfies ShiftPatternSymbolEntry;
  });
};

const parseRepeatCount = (pattern: string, startIndex: number): RepeatParseResult => {
  if (pattern[startIndex] !== "*") {
    return {
      count: 1,
      nextIndex: startIndex,
      invalidTokens: []
    };
  }

  let cursor = startIndex + 1;
  let digits = "";

  while (cursor < pattern.length && /\d/.test(pattern[cursor] ?? "")) {
    digits += pattern[cursor];
    cursor += 1;
  }

  if (digits.length === 0) {
    return {
      count: 1,
      nextIndex: cursor,
      invalidTokens: ["*"]
    };
  }

  const count = Number(digits);

  if (!Number.isInteger(count) || count < 1) {
    return {
      count: 1,
      nextIndex: cursor,
      invalidTokens: [`*${digits}`]
    };
  }

  return {
    count,
    nextIndex: cursor,
    invalidTokens: []
  };
};

const appendRepeatedTokens = (target: string[], tokens: string[], repeatCount: number) => {
  for (let index = 0; index < repeatCount; index += 1) {
    target.push(...tokens);
  }
};

const parsePatternSequence = (
  pattern: string,
  startIndex: number,
  symbolByAlias: Map<string, ShiftPatternSymbolEntry>,
  stopCharacter?: string
): SequenceParseResult => {
  const tokens: string[] = [];
  const invalidTokens: string[] = [];
  let cursor = startIndex;

  while (cursor < pattern.length) {
    const currentCharacter = pattern[cursor] ?? "";

    if (stopCharacter && currentCharacter === stopCharacter) {
      return {
        tokens,
        invalidTokens,
        nextIndex: cursor + 1,
        closed: true
      };
    }

    if (currentCharacter === "(") {
      const groupResult = parsePatternSequence(pattern, cursor + 1, symbolByAlias, ")");
      const repeatResult = parseRepeatCount(pattern, groupResult.nextIndex);

      tokens.push(...groupResult.tokens);
      invalidTokens.push(...groupResult.invalidTokens, ...repeatResult.invalidTokens);

      if (!groupResult.closed) {
        invalidTokens.push("(");
      }

      if (groupResult.tokens.length > 0) {
        const groupedTokens = [...groupResult.tokens];
        tokens.splice(tokens.length - groupedTokens.length, groupedTokens.length);
        appendRepeatedTokens(tokens, groupedTokens, repeatResult.count);
      }

      cursor = repeatResult.nextIndex;
      continue;
    }

    if (currentCharacter === ")") {
      invalidTokens.push(")");
      cursor += 1;
      continue;
    }

    if (currentCharacter === "*") {
      const repeatResult = parseRepeatCount(pattern, cursor);
      invalidTokens.push(...repeatResult.invalidTokens);
      cursor = repeatResult.nextIndex;
      continue;
    }

    const repeatResult = parseRepeatCount(pattern, cursor + 1);

    if (currentCharacter === "휴") {
      appendRepeatedTokens(tokens, ["휴"], repeatResult.count);
      invalidTokens.push(...repeatResult.invalidTokens);
      cursor = repeatResult.nextIndex;
      continue;
    }

    const matchedSymbol = symbolByAlias.get(normalizeAliasToken(currentCharacter));

    if (!matchedSymbol) {
      invalidTokens.push(currentCharacter, ...repeatResult.invalidTokens);
      cursor = repeatResult.nextIndex;
      continue;
    }

    appendRepeatedTokens(tokens, [matchedSymbol.symbol], repeatResult.count);
    invalidTokens.push(...repeatResult.invalidTokens);
    cursor = repeatResult.nextIndex;
  }

  return {
    tokens,
    invalidTokens,
    nextIndex: cursor,
    closed: false
  };
};

export const parseCompressedShiftPatternString = (
  patternString: string,
  shiftCount: number,
  shiftLabels: string[]
): ParsedShiftPatternString => {
  const normalizedPattern = normalizeShiftPatternStringInput(patternString);
  const symbolEntries = buildShiftPatternSymbolEntries(shiftCount, shiftLabels);
  const symbolByAlias = new Map<string, ShiftPatternSymbolEntry>();
  const symbolByCanonical = new Map(symbolEntries.map((entry) => [entry.symbol, entry]));

  symbolEntries.forEach((entry) => {
    entry.aliases.forEach((alias) => {
      symbolByAlias.set(normalizeAliasToken(alias), entry);
    });
  });

  const parsed = parsePatternSequence(normalizedPattern, 0, symbolByAlias);
  const cycleLabels = parsed.tokens.map((token) =>
    token === "휴" ? "휴무" : symbolByCanonical.get(token)?.label ?? "알수없음"
  );

  return {
    normalizedPattern,
    expandedPatternString: parsed.tokens.join(""),
    tokens: parsed.tokens,
    invalidTokens: parsed.invalidTokens,
    cycleLabels,
    symbolEntries
  };
};

export const buildShiftPatternStepsFromPatternString = (
  shiftCount: number,
  shiftLabels: string[],
  shiftTimes: string[],
  breakMinutes: number,
  patternString: string
) => {
  const parsedPattern = parseCompressedShiftPatternString(patternString, shiftCount, shiftLabels);
  const symbolMap = new Map(parsedPattern.symbolEntries.map((entry) => [entry.symbol, entry]));

  return parsedPattern.tokens.map((token, stepIndex) => {
    if (token === "휴") {
      return {
        stepIndex,
        dutyCode: "X",
        breakMinutes: 0
      } satisfies ShiftPatternStepInput;
    }

    const entry = symbolMap.get(token);
    const shiftIndex = parsedPattern.symbolEntries.findIndex((item) => item.symbol === token);
    const timeRange = shiftTimes[shiftIndex] ?? "";
    const [rawStartTime = "", rawEndTime = ""] = timeRange.split("-").map((item) => item.trim());

    return {
      stepIndex,
      dutyCode: entry?.dutyCode ?? `S${shiftIndex + 1}`,
      startTime: rawStartTime || undefined,
      endTime: rawEndTime || undefined,
      breakMinutes
    } satisfies ShiftPatternStepInput;
  });
};

export const buildShiftPatternDisplayString = (
  steps: Array<Pick<ShiftPatternStepInput, "stepIndex" | "dutyCode">>
) => {
  const orderedSteps = steps.slice().sort((left, right) => left.stepIndex - right.stepIndex);
  const workingCodes: string[] = [];

  orderedSteps.forEach((step) => {
    const dutyCode = normalizeDutyCode(step.dutyCode);

    if (!OFF_DUTY_CODES.has(dutyCode) && !workingCodes.includes(dutyCode)) {
      workingCodes.push(dutyCode);
    }
  });

  const symbols = getShiftPatternSymbols(Math.max(workingCodes.length, 1));
  const symbolByCode = new Map(
    workingCodes.map((dutyCode, index) => [dutyCode, symbols[index] ?? String(index + 1)])
  );

  return orderedSteps
    .map((step) => {
      const dutyCode = normalizeDutyCode(step.dutyCode);

      if (OFF_DUTY_CODES.has(dutyCode)) {
        return "휴";
      }

      return symbolByCode.get(dutyCode) ?? dutyCode;
    })
    .join("");
};
