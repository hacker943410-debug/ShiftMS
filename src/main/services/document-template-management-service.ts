import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
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
import { createDocumentTemplateCanvasSnapshot } from "./document-template-canvas-service";
import {
  createFallbackScheduleTemplateProfile,
  createDefaultNonScheduleTemplateProfile,
  getCurrentDocumentTemplateProfileSchemaVersion,
  normalizeDocumentTemplateProfile,
  normalizeDocumentTemplateValidationSnapshot
} from "./document-template-profile-service";
import { detectProposalTemplateGeneration } from "./proposal-template-layout";
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

const LEGACY_PROPOSAL_NOTICE =
  "구버전(2026-04 이전) 품의서 양식으로 인식했습니다. 출력할 때 줄 위치를 자동으로 맞춰 최신 문서와 같은 내용으로 채웁니다.";
const UNKNOWN_PROPOSAL_WARNING =
  "표준 품의서 양식 구조(제목·지급 요청 내역·지급 표 위치)를 인식하지 못했습니다. 최신 양식이 맞는지 확인해 주세요. 구조가 다르면 기본 위치 설정 기준으로 출력됩니다.";

const evaluateProposalTemplateLayout = (
  workbook: ExcelJS.Workbook
): { canProceed: boolean; warnings: string[]; messages: string[] } => {
  const generation = detectProposalTemplateGeneration(workbook);

  if (generation === "updated") {
    return {
      canProceed: true,
      warnings: [],
      messages: ["최신 품의서 양식(2026-04 수정본 구조)으로 인식했습니다."]
    };
  }

  if (generation === "legacy") {
    return {
      canProceed: true,
      warnings: [LEGACY_PROPOSAL_NOTICE],
      messages: [LEGACY_PROPOSAL_NOTICE]
    };
  }

  return {
    canProceed: true,
    warnings: [UNKNOWN_PROPOSAL_WARNING],
    messages: [UNKNOWN_PROPOSAL_WARNING]
  };
};

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
    canvasSnapshot: null,
    detectedZones: [],
    inspectionWarnings: [],
    suggestedLabels: [],
    messages: [
      `워크시트 ${workbook.worksheets.length}개를 확인했습니다.`,
      `텍스트 셀 ${titleCandidates.length}건을 탐지했습니다.`
    ]
  };

  if (input.templateType === "schedule") {
    try {
      const layout = await inspectSchedulePlanTemplate(input.sourcePath);

        const profile = normalizeDocumentTemplateProfile("schedule", {
          kind: "schedule",
          templateFamily: layout.variant,
          layout
        });

        if (!profile || profile.kind !== "schedule") {
          throw new Error("근무표 양식 프로필을 정리하지 못했습니다.");
        }

        const normalizedValidation = normalizeDocumentTemplateValidationSnapshot({
          templateType: input.templateType,
          validation: {
            ...baseValidation,
            canvasSnapshot: createDocumentTemplateCanvasSnapshot({
              workbook,
              templateType: input.templateType,
              profile,
              titleCandidates
            }),
            detectedTemplateFamily: layout.variant,
            messages: [
              ...baseValidation.messages,
              `지원되는 근무표 양식(${layout.variant})으로 인식했습니다.`
            ]
          },
          profile,
          primarySheetName
        });

        return {
          ...normalizedValidation!,
          profile
        };
      } catch (error) {
        const warningMessage =
          error instanceof Error
            ? error.message
            : "지원되는 근무표 양식 구조를 확인하지 못했습니다.";
        const fallbackProfile = createFallbackScheduleTemplateProfile(primarySheetName);
        const normalizedValidation = normalizeDocumentTemplateValidationSnapshot({
          templateType: input.templateType,
          validation: {
            ...baseValidation,
            canProceed: false,
            canvasSnapshot: createDocumentTemplateCanvasSnapshot({
              workbook,
              templateType: input.templateType,
              profile: fallbackProfile,
              titleCandidates
            }),
            inspectionWarnings: [warningMessage],
            messages: [
              ...baseValidation.messages,
              warningMessage
            ]
          },
          profile: fallbackProfile,
          primarySheetName
        });

        return {
          ...normalizedValidation!,
          profile: fallbackProfile
        };
      }
    }

  const profile = createDefaultNonScheduleTemplateProfile(input.templateType, primarySheetName);
  const proposalLayout =
    input.templateType === "proposal" ? evaluateProposalTemplateLayout(workbook) : null;
  const normalizedValidation = normalizeDocumentTemplateValidationSnapshot({
    templateType: input.templateType,
    validation: {
      ...baseValidation,
      canProceed: proposalLayout ? proposalLayout.canProceed : baseValidation.canProceed,
      inspectionWarnings: proposalLayout
        ? proposalLayout.warnings
        : baseValidation.inspectionWarnings,
      canvasSnapshot: createDocumentTemplateCanvasSnapshot({
        workbook,
        templateType: input.templateType,
        profile,
        titleCandidates
      }),
      messages: [
        ...baseValidation.messages,
        ...(proposalLayout
          ? proposalLayout.messages
          : ["문서 영역 후보를 정리했습니다. 2단계에서 위치와 의미를 확인해 주세요."])
      ]
    },
    profile,
    primarySheetName
  });

  return {
    ...normalizedValidation!,
    profile
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
    throw new Error("구조 확인을 통과한 양식만 저장할 수 있습니다.");
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

  const sourcePath = path.resolve(input.sourcePath);
  const existingSourcePath = existingTemplate ? path.resolve(existingTemplate.sourcePath) : null;
  const targetResolvedPath = path.resolve(targetPath);
  const shouldRenameManagedSource =
    existingSourcePath !== null &&
    sourcePath === existingSourcePath &&
    sourcePath !== targetResolvedPath;

  if (shouldRenameManagedSource) {
    renameSync(sourcePath, targetResolvedPath);
  } else if (sourcePath !== targetResolvedPath) {
    copyFileSync(input.sourcePath, targetPath);
  }

  if (
    existingTemplate &&
    existingSourcePath !== null &&
    existingSourcePath !== targetResolvedPath &&
    existingSourcePath !== sourcePath &&
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
    profileSchemaVersion:
      input.profileSchemaVersion ?? getCurrentDocumentTemplateProfileSchemaVersion(),
    profile: normalizeDocumentTemplateProfile(
      input.templateType,
      input.profile,
      input.validation.primarySheetName
    ),
    validation: normalizeDocumentTemplateValidationSnapshot({
      templateType: input.templateType,
      validation: input.validation,
      profile: normalizeDocumentTemplateProfile(
        input.templateType,
        input.profile,
        input.validation.primarySheetName
      ),
      primarySheetName: input.validation.primarySheetName
    }),
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
