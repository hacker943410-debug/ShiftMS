import type {
  DocumentTemplateProfile,
  DocumentTemplateSemanticZone,
  DocumentTemplateStyleSpec,
  DocumentTemplateSuggestedLabel,
  DocumentTemplateValidationSnapshot,
  LegacyGenericDocumentTemplateProfile,
  NonScheduleDocumentTemplateProfile,
  ScheduleDocumentTemplateProfile
} from "../../shared/domain/document-template";
import type { DocumentTemplateVersion, TemplateType } from "../../shared/domain/model";

export interface ProposalTemplateFieldMappings {
  sheetName: string;
  workMonthCell: string;
  printedDateCell: string;
  ownerDepartmentCell: string;
  systemNameCell: string;
  documentTitleCell: string;
  summaryIntroCell: string;
  scopeCell: string;
  targetHeadcountCell: string;
  sectionTitleCell: string;
  dataStartRow: number;
}

export interface AttachmentOneTemplateFieldMappings {
  sheetName: string;
  titleCell: string;
  dataStartRow: number;
}

export interface AttachmentTwoTemplateFieldMappings {
  sheetName: string;
  titleCell: string;
  dateRangeCell: string;
  dataStartRow: number;
}

type NonScheduleTemplateType = Exclude<TemplateType, "schedule">;

type ProposalTemplateFieldMappingInput = Omit<ProposalTemplateFieldMappings, "dataStartRow"> & {
  dataStartRow: string;
};

type AttachmentOneTemplateFieldMappingInput = Omit<AttachmentOneTemplateFieldMappings, "dataStartRow"> & {
  dataStartRow: string;
};

type AttachmentTwoTemplateFieldMappingInput = Omit<AttachmentTwoTemplateFieldMappings, "dataStartRow"> & {
  dataStartRow: string;
};

type NonScheduleFieldMappingInputByType = {
  proposal: ProposalTemplateFieldMappingInput;
  attachment1: AttachmentOneTemplateFieldMappingInput;
  attachment2: AttachmentTwoTemplateFieldMappingInput;
};

interface FieldLabelDefinition {
  label: string;
  description: string;
}

const CURRENT_TEMPLATE_PROFILE_SCHEMA_VERSION = "2";

const defaultNonScheduleFieldMappingsByType: NonScheduleFieldMappingInputByType = {
  proposal: {
    sheetName: "품의서",
    workMonthCell: "C5",
    printedDateCell: "E5",
    ownerDepartmentCell: "C6",
    systemNameCell: "C7",
    documentTitleCell: "A12",
    summaryIntroCell: "C13",
    scopeCell: "B16",
    targetHeadcountCell: "B17",
    sectionTitleCell: "B19",
    dataStartRow: "22"
  },
  attachment1: {
    sheetName: "별첨1",
    titleCell: "A1",
    dataStartRow: "5"
  },
  attachment2: {
    sheetName: "별첨2",
    titleCell: "B1",
    dateRangeCell: "G2",
    dataStartRow: "5"
  }
};

const nonScheduleFieldDefinitions: Record<NonScheduleTemplateType, Record<string, FieldLabelDefinition>> = {
  proposal: {
    sheetName: {
      label: "출력 시트",
      description: "실제 품의서를 채워 넣는 작업 시트입니다."
    },
    workMonthCell: {
      label: "대상 월 위치",
      description: "대상 월이 표시되는 자리입니다."
    },
    printedDateCell: {
      label: "출력일 위치",
      description: "문서 출력일이 표시되는 자리입니다."
    },
    ownerDepartmentCell: {
      label: "부서명 위치",
      description: "부서명이 표시되는 자리입니다."
    },
    systemNameCell: {
      label: "상단 안내 위치",
      description: "시스템명 또는 상단 안내 문구가 표시되는 자리입니다."
    },
    documentTitleCell: {
      label: "문서 제목 위치",
      description: "문서 제목이 표시되는 자리입니다."
    },
    summaryIntroCell: {
      label: "요약 문구 위치",
      description: "상단 요약 안내 문구가 표시되는 자리입니다."
    },
    scopeCell: {
      label: "지급 범위 위치",
      description: "지급 범위 안내가 표시되는 자리입니다."
    },
    targetHeadcountCell: {
      label: "대상 인원 위치",
      description: "대상 인원 안내가 표시되는 자리입니다."
    },
    sectionTitleCell: {
      label: "표 제목 위치",
      description: "지급 표 바로 위 제목이 표시되는 자리입니다."
    },
    dataStartRow: {
      label: "지급 표 시작 줄",
      description: "실제 지급 표가 시작되는 줄입니다."
    }
  },
  attachment1: {
    sheetName: {
      label: "출력 시트",
      description: "실제 별첨1을 채워 넣는 작업 시트입니다."
    },
    titleCell: {
      label: "제목 위치",
      description: "문서 제목이 표시되는 자리입니다."
    },
    dataStartRow: {
      label: "상세 표 시작 줄",
      description: "상세 표가 시작되는 줄입니다."
    }
  },
  attachment2: {
    sheetName: {
      label: "출력 시트",
      description: "실제 별첨2를 채워 넣는 작업 시트입니다."
    },
    titleCell: {
      label: "제목 위치",
      description: "문서 제목이 표시되는 자리입니다."
    },
    dateRangeCell: {
      label: "기간 표시 위치",
      description: "대상 기간이 표시되는 자리입니다."
    },
    dataStartRow: {
      label: "상세 표 시작 줄",
      description: "상세 표가 시작되는 줄입니다."
    }
  }
};

