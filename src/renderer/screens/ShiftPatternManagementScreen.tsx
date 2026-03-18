import { useEffect, useMemo, useState } from "react";

import type {
  AllowanceRateVersionSaveInput,
  AppSettingsUpdateInput,
  AppSettingsSnapshot,
  DocumentTemplateFileSelection,
  DocumentTemplatePreviewRecord,
  FileWatchStatusSnapshot,
  OperationUserSaveInput
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

import {
  OperationsMenuTabs,
  type OperationsMenuKey
} from "./operations-management/OperationsMenuTabs";
import { OperationsSettingsSection } from "./operations-management/OperationsSettingsSection";
import { OperationsHolidaySection } from "./operations-management/OperationsHolidaySection";
import { OperationsRateSection } from "./operations-management/OperationsRateSection";
import { OperationsUserSection } from "./operations-management/OperationsUserSection";
import {
  OperationsTemplateSection,
  type TemplateHistoryRow,
  type TemplateManagementRow
} from "./operations-management/OperationsTemplateSection";
import { TemplateWizardModal } from "./operations-management/TemplateWizardModal";

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
    return "문서 출력 메뉴에서 승인된 양식만 선택됩니다.";
  }

  return getScheduleTemplateVariant(template) === "sample2"
    ? "6조 2교대(D/N) 전용 배포 양식"
    : "Day / Evening / Night 일반형 배포 양식";
};

const getTemplateChangePolicy = (template: DocumentTemplateVersion) => {
  if (template.templateType !== "schedule") {
    return "수정 버튼에서 셀 위치만 고칠 수 있습니다. 저장 전에 미리보기로 결과를 확인할 수 있습니다.";
  }

  return "수정 버튼에서 현재 양식의 좌표와 조건을 바로 고칠 수 있습니다.";
};

const createTemplateEditVersionLabel = (template: DocumentTemplateVersion) => {
  return template.versionLabel;
};

const getGenericFieldLabel = (
  templateType: Exclude<TemplateType, "schedule">,
  fieldKey: string
) => genericTemplateFieldLabels[templateType][fieldKey] ?? fieldKey;

