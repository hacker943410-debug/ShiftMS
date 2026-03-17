import path from "node:path";

import type { TemplateType } from "../../shared/domain/model";

const supportedOutputExtensions = new Set([".xlsx", ".xlsm"]);

const defaultOutputFileNamePatternByType: Record<TemplateType, string> = {
  schedule: "{siteName}_{scheduleMonth}_{patternName}.xlsx",
  proposal: "품의서_{workMonth}.xlsx",
  attachment1: "별첨1_{workMonth}.xlsx",
  attachment2: "별첨2_{workMonth}.xlsx"
};

const supportedOutputTokensByType: Record<TemplateType, Set<string>> = {
  schedule: new Set(["siteName", "scheduleMonth", "patternName", "templateVersion"]),
  proposal: new Set(["workMonth", "templateVersion"]),
  attachment1: new Set(["workMonth", "templateVersion"]),
  attachment2: new Set(["workMonth", "templateVersion"])
};

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

const normalizeBaseName = (value: string) =>
  sanitizeFileSegment(value)
    .replace(/_+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "");

const validateTemplateOutputFileNamePattern = (
  templateType: TemplateType,
  pattern: string
) => {
  const tokens = Array.from(pattern.matchAll(/\{([a-zA-Z0-9]+)\}/g)).map((match) => match[1]);
  const unsupportedTokens = tokens.filter(
    (token) => !supportedOutputTokensByType[templateType].has(token)
  );

  if (unsupportedTokens.length > 0) {
    throw new Error(
      `지원하지 않는 파일명 치환값이 있습니다. ${unsupportedTokens.join(", ")}`
    );
  }
};

export const getDefaultDocumentTemplateOutputFileNamePattern = (
  templateType: TemplateType
) => defaultOutputFileNamePatternByType[templateType];

export const normalizeDocumentTemplateOutputFileNamePattern = (
  templateType: TemplateType,
  rawPattern?: string
) => {
  const fallbackPattern = getDefaultDocumentTemplateOutputFileNamePattern(templateType);
  const trimmedPattern = rawPattern?.trim() ?? "";
  const nextPattern = trimmedPattern.length > 0 ? trimmedPattern : fallbackPattern;
  const extension = path.extname(nextPattern).toLowerCase();

  validateTemplateOutputFileNamePattern(templateType, nextPattern);

  if (!extension) {
    return `${nextPattern}.xlsx`;
  }

  if (!supportedOutputExtensions.has(extension)) {
    throw new Error("출력 파일명은 .xlsx 또는 .xlsm 확장자만 사용할 수 있습니다.");
  }

  return nextPattern;
};

export const resolveDocumentTemplateOutputFileName = (input: {
  templateType: TemplateType;
  pattern?: string;
  tokens: Record<string, string | undefined>;
}) => {
  const fallbackPattern = getDefaultDocumentTemplateOutputFileNamePattern(input.templateType);
  const normalizedPattern = normalizeDocumentTemplateOutputFileNamePattern(
    input.templateType,
    input.pattern
  );
  const extension = path.extname(normalizedPattern) || ".xlsx";
  const fallbackBaseName = path.basename(fallbackPattern, path.extname(fallbackPattern) || ".xlsx");
  const baseNamePattern = path.basename(normalizedPattern, extension);
  const substitutedBaseName = baseNamePattern.replace(
    /\{([a-zA-Z0-9]+)\}/g,
    (_match, token: string) => normalizeBaseName(input.tokens[token] ?? "")
  );
  const normalizedBaseName = normalizeBaseName(substitutedBaseName) || fallbackBaseName;

  return `${normalizedBaseName}${extension}`;
};
