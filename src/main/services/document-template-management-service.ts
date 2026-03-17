import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import type {
  DocumentTemplateInspectInput,
  DocumentTemplateSaveInput
} from "../../shared/bridge/contracts";
import type {
  DocumentTemplateProfile,
  DocumentTemplateTitleCandidate,
  DocumentTemplateValidationSnapshot
} from "../../shared/domain/document-template";
import type { DocumentTemplateVersion, TemplateType } from "../../shared/domain/model";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import { createDefaultGenericFieldMappings } from "./document-template-profile-service";
import { inspectSchedulePlanTemplate } from "./schedule-plan-adapter";
import {
  approveStoredDocumentTemplateVersion,
  deleteStoredDocumentTemplateVersion,
  listStoredDocumentTemplateVersions,
  saveStoredDocumentTemplateVersion
} from "./operations-storage-service";

const supportedTemplateExtensions = new Set([".xlsx", ".xlsm"]);

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim();

const collectTitleCandidates = (
  workbook: ExcelJS.Workbook
): DocumentTemplateTitleCandidate[] => {
  const candidates: DocumentTemplateTitleCandidate[] = [];

  const readCellText = (cell: ExcelJS.Cell) => {
    const value = cell.value;

    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "string") {
      return value.trim();
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value).trim();
    }

    if (value instanceof Date) {
      return "";
    }

    if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((item) => item.text ?? "")
        .join("")
        .trim();
    }

    try {
      return typeof cell.text === "string" ? cell.text.trim() : "";
    } catch {
      return "";
    }
  };

  workbook.worksheets.forEach((worksheet) => {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const text = readCellText(cell);

        if (!text) {
          return;
        }

        candidates.push({
          sheetName: worksheet.name,
          address: `${cell.address}`,
          text
        });
      });
    });
  });

  return candidates;
};

const readWorkbook = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  return workbook;
};

const assertSupportedTemplateFile = (filePath: string) => {
  if (!existsSync(filePath)) {
    throw new Error("선택한 양식 파일을 찾을 수 없습니다.");
  }

  const extension = path.extname(filePath).toLowerCase();

  if (!supportedTemplateExtensions.has(extension)) {
    throw new Error("양식 파일은 .xlsx 또는 .xlsm 형식만 지원합니다.");
  }
};

const createGenericFieldMappings = (
  templateType: Exclude<TemplateType, "schedule">,
  primarySheetName: string
): Record<string, string> => createDefaultGenericFieldMappings(templateType, primarySheetName);

const createGenericProfile = (
  templateType: Exclude<TemplateType, "schedule">,
  primarySheetName: string
): DocumentTemplateProfile => ({
  kind: "generic",
  primarySheetName,
  fieldMappings: createGenericFieldMappings(templateType, primarySheetName)
});

export const inspectDocumentTemplateImport = async (
  input: DocumentTemplateInspectInput
): Promise<DocumentTemplateValidationSnapshot & { profile: DocumentTemplateProfile }> => {
  assertSupportedTemplateFile(input.sourcePath);

  const workbook = await readWorkbook(input.sourcePath);
  const primarySheetName = workbook.worksheets[0]?.name ?? "";
  const titleCandidates = collectTitleCandidates(workbook);
  const baseValidation: DocumentTemplateValidationSnapshot = {
    sourceFileName: path.basename(input.sourcePath),
    primarySheetName,
    sheetNames: workbook.worksheets.map((worksheet) => worksheet.name),
    titleCandidates,
    canProceed: true,
    messages: [
      `워크시트 ${workbook.worksheets.length}개를 확인했습니다.`,
      `텍스트 셀 ${titleCandidates.length}건을 탐지했습니다.`
    ]
  };

  if (input.templateType === "schedule") {
    try {
      const layout = await inspectSchedulePlanTemplate(input.sourcePath);

      return {
        ...baseValidation,
        detectedTemplateFamily: layout.variant,
        messages: [
          ...baseValidation.messages,
          `지원되는 근무표 양식(${layout.variant})으로 인식했습니다.`
        ],
        profile: {
          kind: "schedule",
          templateFamily: layout.variant,
          layout
        }
      };
    } catch (error) {
      return {
        ...baseValidation,
        canProceed: false,
        messages: [
          ...baseValidation.messages,
          error instanceof Error
            ? error.message
            : "지원되는 근무표 양식 구조를 확인하지 못했습니다."
        ],
        profile: {
          kind: "generic",
          primarySheetName,
          fieldMappings: {
            sheetName: primarySheetName
          }
        }
      };
    }
  }

  return {
    ...baseValidation,
    messages: [
      ...baseValidation.messages,
      "기본 양식 프로필을 생성했습니다. 2단계에서 좌표를 확인해 주세요."
    ],
    profile: createGenericProfile(input.templateType, primarySheetName)
  };
};

