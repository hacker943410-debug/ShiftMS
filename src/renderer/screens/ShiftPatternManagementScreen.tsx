import { useEffect, useMemo, useState } from "react";

import type {
  AppSettingsUpdateInput,
  AppSettingsSnapshot,
  DocumentTemplateFileSelection,
  DocumentTemplatePreviewRecord,
  FileWatchStatusSnapshot
} from "@shared/bridge/contracts";
import type {
  DocumentTemplateProfile,
  DocumentTemplateValidationSnapshot
} from "@shared/domain/document-template";
import type {
  AllowanceRateVersion,
  DocumentTemplateHistoryRecord,
  DocumentTemplateVersion,
  HolidayCalendar,
  TemplateType,
  UserRecord
} from "@shared/domain/model";

import { FormSelect } from "../components/FormSelect";

const userRoleLabel: Record<UserRecord["role"], string> = {
  admin: "관리자",
  operator: "사용자"
};

const userStatusLabel: Record<UserRecord["status"], string> = {
  active: "사용중",
  inactive: "중지",
  pending: "대기"
};

const templateTypeLabel: Record<TemplateType, string> = {
  schedule: "근무표 양식",
  proposal: "품의서 양식",
  attachment1: "별첨1 양식",
  attachment2: "별첨2 양식"
};

const templateStatusLabel: Record<DocumentTemplateVersion["status"], string> = {
  pending: "미승인",
  approved: "승인"
};

const defaultTemplateOutputFileNamePattern: Record<TemplateType, string> = {
  schedule: "{siteName}_{scheduleMonth}_{patternName}.xlsx",
  proposal: "품의서_{workMonth}.xlsx",
  attachment1: "별첨1_{workMonth}.xlsx",
  attachment2: "별첨2_{workMonth}.xlsx"
};

const templateOutputTokenGuide: Record<TemplateType, string> = {
  schedule: "{siteName}, {scheduleMonth}, {patternName}, {templateVersion}",
  proposal: "{workMonth}, {templateVersion}",
  attachment1: "{workMonth}, {templateVersion}",
  attachment2: "{workMonth}, {templateVersion}"
};

const templateHistoryActionLabel: Record<DocumentTemplateHistoryRecord["actionType"], string> = {
  registered: "등록",
  updated: "수정",
  approved: "승인",
  "set-default": "기본 전환",
  deleted: "삭제"
};

const genericTemplateFieldLabels: Record<
  Exclude<TemplateType, "schedule">,
  Record<string, string>
> = {
  proposal: {
    sheetName: "출력 시트",
    workMonthCell: "대상월 셀",
    printedDateCell: "출력일 셀",
    ownerDepartmentCell: "부서 셀",
    systemNameCell: "시스템명 셀",
    documentTitleCell: "문서 제목 셀",
    summaryIntroCell: "요약 문구 셀",
    scopeCell: "지급 범위 셀",
    targetHeadcountCell: "대상자 셀",
    sectionTitleCell: "섹션 제목 셀",
    dataStartRow: "표 시작 행"
  },
  attachment1: {
    sheetName: "출력 시트",
    titleCell: "제목 셀",
    dataStartRow: "표 시작 행"
  },
  attachment2: {
    sheetName: "출력 시트",
    titleCell: "제목 셀",
    dateRangeCell: "기간 셀",
    dataStartRow: "표 시작 행"
  }
};

const getTemplateFileName = (sourcePath: string) => sourcePath.split(/[/\\]/).pop() ?? sourcePath;

const getManagedTemplateFileName = (template: Pick<DocumentTemplateVersion, "id" | "sourcePath">) => {
  const fileName = getTemplateFileName(template.sourcePath);
  const legacyPrefix = `${template.id}_`;

  return fileName.startsWith(legacyPrefix) ? fileName.slice(legacyPrefix.length) : fileName;
};

const getTemplateOutputPattern = (template: DocumentTemplateVersion) =>
  template.outputFileNamePattern ?? defaultTemplateOutputFileNamePattern[template.templateType];

const getScheduleTemplateVariant = (template: DocumentTemplateVersion) => {
  if (template.templateType !== "schedule") {
    return null;
  }

  const fileName = getManagedTemplateFileName(template);

  if (fileName.includes("근무표_템플릿2")) {
    return "sample2";
  }

  return "sample1";
};

const getTemplateUsageNote = (template: DocumentTemplateVersion) => {
  if (template.templateType !== "schedule") {
    return "배포 시 최신 버전이 기본으로 사용됩니다.";
  }

  return getScheduleTemplateVariant(template) === "sample2"
    ? "6조 2교대(D/N) 전용 배포 양식"
    : "Day / Evening / Night 일반형 배포 양식";
};

const getTemplateChangePolicy = (template: DocumentTemplateVersion) => {
  if (template.templateType !== "schedule") {
    return "기존 파일을 덮어쓰기보다 새 버전으로 추가 등록하는 방식이 안전합니다.";
  }

  return "운영 중인 양식은 직접 덮어쓰지 말고, 수정본을 새 버전으로 등록해야 합니다.";
};

const createTemplateEditVersionLabel = (template: DocumentTemplateVersion) => {
  return template.versionLabel;
};

const getGenericFieldLabel = (
  templateType: Exclude<TemplateType, "schedule">,
  fieldKey: string
) => genericTemplateFieldLabels[templateType][fieldKey] ?? fieldKey;

const isGenericRowField = (fieldKey: string) => fieldKey.endsWith("Row");

const getMultiplier = (version: AllowanceRateVersion, allowanceCode: string) =>
  version.items.find((item) => item.allowanceCode === allowanceCode)?.multiplier ?? "-";

const fileWatchEventLabel: Record<FileWatchStatusSnapshot["recentEvents"][number]["type"], string> = {
  "file-added": "파일 추가",
  "file-changed": "파일 변경",
  "file-removed": "파일 제거",
  "watcher-error": "감시 오류"
};

const fileWatchDirectoryLabel: Record<
  FileWatchStatusSnapshot["recentEvents"][number]["directoryType"],
  string
> = {
  pending: "승인대기",
  approved: "승인완료",
  unknown: "미확인"
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate()
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
};

const createSettingsForm = (settings?: AppSettingsSnapshot | null): AppSettingsUpdateInput => ({
  holidayApiBaseUrl: settings?.holidayApiBaseUrl ?? "",
  pendingDir: settings?.pendingDir ?? "",
  approvedDir: settings?.approvedDir ?? "",
  scheduleExportDir: settings?.scheduleExportDir ?? ""
});

