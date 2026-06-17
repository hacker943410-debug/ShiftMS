import { useEffect, useMemo, useState } from "react";

import type {
  AccountRecoveryKeyRotationResult,
  AllowanceRateVersionSaveInput,
  AppSettingsUpdateInput,
  AppSettingsSnapshot,
  DatabaseBackupSummary,
  DatabaseMigrationPreview,
  DatabaseMigrationRequirementCheck,
  DatabaseMigrationStateSnapshot,
  DatabaseMigrationSummary,
  DocumentTemplateFileSelection,
  DocumentTemplatePreviewRecord,
  OperationUserSaveInput,
  SiteNameOptionSaveInput
} from "@shared/bridge/contracts";
import type {
  DocumentTemplateProfile,
  DocumentTemplateStyleSpec,
  DocumentTemplateValidationSnapshot
} from "@shared/domain/document-template";
import type {
  AllowanceRateHistoryRecord,
  AllowanceRateVersion,
  DocumentTemplateHistoryRecord,
  DocumentTemplateVersion,
  HolidayCalendar,
  SiteNameOptionRecord,
  TemplateType,
  UserRecord
} from "@shared/domain/model";
import { getRoleLabel } from "@shared/domain/authorization";
import {
  defaultAccessMigrationTables,
  databaseMigrationSourceLabels,
  isSupportedDatabaseMigrationFilePath,
  resolveDatabaseMigrationSourceType,
  type AccessMigrationTableName
} from "@shared/domain/database-migration";

import {
  OperationsMenuTabs,
  type OperationsMenuKey
} from "./operations-management/OperationsMenuTabs";
import { OperationsSettingsSection } from "./operations-management/OperationsSettingsSection";
import { OperationsHolidaySection } from "./operations-management/OperationsHolidaySection";
import { OperationsRateSection } from "./operations-management/OperationsRateSection";
import { OperationsUserSection } from "./operations-management/OperationsUserSection";
import { OperationsSiteNameSection } from "./operations-management/OperationsSiteNameSection";
import {
  OperationsTemplateSection,
  type TemplateHistoryRow,
  type TemplateManagementRow
} from "./operations-management/OperationsTemplateSection";
import { OperationsReleaseHistorySection } from "./operations-management/OperationsReleaseHistorySection";
import { TemplateWizardModal } from "./operations-management/TemplateWizardModal";
import { GuideFlowModal } from "../components/GuideFlowModal";
import { showActionResultDialog } from "../components/action-result-dialog";
import { useQuestionDialog } from "../components/QuestionDialog";
import { useDialogDismiss } from "../components/useDialogDismiss";
import {
  operationsDatabaseUpdateGuide,
  operationsTemplateManagementGuide
} from "../guides/route-guides";

const userRoleLabel: Record<UserRecord["role"], string> = {
  admin: getRoleLabel("admin"),
  planner: getRoleLabel("planner"),
  reviewer: getRoleLabel("reviewer"),
  operator: getRoleLabel("operator")
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
    workMonthCell: "대상 월 위치",
    printedDateCell: "출력일 위치",
    ownerDepartmentCell: "부서명 위치",
    systemNameCell: "상단 안내 위치",
    documentTitleCell: "문서 제목 위치",
    summaryIntroCell: "요약 문구 위치",
    scopeCell: "지급 범위 위치",
    targetHeadcountCell: "대상 인원 위치",
    sectionTitleCell: "표 제목 위치",
    dataStartRow: "지급 표 시작 줄"
  },
  attachment1: {
    sheetName: "출력 시트",
    titleCell: "제목 위치",
    dataStartRow: "상세 표 시작 줄"
  },
  attachment2: {
    sheetName: "출력 시트",
    titleCell: "제목 위치",
    dateRangeCell: "기간 표시 위치",
    dataStartRow: "상세 표 시작 줄"
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
    return "수정 버튼에서 문서 영역 위치를 조정할 수 있습니다. 저장 전에 미리보기 파일로 결과를 확인할 수 있습니다.";
  }

  return "수정 버튼에서 현재 양식의 문서 영역 위치와 기준 조건을 바로 고칠 수 있습니다.";
};

const createTemplateEditVersionLabel = (template: DocumentTemplateVersion) => {
  return template.versionLabel;
};

const getGenericFieldLabel = (
  templateType: Exclude<TemplateType, "schedule">,
  fieldKey: string
) => genericTemplateFieldLabels[templateType][fieldKey] ?? fieldKey;

const isGenericRowField = (fieldKey: string) => fieldKey.endsWith("Row");

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

const buildBackupCompletionDescription = (input: {
  baseDescription: string;
  warningMessages: string[];
}) => {
  if (input.warningMessages.length === 0) {
    return input.baseDescription;
  }

  return `${input.baseDescription} 확인이 필요한 항목: ${input.warningMessages.join(" / ")}`;
};

const createSettingsForm = (settings?: AppSettingsSnapshot | null): AppSettingsUpdateInput => ({
  holidayApiBaseUrl: settings?.holidayApiBaseUrl ?? "",
  pendingDir: settings?.pendingDir ?? "",
  approvedDir: settings?.approvedDir ?? "",
  scheduleExportDir: settings?.scheduleExportDir ?? "",
  allowanceProposalExportDir: settings?.allowanceProposalExportDir ?? "",
  allowanceAttachment1ExportDir: settings?.allowanceAttachment1ExportDir ?? "",
  allowanceAttachment2ExportDir: settings?.allowanceAttachment2ExportDir ?? "",
  databaseBackupDir: settings?.databaseBackupDir ?? "",
  databaseBackupSchedule: settings?.databaseBackupSchedule ?? "daily",
  databaseBackupTime: settings?.databaseBackupTime ?? "02:00",
  migrationFilePath: settings?.migrationFilePath ?? "",
  scheduleConsecutiveNightLimit: settings?.scheduleConsecutiveNightLimit ?? 3,
  scheduleMinimumRestMinutes: settings?.scheduleMinimumRestMinutes ?? 11 * 60,
  scheduleRequireWeeklyHoliday: settings?.scheduleRequireWeeklyHoliday ?? true,
  scheduleWeeklyMaxMinutes: settings?.scheduleWeeklyMaxMinutes ?? 52 * 60
});

const databaseMigrationStateFieldLabels: Array<{
  key: keyof DatabaseMigrationStateSnapshot;
  label: string;
}> = [
  { key: "siteCount", label: "근무지" },
  { key: "employeeCount", label: "인력" },
  { key: "activeAssignmentCount", label: "활성 배정" },
  { key: "endedAssignmentCount", label: "종료 배정" },
  { key: "wageRateCount", label: "시급 이력" },
  { key: "patternCount", label: "패턴" },
  { key: "holidayCalendarCount", label: "공휴일 캘린더" },
  { key: "holidayItemCount", label: "공휴일 항목" },
  { key: "rateVersionCount", label: "요율 버전" },
  { key: "rateItemCount", label: "요율 항목" },
  { key: "userCount", label: "사용자" },
  { key: "templateVersionCount", label: "양식 버전" },
  { key: "templateHistoryCount", label: "양식 이력" },
  { key: "performanceFileCount", label: "실적 파일" },
  { key: "performanceEntryCount", label: "실적 행" },
  { key: "performanceApprovalCount", label: "승인 이력" },
  { key: "allowanceCalculationCount", label: "수당 계산" },
  { key: "allowanceDocumentExportCount", label: "문서 출력 이력" }
];