const resolveManagedTemplateDirectory = (input: {
  userDataPath: string;
  templateType: TemplateType;
}) => {
  const settings = getStoredAppSettingsSnapshot({
    userDataPath: input.userDataPath
  });
  return path.resolve(settings.dataDir, "document-templates", input.templateType);
};

const resolveManagedTemplatePath = (input: {
  userDataPath: string;
  templateType: TemplateType;
  sourceFileName: string;
}) => {
  const directoryPath = resolveManagedTemplateDirectory({
    userDataPath: input.userDataPath,
    templateType: input.templateType
  });

  mkdirSync(directoryPath, { recursive: true });

  return path.resolve(
    directoryPath,
    sanitizeFileSegment(input.sourceFileName)
  );
};

const resolveManagedTemplateFileName = (input: {
  requestedFileName?: string;
  sourcePath: string;
}) => {
  const sourceExtension = path.extname(input.sourcePath).toLowerCase();
  const sourceBaseName = path.basename(input.sourcePath);
  const trimmedFileName = input.requestedFileName?.trim() ?? "";

  if (trimmedFileName.length === 0) {
    return sourceBaseName;
  }

  const requestedExtension = path.extname(trimmedFileName).toLowerCase();

  if (!requestedExtension) {
    return `${trimmedFileName}${sourceExtension}`;
  }

  if (!supportedTemplateExtensions.has(requestedExtension)) {
    throw new Error("양식 보관 파일명은 .xlsx 또는 .xlsm 확장자만 사용할 수 있습니다.");
  }

  return trimmedFileName;
};

const calculateChecksum = (filePath: string) =>
  createHash("sha256").update(readFileSync(filePath)).digest("hex");

const resolveSaveTargetTemplateId = (
  input: DocumentTemplateSaveInput
): {
  existingTemplate?: DocumentTemplateVersion;
  templateId: string;
} => {
  const existingTemplate = input.id
    ? listStoredDocumentTemplateVersions().find((item) => item.id === input.id)
    : undefined;

  return {
    existingTemplate,
    templateId: existingTemplate?.id ?? `template-${input.templateType}-${randomUUID()}`
  };
};

const assertManagedTemplateTargetAvailable = (input: {
  templateType: TemplateType;
  templateId: string;
  targetPath: string;
}) => {
  const conflictingTemplate = listStoredDocumentTemplateVersions(input.templateType).find(
    (template) =>
      template.id !== input.templateId &&
      path.resolve(template.sourcePath) === path.resolve(input.targetPath)
  );

  if (conflictingTemplate) {
    throw new Error("같은 파일명이 이미 등록되어 있습니다. 다른 파일명을 입력해 주세요.");
  }
};

export const saveManagedDocumentTemplateVersion = (
  input: DocumentTemplateSaveInput,
  context: {
    userDataPath: string;
  }
): DocumentTemplateVersion => {
  assertSupportedTemplateFile(input.sourcePath);

  if (!input.validation.canProceed) {
    throw new Error("1차 검증을 통과한 양식만 저장할 수 있습니다.");
  }

  const { existingTemplate, templateId } = resolveSaveTargetTemplateId(input);
  const targetPath = resolveManagedTemplatePath({
    userDataPath: context.userDataPath,
    templateType: input.templateType,
    sourceFileName: resolveManagedTemplateFileName({
      requestedFileName: input.managedFileName,
      sourcePath: input.sourcePath
    })
  });

  assertManagedTemplateTargetAvailable({
    templateType: input.templateType,
    templateId,
    targetPath
  });

  if (path.resolve(input.sourcePath) !== path.resolve(targetPath)) {
    copyFileSync(input.sourcePath, targetPath);
  }

  if (
    existingTemplate &&
    path.resolve(existingTemplate.sourcePath) !== path.resolve(targetPath) &&
    existsSync(existingTemplate.sourcePath)
  ) {
    rmSync(existingTemplate.sourcePath, { force: true });
  }

  return saveStoredDocumentTemplateVersion({
    id: templateId,
    templateType: input.templateType,
    versionLabel: input.versionLabel,
    sourcePath: targetPath,
    status: existingTemplate?.status ?? "pending",
    outputFileNamePattern: existingTemplate?.outputFileNamePattern,
    profileSchemaVersion: input.profileSchemaVersion ?? "1",
    profile: input.profile,
    validation: input.validation,
    checksum: calculateChecksum(targetPath)
  });
};

export const approveManagedDocumentTemplateVersion = (templateId: string) =>
  approveStoredDocumentTemplateVersion(templateId);

export const deleteManagedDocumentTemplateVersion = (
  templateId: string,
  _context: {
    userDataPath: string;
  }
) => {
  const template = listStoredDocumentTemplateVersions().find((item) => item.id === templateId);

  if (!template) {
    throw new Error("삭제할 양식 버전을 찾을 수 없습니다.");
  }

  deleteStoredDocumentTemplateVersion(templateId);
};
