import { existsSync } from "node:fs";
import path from "node:path";

import type { DocumentTemplateVersion } from "../../shared/domain/model";

const bundledDefaultTemplateFileNameById: Record<string, string> = {
  "template-schedule-sample1-2026-1": "근무표_템플릿1.xlsx",
  "template-schedule-sample2-2026-1": "근무표_템플릿2.xlsx",
  "template-proposal-2026-1": "품의서_2026-04_수정본.xlsx",
  "template-attachment1-2026-1": "별첨1_2026-04_수정본.xlsx",
  "template-attachment2-2026-1": "별첨2_샘플.xlsx"
};

const getProcessResourcesPath = () => {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return typeof resourcesPath === "string" && resourcesPath.trim().length > 0
    ? resourcesPath
    : undefined;
};

const listBundledDocumentTemplateCandidatePaths = (fileName: string) => {
  const resourcesPath = getProcessResourcesPath();

  return [
    resourcesPath ? path.join(resourcesPath, "templates", "defaults", fileName) : undefined,
    path.resolve(process.cwd(), "templates", "defaults", fileName),
    path.resolve(process.cwd(), "양식샘플", fileName)
  ].filter((candidate): candidate is string => Boolean(candidate));
};

const findExistingDocumentTemplatePath = (fileName: string) =>
  listBundledDocumentTemplateCandidatePaths(fileName).find((candidate) => existsSync(candidate)) ??
  null;

export const resolveBundledSeedDocumentTemplatePath = (fileName: string) =>
  findExistingDocumentTemplatePath(fileName) ?? path.resolve(process.cwd(), "양식샘플", fileName);

export const resolveBundledDefaultDocumentTemplatePath = (templateId: string) => {
  const fileName = bundledDefaultTemplateFileNameById[templateId];

  if (!fileName) {
    return null;
  }

  return findExistingDocumentTemplatePath(fileName);
};

export const resolveDocumentTemplateSourcePath = (
  template: Pick<DocumentTemplateVersion, "id" | "sourcePath">
) => {
  if (existsSync(template.sourcePath)) {
    return template.sourcePath;
  }

  return resolveBundledDefaultDocumentTemplatePath(template.id) ?? template.sourcePath;
};

export const isBundledDefaultDocumentTemplateId = (templateId: string) =>
  Object.prototype.hasOwnProperty.call(bundledDefaultTemplateFileNameById, templateId);

export const resolveDocumentTemplateSourcePathOrThrow = (
  template: Pick<DocumentTemplateVersion, "id" | "sourcePath">
) => {
  const resolvedPath = resolveDocumentTemplateSourcePath(template);

  if (existsSync(resolvedPath)) {
    return resolvedPath;
  }

  if (isBundledDefaultDocumentTemplateId(template.id)) {
    throw new Error(
      "기본 양식 파일을 찾을 수 없습니다. 설치본에 기본 양식이 포함되었는지 확인하세요."
    );
  }

  throw new Error("선택한 양식 파일을 찾을 수 없습니다. 양식관리에서 파일을 다시 등록해 주세요.");
};
