import type {
  SchedulePlanTemplateLayout,
  SchedulePlanTemplateVariant
} from "./schedule-plan";

export interface DocumentTemplateTitleCandidate {
  sheetName: string;
  address: string;
  text: string;
}

export interface DocumentTemplateValidationSnapshot {
  sourceFileName: string;
  primarySheetName: string;
  sheetNames: string[];
  titleCandidates: DocumentTemplateTitleCandidate[];
  canProceed: boolean;
  messages: string[];
  detectedTemplateFamily?: string;
}

export interface ScheduleDocumentTemplateProfile {
  kind: "schedule";
  templateFamily: SchedulePlanTemplateVariant;
  layout: SchedulePlanTemplateLayout;
}

export interface GenericDocumentTemplateProfile {
  kind: "generic";
  primarySheetName: string;
  fieldMappings: Record<string, string>;
}

export type DocumentTemplateProfile =
  | ScheduleDocumentTemplateProfile
  | GenericDocumentTemplateProfile;