const databaseMigrationImportSummaryLabels: Array<{
  key:
    | "importedSiteCount"
    | "importedEmployeeCount"
    | "importedWageRateCount"
    | "importedPatternCount"
    | "importedPerformanceFileCount"
    | "importedPerformanceEntryCount"
    | "importedApprovedEntryCount"
    | "importedAllowanceCalculationCount"
    | "closedAssignmentCount"
    | "skippedDutyReleaseCount"
    | "restoredTableCount";
  label: string;
}> = [
  { key: "importedSiteCount", label: "복원 근무지" },
  { key: "importedEmployeeCount", label: "복원 인력" },
  { key: "importedWageRateCount", label: "복원 시급 이력" },
  { key: "importedPatternCount", label: "복원 패턴" },
  { key: "importedPerformanceFileCount", label: "복원 실적 파일" },
  { key: "importedPerformanceEntryCount", label: "복원 실적 행" },
  { key: "importedApprovedEntryCount", label: "복원 승인 이력" },
  { key: "importedAllowanceCalculationCount", label: "복원 수당 계산" },
  { key: "closedAssignmentCount", label: "적용 배정 종료" },
  { key: "skippedDutyReleaseCount", label: "제외 직무해제" },
  { key: "restoredTableCount", label: "복원 테이블" }
];

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

const cloneTemplateProfileDraft = (profile: DocumentTemplateProfile): DocumentTemplateProfile =>
  JSON.parse(JSON.stringify(profile)) as DocumentTemplateProfile;