const scheduleFieldDefinitions: Array<{
  fieldKey: "sheetName" | "siteNameCell" | "monthTitleCell" | "rosterSummaryCell" | "changeReasonColumn";
  label: string;
  description: string;
}> = [
  {
    fieldKey: "sheetName",
    label: "작업 시트",
    description: "근무표를 읽어 오는 기준 시트입니다."
  },
  {
    fieldKey: "siteNameCell",
    label: "근무지 이름 위치",
    description: "근무지명이 표시되는 자리입니다."
  },
  {
    fieldKey: "monthTitleCell",
    label: "대상 월 위치",
    description: "대상 월이 표시되는 자리입니다."
  },
  {
    fieldKey: "rosterSummaryCell",
    label: "근무조 요약 위치",
    description: "근무조 요약이 시작되는 자리입니다."
  },
  {
    fieldKey: "changeReasonColumn",
    label: "변경 메모 칸",
    description: "변경 메모가 적히는 칸입니다."
  }
];

const toPositiveRowNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value ?? "");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const createEmptyStyleSpec = (): DocumentTemplateStyleSpec => ({});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isLegacyGenericProfile = (profile: unknown): profile is LegacyGenericDocumentTemplateProfile =>
  isRecord(profile) && profile.kind === "generic" && typeof profile.primarySheetName === "string";

const isScheduleProfile = (profile: unknown): profile is ScheduleDocumentTemplateProfile =>
  isRecord(profile) && profile.kind === "schedule" && isRecord(profile.layout);

const isNonScheduleProfile = (
  templateType: NonScheduleTemplateType,
  profile: unknown
): profile is NonScheduleDocumentTemplateProfile =>
  isRecord(profile) &&
  profile.kind === templateType &&
  typeof profile.primarySheetName === "string" &&
  isRecord(profile.fieldMappings);

const createNonScheduleSuggestedLabels = (
  templateType: NonScheduleTemplateType
): DocumentTemplateSuggestedLabel[] =>
  Object.entries(nonScheduleFieldDefinitions[templateType]).map(([fieldKey, definition]) => ({
    fieldKey,
    label: definition.label,
    description: definition.description
  }));

const createScheduleSuggestedLabels = (): DocumentTemplateSuggestedLabel[] =>
  scheduleFieldDefinitions.map((definition) => ({
    fieldKey: definition.fieldKey,
    label: definition.label,
    description: definition.description
  }));

const createSemanticZone = (input: {
  id: string;
  label: string;
  description: string;
  role: DocumentTemplateSemanticZone["role"];
  bindingType: DocumentTemplateSemanticZone["bindingType"];
  sheetName?: string;
  fieldKey?: string;
  bindings: string[];
}): DocumentTemplateSemanticZone => ({
  id: input.id,
  label: input.label,
  description: input.description,
  role: input.role,
  bindingType: input.bindingType,
  sheetName: input.sheetName,
  fieldKey: input.fieldKey,
  bindings: input.bindings
});

