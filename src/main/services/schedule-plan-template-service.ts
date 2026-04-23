import type { SchedulePlanTemplateLayout } from "../../shared/domain/schedule-plan";
import type { DocumentTemplateVersion } from "../../shared/domain/model";
import { inspectSchedulePlanTemplate } from "./schedule-plan-adapter";
import { resolveDocumentTemplateSourcePathOrThrow } from "./document-template-source-path-service";
import {
  listStoredApprovedDocumentTemplateVersions,
  listStoredDocumentTemplateVersions,
  resolveStoredDefaultDocumentTemplateVersion
} from "./operations-storage-service";

export const resolveSchedulePlanTemplateVersion = (
  templateVersionId?: string
): DocumentTemplateVersion => {
  const templates = listStoredApprovedDocumentTemplateVersions("schedule");

  if (templates.length === 0) {
    throw new Error("사용 가능한 근무표 양식 버전을 찾을 수 없습니다.");
  }

  if (templateVersionId) {
    const matched = templates.find((template) => template.id === templateVersionId);

    if (!matched) {
      throw new Error("선택된 근무표 양식 버전을 찾을 수 없습니다.");
    }

    return matched;
  }

  return resolveStoredDefaultDocumentTemplateVersion("schedule") ?? templates[0]!;
};

export const resolveSchedulePlanTemplateLayout = async (
  template: DocumentTemplateVersion
): Promise<SchedulePlanTemplateLayout> => {
  if (template.profile?.kind === "schedule") {
    return template.profile.layout;
  }

  return inspectSchedulePlanTemplate(resolveDocumentTemplateSourcePathOrThrow(template));
};

export const resolveAnySchedulePlanTemplateVersion = (
  templateVersionId?: string
): DocumentTemplateVersion | null => {
  if (!templateVersionId) {
    return null;
  }

  return (
    listStoredDocumentTemplateVersions("schedule").find(
      (template) => template.id === templateVersionId
    ) ?? null
  );
};