const isGenericRowField = (fieldKey: string) => fieldKey.endsWith("Row");

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
  const currentYear = new Date().getFullYear();
  const [settings, setSettings] = useState<AppSettingsSnapshot | null>(null);
  const [settingsForm, setSettingsForm] = useState<AppSettingsUpdateInput>(createSettingsForm());
  const [fileWatchStatus, setFileWatchStatus] = useState<FileWatchStatusSnapshot | null>(null);
  const [holidayFilterYear, setHolidayFilterYear] = useState(currentYear);
  const [holidayCalendars, setHolidayCalendars] = useState<HolidayCalendar[]>([]);
  const [rateVersions, setRateVersions] = useState<AllowanceRateVersion[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplateVersion[]>([]);
  const [templateHistory, setTemplateHistory] = useState<DocumentTemplateHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);
  const [isWatchActionRunning, setIsWatchActionRunning] = useState(false);
  const [isRateActionRunning, setIsRateActionRunning] = useState(false);
  const [isUserActionRunning, setIsUserActionRunning] = useState(false);
  const [isTemplateActionRunning, setIsTemplateActionRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeMenu, setActiveMenu] = useState<OperationsMenuKey>("settings");
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
  const [templateProfileBaseline, setTemplateProfileBaseline] =
    useState<DocumentTemplateProfile | null>(null);
  const [templateVersionLabelBaseline, setTemplateVersionLabelBaseline] = useState("");
  const [templateManagedFileNameBaseline, setTemplateManagedFileNameBaseline] = useState("");
  const [outputFileNameEditTemplate, setOutputFileNameEditTemplate] =
    useState<DocumentTemplateVersion | null>(null);
  const [outputFileNamePatternInput, setOutputFileNamePatternInput] = useState("");
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
        window.appBridge.listHolidayCalendars(holidayFilterYear),
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
  }, [refreshKey, holidayFilterYear]);

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

  const handleSelectDirectory = async (
    field: "pendingDir" | "approvedDir" | "scheduleExportDir"
  ) => {
    setActionError(null);
    setActionMessage(null);
    setIsSelectingDirectory(true);

    try {
      const directoryLabel =
        field === "pendingDir"
          ? "승인 대기 폴더"
          : field === "approvedDir"
            ? "승인 완료 폴더"
            : "근무표 내보내기 폴더";
      const result = await window.appBridge.selectDirectory({
        defaultPath: settingsForm[field],
        title: `${directoryLabel} 선택`,
        buttonLabel: "폴더 선택"
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      if (!result.data) {
        return;
      }

      handleSettingsFieldChange(field, result.data);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "폴더 선택 중 오류가 발생했습니다.");
    } finally {
      setIsSelectingDirectory(false);
    }
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

  const handleSaveRateVersion = async (input: AllowanceRateVersionSaveInput) => {
    setActionError(null);
    setActionMessage(null);
    setIsRateActionRunning(true);

    try {
      const result = await window.appBridge.saveAllowanceRateVersion(input);

      if (!result.ok) {
        setActionError(result.message);
        throw new Error(result.message);
      }

      setActionMessage(input.id ? "요율 버전을 수정했습니다." : "요율 버전을 등록했습니다.");
      setRefreshKey((current) => current + 1);
    } catch (error) {
      if (error instanceof Error && error.message) {
        throw error;
      }

      const message = "요율 버전 저장 중 오류가 발생했습니다.";
      setActionError(message);
      throw new Error(message);
    } finally {
      setIsRateActionRunning(false);
    }
  };

  const handleDeleteRateVersion = async (version: AllowanceRateVersion) => {
    const confirmed = window.confirm(
      `${version.versionLabel} 요율 버전을 삭제하시겠습니까? 계산 이력에 사용된 버전은 삭제할 수 없습니다.`
    );

    if (!confirmed) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsRateActionRunning(true);

    try {
      const result = await window.appBridge.deleteAllowanceRateVersion({
        rateVersionId: version.id
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage("요율 버전을 삭제했습니다.");
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "요율 버전 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsRateActionRunning(false);
    }
  };

  const handleSaveOperationUser = async (input: OperationUserSaveInput) => {
    setActionError(null);
    setActionMessage(null);
    setIsUserActionRunning(true);

    try {
      const result = await window.appBridge.saveOperationUser(input);

      if (!result.ok) {
        setActionError(result.message);
        throw new Error(result.message);
      }

      setActionMessage("사용자 정보를 저장했습니다.");
      setRefreshKey((current) => current + 1);
    } catch (error) {
      if (error instanceof Error && error.message) {
        throw error;
      }

      const message = "사용자 정보 저장 중 오류가 발생했습니다.";
      setActionError(message);
      throw new Error(message);
    } finally {
      setIsUserActionRunning(false);
    }
  };

  const handleDeleteOperationUser = async (user: UserRecord) => {
    const confirmed = window.confirm(
      `${user.displayName} 사용자를 삭제하시겠습니까? 삭제 후에는 목록에서 바로 제거됩니다.`
    );

    if (!confirmed) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsUserActionRunning(true);

    try {
      const result = await window.appBridge.deleteOperationUser({
        userId: user.id
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage("사용자를 삭제했습니다.");
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "사용자 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsUserActionRunning(false);
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
    setTemplateProfileBaseline(null);
    setTemplateVersionLabelBaseline("");
    setTemplateManagedFileNameBaseline("");
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
      if (editingTemplateId === null) {
        setTemplateProfileBaseline(null);
        setTemplateVersionLabelBaseline("");
        setTemplateManagedFileNameBaseline("");
      }
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
      if (editingTemplateId === null || templateProfileBaseline === null) {
        setTemplateProfileBaseline(result.data.profile);
        setTemplateVersionLabelBaseline(templateVersionLabelInput);
        setTemplateManagedFileNameBaseline(templateManagedFileNameInput);
      }
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
      setTemplateVersionLabelBaseline(createTemplateEditVersionLabel(template));
      setTemplateManagedFileNameBaseline(getManagedTemplateFileName(template));
      setSelectedTemplateSource({
        fileName: getManagedTemplateFileName(template),
        filePath: template.sourcePath
      });
      setTemplateValidation(nextValidation);
      setTemplateProfileDraft(nextProfile);
      setTemplateProfileBaseline(nextProfile);
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
    setActionError(null);
    setActionMessage(null);
    setOutputFileNameEditTemplate(template);
    setOutputFileNamePatternInput(getTemplateOutputPattern(template));
  };

  const handleCloseOutputFileNameModal = () => {
    setOutputFileNameEditTemplate(null);
    setOutputFileNamePatternInput("");
  };

  const handleSaveTemplateOutputFileName = async () => {
    if (!outputFileNameEditTemplate) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsTemplateActionRunning(true);

    try {
      const result = await window.appBridge.updateDocumentTemplateOutputFileName({
        templateId: outputFileNameEditTemplate.id,
        outputFileNamePattern: outputFileNamePatternInput
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage("출력 파일명 규칙을 저장했습니다. 새로 생성되는 파일부터 적용됩니다.");
      handleCloseOutputFileNameModal();
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

  const templateRows = useMemo<TemplateManagementRow[]>(
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
  const templateHistoryRows = useMemo<TemplateHistoryRow[]>(
    () =>
      templateHistory.map((history) => ({
        id: history.id,
        occurredAt: history.occurredAt,
        templateTypeLabel: templateTypeLabel[history.templateType],
        versionLabel: history.versionLabel,
        actionLabel: templateHistoryActionLabel[history.actionType],
        detail: history.detail
      })),
    [templateHistory]
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
  const operationsMenuItems = useMemo(
    () => [
      {
        key: "settings" as const,
        label: "기본 설정",
        description: fileWatchStatus?.isRunning ? "경로, 감시 상태, 이벤트 로그" : "경로 설정과 감시 상태",
        badge: fileWatchStatus?.isRunning ? "감시 중" : "중지"
      },
      {
        key: "holiday" as const,
        label: "공휴일 관리",
        description: "시스템 DB 공휴일과 외부 API 기준",
        badge: `${primaryCalendar?.items.length ?? 0}건`
      },
      {
        key: "rate" as const,
        label: "요율 관리",
        description: "연도별 수당계산 요율 버전",
        badge: `${rateVersions.length}건`
      },
      {
        key: "user" as const,
        label: "사용자 관리",
        description: "권한과 상태별 사용자 목록",
        badge: `${users.length}명`
      },
      {
        key: "template" as const,
        label: "양식 관리",
        description: "승인, 기본 사용, 출력 규칙 관리",
        badge: `${templateRows.length}건`
      }
    ],
    [fileWatchStatus?.isRunning, primaryCalendar?.items.length, rateVersions.length, users.length, templateRows.length]
  );
  const activeMenuMeta =
    operationsMenuItems.find((menu) => menu.key === activeMenu) ?? operationsMenuItems[0];
  const renderedMenuSection = (() => {
    switch (activeMenu) {
      case "settings":
        return (
          <OperationsSettingsSection
            fileWatchDirectoryLabel={fileWatchDirectoryLabel}
            fileWatchEventLabel={fileWatchEventLabel}
            fileWatchStatus={fileWatchStatus}
            formatDateTime={formatDateTime}
            isLoading={isLoading}
            isSaving={isSaving}
            isSelectingDirectory={isSelectingDirectory}
            isWatchActionRunning={isWatchActionRunning}
            onFileWatchAction={(action) => {
              void handleFileWatchAction(action);
            }}
            onSaveSettings={() => {
              void handleSaveSettings();
            }}
            onSelectDirectory={(field) => {
              void handleSelectDirectory(field);
            }}
            onSettingsFieldChange={handleSettingsFieldChange}
            settings={settings}
            settingsForm={settingsForm}
          />
        );
      case "holiday":
        return (
          <OperationsHolidaySection
            holidayApiBaseUrl={settingsForm.holidayApiBaseUrl}
            isLoading={isLoading}
            primaryCalendar={primaryCalendar}
            selectedYear={holidayFilterYear}
            onStoredCalendarChange={(calendar) => {
              setHolidayCalendars(calendar ? [calendar] : []);
            }}
            onYearChange={setHolidayFilterYear}
          />
        );
      case "rate":
        return (
          <OperationsRateSection
            actionError={actionError}
            isActionRunning={isRateActionRunning}
            isLoading={isLoading}
            onDeleteRate={handleDeleteRateVersion}
            onSaveRate={handleSaveRateVersion}
            rateVersions={rateVersions}
          />
        );
      case "user":
        return (
          <OperationsUserSection
            actionError={actionError}
            isActionRunning={isUserActionRunning}
            isLoading={isLoading}
            onDeleteUser={handleDeleteOperationUser}
            onSaveUser={handleSaveOperationUser}
            userRoleLabel={userRoleLabel}
            userStatusLabel={userStatusLabel}
            users={users}
          />
        );
      case "template":
        return (
          <OperationsTemplateSection
            formatDateTime={formatDateTime}
            isLoading={isLoading}
            isTemplateActionRunning={isTemplateActionRunning}
            onApprove={(templateId) => {
              void handleApproveTemplate(templateId);
            }}
            onDelete={(template) => {
              void handleDeleteTemplate(template);
            }}
            onOpenEdit={(template) => {
              void handleOpenTemplateEdit(template);
            }}
            onOpenRegistration={openTemplateRegistration}
            onSetDefault={(template) => {
              void handleSetDefaultTemplate(template);
            }}
            onUpdateOutputFileName={(template) => {
              void handleUpdateTemplateOutputFileName(template);
            }}
            templateHistoryRows={templateHistoryRows}
            templateRows={templateRows}
            templateStatusLabel={templateStatusLabel}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div className="screen-stack">
      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">메뉴 7</p>
            <h3>운영 관리</h3>
          </div>
        </div>
        <OperationsMenuTabs activeKey={activeMenu} items={operationsMenuItems} onChange={setActiveMenu} />
      </section>

      <section className="title-line">
        <strong>{activeMenuMeta.label}</strong>
        <span>
          {settings
            ? `${activeMenuMeta.description} · 데이터 경로: ${settings.dataDir}`
            : activeMenuMeta.description}
        </span>
      </section>

      {errorMessage ? <p className="form-error-text">{errorMessage}</p> : null}
      {!isTemplateModalOpen && !outputFileNameEditTemplate && actionError ? (
        <p className="form-error-text">{actionError}</p>
      ) : null}
      {!isTemplateModalOpen && !outputFileNameEditTemplate && actionMessage ? (
        <p className="form-success-text">{actionMessage}</p>
      ) : null}
      {renderedMenuSection}
      <TemplateWizardModal
        actionError={actionError}
        actionMessage={actionMessage}
        createTemplateCandidateLabel={createTemplateCandidateLabel}
        editingTemplateId={editingTemplateId}
        formatDateTime={formatDateTime}
        genericProfileDraft={genericProfileDraft}
        genericTemplateType={genericTemplateType}
        getGenericFieldLabel={getGenericFieldLabel}
        isGenericRowField={isGenericRowField}
        isOpen={isTemplateModalOpen}
        isTemplateActionRunning={isTemplateActionRunning}
        monthTitleOptions={monthTitleOptions}
        onClose={handleCloseTemplateModal}
        onGenericProfileFieldChange={updateGenericProfileField}
        onGoStep1={() => {
          setTemplateWizardStep(1);
        }}
        onGoStep2={() => {
          setTemplateWizardStep(2);
        }}
        onInspectTemplate={() => {
          void handleInspectTemplate();
        }}
        onManagedFileNameChange={setTemplateManagedFileNameInput}
        onPickTemplateFile={() => {
          void handlePickTemplateFile();
        }}
        onPreviewTemplate={() => {
          void handlePreviewTemplate();
        }}
        onSaveTemplate={() => {
          void handleSaveTemplate();
        }}
        onScheduleProfileFieldChange={updateScheduleProfileField}
        onTemplateTypeChange={(value) => {
          setTemplateTypeInput(value);
          setSelectedTemplateSource(null);
          setTemplateManagedFileNameInput("");
          setTemplateValidation(null);
          setTemplateProfileDraft(null);
          setTemplateProfileBaseline(null);
          setTemplateVersionLabelBaseline("");
          setTemplateManagedFileNameBaseline("");
          setTemplatePreviewRecord(null);
        }}
        templateManagedFileNameBaseline={templateManagedFileNameBaseline}
        onVersionLabelChange={setTemplateVersionLabelInput}
        reasonColumnOptions={reasonColumnOptions}
        rosterSummaryOptions={rosterSummaryOptions}
        scheduleProfileDraft={scheduleProfileDraft}
        selectedTemplateSource={selectedTemplateSource}
        siteNameOptions={siteNameOptions}
        templateCandidateOptions={templateCandidateOptions}
        templateProfileBaseline={templateProfileBaseline}
        templateManagedFileNameInput={templateManagedFileNameInput}
        templatePreviewRecord={templatePreviewRecord}
        templateTypeInput={templateTypeInput}
        templateTypeLabel={templateTypeLabel}
        templateTypeOptions={templateTypeOptions}
        templateValidation={templateValidation}
        templateVersionLabelBaseline={templateVersionLabelBaseline}
        templateVersionLabelInput={templateVersionLabelInput}
        templateWizardStep={templateWizardStep}
      />
      {outputFileNameEditTemplate ? (
        <div className="modal-overlay">
          <div className="modal-card operations-edit-modal">
            <div className="section-heading">
              <div className="modal-heading-copy">
                <strong>출력 파일명 규칙 변경</strong>
                <p>
                  {templateTypeLabel[outputFileNameEditTemplate.templateType]}이 실제로 생성될 때 쓰는 파일명
                  규칙입니다.
                </p>
              </div>
              <button className="ghost-button" onClick={handleCloseOutputFileNameModal} type="button">
                닫기
              </button>
            </div>
            {actionError ? <p className="form-error-text">{actionError}</p> : null}
            {actionMessage ? <p className="form-success-text">{actionMessage}</p> : null}
            <div className="template-guide-grid template-guide-grid--compact">
              <article className="template-guide-card">
                <strong>현재 양식</strong>
                <p>{outputFileNameEditTemplate.versionLabel}</p>
              </article>
              <article className="template-guide-card">
                <strong>지원 치환값</strong>
                <p>{templateOutputTokenGuide[outputFileNameEditTemplate.templateType]}</p>
              </article>
            </div>
            <label className="field">
              <span>출력 파일명 규칙</span>
              <input
                onChange={(event) => {
                  setOutputFileNamePatternInput(event.target.value);
                }}
                placeholder="비워두면 기본 규칙을 사용합니다."
                value={outputFileNamePatternInput}
              />
              <small className="field-hint">
                예: {getTemplateOutputPattern(outputFileNameEditTemplate)}
              </small>
            </label>
            <div className="button-row">
              <button
                className="ghost-button"
                disabled={isTemplateActionRunning}
                onClick={() => {
                  setOutputFileNamePatternInput("");
                }}
                type="button"
              >
                기본 규칙 사용
              </button>
              <button
                className="ghost-button"
                disabled={isTemplateActionRunning}
                onClick={handleCloseOutputFileNameModal}
                type="button"
              >
                취소
              </button>
              <button
                className="primary-button"
                disabled={isTemplateActionRunning}
                onClick={() => {
                  void handleSaveTemplateOutputFileName();
                }}
                type="button"
              >
                {isTemplateActionRunning ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