const createNonScheduleSemanticZones = (
  templateType: NonScheduleTemplateType,
  primarySheetName: string,
  fieldMappings: Record<string, string>
): DocumentTemplateSemanticZone[] =>
  createNonScheduleSuggestedLabels(templateType).map((suggestion) =>
    createSemanticZone({
      id: `${templateType}-${suggestion.fieldKey}`,
      label: suggestion.label,
      description: suggestion.description,
      role:
        suggestion.fieldKey === "sheetName"
          ? "sheet"
          : suggestion.fieldKey.endsWith("Row")
            ? "table"
            : suggestion.fieldKey.toLowerCase().includes("title")
              ? "title"
              : "field",
      bindingType:
        suggestion.fieldKey === "sheetName"
          ? "sheet"
          : suggestion.fieldKey.endsWith("Row")
            ? "row"
            : "cell",
      sheetName: fieldMappings.sheetName ?? primarySheetName,
      fieldKey: suggestion.fieldKey,
      bindings:
        suggestion.fieldKey === "sheetName"
          ? [fieldMappings.sheetName ?? primarySheetName]
          : [fieldMappings[suggestion.fieldKey] ?? ""].filter(Boolean)
    })
  );

const createScheduleSemanticZones = (
  profile: Pick<ScheduleDocumentTemplateProfile, "layout">
): DocumentTemplateSemanticZone[] => {
  const { layout } = profile;

  return [
    createSemanticZone({
      id: "schedule-sheet",
      label: "작업 시트",
      description: "근무표를 읽어 오는 기준 시트입니다.",
      role: "sheet",
      bindingType: "sheet",
      sheetName: layout.sheetName,
      fieldKey: "sheetName",
      bindings: [layout.sheetName]
    }),
    createSemanticZone({
      id: "schedule-site-name",
      label: "근무지 이름 위치",
      description: "근무지명이 표시되는 자리입니다.",
      role: "header",
      bindingType: "cell",
      sheetName: layout.sheetName,
      fieldKey: "siteNameCell",
      bindings: [layout.siteNameCell]
    }),
    createSemanticZone({
      id: "schedule-month-title",
      label: "대상 월 위치",
      description: "대상 월이 표시되는 자리입니다.",
      role: "title",
      bindingType: "cell",
      sheetName: layout.sheetName,
      fieldKey: "monthTitleCell",
      bindings: [layout.monthTitleCell, ...layout.monthAnchorCells]
    }),
    createSemanticZone({
      id: "schedule-roster-summary",
      label: "근무조 요약 위치",
      description: "근무조 요약이 시작되는 자리입니다.",
      role: "summary",
      bindingType: "cell",
      sheetName: layout.sheetName,
      fieldKey: "rosterSummaryCell",
      bindings: [layout.rosterSummaryCell]
    }),
    ...layout.weekBlocks.map((weekBlock, index) =>
      createSemanticZone({
        id: `schedule-week-${index + 1}`,
        label: `주간 일정 영역 ${index + 1}`,
        description: `${index + 1}번째 주간 일정 영역입니다.`,
        role: "week",
        bindingType: "block",
        sheetName: layout.sheetName,
        bindings: weekBlock.daySlots.flatMap((daySlot) => [
          daySlot.dateAddress,
          ...Object.values(daySlot.dutyCellAddresses).flat()
        ])
      })
    ),
    createSemanticZone({
      id: "schedule-change-reason",
      label: "변경 메모 칸",
      description: "변경 메모가 적히는 칸입니다.",
      role: "notes",
      bindingType: "column",
      sheetName: layout.sheetName,
      fieldKey: "changeReasonColumn",
      bindings: [
        layout.changeReasonColumn,
        ...(layout.changeReasonColumns ?? []).filter(Boolean)
      ]
    })
  ];
};

const ensureNonScheduleFieldMappings = <T extends NonScheduleTemplateType>(
  templateType: T,
  primarySheetName: string,
  fieldMappings?: Record<string, string>
) => ({
  ...defaultNonScheduleFieldMappingsByType[templateType],
  ...(fieldMappings ?? {}),
  sheetName: fieldMappings?.sheetName ?? primarySheetName
}) as NonScheduleFieldMappingInputByType[T];

export const createDefaultGenericFieldMappings = <T extends NonScheduleTemplateType>(
  templateType: T,
  primarySheetName: string
): NonScheduleFieldMappingInputByType[T] => ({
  ...defaultNonScheduleFieldMappingsByType[templateType],
  sheetName: primarySheetName
});

export const createDefaultNonScheduleTemplateProfile = (
  templateType: NonScheduleTemplateType,
  primarySheetName: string
): NonScheduleDocumentTemplateProfile => {
  const fieldMappings = ensureNonScheduleFieldMappings(templateType, primarySheetName);

  return {
    kind: templateType,
    primarySheetName,
    fieldMappings,
    editorSchemaVersion: CURRENT_TEMPLATE_PROFILE_SCHEMA_VERSION,
    semanticZones: createNonScheduleSemanticZones(templateType, primarySheetName, fieldMappings),
    styleSpec: createEmptyStyleSpec()
  };
};

