export interface SequencePatternDetectionOptions {
  minCycleLength?: number;
  maxCycleLength?: number;
  minConfidence?: number;
}

export interface SequencePatternResult {
  cycle: string[];
  cycleLength: number;
  startOffset: number;
  confidence: number;
  mismatchIndices: number[];
}

export interface SequencePatternGroupMember {
  name: string;
  offset: number;
  confidence: number;
  mismatchIndices: number[];
}

export interface SequencePatternGroup {
  groupId: number;
  cycle: string[];
  cycleLength: number;
  members: SequencePatternGroupMember[];
}

export interface SequencePatternGroupingInput {
  name: string;
  pattern: SequencePatternResult | null;
}

const DEFAULT_MIN_CYCLE_LENGTH = 2;
const DEFAULT_MAX_CYCLE_LENGTH = 60;
const DEFAULT_MIN_CONFIDENCE = 0.7;

const normalizeSequenceToken = (value: string | null | undefined) => value?.trim() ?? "";

const buildRotatedCycle = (cycle: string[], rotation: number) => {
  if (cycle.length === 0) {
    return [];
  }

  const normalizedRotation = ((rotation % cycle.length) + cycle.length) % cycle.length;

  return cycle
    .slice(normalizedRotation)
    .concat(cycle.slice(0, normalizedRotation));
};

const selectDominantToken = (tokens: string[]) => {
  const counts = new Map<string, number>();
  let dominantToken = "";
  let dominantCount = -1;

  tokens.forEach((token) => {
    const nextCount = (counts.get(token) ?? 0) + 1;
    counts.set(token, nextCount);

    if (nextCount > dominantCount) {
      dominantToken = token;
      dominantCount = nextCount;
    }
  });

  return dominantToken;
};

const buildCandidateCycle = (sequence: string[], cycleLength: number, offset: number) =>
  Array.from({ length: cycleLength }, (_, position) => {
    const bucket = sequence.filter(
      (token, index) => token.length > 0 && (index + offset) % cycleLength === position
    );

    return bucket.length > 0 ? selectDominantToken(bucket) : "";
  });

const evaluateCandidateCycle = (sequence: string[], cycle: string[], offset: number) => {
  let matches = 0;
  let total = 0;
  const mismatchIndices: number[] = [];

  sequence.forEach((token, index) => {
    if (!token) {
      return;
    }

    total += 1;
    const expectedToken = cycle[(index + offset) % cycle.length] ?? "";

    if (expectedToken === token) {
      matches += 1;
      return;
    }

    mismatchIndices.push(index);
  });

  return {
    confidence: total > 0 ? matches / total : 0,
    mismatchIndices
  };
};

const findSingleTokenPattern = (sequence: string[]) => {
  const uniqueTokens = Array.from(
    new Set(sequence.map(normalizeSequenceToken).filter((token) => token.length > 0))
  );

  if (uniqueTokens.length !== 1) {
    return null;
  }

  return {
    cycle: [uniqueTokens[0]!],
    cycleLength: 1,
    startOffset: 0,
    confidence: 1,
    mismatchIndices: []
  } satisfies SequencePatternResult;
};

export const findRotationOffset = (referenceCycle: string[], candidateCycle: string[]) => {
  if (referenceCycle.length !== candidateCycle.length) {
    return null;
  }

  for (let rotation = 0; rotation < referenceCycle.length; rotation += 1) {
    const rotated = buildRotatedCycle(referenceCycle, rotation);

    if (rotated.every((token, index) => token === candidateCycle[index])) {
      return rotation;
    }
  }

  return null;
};

export const detectSequencePattern = (
  input: string[],
  options?: SequencePatternDetectionOptions
): SequencePatternResult | null => {
  const sequence = input.map(normalizeSequenceToken);
  const singleTokenPattern = findSingleTokenPattern(sequence);

  if (singleTokenPattern) {
    return singleTokenPattern;
  }

  const minCycleLength = Math.max(options?.minCycleLength ?? DEFAULT_MIN_CYCLE_LENGTH, 2);
  const maxCycleLength = Math.max(options?.maxCycleLength ?? DEFAULT_MAX_CYCLE_LENGTH, minCycleLength);
  const searchMaxCycleLength = Math.min(maxCycleLength, Math.floor(sequence.length / 2));
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  let bestResult: SequencePatternResult | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  if (searchMaxCycleLength < minCycleLength) {
    return null;
  }

  for (let cycleLength = minCycleLength; cycleLength <= searchMaxCycleLength; cycleLength += 1) {
    for (let offset = 0; offset < cycleLength; offset += 1) {
      const cycle = buildCandidateCycle(sequence, cycleLength, offset);
      const evaluation = evaluateCandidateCycle(sequence, cycle, offset);
      const score = evaluation.confidence * 1000 - cycleLength * 0.01;

      if (evaluation.confidence < minConfidence || score <= bestScore) {
        continue;
      }

      bestResult = {
        cycle,
        cycleLength,
        startOffset: offset,
        confidence: evaluation.confidence,
        mismatchIndices: evaluation.mismatchIndices
      };
      bestScore = score;
    }
  }

  return bestResult;
};

export const classifySequencePatternGroups = (items: SequencePatternGroupingInput[]) => {
  const groups: SequencePatternGroup[] = [];

  items.forEach((item) => {
    if (!item.pattern) {
      return;
    }

    const matchingGroup = groups.find((group) => findRotationOffset(group.cycle, item.pattern!.cycle) !== null);

    if (!matchingGroup) {
      groups.push({
        groupId: groups.length + 1,
        cycle: item.pattern.cycle.slice(),
        cycleLength: item.pattern.cycleLength,
        members: [
          {
            name: item.name,
            offset: item.pattern.startOffset,
            confidence: item.pattern.confidence,
            mismatchIndices: item.pattern.mismatchIndices
          }
        ]
      });
      return;
    }

    const rotation = findRotationOffset(matchingGroup.cycle, item.pattern.cycle);
    const offset =
      rotation === null
        ? item.pattern.startOffset
        : (item.pattern.startOffset + rotation) % matchingGroup.cycleLength;

    matchingGroup.members.push({
      name: item.name,
      offset,
      confidence: item.pattern.confidence,
      mismatchIndices: item.pattern.mismatchIndices
    });
  });

  return groups;
};