export const OperationsManagementScreen = () => {
  const currentYear = new Date().getFullYear();
  const [settings, setSettings] = useState<AppSettingsSnapshot | null>(null);
  const [settingsForm, setSettingsForm] = useState<AppSettingsUpdateInput>(createSettingsForm());
  const [holidayFilterYear, setHolidayFilterYear] = useState(currentYear);
  // 입력칸은 holidayFilterYear 로 즉시 반응하고, 실제 조회는 입력이 멈춘 뒤의
  // debouncedHolidayYear 로만 한 번 일어난다(키 입력마다 전체 재조회 방지).
  const [debouncedHolidayYear, setDebouncedHolidayYear] = useState(currentYear);
  const [holidayCalendars, setHolidayCalendars] = useState<HolidayCalendar[]>([]);
  const [rateVersions, setRateVersions] = useState<AllowanceRateVersion[]>([]);
  const [rateHistory, setRateHistory] = useState<AllowanceRateHistoryRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [siteNameOptionRecords, setSiteNameOptionRecords] = useState<SiteNameOptionRecord[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplateVersion[]>([]);
  const [templateHistory, setTemplateHistory] = useState<DocumentTemplateHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);
  const [isSelectingMigrationFile, setIsSelectingMigrationFile] = useState(false);
  const [isRunningDatabaseBackup, setIsRunningDatabaseBackup] = useState(false);
  const [isDatabaseUpdating, setIsDatabaseUpdating] = useState(false);
  const [isDatabasePreviewLoading, setIsDatabasePreviewLoading] = useState(false);
  const [isRateActionRunning, setIsRateActionRunning] = useState(false);
  const [isUserActionRunning, setIsUserActionRunning] = useState(false);
  const [isRecoveryKeyRotating, setIsRecoveryKeyRotating] = useState(false);
  const [isSiteNameActionRunning, setIsSiteNameActionRunning] = useState(false);
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
  const [templateProfileHistory, setTemplateProfileHistory] = useState<DocumentTemplateProfile[]>([]);
  const [templateVersionLabelBaseline, setTemplateVersionLabelBaseline] = useState("");
  const [templateManagedFileNameBaseline, setTemplateManagedFileNameBaseline] = useState("");
  const [outputFileNameEditTemplate, setOutputFileNameEditTemplate] =
    useState<DocumentTemplateVersion | null>(null);
  const [outputFileNamePatternInput, setOutputFileNamePatternInput] = useState("");
  const [templatePreviewRecord, setTemplatePreviewRecord] =
    useState<DocumentTemplatePreviewRecord | null>(null);
  const [isDatabaseUpdateModalOpen, setIsDatabaseUpdateModalOpen] = useState(false);
  const [databaseUpdatePreview, setDatabaseUpdatePreview] =
    useState<DatabaseMigrationPreview | null>(null);
  const [databaseUpdateResult, setDatabaseUpdateResult] =
    useState<DatabaseMigrationSummary | null>(null);
  const [databaseMigrationRequirementCheck, setDatabaseMigrationRequirementCheck] =
    useState<DatabaseMigrationRequirementCheck | null>(null);
  const [databaseUpdateModalError, setDatabaseUpdateModalError] = useState<string | null>(null);
  const [databaseGuideInitialPageId, setDatabaseGuideInitialPageId] = useState<string | null>(null);
  const [templateGuideInitialPageId, setTemplateGuideInitialPageId] = useState<string | null>(null);
  const [selectedAccessTables, setSelectedAccessTables] = useState<AccessMigrationTableName[]>(
    defaultAccessMigrationTables
  );
  const { askQuestion, questionDialog } = useQuestionDialog();

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedHolidayYear(holidayFilterYear);
    }, 400);

    return () => {
      clearTimeout(handle);
    };
  }, [holidayFilterYear]);

  useEffect(() => {
    let active = true;

    const loadOperationsData = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      const [
        settingsResult,
        holidayResult,
        rateResult,
        rateHistoryResult,
        usersResult,
        siteNameOptionsResult,
        templatesResult,
        templateHistoryResult
      ] = await Promise.all([
        window.appBridge.getAppSettings(),
        window.appBridge.listHolidayCalendars(debouncedHolidayYear),
        window.appBridge.listAllowanceRateVersions(),
        window.appBridge.listAllowanceRateHistory(),
        window.appBridge.listOperationUsers(),
        window.appBridge.listSiteNameOptions(),
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

      if (!rateHistoryResult.ok) {
        setErrorMessage(rateHistoryResult.message);
      } else {
        setRateHistory(rateHistoryResult.data);
      }

      if (!usersResult.ok) {
        setErrorMessage(usersResult.message);
      } else {
        setUsers(usersResult.data);
      }

      if (!siteNameOptionsResult.ok) {
        setErrorMessage(siteNameOptionsResult.message);
      } else {
        setSiteNameOptionRecords(siteNameOptionsResult.data);
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
  }, [refreshKey, debouncedHolidayYear]);

  const handleSettingsFieldChange = (
    field: keyof AppSettingsUpdateInput,
    value: AppSettingsUpdateInput[keyof AppSettingsUpdateInput]
  ) => {
    setSettingsForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleSelectDirectory = async (
    field:
      | "pendingDir"
      | "approvedDir"
      | "scheduleExportDir"
      | "allowanceProposalExportDir"
      | "allowanceAttachment1ExportDir"
      | "allowanceAttachment2ExportDir"
      | "databaseBackupDir"
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
            : field === "scheduleExportDir"
              ? "근무표 내보내기 폴더"
              : field === "allowanceProposalExportDir"
                ? "품의서 저장 폴더"
                : field === "allowanceAttachment1ExportDir"
                  ? "별첨1 저장 폴더"
                  : field === "allowanceAttachment2ExportDir"
                    ? "별첨2 저장 폴더"
                    : "DB 백업 저장 폴더";
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
      setActionMessage("운영 경로 설정을 저장했습니다.");
      await showActionResultDialog(askQuestion, {
        title: "설정 저장 완료",
        message: "운영 경로 설정을 저장했습니다."
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "설정 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const showBackupCompletedDialog = async (
    summary: Pick<DatabaseBackupSummary, "warningMessages">,
    baseDescription: string
  ) => {
    await askQuestion({
      title: "백업 완료",
      message: "백업 저장이 완료되었습니다.",
      description: buildBackupCompletionDescription({
        baseDescription,
        warningMessages: summary.warningMessages
      }),
      confirmLabel: "확인",
      hideCancel: true
    });
  };

  const handleRunDatabaseBackupNow = async () => {
    setActionError(null);
    setActionMessage(null);
    setIsRunningDatabaseBackup(true);

    try {
      const settingsResult = await window.appBridge.saveAppSettings(settingsForm);

      if (!settingsResult.ok) {
        setActionError(settingsResult.message);
        return;
      }

      setSettings(settingsResult.data);
      setSettingsForm(createSettingsForm(settingsResult.data));

      const backupResult = await window.appBridge.runDatabaseBackupNow();

      if (!backupResult.ok) {
        setActionError(backupResult.message);
        return;
      }

      await showBackupCompletedDialog(
        backupResult.data,
        "수동 DB 백업 파일(JSON, Excel, Access 원본)을 지정한 저장 폴더에 저장했습니다."
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "DB 수동 백업 중 오류가 발생했습니다.");
    } finally {
      setIsRunningDatabaseBackup(false);
    }
  };

  const handleSelectMigrationFile = async () => {
    setActionError(null);
    setActionMessage(null);
    setIsSelectingMigrationFile(true);

    try {
      const result = await window.appBridge.selectMigrationFile({
        defaultPath: settingsForm.migrationFilePath,
        title: "복원 파일 선택",
        buttonLabel: "파일 선택",
        filters: [
          {
            name: "복원 파일",
            extensions: ["json", "accdb"]
          }
        ]
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      if (!result.data) {
        return;
      }

      if (!isSupportedDatabaseMigrationFilePath(result.data)) {
        setActionError("DB복원은 JSON 백업(.json) 또는 Access DB(.accdb) 파일만 선택할 수 있습니다.");
        return;
      }

      handleSettingsFieldChange("migrationFilePath", result.data);

      if (resolveDatabaseMigrationSourceType(result.data) === "access" && selectedAccessTables.length === 0) {
        setSelectedAccessTables(defaultAccessMigrationTables);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "파일 선택 중 오류가 발생했습니다.");
    } finally {
      setIsSelectingMigrationFile(false);
    }
  };

  const buildDatabaseUpdateMessage = (summary: DatabaseMigrationSummary) => {
    const warnings = summary.warningMessages.length > 0 ? ` / 경고 ${summary.warningMessages.length}건` : "";

    if (summary.sourceType === "json") {
      return `DB복원을 완료했습니다. JSON 복원 테이블 ${summary.restoredTableCount}건, 실적 파일 ${summary.importedPerformanceFileCount}건, 승인 ${summary.importedApprovedEntryCount}건${warnings}`;
    }

    return `DB복원을 완료했습니다. 근무지 ${summary.importedSiteCount}건, 인력 ${summary.importedEmployeeCount}명, 패턴 ${summary.importedPatternCount}건, 실적 ${summary.importedPerformanceEntryCount}건, 승인 ${summary.importedApprovedEntryCount}건, 수당 ${summary.importedAllowanceCalculationCount}건, 배정 종료 ${summary.closedAssignmentCount}건${warnings}`;
  };

  const buildDatabaseMigrationRequirementMessage = (
    requirementCheck: DatabaseMigrationRequirementCheck
  ) =>
    [requirementCheck.headline, ...requirementCheck.details, ...requirementCheck.recommendedActions].join(
      " / "
    );

  const formatMigrationCount = (value: number) => value.toLocaleString("ko-KR");

  const handleCloseDatabaseUpdateModal = () => {
    if (isDatabaseUpdating || isDatabasePreviewLoading) {
      return;
    }

    setIsDatabaseUpdateModalOpen(false);
    setDatabaseUpdatePreview(null);
    setDatabaseUpdateResult(null);
    setDatabaseMigrationRequirementCheck(null);
    setDatabaseUpdateModalError(null);
    setIsDatabasePreviewLoading(false);
  };

  const handleSelectAllAccessTables = () => {
    setSelectedAccessTables(defaultAccessMigrationTables);
  };

  const handleClearAccessTables = () => {
    setSelectedAccessTables([]);
  };

  const handleToggleAccessTable = (tableName: AccessMigrationTableName) => {
    setSelectedAccessTables((current) =>
      current.includes(tableName)
        ? current.filter((value) => value !== tableName)
        : [...current, tableName]
    );
  };

  const handleOpenDatabaseUpdateModal = async () => {
    const migrationFilePath = settingsForm.migrationFilePath.trim();
    const sourceType = resolveDatabaseMigrationSourceType(migrationFilePath);

    if (!migrationFilePath) {
      setActionError("복원 파일 경로를 먼저 지정해야 합니다.");
      return;
    }

    if (sourceType === "access" && selectedAccessTables.length === 0) {
      setActionError("복원할 Access 테이블을 하나 이상 선택해야 합니다.");
      return;
    }

    if (!isSupportedDatabaseMigrationFilePath(migrationFilePath)) {
      setActionError(
        "DB복원은 JSON 백업(.json) 또는 Access DB(.accdb) 파일만 사용할 수 있습니다. Excel 파일은 복구 대상이 아닙니다."
      );
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setDatabaseUpdateModalError(null);
    setDatabaseUpdateResult(null);
    setDatabaseUpdatePreview(null);
    setDatabaseMigrationRequirementCheck(null);
    setIsDatabaseUpdateModalOpen(true);
    setIsDatabasePreviewLoading(true);

    try {
      const requirementResult = await window.appBridge.checkDatabaseMigrationRequirements({
        migrationFilePath
      });

      if (!requirementResult.ok) {
        setDatabaseUpdateModalError(requirementResult.message);
        return;
      }

      setDatabaseMigrationRequirementCheck(requirementResult.data);

      if (!requirementResult.data.isReady) {
        return;
      }

      const result = await window.appBridge.previewDatabaseMigrationUpdate({
        migrationFilePath,
        selectedAccessTables
      });

      if (!result.ok) {
        setDatabaseUpdateModalError(result.message);
        return;
      }

      setDatabaseMigrationRequirementCheck(result.data.requirementCheck);
      setDatabaseUpdatePreview(result.data);
    } catch (error) {
      setDatabaseUpdateModalError(
        error instanceof Error ? error.message : "DB복원 미리보기 중 오류가 발생했습니다."
      );
    } finally {
      setIsDatabasePreviewLoading(false);
    }
  };

  const handleRunDatabaseUpdate = async () => {
    const migrationFilePath = settingsForm.migrationFilePath.trim();
    const sourceType = resolveDatabaseMigrationSourceType(migrationFilePath);

    if (!migrationFilePath) {
      setDatabaseUpdateModalError("복원 파일 경로를 먼저 지정해야 합니다.");
      return;
    }

    if (sourceType === "access" && selectedAccessTables.length === 0) {
      setDatabaseUpdateModalError("복원할 Access 테이블을 하나 이상 선택해야 합니다.");
      return;
    }

    if (!isSupportedDatabaseMigrationFilePath(migrationFilePath)) {
      setDatabaseUpdateModalError(
        "DB복원은 JSON 백업(.json) 또는 Access DB(.accdb) 파일만 사용할 수 있습니다. Excel 파일은 복구 대상이 아닙니다."
      );
      return;
    }

    setDatabaseUpdateModalError(null);
    setActionError(null);
    setActionMessage(null);
    setIsDatabaseUpdating(true);

    try {
      const requirementResult = await window.appBridge.checkDatabaseMigrationRequirements({
        migrationFilePath
      });

      if (!requirementResult.ok) {
        setDatabaseUpdateModalError(requirementResult.message);
        return;
      }

      setDatabaseMigrationRequirementCheck(requirementResult.data);

      if (!requirementResult.data.isReady) {
        setDatabaseUpdateModalError(buildDatabaseMigrationRequirementMessage(requirementResult.data));
        return;
      }

      const settingsResult = await window.appBridge.saveAppSettings(settingsForm);

      if (!settingsResult.ok) {
        setDatabaseUpdateModalError(settingsResult.message);
        return;
      }

      setSettings(settingsResult.data);
      setSettingsForm(createSettingsForm(settingsResult.data));

      const result = await window.appBridge.updateDatabaseFromMigration({
        migrationFilePath,
        selectedAccessTables
      });

      if (!result.ok) {
        setDatabaseUpdateModalError(result.message);
        return;
      }

      setDatabaseMigrationRequirementCheck(result.data.requirementCheck);
      setDatabaseUpdateResult(result.data);
      setActionMessage(buildDatabaseUpdateMessage(result.data));
      setRefreshKey((current) => current + 1);
      setActiveMenu("settings");
      await showBackupCompletedDialog(
        result.data.backupSummary,
        "DB복원 전에 현재 DB 백업(JSON, Excel, Access 원본)을 저장했습니다."
      );
    } catch (error) {
      setDatabaseUpdateModalError(
        error instanceof Error ? error.message : "DB복원 중 오류가 발생했습니다."
      );
    } finally {
      setIsDatabaseUpdating(false);
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
      await showActionResultDialog(askQuestion, {
        title: input.id ? "요율 수정 완료" : "요율 등록 완료",
        message: input.id ? "요율 버전을 수정했습니다." : "요율 버전을 등록했습니다."
      });
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
    const confirmed = await askQuestion({
      title: "요율 버전 삭제 확인",
      message: `${version.versionLabel} 요율 버전을 삭제하시겠습니까? 계산 이력에 사용된 버전은 삭제할 수 없습니다.`,
      confirmLabel: "삭제",
      confirmVariant: "danger"
    });

    if (!confirmed.confirmed) {
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
      await showActionResultDialog(askQuestion, {
        title: "요율 삭제 완료",
        message: "요율 버전을 삭제했습니다."
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "요율 버전 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsRateActionRunning(false);
    }
  };

  const handleApplyRateVersion = async (version: AllowanceRateVersion) => {
    if (version.status === "active") {
      setActionError(null);
      setActionMessage(`${version.versionLabel} 요율이 이미 적용 중입니다.`);
      return;
    }

    const reasonResult = await askQuestion({
      title: "요율 적용 사유 입력",
      message: `${version.versionLabel} 요율을 적용합니다.`,
      description: "변경 사유는 요율 변경 이력과 활동 이력에 함께 기록됩니다.",
      confirmLabel: "적용",
      input: {
        label: "변경 사유",
        placeholder: "예: 2026년 하반기 지급 기준 조정 반영",
        multiline: true
      }
    });

    if (!reasonResult.confirmed) {
      return;
    }

    const changeReason = reasonResult.inputValue?.trim();

    if (!changeReason) {
      setActionError("요율 적용 사유를 입력하세요.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsRateActionRunning(true);

    try {
      const result = await window.appBridge.saveAllowanceRateVersion({
        id: version.id,
        year: version.year,
        versionLabel: version.versionLabel,
        status: "active",
        effectiveFrom: version.effectiveFrom,
        effectiveTo: version.effectiveTo,
        changeReason,
        items: version.items.map((item) => ({
          allowanceCode: item.allowanceCode,
          multiplier: item.multiplier,
          roundingPolicy: item.roundingPolicy
        }))
      });

      if (!result.ok) {
        setActionError(result.message);
        throw new Error(result.message);
      }

      setActionMessage(`${version.versionLabel} 요율을 적용했습니다.`);
      setRefreshKey((current) => current + 1);
      await showActionResultDialog(askQuestion, {
        title: "요율 적용 완료",
        message: `${version.versionLabel} 요율을 적용했습니다.`
      });
    } catch (error) {
      if (error instanceof Error && error.message) {
        throw error;
      }

      const message = "요율 적용 중 오류가 발생했습니다.";
      setActionError(message);
      throw new Error(message);
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
      await showActionResultDialog(askQuestion, {
        title: "사용자 저장 완료",
        message: "사용자 정보를 저장했습니다."
      });
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
    const confirmed = await askQuestion({
      title: "사용자 삭제 확인",
      message: `${user.displayName} 사용자를 삭제하시겠습니까? 삭제 후에는 목록에서 바로 제거됩니다.`,
      confirmLabel: "삭제",
      confirmVariant: "danger"
    });

    if (!confirmed.confirmed) {
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
      await showActionResultDialog(askQuestion, {
        title: "사용자 삭제 완료",
        message: "사용자를 삭제했습니다."
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "사용자 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsUserActionRunning(false);
    }
  };

  const handleRotateAccountRecoveryKey =
    async (): Promise<AccountRecoveryKeyRotationResult | null> => {
      const confirmed = await askQuestion({
        title: "계정복구키 발급",
        message:
          "새 복구키를 발급하면 이전 복구키는 즉시 사용할 수 없습니다. 계속 진행하시겠습니까?",
        confirmLabel: "발급",
        cancelLabel: "취소"
      });

      if (!confirmed.confirmed) {
        return null;
      }

      setActionError(null);
      setActionMessage(null);
      setIsRecoveryKeyRotating(true);

      try {
        const result = await window.appBridge.rotateAccountRecoveryKey();

        if (!result.ok) {
          setActionError(result.message);
          return null;
        }

        setActionMessage("계정복구키를 발급했습니다.");
        await showActionResultDialog(askQuestion, {
          title: "계정복구키 발급 완료",
          message: "새 복구키가 발급되었습니다. 다음 화면에서 키를 안전한 위치에 보관하세요."
        });

        return result.data;
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "계정복구키 발급 중 오류가 발생했습니다."
        );
        return null;
      } finally {
        setIsRecoveryKeyRotating(false);
      }
    };

  const handleSaveSiteNameOption = async (input: SiteNameOptionSaveInput) => {
    setActionError(null);
    setActionMessage(null);
    setIsSiteNameActionRunning(true);

    try {
      const result = await window.appBridge.saveSiteNameOption(input);

      if (!result.ok) {
        setActionError(result.message);
        throw new Error(result.message);
      }

      setActionMessage(`${result.data.name} 사이트 명을 저장했습니다.`);
      setRefreshKey((current) => current + 1);
      await showActionResultDialog(askQuestion, {
        title: "사이트 명 저장 완료",
        message: `${result.data.name} 사이트 명을 저장했습니다.`
      });
    } catch (error) {
      if (error instanceof Error && error.message) {
        throw error;
      }

      const message = "사이트 명 저장 중 오류가 발생했습니다.";
      setActionError(message);
      throw new Error(message);
    } finally {
      setIsSiteNameActionRunning(false);
    }
  };

  const handleDeleteSiteNameOption = async (option: SiteNameOptionRecord) => {
    const confirmed = await askQuestion({
      title: "사이트 명 삭제 확인",
      message: `${option.name} 사이트 명을 삭제하시겠습니까?`,
      description: "삭제 후 신규 근무지 등록 선택 목록에서 제외됩니다.",
      confirmLabel: "삭제",
      confirmVariant: "danger"
    });

    if (!confirmed.confirmed) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsSiteNameActionRunning(true);

    try {
      const result = await window.appBridge.deleteSiteNameOption({
        optionId: option.id
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage("사이트 명을 삭제했습니다.");
      setRefreshKey((current) => current + 1);
      await showActionResultDialog(askQuestion, {
        title: "사이트 명 삭제 완료",
        message: "사이트 명을 삭제했습니다."
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "사이트 명 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsSiteNameActionRunning(false);
    }
  };

  const pushTemplateProfileHistory = (profile: DocumentTemplateProfile) => {
    setTemplateProfileHistory((current) => [cloneTemplateProfileDraft(profile), ...current].slice(0, 20));
  };

  const applyTemplateProfileDraftUpdate = (
    updater: (current: DocumentTemplateProfile) => DocumentTemplateProfile
  ) => {
    setTemplatePreviewRecord(null);
    setTemplateProfileDraft((current) => {
      if (!current) {
        return current;
      }

      const next = updater(current);

      if (next === current) {
        return current;
      }

      pushTemplateProfileHistory(current);
      return next;
    });
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
    setTemplateProfileHistory([]);
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
      setTemplateProfileHistory([]);
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
      setTemplateProfileHistory([]);
      if (editingTemplateId === null || templateProfileBaseline === null) {
        setTemplateProfileBaseline(result.data.profile);
        setTemplateVersionLabelBaseline(templateVersionLabelInput);
        setTemplateManagedFileNameBaseline(templateManagedFileNameInput);
      }
      setTemplatePreviewRecord(null);

      const inspectionWarnings = result.data.inspectionWarnings ?? [];

      if (!result.data.canProceed) {
        // 구조가 맞지 않는 양식(예: 구버전 품의서)은 등록 단계에서 막아 운영자가 미리 교정하게 한다.
        const blockMessage =
          inspectionWarnings[0] ?? "이 양식은 구조가 맞지 않아 등록할 수 없습니다.";
        setActionError(blockMessage);
        await showActionResultDialog(askQuestion, {
          title: "양식 등록 불가",
          message: blockMessage
        });
        return;
      }

      if (inspectionWarnings.length > 0) {
        // 등록은 가능하지만 구조가 표준과 달라 생성 시 문제가 될 수 있는 경우 경고를 노출한다.
        setActionMessage(inspectionWarnings[0]);
        await showActionResultDialog(askQuestion, {
          title: "양식 확인 필요",
          message: inspectionWarnings[0]
        });
        return;
      }

      setActionMessage("양식 구조 확인을 완료했습니다.");
      await showActionResultDialog(askQuestion, {
        title: "양식 검증 완료",
        message: "양식 구조 확인을 완료했습니다."
      });
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
          setTemplateProfileHistory([]);
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
      setTemplateProfileHistory([]);
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
      setActionError("구조 확인을 통과한 양식만 저장할 수 있습니다.");
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
        profileSchemaVersion: "2",
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
      await showActionResultDialog(askQuestion, {
        title: editingTemplateId ? "양식 수정 완료" : "양식 저장 완료",
        message: editingTemplateId ? "양식을 수정했습니다." : "양식을 미승인 상태로 저장했습니다."
      });
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
      await showActionResultDialog(askQuestion, {
        title: "양식 미리보기 저장 완료",
        message: "미리보기 파일을 저장했습니다.",
        description: result.data.outputPath
      });
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
      await showActionResultDialog(askQuestion, {
        title: "양식 승인 완료",
        message: result.data.isDefault
          ? "양식을 승인했습니다. 현재 이 버전이 기본 사용 양식입니다."
          : "양식을 승인했습니다. 배포 메뉴에서 선택 가능하며, 필요하면 기본 사용으로 전환할 수 있습니다."
      });
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
    // 저장이 진행 중일 때는 취소/닫기 버튼처럼 Esc 로도 닫히지 않게 한다.
    if (isTemplateActionRunning) {
      return;
    }

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
      // 저장 성공 시에는 저장 진행 플래그가 아직 true 라 가드된 close 핸들러가 막히므로
      // 상태를 직접 정리해 모달을 닫는다.
      setOutputFileNameEditTemplate(null);
      setOutputFileNamePatternInput("");
      setRefreshKey((current) => current + 1);
      await showActionResultDialog(askQuestion, {
        title: "출력 파일명 규칙 저장 완료",
        message: "출력 파일명 규칙을 저장했습니다. 새로 생성되는 파일부터 적용됩니다."
      });
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
      await showActionResultDialog(askQuestion, {
        title: "기본 양식 전환 완료",
        message: `${templateTypeLabel[template.templateType]} 기본 사용 버전을 ${result.data.versionLabel}로 전환했습니다.`
      });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "기본 사용 양식 전환 중 오류가 발생했습니다."
      );
    } finally {
      setIsTemplateActionRunning(false);
    }
  };

  const handleDeleteTemplate = async (template: DocumentTemplateVersion) => {
    const confirmed = await askQuestion({
      title: "문서 양식 삭제 확인",
      message: `${template.versionLabel} 양식을 삭제하시겠습니까? 사용 중인 양식은 삭제할 수 없습니다.`,
      confirmLabel: "삭제",
      confirmVariant: "danger"
    });

    if (!confirmed.confirmed) {
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
      await showActionResultDialog(askQuestion, {
        title: "양식 삭제 완료",
        message: "양식을 삭제했습니다."
      });
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
    applyTemplateProfileDraftUpdate((current) => {
      if (!current || current.kind !== "schedule") {
        return current;
      }

      if (field === "changeReasonColumn") {
        const nextColumn = toColumnAddress(value);

        if (current.layout.changeReasonColumn === nextColumn) {
          return current;
        }

        return {
          ...current,
          layout: {
            ...current.layout,
            changeReasonColumn: nextColumn
          }
        };
      }

      if (current.layout[field] === value) {
        return current;
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
    applyTemplateProfileDraftUpdate((current) => {
      if (!current || current.kind === "schedule") {
        return current;
      }

      if (fieldKey === "primarySheetName") {
        if (current.primarySheetName === value) {
          return current;
        }

        return {
          ...current,
          primarySheetName: value
        };
      }

      if (current.fieldMappings[fieldKey] === value) {
        return current;
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

  const updateTemplateStyleSpecField = (
    field:
      | "columnWidths"
      | "rowHeights"
      | "fontSizes"
      | "fontColors"
      | "fillColors"
      | "horizontalAlignments"
      | "mergedRanges",
    styleKey: string,
    value: string | number | null
  ) => {
    applyTemplateProfileDraftUpdate((current) => {
      if (!current) {
        return current;
      }

      const nextStyleSpec: DocumentTemplateStyleSpec = {
        ...(current.styleSpec ?? {})
      };
      const currentMap = {
        ...(nextStyleSpec[field] ?? {})
      } as Record<string, string | number>;
      const normalizedCurrentValue = current.styleSpec?.[field]?.[styleKey] ?? undefined;
      const normalizedNextValue = value === null || value === "" ? undefined : value;

      if (normalizedCurrentValue === normalizedNextValue) {
        return current;
      }

      if (normalizedNextValue === undefined) {
        delete currentMap[styleKey];
      } else {
        currentMap[styleKey] = normalizedNextValue;
      }

      if (Object.keys(currentMap).length === 0) {
        delete nextStyleSpec[field];
      } else {
        nextStyleSpec[field] = currentMap as never;
      }

      return {
        ...current,
        styleSpec: nextStyleSpec
      };
    });
  };

  const restoreTemplateZoneStyle = (styleKey: string) => {
    applyTemplateProfileDraftUpdate((current) => {
      if (!current) {
        return current;
      }

      const nextStyleSpec: DocumentTemplateStyleSpec = {
        ...(current.styleSpec ?? {})
      };
      const baselineStyleSpec = templateProfileBaseline?.styleSpec ?? {};
      const styleFields: Array<keyof DocumentTemplateStyleSpec> = [
        "columnWidths",
        "rowHeights",
        "fontSizes",
        "fontColors",
        "fillColors",
        "horizontalAlignments",
        "mergedRanges"
      ];
      let hasChanges = false;

      for (const field of styleFields) {
        const currentMap = nextStyleSpec[field];
        const currentValue = current.styleSpec?.[field]?.[styleKey] ?? undefined;
        const baselineValue = baselineStyleSpec[field]?.[styleKey] ?? undefined;

        if (currentValue !== baselineValue) {
          hasChanges = true;
        }

        if (!currentMap || typeof currentMap !== "object") {
          if (baselineValue !== undefined) {
            nextStyleSpec[field] = {
              [styleKey]: baselineValue
            } as never;
          }
          continue;
        }

        const nextMap = {
          ...(currentMap as Record<string, string | number>)
        };

        if (baselineValue === undefined) {
          delete nextMap[styleKey];
        } else {
          nextMap[styleKey] = baselineValue;
        }

        if (Object.keys(nextMap).length === 0) {
          delete nextStyleSpec[field];
        } else {
          nextStyleSpec[field] = nextMap as never;
        }
      }

      if (!hasChanges) {
        return current;
      }

      return {
        ...current,
        styleSpec: nextStyleSpec
      };
    });
  };

  const undoTemplateProfileChange = () => {
    setTemplatePreviewRecord(null);
    setTemplateProfileHistory((current) => {
      const [latest, ...rest] = current;

      if (!latest) {
        return current;
      }

      setTemplateProfileDraft(cloneTemplateProfileDraft(latest));
      return rest;
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
    templateProfileDraft && templateProfileDraft.kind !== "schedule" ? templateProfileDraft : null;
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
        label: "경로 설정",
        description: "승인 폴더와 출력 경로 설정",
        badge: "설정"
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
        key: "site-name" as const,
        label: "사이트 명 관리",
        description: "근무지 등록 선택값 관리",
        badge: `${siteNameOptionRecords.length}건`
      },
      {
        key: "template" as const,
        label: "양식 관리",
        description: "승인, 기본 사용, 출력 규칙 관리",
        badge: `${templateRows.length}건`
      },
      {
        key: "patch-history" as const,
        label: "업데이트 내역",
        description: "버전별 변경사항과 배포 기준 조회",
        badge: "이력"
      }
    ],
    [
      primaryCalendar?.items.length,
      rateVersions.length,
      users.length,
      siteNameOptionRecords.length,
      templateRows.length
    ]
  );
  const activeMenuMeta =
    operationsMenuItems.find((menu) => menu.key === activeMenu) ?? operationsMenuItems[0];
  const renderedMenuSection = (() => {
    switch (activeMenu) {
      case "settings":
        return (
          <OperationsSettingsSection
            isLoading={isLoading}
            isSaving={isSaving}
            isSelectingDirectory={isSelectingDirectory}
            isSelectingMigrationFile={isSelectingMigrationFile}
            isRunningDatabaseBackup={isRunningDatabaseBackup}
            onClearAccessTables={handleClearAccessTables}
            onRunDatabaseBackupNow={() => {
              void handleRunDatabaseBackupNow();
            }}
            onSaveSettings={() => {
              void handleSaveSettings();
            }}
            onSelectAllAccessTables={handleSelectAllAccessTables}
            onSelectDirectory={(field) => {
              void handleSelectDirectory(field);
            }}
            onSelectMigrationFile={() => {
              void handleSelectMigrationFile();
            }}
            onSettingsFieldChange={handleSettingsFieldChange}
            onToggleAccessTable={handleToggleAccessTable}
            selectedAccessTables={selectedAccessTables}
            settings={settings}
            settingsForm={settingsForm}
            showAccessTableSelection={
              resolveDatabaseMigrationSourceType(settingsForm.migrationFilePath.trim()) === "access"
            }
          />
        );
      case "holiday":
        return (
          <OperationsHolidaySection
            holidayApiBaseUrl={settingsForm.holidayApiBaseUrl}
            isLoading={isLoading}
            lookupYear={debouncedHolidayYear}
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
            onApplyRate={handleApplyRateVersion}
            onDeleteRate={handleDeleteRateVersion}
            onSaveRate={handleSaveRateVersion}
            rateHistory={rateHistory}
            rateVersions={rateVersions}
          />
        );
      case "user":
        return (
          <OperationsUserSection
            actionError={actionError}
            isActionRunning={isUserActionRunning}
            isLoading={isLoading}
            isRecoveryKeyRotating={isRecoveryKeyRotating}
            onDeleteUser={handleDeleteOperationUser}
            onRotateAccountRecoveryKey={handleRotateAccountRecoveryKey}
            onSaveUser={handleSaveOperationUser}
            userRoleLabel={userRoleLabel}
            userStatusLabel={userStatusLabel}
            users={users}
          />
        );
      case "site-name":
        return (
          <OperationsSiteNameSection
            actionError={actionError}
            isActionRunning={isSiteNameActionRunning}
            isLoading={isLoading}
            onDeleteSiteNameOption={handleDeleteSiteNameOption}
            onSaveSiteNameOption={handleSaveSiteNameOption}
            siteNameOptions={siteNameOptionRecords}
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
            onOpenGuide={() => {
              setTemplateGuideInitialPageId("operations-template-guide-intro");
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
      case "patch-history":
        return <OperationsReleaseHistorySection />;
      default:
        return null;
    }
  })();
  const databaseUpdateNextState =
    databaseUpdateResult?.databaseState ?? databaseUpdatePreview?.previewState ?? null;
  const databaseUpdateSummary = databaseUpdateResult ?? databaseUpdatePreview;
  const activeDatabaseMigrationRequirementCheck =
    databaseUpdateResult?.requirementCheck ??
    databaseUpdatePreview?.requirementCheck ??
    databaseMigrationRequirementCheck;
  const databaseUpdateSourceLabel =
    activeDatabaseMigrationRequirementCheck?.sourceType
      ? databaseMigrationSourceLabels[activeDatabaseMigrationRequirementCheck.sourceType]
      : databaseUpdatePreview?.sourceType
        ? databaseMigrationSourceLabels[databaseUpdatePreview.sourceType]
        : null;

  const { dialogRef: dbDialogRef, onKeyDown: dbOnKeyDown } = useDialogDismiss<HTMLDivElement>({
    isOpen: isDatabaseUpdateModalOpen,
    onDismiss: handleCloseDatabaseUpdateModal
  });
  const { dialogRef: outputDialogRef, onKeyDown: outputOnKeyDown } = useDialogDismiss<HTMLDivElement>({
    isOpen: Boolean(outputFileNameEditTemplate),
    onDismiss: handleCloseOutputFileNameModal
  });

  return (
    <div className="screen-stack">
      {questionDialog}

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">메뉴 7</p>
            <h3>운영 관리</h3>
          </div>
          <button
            className="primary-button"
            disabled={
              isLoading ||
              isSaving ||
              isSelectingDirectory ||
              isSelectingMigrationFile ||
              isRunningDatabaseBackup ||
              isDatabaseUpdating ||
              isDatabasePreviewLoading
            }
            onClick={() => {
              void handleOpenDatabaseUpdateModal();
            }}
            type="button"
          >
            {isDatabasePreviewLoading
              ? "미리보기 불러오는 중..."
              : isDatabaseUpdating
                ? "복원 중..."
                : "DB복원"}
          </button>
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
      {!isTemplateModalOpen && !outputFileNameEditTemplate && !isDatabaseUpdateModalOpen && actionError ? (
        <p className="form-error-text">{actionError}</p>
      ) : null}
      {!isTemplateModalOpen && !outputFileNameEditTemplate && !isDatabaseUpdateModalOpen && actionMessage ? (
        <p className="form-success-text">{actionMessage}</p>
      ) : null}
      {renderedMenuSection}
      <TemplateWizardModal
        actionError={actionError}
        actionMessage={actionMessage}
        canUndoTemplateProfileChange={templateProfileHistory.length > 0}
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
        onOpenGuide={() => {
          setTemplateGuideInitialPageId("operations-template-guide-register");
        }}
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
        onRestoreTemplateZoneStyle={restoreTemplateZoneStyle}
        onSaveTemplate={() => {
          void handleSaveTemplate();
        }}
        onScheduleProfileFieldChange={updateScheduleProfileField}
        onTemplateStyleSpecChange={updateTemplateStyleSpecField}
        onUndoTemplateProfileChange={undoTemplateProfileChange}
        onTemplateTypeChange={(value) => {
          setTemplateTypeInput(value);
          setSelectedTemplateSource(null);
          setTemplateManagedFileNameInput("");
          setTemplateValidation(null);
          setTemplateProfileDraft(null);
          setTemplateProfileHistory([]);
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
      {isDatabaseUpdateModalOpen ? (
        <div className="modal-overlay">
          <div
            aria-labelledby="ops-db-migration-modal-title"
            aria-modal="true"
            className="modal-card operations-edit-modal database-migration-modal"
            onKeyDown={dbOnKeyDown}
            ref={dbDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="section-heading">
              <div className="modal-heading-copy">
                <strong id="ops-db-migration-modal-title">{databaseUpdateResult ? "DB복원 완료" : "DB복원 미리보기"}</strong>
                <p>
                  현재 저장된 자료 현황과 되돌린 뒤 반영될 현황을 비교합니다. 내용을 확인한 뒤
                  '승인'을 누르면 자료 교체를 실행합니다.
                </p>
              </div>
              <div className="button-row">
                <button
                  className="ghost-button compact-button"
                  disabled={isDatabaseUpdating || isDatabasePreviewLoading}
                  onClick={() => {
                    setDatabaseGuideInitialPageId(
                      databaseUpdateResult
                        ? "operations-db-update-guide-run"
                        : "operations-db-update-guide-preview"
                    );
                  }}
                  type="button"
                >
                  가이드 보기
                </button>
                <button
                  className="ghost-button"
                  disabled={isDatabaseUpdating || isDatabasePreviewLoading}
                  onClick={handleCloseDatabaseUpdateModal}
                  type="button"
                >
                  닫기
                </button>
              </div>
            </div>
            {databaseUpdateModalError ? <p className="form-error-text">{databaseUpdateModalError}</p> : null}
            {databaseUpdateResult ? (
              <p className="form-success-text">{buildDatabaseUpdateMessage(databaseUpdateResult)}</p>
            ) : null}
            {isDatabasePreviewLoading ? (
              <div className="database-migration-loading-card">
                <strong>복원 미리보기를 준비 중입니다.</strong>
                <span>Access/JSON 파일을 임시 DB로 불러와 현재 저장 현황과 비교합니다.</span>
              </div>
            ) : activeDatabaseMigrationRequirementCheck && !activeDatabaseMigrationRequirementCheck.isReady ? (
              <div className="database-migration-modal-body">
                <section className="database-migration-section">
                  <div className="database-migration-section-head">
                    <strong>Access 복원 사전 점검</strong>
                    <span>현재 PC에서는 Access DB(.accdb) 복원을 바로 실행할 수 없습니다.</span>
                  </div>
                  <article className="database-migration-requirement-card is-blocked">
                    <strong>{activeDatabaseMigrationRequirementCheck.headline}</strong>
                    <ul className="database-migration-warning-list">
                      {activeDatabaseMigrationRequirementCheck.details.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                    {activeDatabaseMigrationRequirementCheck.recommendedActions.length > 0 ? (
                      <ul className="database-migration-warning-list">
                        {activeDatabaseMigrationRequirementCheck.recommendedActions.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                </section>
              </div>
            ) : databaseUpdatePreview && databaseUpdateSummary && databaseUpdateNextState ? (
              <div className="database-migration-modal-body">
                <div className="database-migration-meta-grid">
                  <article className="database-migration-meta-card">
                    <span>복원 유형</span>
                    <strong>{databaseUpdateSourceLabel ?? "-"}</strong>
                    <em>{databaseUpdateResult ? "실행 완료" : "미리보기 준비 완료"}</em>
                  </article>
                  <article className="database-migration-meta-card database-migration-meta-card--wide">
                    <span>대상 파일</span>
                    <strong title={databaseUpdatePreview.migrationFilePath}>
                      {databaseUpdatePreview.migrationFilePath}
                    </strong>
                    <em title={databaseUpdatePreview.databasePath}>
                      DB 경로: {databaseUpdatePreview.databasePath}
                    </em>
                  </article>
                  <article className="database-migration-meta-card">
                    <span>{databaseUpdateResult ? "완료 시각" : "미리보기 시각"}</span>
                    <strong>
                      {formatDateTime(
                        databaseUpdateResult?.completedAt ?? databaseUpdatePreview.previewedAt
                      )}
                    </strong>
                    <em>경고 {databaseUpdateSummary.warningMessages.length}건</em>
                  </article>
                </div>

                {activeDatabaseMigrationRequirementCheck?.sourceType === "access" ? (
                  <section className="database-migration-section">
                    <div className="database-migration-section-head">
                      <strong>Access 복원 사전 점검</strong>
                      <span>
                        {activeDatabaseMigrationRequirementCheck.isReady
                          ? "현재 PC에서 Access DB(.accdb) 복원을 실행할 수 있습니다."
                          : "추가 환경 구성이 필요합니다."}
                      </span>
                    </div>
                    <article
                      className={`database-migration-requirement-card ${
                        activeDatabaseMigrationRequirementCheck.isReady ? "is-ready" : "is-blocked"
                      }`}
                    >
                      <strong>{activeDatabaseMigrationRequirementCheck.headline}</strong>
                      <ul className="database-migration-warning-list">
                        {activeDatabaseMigrationRequirementCheck.details.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    </article>
                  </section>
                ) : null}

                {databaseUpdateSummary.sourceType === "access" ? (
                  <section className="database-migration-section">
                    <div className="database-migration-section-head">
                      <strong>선택 테이블</strong>
                      <span>이번 Access 복원 미리보기/실행에 반영되는 원본 테이블입니다.</span>
                    </div>
                    <div className="database-migration-tag-row">
                      {databaseUpdateSummary.selectedAccessTables.map((tableName) => (
                        <span className="database-migration-tag" key={tableName}>
                          {tableName}
                        </span>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="database-migration-section">
                  <div className="database-migration-section-head">
                    <strong>현황 비교</strong>
                    <span>
                      {databaseUpdateResult ? "복원 완료 후 실제 DB 상태" : "승인 시 반영될 예상 상태"}
                    </span>
                  </div>
                  <div className="database-migration-table-shell">
                    <table className="database-migration-table">
                      <colgroup>
                        <col className="database-migration-col-label" />
                        <col className="database-migration-col-current" />
                        <col className="database-migration-col-next" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>항목</th>
                          <th>현재</th>
                          <th>DB복원</th>
                        </tr>
                      </thead>
                      <tbody>
                        {databaseMigrationStateFieldLabels.map(({ key, label }) => {
                          const currentValue = databaseUpdatePreview.currentState[key];
                          const nextValue = databaseUpdateNextState[key];

                          return (
                            <tr key={key}>
                              <td>{label}</td>
                              <td>{formatMigrationCount(currentValue)}</td>
                              <td>{formatMigrationCount(nextValue)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="database-migration-section">
                  <div className="database-migration-section-head">
                    <strong>복원 상세</strong>
                    <span>{databaseUpdateResult ? "실제 복원 결과" : "예상 복원 건수"}</span>
                  </div>
                  <div className="database-migration-impact-grid">
                    {databaseMigrationImportSummaryLabels.map(({ key, label }) => (
                      <article className="database-migration-impact-card" key={key}>
                        <span>{label}</span>
                        <strong>{formatMigrationCount(databaseUpdateSummary[key])}</strong>
                      </article>
                    ))}
                  </div>
                </section>

                {databaseUpdateSummary.skippedPatternSiteNames.length > 0 ? (
                  <section className="database-migration-section">
                    <div className="database-migration-section-head">
                      <strong>패턴 제외 근무지</strong>
                      <span>원본 시간 슬롯이 없어 자동 복원하지 않습니다.</span>
                    </div>
                    <div className="database-migration-tag-row">
                      {databaseUpdateSummary.skippedPatternSiteNames.map((siteName) => (
                        <span className="database-migration-tag" key={siteName}>
                          {siteName}
                        </span>
                      ))}
                    </div>
                  </section>
                ) : null}

                {databaseUpdateSummary.warningMessages.length > 0 ? (
                  <section className="database-migration-section">
                    <div className="database-migration-section-head">
                      <strong>경고 및 제외 항목</strong>
                      <span>자동 복원에서 제외되거나 별도 확인이 필요한 항목입니다.</span>
                    </div>
                    <ul className="database-migration-warning-list">
                      {databaseUpdateSummary.warningMessages.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {databaseUpdateResult?.backupSummary ? (
                  <section className="database-migration-section">
                    <div className="database-migration-section-head">
                      <strong>사전 백업</strong>
                      <span>DB 교체 전 현재 DB를 JSON 및 Excel 백업으로 저장했습니다.</span>
                    </div>
                    <div className="database-migration-meta-grid">
                      <article className="database-migration-meta-card database-migration-meta-card--wide">
                        <span>JSON 백업</span>
                        <strong title={databaseUpdateResult.backupSummary.jsonBackupPath}>
                          {databaseUpdateResult.backupSummary.jsonBackupPath}
                        </strong>
                        <em>{formatDateTime(databaseUpdateResult.backupSummary.createdAt)}</em>
                      </article>
                      <article className="database-migration-meta-card database-migration-meta-card--wide">
                        <span>Excel 백업</span>
                        <strong title={databaseUpdateResult.backupSummary.excelBackupPath ?? ""}>
                          {databaseUpdateResult.backupSummary.excelBackupPath ?? "생성 안 됨"}
                        </strong>
                        <em>{formatDateTime(databaseUpdateResult.backupSummary.createdAt)}</em>
                      </article>
                      <article className="database-migration-meta-card database-migration-meta-card--wide">
                        <span>Access 백업</span>
                        <strong title={databaseUpdateResult.backupSummary.accessBackupPath ?? ""}>
                          {databaseUpdateResult.backupSummary.accessBackupPath ?? "생성 안 됨"}
                        </strong>
                        <em>경고 {databaseUpdateResult.backupSummary.warningMessages.length}건</em>
                      </article>
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
            <div className="button-row">
              <button
                className="ghost-button"
                disabled={isDatabaseUpdating || isDatabasePreviewLoading}
                onClick={handleCloseDatabaseUpdateModal}
                type="button"
              >
                {databaseUpdateResult ? "닫기" : "취소"}
              </button>
              {!databaseUpdateResult ? (
                <button
                  className="primary-button"
                  disabled={isDatabasePreviewLoading || isDatabaseUpdating || !databaseUpdatePreview}
                  onClick={() => {
                    void handleRunDatabaseUpdate();
                  }}
                  type="button"
                >
                  {isDatabaseUpdating ? "복원 실행 중..." : "승인"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {templateGuideInitialPageId ? (
        <GuideFlowModal
          guide={operationsTemplateManagementGuide}
          initialPageId={templateGuideInitialPageId}
          onClose={() => {
            setTemplateGuideInitialPageId(null);
          }}
        />
      ) : null}
      {databaseGuideInitialPageId ? (
        <GuideFlowModal
          guide={operationsDatabaseUpdateGuide}
          initialPageId={databaseGuideInitialPageId}
          onClose={() => {
            setDatabaseGuideInitialPageId(null);
          }}
        />
      ) : null}
      {outputFileNameEditTemplate ? (
        <div className="modal-overlay">
          <div
            aria-labelledby="ops-output-filename-modal-title"
            aria-modal="true"
            className="modal-card operations-edit-modal"
            onKeyDown={outputOnKeyDown}
            ref={outputDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="section-heading">
              <div className="modal-heading-copy">
                <strong id="ops-output-filename-modal-title">출력 파일명 규칙 변경</strong>
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