export const createFallbackScheduleTemplateProfile = (
  primarySheetName: string
): ScheduleDocumentTemplateProfile => ({
  kind: "schedule",
  templateFamily: "sample1",
  layout: {
    variant: "sample1",
    sheetName: primarySheetName,
    siteNameCell: "A1",
    monthTitleCell: "A2",
    rosterSummaryCell: "A3",
    monthAnchorCells: [],
    weekBlocks: [],
    rescheduleDateCells: [],
    supportedWorkingDutyCodes: ["D", "E", "N"],
    regularPlanColumns: {},
    changedPlanColumns: {},
    changeReasonColumn: "A",
    changeReasonColumns: ["A"]
  },
  editorSchemaVersion: CURRENT_TEMPLATE_PROFILE_SCHEMA_VERSION,
  semanticZones: [],
  styleSpec: createEmptyStyleSpec()
});

export const normalizeDocumentTemplateProfile = (
  templateType: TemplateType,
  profile: unknown,
  primarySheetName?: string
): DocumentTemplateProfile | undefined => {
  if (templateType === "schedule") {
    if (!isScheduleProfile(profile)) {
      return undefined;
    }

    return {
      ...profile,
      editorSchemaVersion:
        typeof profile.editorSchemaVersion === "string"
          ? profile.editorSchemaVersion
          : CURRENT_TEMPLATE_PROFILE_SCHEMA_VERSION,
      semanticZones:
        Array.isArray(profile.semanticZones) && profile.semanticZones.length > 0
          ? profile.semanticZones
          : createScheduleSemanticZones(profile),
      styleSpec: isRecord(profile.styleSpec)
        ? (profile.styleSpec as DocumentTemplateStyleSpec)
        : createEmptyStyleSpec(),
      advancedBindings: isRecord(profile.advancedBindings)
        ? (profile.advancedBindings as Record<string, string>)
        : undefined
    };
  }

  const fallbackPrimarySheetName =
    primarySheetName ?? (isRecord(profile) && typeof profile.primarySheetName === "string"
      ? profile.primarySheetName
      : defaultNonScheduleFieldMappingsByType[templateType].sheetName);

  if (isNonScheduleProfile(templateType, profile)) {
    const fieldMappings = ensureNonScheduleFieldMappings(
      templateType,
      fallbackPrimarySheetName,
      profile.fieldMappings
    );

    return {
      ...profile,
      kind: templateType,
      primarySheetName: fallbackPrimarySheetName,
      fieldMappings,
      editorSchemaVersion:
        typeof profile.editorSchemaVersion === "string"
          ? profile.editorSchemaVersion
          : CURRENT_TEMPLATE_PROFILE_SCHEMA_VERSION,
      semanticZones:
        Array.isArray(profile.semanticZones) && profile.semanticZones.length > 0
          ? profile.semanticZones
          : createNonScheduleSemanticZones(templateType, fallbackPrimarySheetName, fieldMappings),
      styleSpec: isRecord(profile.styleSpec)
        ? (profile.styleSpec as DocumentTemplateStyleSpec)
        : createEmptyStyleSpec(),
      advancedBindings: isRecord(profile.advancedBindings)
        ? (profile.advancedBindings as Record<string, string>)
        : undefined
    };
  }

  if (isLegacyGenericProfile(profile)) {
    const fieldMappings = ensureNonScheduleFieldMappings(
      templateType,
      profile.primarySheetName,
      profile.fieldMappings
    );

    return {
      kind: templateType,
      primarySheetName: profile.primarySheetName,
      fieldMappings,
      editorSchemaVersion: CURRENT_TEMPLATE_PROFILE_SCHEMA_VERSION,
      semanticZones: createNonScheduleSemanticZones(templateType, profile.primarySheetName, fieldMappings),
      styleSpec: createEmptyStyleSpec()
    };
  }

  return createDefaultNonScheduleTemplateProfile(templateType, fallbackPrimarySheetName);
};

