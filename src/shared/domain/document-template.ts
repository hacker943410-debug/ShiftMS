import type {
  SchedulePlanTemplateLayout,
  SchedulePlanTemplateVariant
} from "./schedule-plan";
import type { TemplateType } from "./model";

export interface DocumentTemplateTitleCandidate {
  sheetName: string;
  address: string;
  text: string;
}

export type DocumentTemplateSemanticZoneRole =
  | "sheet"
  | "header"
  | "title"
  | "field"
  | "summary"
  | "table"
  | "week"
  | "notes"
  | "logo"
  | "footer";

export type DocumentTemplateSemanticBindingType = "sheet" | "cell" | "row" | "column" | "block";

export interface DocumentTemplateSemanticZone {
  id: string;
  label: string;
  description: string;
  role: DocumentTemplateSemanticZoneRole;
  bindingType: DocumentTemplateSemanticBindingType;
  sheetName?: string;
  fieldKey?: string;
  bindings: string[];
}

export interface DocumentTemplateSuggestedLabel {
  fieldKey: string;
  label: string;
  description: string;
}

export interface DocumentTemplateStyleSpec {
  columnWidths?: Record<string, number>;
  rowHeights?: Record<string, number>;
  fontSizes?: Record<string, number>;
  fontColors?: Record<string, string>;
  fillColors?: Record<string, string>;
  horizontalAlignments?: Record<string, "left" | "center" | "right">;
  mergedRanges?: Record<string, string>;
}

export interface DocumentTemplateCanvasBounds {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export interface DocumentTemplateCanvasLabel {
  id: string;
  text: string;
  row: number;
  column: number;
}

export interface DocumentTemplateCanvasZone {
  id: string;
  label: string;
  description: string;
  role: DocumentTemplateSemanticZoneRole;
  bindingType: DocumentTemplateSemanticBindingType;
  fieldKey?: string;
  bindings: string[];
  bounds: DocumentTemplateCanvasBounds;
}

export interface DocumentTemplateCanvasSnapshot {
  templateType: TemplateType;
  sheetName: string;
  maxRow: number;
  maxColumn: number;
  zones: DocumentTemplateCanvasZone[];
  labels: DocumentTemplateCanvasLabel[];
}

export interface DocumentTemplateValidationSnapshot {
  sourceFileName: string;
  primarySheetName: string;
  sheetNames: string[];
  titleCandidates: DocumentTemplateTitleCandidate[];
  canProceed: boolean;
  messages: string[];
  detectedTemplateFamily?: string;
  detectedZones: DocumentTemplateSemanticZone[];
  canvasSnapshot: DocumentTemplateCanvasSnapshot | null;
  inspectionWarnings: string[];
  suggestedLabels: DocumentTemplateSuggestedLabel[];
}

interface DocumentTemplateEditorConfig {
  editorSchemaVersion: string;
  semanticZones: DocumentTemplateSemanticZone[];
  styleSpec: DocumentTemplateStyleSpec;
  advancedBindings?: Record<string, string>;
}

export interface ScheduleDocumentTemplateProfile extends DocumentTemplateEditorConfig {
  kind: Extract<TemplateType, "schedule">;
  templateFamily: SchedulePlanTemplateVariant;
  layout: SchedulePlanTemplateLayout;
}

export interface ProposalDocumentTemplateProfile extends DocumentTemplateEditorConfig {
  kind: Extract<TemplateType, "proposal">;
  primarySheetName: string;
  fieldMappings: Record<string, string>;
}

export interface AttachmentOneDocumentTemplateProfile extends DocumentTemplateEditorConfig {
  kind: Extract<TemplateType, "attachment1">;
  primarySheetName: string;
  fieldMappings: Record<string, string>;
}

export interface AttachmentTwoDocumentTemplateProfile extends DocumentTemplateEditorConfig {
  kind: Extract<TemplateType, "attachment2">;
  primarySheetName: string;
  fieldMappings: Record<string, string>;
}

export interface LegacyGenericDocumentTemplateProfile {
  kind: "generic";
  primarySheetName: string;
  fieldMappings: Record<string, string>;
}

export type NonScheduleDocumentTemplateProfile =
  | ProposalDocumentTemplateProfile
  | AttachmentOneDocumentTemplateProfile
  | AttachmentTwoDocumentTemplateProfile;

export type DocumentTemplateProfile =
  | ScheduleDocumentTemplateProfile
  | NonScheduleDocumentTemplateProfile;