const templateTypeOptions: TemplateType[] = [
  "schedule",
  "proposal",
  "attachment1",
  "attachment2"
];

const createTemplateCandidateLabel = (address: string, text?: string) =>
  text ? `${address} · ${text}` : address;

const getCellAddressOptions = (validation?: DocumentTemplateValidationSnapshot) =>
  validation?.titleCandidates ?? [];

const getCellAddressOptionsWithCurrent = (
  validation: DocumentTemplateValidationSnapshot | null,
  currentAddress?: string
) => {
  const base = getCellAddressOptions(validation ?? undefined);

  if (!currentAddress) {
    return base;
  }

  if (base.some((candidate) => candidate.address === currentAddress)) {
    return base;
  }

  return [
    {
      sheetName: validation?.primarySheetName ?? "-",
      address: currentAddress,
      text: "현재 설정"
    },
    ...base
  ];
};

const toColumnAddress = (address: string) => address.replace(/\d+/g, "");

export const ShiftPatternManagementScreen = () => {
  const [settings, setSettings] = useState<AppSettingsSnapshot | null>(null);
  const [settingsForm, setSettingsForm] = useState<AppSettingsUpdateInput>(createSettingsForm());
  const [fileWatchStatus, setFileWatchStatus] = useState<FileWatchStatusSnapshot | null>(null);
  const [holidayCalendars, setHolidayCalendars] = useState<HolidayCalendar[]>([]);
  const [rateVersions, setRateVersions] = useState<AllowanceRateVersion[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplateVersion[]>([]);
  const [templateHistory, setTemplateHistory] = useState<DocumentTemplateHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isWatchActionRunning, setIsWatchActionRunning] = useState(false);
  const [isTemplateActionRunning, setIsTemplateActionRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateWizardStep, setTemplateWizardStep] = useState<1 | 2>(1);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateTypeInput, setTemplateTypeInput] = useState<TemplateType>("schedule");
  const [templateVersionLabelInput, setTemplateVersionLabelInput] = useState("");
  const [templateManagedFileNameInput, setTemplateManagedFileNameInput] = useState("");
  const [selectedTemplateSource, setSelectedTemplateSource] =
    useState<DocumentTemplateFileSelection | null>(null);
  const [templateValidation, setTemplateValidation] =
    useState<DocumentTemplateValidationSnapshot | null>(null);
  const [templateProfileDraft, setTemplateProfileDraft] = useState<DocumentTemplateProfile | null>(
    null
  );
  const [templatePreviewRecord, setTemplatePreviewRecord] =
    useState<DocumentTemplatePreviewRecord | null>(null);

  useEffect(() => {
    let active = true;

    const loadOperationsData = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      const [
        settingsResult,
        watchStatusResult,
        holidayResult,
        rateResult,
        usersResult,
        templatesResult,
        templateHistoryResult
      ] = await Promise.all([
        window.appBridge.getAppSettings(),
        window.appBridge.getFileWatchStatus(),
        window.appBridge.listHolidayCalendars(),
        window.appBridge.listAllowanceRateVersions(),
        window.appBridge.listOperationUsers(),
        window.appBridge.listDocumentTemplateVersions(),
        window.appBridge.listDocumentTemplateHistory()
      ]);

      if (!active) {
        return;
      }

      if (!settingsResult.ok) {
        setErrorMessage(settingsResult.message);
      } else {
        setSettings(settingsResult.data);
        setSettingsForm(createSettingsForm(settingsResult.data));
      }

      if (watchStatusResult.ok) {
        setFileWatchStatus(watchStatusResult.data);
      }

      if (!holidayResult.ok) {
        setErrorMessage(holidayResult.message);
      } else {
        setHolidayCalendars(holidayResult.data);
      }

      if (!rateResult.ok) {
        setErrorMessage(rateResult.message);
      } else {
        setRateVersions(rateResult.data);
      }

      if (!usersResult.ok) {
        setErrorMessage(usersResult.message);
      } else {
        setUsers(usersResult.data);
      }

      if (!templatesResult.ok) {
        setErrorMessage(templatesResult.message);
      } else {
        setTemplates(templatesResult.data);
      }

      if (!templateHistoryResult.ok) {
        setErrorMessage(templateHistoryResult.message);
      } else {
        setTemplateHistory(templateHistoryResult.data);
      }

      setIsLoading(false);
    };

    void loadOperationsData();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;

    const loadFileWatchStatus = async () => {
      const result = await window.appBridge.getFileWatchStatus();

      if (!active || !result.ok) {
        return;
      }

      setFileWatchStatus(result.data);
    };

    void loadFileWatchStatus();

    const intervalId = window.setInterval(() => {
      void loadFileWatchStatus();
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const handleSettingsFieldChange = (
    field: keyof AppSettingsUpdateInput,
    value: string
  ) => {
    setSettingsForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleSaveSettings = async () => {
    setActionError(null);
    setActionMessage(null);
    setIsSaving(true);

    try {
      const result = await window.appBridge.saveAppSettings(settingsForm);

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setSettings(result.data);
      setSettingsForm(createSettingsForm(result.data));
      setActionMessage(
        fileWatchStatus?.isRunning
          ? "운영 경로 설정을 저장했습니다. 감시 재시작 후 새 경로가 적용됩니다."
          : "운영 경로 설정을 저장했습니다."
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "설정 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileWatchAction = async (action: "restart" | "stop") => {
    setActionError(null);
    setActionMessage(null);
    setIsWatchActionRunning(true);

    try {
      const result =
        action === "restart"
          ? await window.appBridge.restartFileWatch()
          : await window.appBridge.stopFileWatch();

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setFileWatchStatus(result.data);
      setActionMessage(
        action === "restart"
          ? "파일 감시를 재시작했습니다."
          : "파일 감시를 중지했습니다."
      );
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "파일 감시 제어 중 오류가 발생했습니다.");
    } finally {
      setIsWatchActionRunning(false);
    }
  };

  const resetTemplateWizard = () => {
    setTemplateWizardStep(1);
    setEditingTemplateId(null);
    setTemplateTypeInput("schedule");
    setTemplateVersionLabelInput("");
    setTemplateManagedFileNameInput("");
    setSelectedTemplateSource(null);
    setTemplateValidation(null);
    setTemplateProfileDraft(null);
    setTemplatePreviewRecord(null);
  };

  const openTemplateRegistration = () => {
    resetTemplateWizard();
    setIsTemplateModalOpen(true);
    setActionError(null);
    setActionMessage(null);
  };

  const handleCloseTemplateModal = () => {
    setIsTemplateModalOpen(false);
    resetTemplateWizard();
  };

  const handlePickTemplateFile = async () => {
    setActionError(null);
    setActionMessage(null);
    setIsTemplateActionRunning(true);

    try {
      const result = await window.appBridge.selectDocumentTemplateFile(templateTypeInput);

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setSelectedTemplateSource(result.data);
      setTemplateManagedFileNameInput(result.data?.fileName ?? "");
      setTemplateValidation(null);
      setTemplateProfileDraft(null);
      setTemplatePreviewRecord(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "양식 파일 선택 중 오류가 발생했습니다.");
    } finally {
      setIsTemplateActionRunning(false);
    }
  };

  const handleInspectTemplate = async () => {
    if (!selectedTemplateSource?.filePath) {
      setActionError("검증할 양식 파일을 먼저 가져와 주세요.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsTemplateActionRunning(true);

    try {
      const result = await window.appBridge.inspectDocumentTemplate({
        templateType: templateTypeInput,
        sourcePath: selectedTemplateSource.filePath
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setTemplateValidation(result.data);
      setTemplateProfileDraft(result.data.profile);
      setTemplatePreviewRecord(null);
      setActionMessage("1차 검증을 완료했습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "양식 검증 중 오류가 발생했습니다.");
    } finally {
      setIsTemplateActionRunning(false);
    }
  };

  const handleOpenTemplateEdit = async (template: DocumentTemplateVersion) => {
    setActionError(null);
    setActionMessage(null);
    setIsTemplateActionRunning(true);

    try {
      let nextValidation = template.validation ?? null;
      let nextProfile = template.profile ?? null;

      if (!nextValidation || !nextProfile) {
        const inspectResult = await window.appBridge.inspectDocumentTemplate({
          templateType: template.templateType,
          sourcePath: template.sourcePath
        });

        if (!inspectResult.ok) {
          setEditingTemplateId(template.id);
          setTemplateTypeInput(template.templateType);
          setTemplateVersionLabelInput(createTemplateEditVersionLabel(template));
          setTemplateManagedFileNameInput(getManagedTemplateFileName(template));
          setSelectedTemplateSource({
            fileName: getManagedTemplateFileName(template),
            filePath: template.sourcePath
          });
          setTemplateValidation(null);
          setTemplateProfileDraft(null);
          setTemplatePreviewRecord(null);
          setTemplateWizardStep(1);
          setIsTemplateModalOpen(true);
          setActionError(inspectResult.message);
          return;
        }

        nextValidation = inspectResult.data;
        nextProfile = inspectResult.data.profile;
      }

      setEditingTemplateId(template.id);
      setTemplateTypeInput(template.templateType);
      setTemplateVersionLabelInput(createTemplateEditVersionLabel(template));
      setTemplateManagedFileNameInput(getManagedTemplateFileName(template));
      setSelectedTemplateSource({
        fileName: getManagedTemplateFileName(template),
        filePath: template.sourcePath
      });
      setTemplateValidation(nextValidation);
      setTemplateProfileDraft(nextProfile);
      setTemplatePreviewRecord(null);
      setTemplateWizardStep(2);
      setIsTemplateModalOpen(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "양식 편집 준비 중 오류가 발생했습니다.");
    } finally {
      setIsTemplateActionRunning(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!selectedTemplateSource?.filePath || !templateValidation || !templateProfileDraft) {
      setActionError("저장할 양식 검증 결과가 없습니다.");
      return;
    }

    if (!templateValidation.canProceed) {
      setActionError("1차 검증을 통과한 양식만 저장할 수 있습니다.");
      return;
    }

    if (templateVersionLabelInput.trim().length === 0) {
      setActionError("버전명을 입력해 주세요.");
      return;
    }

    if (templateManagedFileNameInput.trim().length === 0) {
      setActionError("양식 보관 파일명을 입력해 주세요.");
      return;
    }

    if (editingTemplateId === null && !templatePreviewRecord) {
      setActionError("미리보기 파일을 먼저 확인한 뒤 저장해 주세요.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsTemplateActionRunning(true);

    try {
      const result = await window.appBridge.saveDocumentTemplateVersion({
        id: editingTemplateId ?? undefined,
        templateType: templateTypeInput,
        versionLabel: templateVersionLabelInput.trim(),
        sourcePath: selectedTemplateSource.filePath,
        managedFileName: templateManagedFileNameInput.trim(),
        profileSchemaVersion: "1",
        profile: templateProfileDraft,
        validation: templateValidation
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage(editingTemplateId ? "양식을 수정했습니다." : "양식을 미승인 상태로 저장했습니다.");
      handleCloseTemplateModal();
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "양식 저장 중 오류가 발생했습니다.");
    } finally {
      setIsTemplateActionRunning(false);
    }
  };

  const handlePreviewTemplate = async () => {
    if (!selectedTemplateSource?.filePath || !templateProfileDraft) {
      setActionError("미리보기할 양식 정보가 없습니다.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsTemplateActionRunning(true);

    try {
      const result = await window.appBridge.previewDocumentTemplate({
        templateType: templateTypeInput,
        versionLabel: templateVersionLabelInput.trim() || undefined,
        sourcePath: selectedTemplateSource.filePath,
        profile: templateProfileDraft
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      if (!result.data) {
        setActionMessage("미리보기 저장을 취소했습니다.");
        return;
      }

      setTemplatePreviewRecord(result.data);
      setActionMessage(`미리보기 파일을 저장했습니다. ${result.data.outputPath}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "양식 미리보기 중 오류가 발생했습니다.");
    } finally {
      setIsTemplateActionRunning(false);
    }
  };

  const handleApproveTemplate = async (templateId: string) => {
    setActionError(null);
    setActionMessage(null);
    setIsTemplateActionRunning(true);

    try {
      const result = await window.appBridge.approveDocumentTemplateVersion(templateId);

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage(
        result.data.isDefault
          ? "양식을 승인했습니다. 현재 이 버전이 기본 사용 양식입니다."
          : "양식을 승인했습니다. 배포 메뉴에서 선택 가능하며, 필요하면 기본 사용으로 전환할 수 있습니다."
      );
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "양식 승인 중 오류가 발생했습니다.");
    } finally {
      setIsTemplateActionRunning(false);
    }
  };

  const handleUpdateTemplateOutputFileName = async (template: DocumentTemplateVersion) => {
    const nextPattern = window.prompt(
      `${templateTypeLabel[template.templateType]} 출력 파일명 규칙을 입력해 주세요.\n지원 치환값: ${templateOutputTokenGuide[template.templateType]}\n비워두면 기본 규칙을 사용합니다.`,
      getTemplateOutputPattern(template)
    );

    if (nextPattern === null) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsTemplateActionRunning(true);

    try {
      const result = await window.appBridge.updateDocumentTemplateOutputFileName({
        templateId: template.id,
        outputFileNamePattern: nextPattern
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage("출력 파일명 규칙을 저장했습니다. 새로 생성되는 파일부터 적용됩니다.");
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "출력 파일명 규칙 저장 중 오류가 발생했습니다."
      );
    } finally {
      setIsTemplateActionRunning(false);
    }
  };

  const handleSetDefaultTemplate = async (template: DocumentTemplateVersion) => {
    if (template.status !== "approved") {
      setActionError("승인된 양식만 기본 사용으로 전환할 수 있습니다.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsTemplateActionRunning(true);

    try {
      const result = await window.appBridge.setDefaultDocumentTemplateVersion(template.id);

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage(
        `${templateTypeLabel[template.templateType]} 기본 사용 버전을 ${result.data.versionLabel}로 전환했습니다.`
      );
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "기본 사용 양식 전환 중 오류가 발생했습니다."
      );
    } finally {
      setIsTemplateActionRunning(false);
    }
  };

  const handleDeleteTemplate = async (template: DocumentTemplateVersion) => {
    const confirmed = window.confirm(
      `${template.versionLabel} 양식을 삭제하시겠습니까? 사용 중인 양식은 삭제할 수 없습니다.`
    );

    if (!confirmed) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsTemplateActionRunning(true);

    try {
      const result = await window.appBridge.deleteDocumentTemplateVersion(template.id);

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage("양식을 삭제했습니다.");
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "양식 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsTemplateActionRunning(false);
    }
  };

  const updateScheduleProfileField = (
    field: "sheetName" | "siteNameCell" | "monthTitleCell" | "rosterSummaryCell" | "changeReasonColumn",
    value: string
  ) => {
    setTemplatePreviewRecord(null);
    setTemplateProfileDraft((current) => {
      if (!current || current.kind !== "schedule") {
        return current;
      }

      if (field === "changeReasonColumn") {
        return {
          ...current,
          layout: {
            ...current.layout,
            changeReasonColumn: toColumnAddress(value)
          }
        };
      }

      return {
        ...current,
        layout: {
          ...current.layout,
          [field]: value
        }
      };
    });
  };

  const updateGenericProfileField = (fieldKey: string, value: string) => {
    setTemplatePreviewRecord(null);
    setTemplateProfileDraft((current) => {
      if (!current || current.kind !== "generic") {
        return current;
      }

      if (fieldKey === "primarySheetName") {
        return {
          ...current,
          primarySheetName: value
        };
      }

      return {
        ...current,
        fieldMappings: {
          ...current.fieldMappings,
          [fieldKey]: value
        }
      };
    });
  };

  const primaryCalendar = holidayCalendars[0] ?? null;

  const rateRows = useMemo(
    () =>
      rateVersions.map((version) => ({
        id: version.id,
        versionLabel: version.versionLabel,
        year: version.year,
        base: getMultiplier(version, "base"),
        overtime: getMultiplier(version, "overtime"),
        night: getMultiplier(version, "night"),
        status: version.status
      })),
    [rateVersions]
  );

  const templateRows = useMemo(
    () => {
      return templates
        .slice()
        .sort((left, right) => {
          const typeCompare = left.templateType.localeCompare(right.templateType);

          if (typeCompare !== 0) {
            return typeCompare;
          }

          if (left.isDefault !== right.isDefault) {
            return left.isDefault ? -1 : 1;
          }

          return right.createdAt.localeCompare(left.createdAt);
        })
        .map((template) => ({
          template,
          id: template.id,
          title: templateTypeLabel[template.templateType],
          templateType: template.templateType,
          path: template.sourcePath,
          fileName: getManagedTemplateFileName(template),
          outputFileNamePattern: getTemplateOutputPattern(template),
          versionLabel: template.versionLabel,
          status: template.status,
          isDefault: template.isDefault,
          usageNote: getTemplateUsageNote(template),
          changePolicy: getTemplateChangePolicy(template),
          createdAt: template.createdAt,
          approvedAt: template.approvedAt
        }));
    },
    [templates]
  );
  const templateCandidateOptions = useMemo(
    () => getCellAddressOptions(templateValidation ?? undefined),
    [templateValidation]
  );
  const scheduleProfileDraft =
    templateProfileDraft?.kind === "schedule" ? templateProfileDraft : null;
  const genericProfileDraft =
    templateProfileDraft?.kind === "generic" ? templateProfileDraft : null;
  const genericTemplateType =
    templateTypeInput === "schedule"
      ? null
      : (templateTypeInput as Exclude<TemplateType, "schedule">);
  const siteNameOptions = useMemo(
    () =>
      getCellAddressOptionsWithCurrent(
        templateValidation,
        scheduleProfileDraft?.layout.siteNameCell
      ),
    [scheduleProfileDraft?.layout.siteNameCell, templateValidation]
  );
  const monthTitleOptions = useMemo(
    () =>
      getCellAddressOptionsWithCurrent(
        templateValidation,
        scheduleProfileDraft?.layout.monthTitleCell
      ),
    [scheduleProfileDraft?.layout.monthTitleCell, templateValidation]
  );
  const rosterSummaryOptions = useMemo(
    () =>
      getCellAddressOptionsWithCurrent(
        templateValidation,
        scheduleProfileDraft?.layout.rosterSummaryCell
      ),
    [scheduleProfileDraft?.layout.rosterSummaryCell, templateValidation]
  );
  const reasonColumnOptions = useMemo(() => {
    const currentColumn = scheduleProfileDraft?.layout.changeReasonColumn;
    const base = templateCandidateOptions.filter((candidate) => candidate.text.includes("변경"));

    if (!currentColumn) {
      return base;
    }

    if (base.some((candidate) => toColumnAddress(candidate.address) === currentColumn)) {
      return base;
    }

    return [
      {
        sheetName: templateValidation?.primarySheetName ?? "-",
        address: `${currentColumn}1`,
        text: "현재 설정"
      },
      ...base
    ];
  }, [
    scheduleProfileDraft?.layout.changeReasonColumn,
    templateCandidateOptions,
    templateValidation?.primarySheetName
  ]);

  return (
    <div className="screen-stack">
      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">메뉴 7</p>
            <h3>운영 관리</h3>
          </div>
        </div>
        <div className="tab-row">
          <span className="tab-chip active">공휴일 관리</span>
          <span className="tab-chip">요율 관리</span>
          <span className="tab-chip">사용자 관리</span>
          <span className="tab-chip">양식 관리</span>
        </div>
      </section>

      <section className="title-line">
        <strong>운영 기준정보</strong>
        <span>{settings ? `데이터 경로: ${settings.dataDir}` : "운영 기준정보를 확인합니다."}</span>
      </section>

      {errorMessage ? <p className="form-error-text">{errorMessage}</p> : null}
      {!isTemplateModalOpen && actionError ? <p className="form-error-text">{actionError}</p> : null}
      {!isTemplateModalOpen && actionMessage ? <p className="form-success-text">{actionMessage}</p> : null}

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.0 경로 설정</p>
            <h3>파일 감시 및 출력 경로</h3>
          </div>
          <button
            className="primary-button"
            disabled={isLoading || isSaving}
            onClick={() => {
              void handleSaveSettings();
            }}
            type="button"
          >
            {isSaving ? "저장 중..." : "경로 저장"}
          </button>
        </div>
        <div className="filter-grid two-up">
          <label className="field">
            <span>승인 대기 폴더</span>
            <input
              onChange={(event) => {
                handleSettingsFieldChange("pendingDir", event.target.value);
              }}
              placeholder="승인 대기 폴더 경로"
              value={settingsForm.pendingDir}
            />
          </label>
          <label className="field">
            <span>승인 완료 폴더</span>
            <input
              onChange={(event) => {
                handleSettingsFieldChange("approvedDir", event.target.value);
              }}
              placeholder="승인 완료 폴더 경로"
              value={settingsForm.approvedDir}
            />
          </label>
          <label className="field">
            <span>근무표 내보내기 폴더</span>
            <input
              onChange={(event) => {
                handleSettingsFieldChange("scheduleExportDir", event.target.value);
              }}
              placeholder="근무표 내보내기 경로"
              value={settingsForm.scheduleExportDir}
            />
          </label>
          <label className="field">
            <span>공휴일 API 주소</span>
            <input
              onChange={(event) => {
                handleSettingsFieldChange("holidayApiBaseUrl", event.target.value);
              }}
              placeholder="공휴일 API 주소"
              value={settingsForm.holidayApiBaseUrl}
            />
          </label>
          <label className="field">
            <span>데이터 루트</span>
            <input readOnly value={settings?.dataDir ?? "-"} />
          </label>
          <label className="field">
            <span>DB 경로</span>
            <input readOnly value={settings?.databasePath ?? "-"} />
          </label>
        </div>
      </section>

      <section className="split-grid two-up">
        <article className="surface-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">7.0.1 감시 상태</p>
              <h3>실적 파일 감시 런타임</h3>
            </div>
            <div className="button-row">
              <span className={`pill ${fileWatchStatus?.isRunning ? "info" : "neutral"}`}>
                {fileWatchStatus?.isRunning ? "감시 중" : "중지"}
              </span>
              <button
                className="ghost-button"
                disabled={isLoading || isWatchActionRunning}
                onClick={() => {
                  void handleFileWatchAction("stop");
                }}
                type="button"
              >
                {isWatchActionRunning ? "처리 중..." : "감시 중지"}
              </button>
              <button
                className="primary-button"
                disabled={isLoading || isWatchActionRunning}
                onClick={() => {
                  void handleFileWatchAction("restart");
                }}
                type="button"
              >
                {isWatchActionRunning ? "처리 중..." : "감시 재시작"}
              </button>
            </div>
          </div>
          <div className="filter-grid two-up">
            <label className="field">
              <span>활성 승인 대기 폴더</span>
              <input readOnly value={fileWatchStatus?.pendingDir ?? "-"} />
            </label>
            <label className="field">
              <span>활성 승인 완료 폴더</span>
              <input readOnly value={fileWatchStatus?.approvedDir ?? "-"} />
            </label>
            <label className="field">
              <span>최근 시작 시각</span>
              <input readOnly value={formatDateTime(fileWatchStatus?.lastStartedAt)} />
            </label>
            <label className="field">
              <span>최근 중지 시각</span>
              <input readOnly value={formatDateTime(fileWatchStatus?.lastStoppedAt)} />
            </label>
          </div>
          <p className="field-hint">
            {fileWatchStatus?.lastErrorMessage
              ? `최근 오류: ${fileWatchStatus.lastErrorMessage}`
              : "경로를 바꾼 뒤에는 감시 재시작으로 새 설정을 적용합니다."}
          </p>
        </article>

        <article className="surface-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">7.0.2 최근 감지 이력</p>
              <h3>감시 이벤트 로그</h3>
            </div>
            <span className="pill neutral">{fileWatchStatus?.recentEvents.length ?? 0}건</span>
          </div>
          <div className="data-scroll">
            <table className="info-table template-management-table">
              <thead>
                <tr>
                  <th>시각</th>
                  <th>이벤트</th>
                  <th>대상</th>
                  <th>파일명</th>
                </tr>
              </thead>
              <tbody>
                {fileWatchStatus?.recentEvents.length ? (
                  fileWatchStatus.recentEvents.map((event, index) => (
                    <tr key={`${event.occurredAt}-${event.filePath}-${index}`}>
                      <td>{formatDateTime(event.occurredAt)}</td>
                      <td>{fileWatchEventLabel[event.type]}</td>
                      <td>{fileWatchDirectoryLabel[event.directoryType]}</td>
                      <td>{event.message ? `${event.fileName} / ${event.message}` : event.fileName}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>기록된 감시 이벤트가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="split-grid two-up">
        <article className="surface-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">7.1 공휴일 관리</p>
              <h3>시스템 DB 등록 공휴일</h3>
            </div>
            <span className="pill info">{primaryCalendar?.year ?? "-"}</span>
          </div>
          <div className="data-scroll">
            <table className="info-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>공휴일명</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={2}>공휴일 정보를 불러오는 중입니다.</td>
                  </tr>
                ) : primaryCalendar?.items.length ? (
                  primaryCalendar.items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.holidayDate}</td>
                      <td>{row.name}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2}>등록된 공휴일 정보가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="surface-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">외부 API 조회</p>
              <h3>반영 대기 공휴일</h3>
            </div>
            <button className="primary-button" disabled type="button">
              API 연동 예정
            </button>
          </div>
          <div className="data-scroll">
            <table className="info-table">
              <thead>
                <tr>
                  <th>선택</th>
                  <th>날짜</th>
                  <th>공휴일명</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>·</td>
                  <td colSpan={2}>
                    {settingsForm.holidayApiBaseUrl
                      ? `외부 API 기준 주소: ${settingsForm.holidayApiBaseUrl}`
                      : "외부 API 설정을 불러오는 중입니다."}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="split-grid two-up">
        <article className="surface-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">7.2 요율 관리</p>
              <h3>연도별 수당계산 요율 버전</h3>
            </div>
          </div>
          <div className="data-scroll">
            <table className="info-table">
              <thead>
                <tr>
                  <th>버전</th>
                  <th>기본요율</th>
                  <th>연장요율</th>
                  <th>야간요율</th>
                  <th>정의연도</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5}>요율 정보를 불러오는 중입니다.</td>
                  </tr>
                ) : rateRows.length > 0 ? (
                  rateRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.versionLabel}</td>
                      <td>{row.base}</td>
                      <td>{row.overtime}</td>
                      <td>{row.night}</td>
                      <td>{row.year}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>등록된 요율 버전이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="surface-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">7.3 사용자 관리</p>
              <h3>권한 및 상태별 사용자 목록</h3>
            </div>
          </div>
          <div className="data-scroll">
            <table className="info-table">
              <thead>
                <tr>
                  <th>계정명</th>
                  <th>이름</th>
                  <th>권한</th>
                  <th>연락처</th>
                  <th>메일주소</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6}>사용자 정보를 불러오는 중입니다.</td>
                  </tr>
                ) : users.length > 0 ? (
                  users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.loginId}</td>
                      <td>{user.displayName}</td>
                      <td>{userRoleLabel[user.role]}</td>
                      <td>{user.contact ?? "-"}</td>
                      <td>{user.email ?? "-"}</td>
                      <td>{userStatusLabel[user.status]}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>등록된 사용자가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.4 양식 관리</p>
            <h3>양식 등록 및 승인 관리</h3>
          </div>
          <button
            className="primary-button"
            disabled={isLoading || isTemplateActionRunning}
            onClick={openTemplateRegistration}
            type="button"
          >
            양식등록
          </button>
        </div>
        <div className="template-operations-guide">
          <div className="template-operations-guide-head">
            <strong>운영 원칙</strong>
            <span className="pill neutral">수정 시 새 버전 등록</span>
          </div>
          <p>
            운영 중인 양식은 기존 파일을 직접 덮어쓰지 않고, 수정본을 새 파일과 새 버전으로 등록한 뒤
            검증 후 기본 버전을 전환하는 방식으로 관리합니다.
          </p>
          <p className="field-hint">
            승인만 하면 사용 후보가 되고, 실제 배포 기본본 변경은 `기본 사용` 버튼으로 따로 전환합니다.
          </p>
        </div>
        <div className="data-scroll">
          {isLoading ? (
            <table className="info-table">
              <tbody>
                <tr>
                  <td>양식 정보를 불러오는 중입니다.</td>
                </tr>
              </tbody>
            </table>
          ) : templateRows.length > 0 ? (
            <table className="info-table">
              <thead>
                <tr>
                  <th>양식 종류</th>
                  <th>버전</th>
                  <th>상태</th>
                  <th>기본 사용</th>
                  <th>파일명</th>
                  <th>생성일</th>
                  <th>승인일</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {templateRows.map((template) => (
                  <tr key={template.id}>
                    <td>{template.title}</td>
                    <td>{template.versionLabel}</td>
                    <td>{templateStatusLabel[template.status]}</td>
                    <td>{template.isDefault ? "사용중" : "-"}</td>
                    <td
                      className="template-file-cell"
                      title={`${template.path}\n출력 규칙: ${template.outputFileNamePattern}`}
                    >
                      <div className="template-file-stack">
                        <span className="template-file-primary">{template.fileName}</span>
                        <span className="template-file-secondary">
                          출력: {template.outputFileNamePattern}
                        </span>
                      </div>
                    </td>
                    <td>{formatDateTime(template.createdAt)}</td>
                    <td>{formatDateTime(template.approvedAt)}</td>
                    <td className="template-action-cell">
                      <div className="button-row">
                        <button
                          className="ghost-button"
                          disabled={isTemplateActionRunning}
                          onClick={() => {
                            void handleOpenTemplateEdit(template.template);
                          }}
                          type="button"
                        >
                          수정
                        </button>
                        <button
                          className="ghost-button"
                          disabled={isTemplateActionRunning}
                          onClick={() => {
                            void handleUpdateTemplateOutputFileName(template.template);
                          }}
                          type="button"
                        >
                          파일명 변경
                        </button>
                        <button
                          className="ghost-button"
                          disabled={isTemplateActionRunning || template.status === "approved"}
                          onClick={() => {
                            void handleApproveTemplate(template.id);
                          }}
                          type="button"
                        >
                          승인
                        </button>
                        <button
                          className="ghost-button"
                          disabled={
                            isTemplateActionRunning ||
                            template.status !== "approved" ||
                            template.isDefault
                          }
                          onClick={() => {
                            void handleSetDefaultTemplate(template.template);
                          }}
                          type="button"
                        >
                          기본 사용
                        </button>
                        <button
                          className="danger-button"
                          disabled={isTemplateActionRunning}
                          onClick={() => {
                            void handleDeleteTemplate(template.template);
                          }}
                          type="button"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="info-table">
              <tbody>
                <tr>
                  <td>등록된 양식이 없습니다.</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.4.1 최근 이력</p>
            <h3>양식 변경 이력</h3>
          </div>
          <span className="pill neutral">{templateHistory.length}건</span>
        </div>
        <div className="data-scroll">
          <table className="info-table">
            <thead>
              <tr>
                <th>시각</th>
                <th>양식 종류</th>
                <th>버전</th>
                <th>작업</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5}>양식 변경 이력을 불러오는 중입니다.</td>
                </tr>
              ) : templateHistory.length > 0 ? (
                templateHistory.map((history) => (
                  <tr key={history.id}>
                    <td>{formatDateTime(history.occurredAt)}</td>
                    <td>{templateTypeLabel[history.templateType]}</td>
                    <td>{history.versionLabel}</td>
                    <td>{templateHistoryActionLabel[history.actionType]}</td>
                    <td>{history.detail ?? "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>기록된 양식 변경 이력이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isTemplateModalOpen ? (
        <div className="modal-overlay">
          <div className="modal-card template-wizard-modal">
            <div className="section-heading">
              <div className="modal-heading-copy">
                <strong>
                  {editingTemplateId ? "양식 프로필 편집기" : "양식등록"}
                  {` (${templateWizardStep}단계)`}
                </strong>
                <p>
                  1단계에서 파일 Import 와 1차 검증을 수행하고, 2단계에서 좌표와 프로필을
                  조정한 뒤 저장합니다.
                </p>
              </div>
              <button className="ghost-button" onClick={handleCloseTemplateModal} type="button">
                닫기
              </button>
            </div>
            <div className="template-wizard-body">
              {actionError ? <p className="form-error-text">{actionError}</p> : null}
              {actionMessage ? <p className="form-success-text">{actionMessage}</p> : null}

              {templateWizardStep === 1 ? (
                <div className="template-wizard-grid">
                <label className="field">
                  <span>양식 종류</span>
                  <FormSelect
                    className="top-filter-select-shell"
                    onChange={(event) => {
                      setTemplateTypeInput(event.target.value as TemplateType);
                      setSelectedTemplateSource(null);
                      setTemplateManagedFileNameInput("");
                      setTemplateValidation(null);
                      setTemplateProfileDraft(null);
                      setTemplatePreviewRecord(null);
                    }}
                    selectClassName="top-filter-select"
                    value={templateTypeInput}
                  >
                    {templateTypeOptions.map((templateType) => (
                      <option key={templateType} value={templateType}>
                        {templateTypeLabel[templateType]}
                      </option>
                    ))}
                  </FormSelect>
                </label>
                <label className="field">
                  <span>버전명</span>
                  <input
                    onChange={(event) => {
                      setTemplateVersionLabelInput(event.target.value);
                    }}
                    placeholder="예: 2026.2 / 양식 v2"
                    value={templateVersionLabelInput}
                  />
                </label>
                <label className="field">
                  <span>양식 보관 파일명</span>
                  <input
                    onChange={(event) => {
                      setTemplateManagedFileNameInput(event.target.value);
                    }}
                    placeholder="예: 근무표_양식_v2.xlsx"
                    value={templateManagedFileNameInput}
                  />
                </label>
                <label className="field template-source-field">
                  <span>가져온 파일</span>
                  <input readOnly value={selectedTemplateSource?.filePath ?? "-"} />
                </label>
                <div className="button-row">
                  <button
                    className="ghost-button"
                    disabled={isTemplateActionRunning}
                    onClick={() => {
                      void handlePickTemplateFile();
                    }}
                    type="button"
                  >
                    {isTemplateActionRunning ? "처리 중..." : "Import"}
                  </button>
                  <button
                    className="primary-button"
                    disabled={isTemplateActionRunning || !selectedTemplateSource}
                    onClick={() => {
                      void handleInspectTemplate();
                    }}
                    type="button"
                  >
                    {isTemplateActionRunning ? "검증 중..." : "1차 검증"}
                  </button>
                </div>
                {templateValidation ? (
                  <article className="template-validation-panel">
                    <strong>검증 결과</strong>
                    <p>기본 시트: {templateValidation.primarySheetName || "-"}</p>
                    <p>탐지 시트: {templateValidation.sheetNames.join(", ") || "-"}</p>
                    <p>
                      판정:{" "}
                      {templateValidation.canProceed ? "2단계 진행 가능" : "2단계 진행 불가"}
                    </p>
                    <div className="template-validation-message-list">
                      {templateValidation.messages.map((message, index) => (
                        <span key={`${message}-${index}`}>{message}</span>
                      ))}
                    </div>
                  </article>
                ) : null}
                <div className="button-row template-wizard-actions">
                  <button className="ghost-button" onClick={handleCloseTemplateModal} type="button">
                    취소
                  </button>
                  <button
                    className="primary-button"
                    disabled={!templateValidation?.canProceed || !templateProfileDraft}
                    onClick={() => {
                      setTemplateWizardStep(2);
                    }}
                    type="button"
                  >
                    2단계로 이동
                  </button>
                </div>
                </div>
              ) : (
                <div className="template-profile-editor-layout">
                <section className="template-profile-panel">
                  <strong>현재 탐지 정보</strong>
                  <p className="field-hint">
                    좌측은 양식 내부에서 탐지한 타이틀/셀 위치입니다. 우측에서 선택 목록 기준으로
                    프로필을 조정합니다.
                  </p>
                  <div className="data-scroll template-candidate-table">
                    <table className="info-table compact-table">
                      <thead>
                        <tr>
                          <th>시트</th>
                          <th>셀</th>
                          <th>타이틀</th>
                        </tr>
                      </thead>
                      <tbody>
                        {templateCandidateOptions.length > 0 ? (
                          templateCandidateOptions.slice(0, 60).map((candidate) => (
                            <tr
                              key={`${candidate.sheetName}-${candidate.address}-${candidate.text}`}
                            >
                              <td>{candidate.sheetName}</td>
                              <td>{candidate.address}</td>
                              <td>{candidate.text}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3}>탐지된 타이틀이 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="template-profile-panel">
                  <strong>프로필 편집</strong>
                  <div className="filter-grid two-up">
                    <label className="field">
                      <span>버전명</span>
                      <input
                        onChange={(event) => {
                          setTemplateVersionLabelInput(event.target.value);
                        }}
                        value={templateVersionLabelInput}
                      />
                    </label>
                    <label className="field">
                      <span>양식 보관 파일명</span>
                      <input
                        onChange={(event) => {
                          setTemplateManagedFileNameInput(event.target.value);
                        }}
                        value={templateManagedFileNameInput}
                      />
                    </label>
                  </div>
                  {scheduleProfileDraft ? (
                    <div className="filter-grid two-up">
                      <label className="field">
                        <span>시트명</span>
                        <FormSelect
                          className="top-filter-select-shell"
                          onChange={(event) => {
                            updateScheduleProfileField("sheetName", event.target.value);
                          }}
                          selectClassName="top-filter-select"
                          value={scheduleProfileDraft.layout.sheetName}
                        >
                          {templateValidation?.sheetNames.map((sheetName) => (
                            <option key={sheetName} value={sheetName}>
                              {sheetName}
                            </option>
                          )) ?? []}
                        </FormSelect>
                      </label>
                      <label className="field">
                        <span>양식 계열</span>
                        <input readOnly value={scheduleProfileDraft.templateFamily} />
                      </label>
                      <label className="field">
                        <span>현장명 셀</span>
                        <FormSelect
                          className="top-filter-select-shell"
                          onChange={(event) => {
                            updateScheduleProfileField("siteNameCell", event.target.value);
                          }}
                          selectClassName="top-filter-select"
                          value={scheduleProfileDraft.layout.siteNameCell}
                        >
                          {siteNameOptions.map((candidate) => (
                            <option key={`site-${candidate.address}`} value={candidate.address}>
                              {createTemplateCandidateLabel(candidate.address, candidate.text)}
                            </option>
                          ))}
                        </FormSelect>
                      </label>
                      <label className="field">
                        <span>월 제목 셀</span>
                        <FormSelect
                          className="top-filter-select-shell"
                          onChange={(event) => {
                            updateScheduleProfileField("monthTitleCell", event.target.value);
                          }}
                          selectClassName="top-filter-select"
                          value={scheduleProfileDraft.layout.monthTitleCell}
                        >
                          {monthTitleOptions.map((candidate) => (
                            <option key={`month-${candidate.address}`} value={candidate.address}>
                              {createTemplateCandidateLabel(candidate.address, candidate.text)}
                            </option>
                          ))}
                        </FormSelect>
                      </label>
                      <label className="field">
                        <span>팀 요약 셀</span>
                        <FormSelect
                          className="top-filter-select-shell"
                          onChange={(event) => {
                            updateScheduleProfileField("rosterSummaryCell", event.target.value);
                          }}
                          selectClassName="top-filter-select"
                          value={scheduleProfileDraft.layout.rosterSummaryCell}
                        >
                          {rosterSummaryOptions.map((candidate) => (
                            <option key={`roster-${candidate.address}`} value={candidate.address}>
                              {createTemplateCandidateLabel(candidate.address, candidate.text)}
                            </option>
                          ))}
                        </FormSelect>
                      </label>
                      <label className="field">
                        <span>변경 사유 컬럼</span>
                        <FormSelect
                          className="top-filter-select-shell"
                          onChange={(event) => {
                            updateScheduleProfileField("changeReasonColumn", event.target.value);
                          }}
                          selectClassName="top-filter-select"
                          value={`${scheduleProfileDraft.layout.changeReasonColumn}1`}
                        >
                          {reasonColumnOptions.map((candidate) => (
                            <option key={`reason-${candidate.address}`} value={candidate.address}>
                              {createTemplateCandidateLabel(candidate.address, candidate.text)}
                            </option>
                          ))}
                        </FormSelect>
                      </label>
                      <label className="field">
                        <span>주차 블록 수</span>
                        <input
                          readOnly
                          value={`${scheduleProfileDraft.layout.weekBlocks.length}개`}
                        />
                      </label>
                    </div>
                  ) : genericProfileDraft ? (
                    <div className="filter-grid two-up">
                      <label className="field">
                        <span>기본 시트</span>
                        <FormSelect
                          className="top-filter-select-shell"
                          onChange={(event) => {
                            updateGenericProfileField("primarySheetName", event.target.value);
                          }}
                          selectClassName="top-filter-select"
                          value={genericProfileDraft.primarySheetName}
                        >
                          {templateValidation?.sheetNames.map((sheetName) => (
                            <option key={sheetName} value={sheetName}>
                              {sheetName}
                            </option>
                          )) ?? []}
                        </FormSelect>
                      </label>
                      {Object.entries(genericProfileDraft.fieldMappings).map(([fieldKey, fieldValue]) => {
                        const label = genericTemplateType
                          ? getGenericFieldLabel(genericTemplateType, fieldKey)
                          : fieldKey;
                        const cellOptions = getCellAddressOptionsWithCurrent(
                          templateValidation,
                          fieldValue
                        );

                        if (fieldKey === "sheetName") {
                          return (
                            <label className="field" key={fieldKey}>
                              <span>{label}</span>
                              <FormSelect
                                className="top-filter-select-shell"
                                onChange={(event) => {
                                  updateGenericProfileField(fieldKey, event.target.value);
                                }}
                                selectClassName="top-filter-select"
                                value={fieldValue}
                              >
                                {templateValidation?.sheetNames.map((sheetName) => (
                                  <option key={`${fieldKey}-${sheetName}`} value={sheetName}>
                                    {sheetName}
                                  </option>
                                )) ?? []}
                              </FormSelect>
                            </label>
                          );
                        }

                        if (isGenericRowField(fieldKey)) {
                          return (
                            <label className="field" key={fieldKey}>
                              <span>{label}</span>
                              <input
                                min={1}
                                onChange={(event) => {
                                  updateGenericProfileField(fieldKey, event.target.value);
                                }}
                                type="number"
                                value={fieldValue}
                              />
                            </label>
                          );
                        }

                        return (
                          <label className="field" key={fieldKey}>
                            <span>{label}</span>
                            <FormSelect
                              className="top-filter-select-shell"
                              onChange={(event) => {
                                updateGenericProfileField(fieldKey, event.target.value);
                              }}
                              selectClassName="top-filter-select"
                              value={fieldValue}
                            >
                              {cellOptions.map((candidate) => (
                                <option
                                  key={`${fieldKey}-${candidate.sheetName}-${candidate.address}`}
                                  value={candidate.address}
                                >
                                  {createTemplateCandidateLabel(candidate.address, candidate.text)}
                                </option>
                              ))}
                            </FormSelect>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="field-hint">편집할 프로필이 없습니다.</p>
                  )}
                  {templatePreviewRecord ? (
                    <article className="template-validation-panel">
                      <strong>최근 미리보기</strong>
                      <p>파일명: {templatePreviewRecord.outputFileName}</p>
                      <p>경로: {templatePreviewRecord.outputPath}</p>
                      <p>시각: {formatDateTime(templatePreviewRecord.previewedAt)}</p>
                    </article>
                  ) : (
                    <p className="field-hint">
                      {editingTemplateId
                        ? "필요하면 미리보기 파일을 생성해 수정 결과를 먼저 확인할 수 있습니다."
                        : "저장 전에 미리보기 파일을 생성해 실제 좌표와 출력 위치를 확인합니다."}
                    </p>
                  )}
                  <div className="button-row template-wizard-actions">
                    <button
                      className="ghost-button"
                      onClick={() => {
                        setTemplateWizardStep(1);
                      }}
                      type="button"
                    >
                      이전
                    </button>
                    <button
                      className="ghost-button"
                      disabled={isTemplateActionRunning || !templateProfileDraft}
                      onClick={() => {
                        void handlePreviewTemplate();
                      }}
                      type="button"
                    >
                      {isTemplateActionRunning ? "처리 중..." : "미리보기"}
                    </button>
                    <button
                      className="primary-button"
                      disabled={isTemplateActionRunning || (editingTemplateId === null && !templatePreviewRecord)}
                      onClick={() => {
                        void handleSaveTemplate();
                      }}
                      type="button"
                    >
                      저장
                    </button>
                  </div>
                </section>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