export const normalizeDocumentTemplateValidationSnapshot = (input: {
  templateType: TemplateType;
  validation?: DocumentTemplateValidationSnapshot;
  profile?: DocumentTemplateProfile;
  primarySheetName: string;
}): DocumentTemplateValidationSnapshot | undefined => {
  if (!input.validation) {
    return undefined;
  }

  const fallbackDetectedZones =
    input.profile?.kind === "schedule"
      ? createScheduleSemanticZones(input.profile)
      : input.profile
        ? createNonScheduleSemanticZones(
            input.templateType as NonScheduleTemplateType,
            input.profile.primarySheetName,
            input.profile.fieldMappings
          )
        : [];

  const fallbackSuggestedLabels =
    input.templateType === "schedule"
      ? createScheduleSuggestedLabels()
      : createNonScheduleSuggestedLabels(input.templateType as NonScheduleTemplateType);

  return {
    ...input.validation,
    primarySheetName: input.validation.primarySheetName || input.primarySheetName,
    canvasSnapshot: input.validation.canvasSnapshot ?? null,
    detectedZones:
      Array.isArray(input.validation.detectedZones) && input.validation.detectedZones.length > 0
        ? input.validation.detectedZones
        : fallbackDetectedZones,
    inspectionWarnings: Array.isArray(input.validation.inspectionWarnings)
      ? input.validation.inspectionWarnings
      : [],
    suggestedLabels:
      Array.isArray(input.validation.suggestedLabels) && input.validation.suggestedLabels.length > 0
        ? input.validation.suggestedLabels
        : fallbackSuggestedLabels
  };
};

const getNonScheduleFieldMappings = <T extends NonScheduleTemplateType>(
  templateType: T,
  template: Pick<DocumentTemplateVersion, "profile" | "validation">
): NonScheduleFieldMappingInputByType[T] => {
  const normalizedProfile = normalizeDocumentTemplateProfile(
    templateType,
    template.profile,
    template.validation?.primarySheetName
  );

  if (!normalizedProfile || normalizedProfile.kind === "schedule") {
    return ensureNonScheduleFieldMappings(
      templateType,
      template.validation?.primarySheetName ?? defaultNonScheduleFieldMappingsByType[templateType].sheetName
    );
  }

  return ensureNonScheduleFieldMappings(
    templateType,
    normalizedProfile.primarySheetName,
    normalizedProfile.fieldMappings
  );
};

export const resolveProposalTemplateFields = (
  template: Pick<DocumentTemplateVersion, "profile" | "validation">
): ProposalTemplateFieldMappings => {
  const mappings = getNonScheduleFieldMappings("proposal", template);

  return {
    sheetName: mappings.sheetName,
    workMonthCell: mappings.workMonthCell,
    printedDateCell: mappings.printedDateCell,
    ownerDepartmentCell: mappings.ownerDepartmentCell,
    systemNameCell: mappings.systemNameCell,
    documentTitleCell: mappings.documentTitleCell,
    summaryIntroCell: mappings.summaryIntroCell,
    scopeCell: mappings.scopeCell,
    targetHeadcountCell: mappings.targetHeadcountCell,
    sectionTitleCell: mappings.sectionTitleCell,
    dataStartRow: toPositiveRowNumber(mappings.dataStartRow, 22)
  };
};

export const resolveAttachmentOneTemplateFields = (
  template: Pick<DocumentTemplateVersion, "profile" | "validation">
): AttachmentOneTemplateFieldMappings => {
  const mappings = getNonScheduleFieldMappings("attachment1", template);

  return {
    sheetName: mappings.sheetName,
    titleCell: mappings.titleCell,
    dataStartRow: toPositiveRowNumber(mappings.dataStartRow, 5)
  };
};

export const resolveAttachmentTwoTemplateFields = (
  template: Pick<DocumentTemplateVersion, "profile" | "validation">
): AttachmentTwoTemplateFieldMappings => {
  const mappings = getNonScheduleFieldMappings("attachment2", template);

  return {
    sheetName: mappings.sheetName,
    titleCell: mappings.titleCell,
    dateRangeCell: mappings.dateRangeCell,
    dataStartRow: toPositiveRowNumber(mappings.dataStartRow, 5)
  };
};

export const getGenericTemplateFieldLabels = (
  templateType: NonScheduleTemplateType
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(nonScheduleFieldDefinitions[templateType]).map(([fieldKey, definition]) => [
      fieldKey,
      definition.label
    ])
  );

export const isGenericTemplateRowField = (fieldKey: string) => fieldKey.endsWith("Row");

export const getCurrentDocumentTemplateProfileSchemaVersion = () =>
  CURRENT_TEMPLATE_PROFILE_SCHEMA_VERSION;
