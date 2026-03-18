import type { ReactNode } from "react";

import type {
  DocumentTemplateFileSelection,
  DocumentTemplatePreviewRecord
} from "@shared/bridge/contracts";
import type {
  DocumentTemplateProfile,
  DocumentTemplateTitleCandidate,
  DocumentTemplateValidationSnapshot,
  GenericDocumentTemplateProfile,
  ScheduleDocumentTemplateProfile
} from "@shared/domain/document-template";
import type { TemplateType } from "@shared/domain/model";

import { FormSelect } from "../../components/FormSelect";

type ScheduleProfileField =
  | "sheetName"
  | "siteNameCell"
  | "monthTitleCell"
  | "rosterSummaryCell"
  | "changeReasonColumn";

interface TemplateWizardModalProps {
  isOpen: boolean;
  editingTemplateId: string | null;
  templateWizardStep: 1 | 2;
  actionError: string | null;
  actionMessage: string | null;
  templateTypeInput: TemplateType;
  templateTypeOptions: TemplateType[];
  templateTypeLabel: Record<TemplateType, string>;
  templateVersionLabelInput: string;
  templateVersionLabelBaseline: string;
  templateManagedFileNameInput: string;
  templateManagedFileNameBaseline: string;
  selectedTemplateSource: DocumentTemplateFileSelection | null;
  templateValidation: DocumentTemplateValidationSnapshot | null;
  templatePreviewRecord: DocumentTemplatePreviewRecord | null;
  isTemplateActionRunning: boolean;
  scheduleProfileDraft: ScheduleDocumentTemplateProfile | null;
  genericProfileDraft: GenericDocumentTemplateProfile | null;
  genericTemplateType: Exclude<TemplateType, "schedule"> | null;
  templateCandidateOptions: DocumentTemplateTitleCandidate[];
  templateProfileBaseline: DocumentTemplateProfile | null;
  siteNameOptions: DocumentTemplateTitleCandidate[];
  monthTitleOptions: DocumentTemplateTitleCandidate[];
  rosterSummaryOptions: DocumentTemplateTitleCandidate[];
  reasonColumnOptions: DocumentTemplateTitleCandidate[];
  onClose: () => void;
  onTemplateTypeChange: (value: TemplateType) => void;
  onVersionLabelChange: (value: string) => void;
  onManagedFileNameChange: (value: string) => void;
  onPickTemplateFile: () => void;
  onInspectTemplate: () => void;
  onGoStep2: () => void;
  onGoStep1: () => void;
  onScheduleProfileFieldChange: (field: ScheduleProfileField, value: string) => void;
  onGenericProfileFieldChange: (fieldKey: string, value: string) => void;
  onPreviewTemplate: () => void;
  onSaveTemplate: () => void;
  formatDateTime: (value?: string) => string;
  getGenericFieldLabel: (
    templateType: Exclude<TemplateType, "schedule">,
    fieldKey: string
  ) => string;
  createTemplateCandidateLabel: (address: string, text?: string) => string;
  isGenericRowField: (fieldKey: string) => boolean;
}

interface NavigatorCardDefinition {
  key: string;
  title: string;
  description: string;
  impact: string;
  beforeValue: string;
  afterValue: string;
  control: ReactNode;
}

const scheduleFieldGuide: Record<
  ScheduleProfileField,
  {
    title: string;
    description: string;
    impact: string;
  }
> = {
  sheetName: {
    title: "어느 시트를 읽을지",
    description: "엑셀 안에 시트가 여러 개 있으면, 이 시트를 기준으로 배포 양식을 읽습니다.",
    impact: "다른 시트를 고르면 아래 셀 좌표 의미도 함께 달라질 수 있습니다."
  },
  siteNameCell: {
    title: "근무지명이 들어갈 위치",
    description: "배포 파일에서 근무지명이 적히는 셀입니다.",
    impact: "여기를 바꾸면 근무지명이 보이는 위치만 달라집니다."
  },
  monthTitleCell: {
    title: "대상 월이 들어갈 위치",
    description: "배포 대상 월이나 제목이 적히는 셀입니다.",
    impact: "여기를 바꾸면 월 표기 위치가 바뀝니다."
  },
  rosterSummaryCell: {
    title: "근무조 편성 요약 시작 위치",
    description: "우측 근무조 편성 정보가 요약 표시되는 기준 셀입니다.",
    impact: "여기를 바꾸면 우측 요약 블록 시작 위치가 달라집니다."
  },
  changeReasonColumn: {
    title: "변경 사유 열",
    description: "중앙 변경관리 표에서 변경 사유를 적는 기준 열입니다.",
    impact: "여기를 바꾸면 변경 사유가 기록되는 열이 이동합니다."
  }
};

const genericFieldGuide: Record<
  Exclude<TemplateType, "schedule">,
  Record<string, { description: string; impact: string }>
> = {
  proposal: {
    primarySheetName: {
      description: "검토 기준으로 사용할 시트입니다.",
      impact: "후보 셀 탐색 기준과 기본 검토 화면이 달라집니다."
    },
    sheetName: {
      description: "실제 문서를 채워 넣을 시트입니다.",
      impact: "출력 결과가 기록되는 시트가 바뀝니다."
    },
    workMonthCell: {
      description: "대상 월이 적히는 셀입니다.",
      impact: "품의서 상단의 월 정보 위치가 달라집니다."
    },
    printedDateCell: {
      description: "문서 출력일이 적히는 셀입니다.",
      impact: "출력일 위치가 바뀝니다."
    },
    ownerDepartmentCell: {
      description: "부서명이 적히는 셀입니다.",
      impact: "부서 정보 위치만 바뀝니다."
    },
    systemNameCell: {
      description: "시스템명 또는 상단 안내가 적히는 셀입니다.",
      impact: "문서 상단 안내 위치가 바뀝니다."
    },
    documentTitleCell: {
      description: "문서 제목이 적히는 셀입니다.",
      impact: "제목 표시 위치가 바뀝니다."
    },
    summaryIntroCell: {
      description: "도입 문구가 들어가는 셀입니다.",
      impact: "요약 안내 문구 위치가 바뀝니다."
    },
    scopeCell: {
      description: "지급 범위 문구가 들어가는 셀입니다.",
      impact: "지급 기준 설명 위치가 바뀝니다."
    },
    targetHeadcountCell: {
      description: "대상 인원 안내가 적히는 셀입니다.",
      impact: "대상자 수 표기 위치가 달라집니다."
    },
    sectionTitleCell: {
      description: "표 바로 위 소제목이 적히는 셀입니다.",
      impact: "표 제목 위치가 바뀝니다."
    },
    dataStartRow: {
      description: "실제 표 데이터가 시작되는 행입니다.",
      impact: "표를 채우기 시작하는 위치가 위아래로 이동합니다."
    }
  },
  attachment1: {
    primarySheetName: {
      description: "검토 기준으로 사용할 시트입니다.",
      impact: "후보 셀 탐색 기준과 기본 검토 화면이 달라집니다."
    },
    sheetName: {
      description: "실제 문서를 채워 넣을 시트입니다.",
      impact: "출력 결과가 기록되는 시트가 바뀝니다."
    },
    titleCell: {
      description: "문서 제목이 적히는 셀입니다.",
      impact: "제목 표시 위치가 달라집니다."
    },
    dataStartRow: {
      description: "표 데이터가 시작되는 행입니다.",
      impact: "표 전체 시작 위치가 이동합니다."
    }
  },
  attachment2: {
    primarySheetName: {
      description: "검토 기준으로 사용할 시트입니다.",
      impact: "후보 셀 탐색 기준과 기본 검토 화면이 달라집니다."
    },
    sheetName: {
      description: "실제 문서를 채워 넣을 시트입니다.",
      impact: "출력 결과가 기록되는 시트가 바뀝니다."
    },
    titleCell: {
      description: "문서 제목이 적히는 셀입니다.",
      impact: "제목 표시 위치가 달라집니다."
    },
    dateRangeCell: {
      description: "기간이 적히는 셀입니다.",
      impact: "대상 기간 문구 위치가 바뀝니다."
    },
    dataStartRow: {
      description: "표 데이터가 시작되는 행입니다.",
      impact: "표 전체 시작 위치가 이동합니다."
    }
  }
};

const formatValue = (value?: string | null) => value || "-";

const renderNavigatorCard = ({
  key,
  title,
  description,
  impact,
  beforeValue,
  afterValue,
  control
}: NavigatorCardDefinition) => {
  const changed = beforeValue !== afterValue;

  return (
    <article className="template-change-card" data-changed={changed} key={key}>
      <div className="template-change-card-head">
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        <span className={`pill ${changed ? "accent" : "neutral"}`}>{changed ? "변경됨" : "유지"}</span>
      </div>
      <div className="template-change-values">
        <div className="template-change-value">
          <span>변경 전</span>
          <strong>{beforeValue}</strong>
        </div>
        <div className="template-change-arrow">→</div>
        <div className="template-change-value">
          <span>변경 후</span>
          <strong>{afterValue}</strong>
        </div>
      </div>
      <p className="template-change-impact">{impact}</p>
      <div className="template-change-control">{control}</div>
    </article>
  );
};

export const TemplateWizardModal = ({
  isOpen,
  editingTemplateId,
  templateWizardStep,
  actionError,
  actionMessage,
  templateTypeInput,
  templateTypeOptions,
  templateTypeLabel,
  templateVersionLabelInput,
  templateVersionLabelBaseline,
  templateManagedFileNameInput,
  templateManagedFileNameBaseline,
  selectedTemplateSource,
  templateValidation,
  templatePreviewRecord,
  isTemplateActionRunning,
  scheduleProfileDraft,
  genericProfileDraft,
  genericTemplateType,
  templateCandidateOptions,
  templateProfileBaseline,
  siteNameOptions,
  monthTitleOptions,
  rosterSummaryOptions,
  reasonColumnOptions,
  onClose,
  onTemplateTypeChange,
  onVersionLabelChange,
  onManagedFileNameChange,
  onPickTemplateFile,
  onInspectTemplate,
  onGoStep2,
  onGoStep1,
  onScheduleProfileFieldChange,
  onGenericProfileFieldChange,
  onPreviewTemplate,
  onSaveTemplate,
  formatDateTime,
  getGenericFieldLabel,
  createTemplateCandidateLabel,
  isGenericRowField
}: TemplateWizardModalProps) => {
  if (!isOpen) {
    return null;
  }

  const hasProfileDraft = scheduleProfileDraft !== null || genericProfileDraft !== null;
  const scheduleBaseline =
    templateProfileBaseline?.kind === "schedule" ? templateProfileBaseline : null;
  const genericBaseline = templateProfileBaseline?.kind === "generic" ? templateProfileBaseline : null;
  const candidateLabelLookup = new Map(
    templateCandidateOptions.map((candidate) => [
      candidate.address,
      createTemplateCandidateLabel(candidate.address, candidate.text)
    ])
  );

  const getTitleCandidateOptionsWithCurrent = (currentAddress?: string) => {
    const base = templateValidation?.titleCandidates ?? [];

    if (!currentAddress) {
      return base;
    }

    if (base.some((candidate) => candidate.address === currentAddress)) {
      return base;
    }

    return [
      {
        sheetName: templateValidation?.primarySheetName ?? "-",
        address: currentAddress,
        text: "현재 설정"
      },
      ...base
    ];
  };

  const getAddressLabel = (address?: string) => {
    if (!address) {
      return "-";
    }

    return candidateLabelLookup.get(address) ?? address;
  };

  const getReasonColumnLabel = (column?: string) => {
    if (!column) {
      return "-";
    }

    const currentAddress = `${column}1`;
    const candidate = reasonColumnOptions.find(
      (item) => item.address === currentAddress || item.address === column
    );

    return candidate ? createTemplateCandidateLabel(candidate.address, candidate.text) : `${column} 열`;
  };

  const scheduleCards: NavigatorCardDefinition[] = scheduleProfileDraft
    ? [
        {
          key: "versionLabel",
          title: "목록에 보일 이름",
          description: "양식 관리 목록과 배포 선택 목록에서 보이는 이름입니다.",
          impact: "이름만 바뀌고, 엑셀 안의 좌표나 출력 내용은 그대로 유지됩니다.",
          beforeValue: formatValue(templateVersionLabelBaseline || (editingTemplateId ? "-" : "새 등록")),
          afterValue: formatValue(templateVersionLabelInput),
          control: (
            <input
              onChange={(event) => {
                onVersionLabelChange(event.target.value);
              }}
              placeholder="예: 2026.3 운영본"
              value={templateVersionLabelInput}
            />
          )
        },
        {
          key: "managedFileName",
          title: "내부 보관 파일명",
          description: "관리 폴더에 보관되는 양식 파일 이름입니다.",
          impact: "보관용 파일명만 바뀌며, 실제 배포 파일명 규칙은 별도로 관리됩니다.",
          beforeValue: formatValue(templateManagedFileNameBaseline || (editingTemplateId ? "-" : "새 파일")),
          afterValue: formatValue(templateManagedFileNameInput),
          control: (
            <input
              onChange={(event) => {
                onManagedFileNameChange(event.target.value);
              }}
              placeholder="예: 근무표_운영본.xlsx"
              value={templateManagedFileNameInput}
            />
          )
        },
        {
          key: "sheetName",
          title: scheduleFieldGuide.sheetName.title,
          description: scheduleFieldGuide.sheetName.description,
          impact: scheduleFieldGuide.sheetName.impact,
          beforeValue: formatValue(scheduleBaseline?.layout.sheetName),
          afterValue: formatValue(scheduleProfileDraft.layout.sheetName),
          control: (
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                onScheduleProfileFieldChange("sheetName", event.target.value);
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
          )
        },
        {
          key: "siteNameCell",
          title: scheduleFieldGuide.siteNameCell.title,
          description: scheduleFieldGuide.siteNameCell.description,
          impact: scheduleFieldGuide.siteNameCell.impact,
          beforeValue: getAddressLabel(scheduleBaseline?.layout.siteNameCell),
          afterValue: getAddressLabel(scheduleProfileDraft.layout.siteNameCell),
          control: (
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                onScheduleProfileFieldChange("siteNameCell", event.target.value);
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
          )
        },
        {
          key: "monthTitleCell",
          title: scheduleFieldGuide.monthTitleCell.title,
          description: scheduleFieldGuide.monthTitleCell.description,
          impact: scheduleFieldGuide.monthTitleCell.impact,
          beforeValue: getAddressLabel(scheduleBaseline?.layout.monthTitleCell),
          afterValue: getAddressLabel(scheduleProfileDraft.layout.monthTitleCell),
          control: (
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                onScheduleProfileFieldChange("monthTitleCell", event.target.value);
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
          )
        },
        {
          key: "rosterSummaryCell",
          title: scheduleFieldGuide.rosterSummaryCell.title,
          description: scheduleFieldGuide.rosterSummaryCell.description,
          impact: scheduleFieldGuide.rosterSummaryCell.impact,
          beforeValue: getAddressLabel(scheduleBaseline?.layout.rosterSummaryCell),
          afterValue: getAddressLabel(scheduleProfileDraft.layout.rosterSummaryCell),
          control: (
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                onScheduleProfileFieldChange("rosterSummaryCell", event.target.value);
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
          )
        },
        {
          key: "changeReasonColumn",
          title: scheduleFieldGuide.changeReasonColumn.title,
          description: scheduleFieldGuide.changeReasonColumn.description,
          impact: scheduleFieldGuide.changeReasonColumn.impact,
          beforeValue: getReasonColumnLabel(scheduleBaseline?.layout.changeReasonColumn),
          afterValue: getReasonColumnLabel(scheduleProfileDraft.layout.changeReasonColumn),
          control: (
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                onScheduleProfileFieldChange("changeReasonColumn", event.target.value);
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
          )
        }
      ]
    : [];

  const genericCards: NavigatorCardDefinition[] =
    genericProfileDraft && genericTemplateType
      ? [
          {
            key: "versionLabel",
            title: "목록에 보일 이름",
            description: "양식 관리 목록과 출력 메뉴에서 보이는 이름입니다.",
            impact: "이름만 바뀌고 좌표는 유지됩니다.",
            beforeValue: formatValue(templateVersionLabelBaseline || (editingTemplateId ? "-" : "새 등록")),
            afterValue: formatValue(templateVersionLabelInput),
            control: (
              <input
                onChange={(event) => {
                  onVersionLabelChange(event.target.value);
                }}
                placeholder="예: 2026.3 운영본"
                value={templateVersionLabelInput}
              />
            )
          },
          {
            key: "managedFileName",
            title: "내부 보관 파일명",
            description: "관리 폴더에 보관되는 양식 파일 이름입니다.",
            impact: "보관용 파일명만 바뀌며, 실제 출력 파일명 규칙은 별도 관리됩니다.",
            beforeValue: formatValue(templateManagedFileNameBaseline || (editingTemplateId ? "-" : "새 파일")),
            afterValue: formatValue(templateManagedFileNameInput),
            control: (
              <input
                onChange={(event) => {
                  onManagedFileNameChange(event.target.value);
                }}
                placeholder="예: 품의서_운영본.xlsx"
                value={templateManagedFileNameInput}
              />
            )
          },
          {
            key: "primarySheetName",
            title: "검토 기준 시트",
            description: genericFieldGuide[genericTemplateType].primarySheetName.description,
            impact: genericFieldGuide[genericTemplateType].primarySheetName.impact,
            beforeValue: formatValue(genericBaseline?.primarySheetName),
            afterValue: formatValue(genericProfileDraft.primarySheetName),
            control: (
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  onGenericProfileFieldChange("primarySheetName", event.target.value);
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
            )
          },
          ...Object.entries(genericProfileDraft.fieldMappings).map(([fieldKey, fieldValue]) => {
            const label = getGenericFieldLabel(genericTemplateType, fieldKey);
            const guide =
              genericFieldGuide[genericTemplateType][fieldKey] ?? {
                description: "이 항목이 채워질 셀 또는 행을 지정합니다.",
                impact: "해당 정보가 출력되는 위치가 달라집니다."
              };
            const baselineValue = genericBaseline?.fieldMappings[fieldKey] ?? "";
            const cellOptions = getTitleCandidateOptionsWithCurrent(fieldValue);

            if (fieldKey === "sheetName") {
              return {
                key: fieldKey,
                title: label,
                description: guide.description,
                impact: guide.impact,
                beforeValue: formatValue(baselineValue),
                afterValue: formatValue(fieldValue),
                control: (
                  <FormSelect
                    className="top-filter-select-shell"
                    onChange={(event) => {
                      onGenericProfileFieldChange(fieldKey, event.target.value);
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
                )
              };
            }

            if (isGenericRowField(fieldKey)) {
              return {
                key: fieldKey,
                title: label,
                description: guide.description,
                impact: guide.impact,
                beforeValue: formatValue(baselineValue),
                afterValue: formatValue(fieldValue),
                control: (
                  <input
                    min={1}
                    onChange={(event) => {
                      onGenericProfileFieldChange(fieldKey, event.target.value);
                    }}
                    type="number"
                    value={fieldValue}
                  />
                )
              };
            }

            return {
              key: fieldKey,
              title: label,
              description: guide.description,
              impact: guide.impact,
              beforeValue: getAddressLabel(baselineValue),
              afterValue: getAddressLabel(fieldValue),
              control: (
                <FormSelect
                  className="top-filter-select-shell"
                  onChange={(event) => {
                    onGenericProfileFieldChange(fieldKey, event.target.value);
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
                  )) ?? []}
                </FormSelect>
              )
            };
          })
        ]
      : [];

  const navigatorCards = scheduleProfileDraft ? scheduleCards : genericCards;
  const typeGuide =
    templateTypeInput === "schedule"
      ? "근무표 배포 화면에서 선택되는 양식입니다."
      : "문서 출력 화면에서 선택되는 보조 양식입니다.";

  return (
    <div className="modal-overlay">
      <div className="modal-card template-wizard-modal">
        <div className="section-heading">
          <div className="modal-heading-copy">
            <strong>{editingTemplateId ? "양식 편집기" : "양식 등록"}</strong>
            <p>
              어려운 좌표 용어 대신, 이 값이 어디에 쓰이는지와 바꾸면 어떤 결과가 생기는지를 바로 보면서
              수정할 수 있습니다.
            </p>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            닫기
          </button>
        </div>

        <div className="template-wizard-stepper">
          <article className={`template-step-card ${templateWizardStep === 1 ? "active" : "done"}`}>
            <span className="template-step-index">1</span>
            <div>
              <strong>파일 준비와 1차 확인</strong>
              <p>문서 종류를 정하고 파일을 가져온 뒤, 2단계로 갈 수 있는지 먼저 확인합니다.</p>
            </div>
          </article>
          <article className={`template-step-card ${templateWizardStep === 2 ? "active" : ""}`}>
            <span className="template-step-index">2</span>
            <div>
              <strong>위치 조정과 저장</strong>
              <p>왼쪽은 양식 후보, 오른쪽은 변경 전/후와 실제 영향입니다.</p>
            </div>
          </article>
        </div>

        <div className="template-wizard-body">
          {actionError ? <p className="form-error-text">{actionError}</p> : null}
          {actionMessage ? <p className="form-success-text">{actionMessage}</p> : null}

          {templateWizardStep === 1 ? (
            <div className="template-wizard-grid">
              <div className="template-guide-grid">
                <article className="template-guide-card">
                  <strong>이 단계에서 하는 일</strong>
                  <p>{templateTypeLabel[templateTypeInput]}을 등록하기 전에 파일 구조를 먼저 확인합니다.</p>
                </article>
                <article className="template-guide-card">
                  <strong>2단계에서 바꾸는 것</strong>
                  <p>엑셀 내용을 직접 수정하지 않고, 어떤 셀을 쓸지만 고르게 됩니다.</p>
                </article>
                <article className="template-guide-card">
                  <strong>이 문서가 어디에 쓰이는지</strong>
                  <p>{typeGuide}</p>
                </article>
              </div>

              <div className="template-form-grid">
                <label className="field">
                  <span>문서 종류</span>
                  <FormSelect
                    className="top-filter-select-shell"
                    onChange={(event) => {
                      onTemplateTypeChange(event.target.value as TemplateType);
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
                  <small className="field-hint">어느 메뉴에서 이 양식을 사용할지 정합니다.</small>
                </label>
                <label className="field">
                  <span>목록에 보일 이름</span>
                  <input
                    onChange={(event) => {
                      onVersionLabelChange(event.target.value);
                    }}
                    placeholder="예: 2026.3 운영본"
                    value={templateVersionLabelInput}
                  />
                  <small className="field-hint">양식 관리 목록과 선택 목록에 보이는 이름입니다.</small>
                </label>
                <label className="field">
                  <span>내부 보관 파일명</span>
                  <input
                    onChange={(event) => {
                      onManagedFileNameChange(event.target.value);
                    }}
                    placeholder="예: 근무표_운영본.xlsx"
                    value={templateManagedFileNameInput}
                  />
                  <small className="field-hint">관리 폴더에 복사 보관할 때 쓰는 파일명입니다.</small>
                </label>
                <label className="field template-source-field">
                  <span>가져온 파일</span>
                  <input readOnly value={selectedTemplateSource?.filePath ?? "-"} />
                  <small className="field-hint">엑셀 원본을 선택한 뒤 1차 검증을 눌러 주세요.</small>
                </label>
              </div>

              <div className="button-row">
                <button
                  className="ghost-button"
                  disabled={isTemplateActionRunning}
                  onClick={onPickTemplateFile}
                  type="button"
                >
                  {isTemplateActionRunning ? "처리 중..." : "파일 가져오기"}
                </button>
                <button
                  className="primary-button"
                  disabled={isTemplateActionRunning || !selectedTemplateSource}
                  onClick={onInspectTemplate}
                  type="button"
                >
                  {isTemplateActionRunning ? "검증 중..." : "1차 검증"}
                </button>
              </div>

              {templateValidation ? (
                <article className="template-validation-panel">
                  <div className="template-card-head">
                    <strong>검증 결과</strong>
                    <span className={`pill ${templateValidation.canProceed ? "accent" : "neutral"}`}>
                      {templateValidation.canProceed ? "2단계 진행 가능" : "추가 확인 필요"}
                    </span>
                  </div>
                  <div className="template-guide-grid template-guide-grid--compact">
                    <article className="template-guide-card">
                      <strong>기본 시트</strong>
                      <p>{templateValidation.primarySheetName || "-"}</p>
                    </article>
                    <article className="template-guide-card">
                      <strong>탐지된 시트</strong>
                      <p>{templateValidation.sheetNames.join(", ") || "-"}</p>
                    </article>
                    <article className="template-guide-card">
                      <strong>탐지된 양식 계열</strong>
                      <p>{templateValidation.detectedTemplateFamily ?? "자동 탐지 없음"}</p>
                    </article>
                  </div>
                  <div className="template-validation-message-list">
                    {templateValidation.messages.map((message, index) => (
                      <span key={`${message}-${index}`}>{message}</span>
                    ))}
                  </div>
                </article>
              ) : (
                <article className="template-validation-panel">
                  <strong>먼저 1차 검증을 해 주세요.</strong>
                  <p className="field-hint">
                    검증을 하면 시트 목록, 셀 후보, 다음 단계 진행 가능 여부를 확인할 수 있습니다.
                  </p>
                </article>
              )}

              <div className="button-row template-wizard-actions">
                <button className="ghost-button" onClick={onClose} type="button">
                  취소
                </button>
                <button
                  className="primary-button"
                  disabled={!templateValidation?.canProceed || !hasProfileDraft}
                  onClick={onGoStep2}
                  type="button"
                >
                  2단계로 이동
                </button>
              </div>
            </div>
          ) : (
            <div className="template-profile-editor-layout">
              <section className="template-profile-panel">
                <div className="template-card-head">
                  <div>
                    <strong>양식에서 읽은 후보</strong>
                    <p className="field-hint">
                      왼쪽 목록은 현재 엑셀에서 읽은 제목과 셀 위치입니다. 오른쪽에서 이 후보를 선택하면
                      배포 위치가 바뀝니다.
                    </p>
                  </div>
                  <span className="pill neutral">{templateCandidateOptions.length}개 후보</span>
                </div>
                <div className="template-guide-grid template-guide-grid--compact">
                  <article className="template-guide-card">
                    <strong>기본 시트</strong>
                    <p>{templateValidation?.primarySheetName || "-"}</p>
                  </article>
                  <article className="template-guide-card">
                    <strong>현재 문서 종류</strong>
                    <p>{templateTypeLabel[templateTypeInput]}</p>
                  </article>
                  <article className="template-guide-card">
                    <strong>주차 블록</strong>
                    <p>
                      {scheduleProfileDraft
                        ? `${scheduleProfileDraft.layout.weekBlocks.length}개`
                        : "해당 없음"}
                    </p>
                  </article>
                </div>
                <div className="data-scroll template-candidate-table">
                  <table className="info-table compact-table">
                    <thead>
                      <tr>
                        <th>시트</th>
                        <th>셀</th>
                        <th>양식에 적힌 텍스트</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templateCandidateOptions.length > 0 ? (
                        templateCandidateOptions.slice(0, 80).map((candidate) => (
                          <tr key={`${candidate.sheetName}-${candidate.address}-${candidate.text}`}>
                            <td>{candidate.sheetName}</td>
                            <td>{candidate.address}</td>
                            <td>{candidate.text}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3}>탐지된 후보가 없습니다.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="template-profile-panel">
                <div className="template-card-head">
                  <div>
                    <strong>변경 전 / 변경 후 안내</strong>
                    <p className="field-hint">
                      각 항목은 무엇을 바꾸는지, 바꾸면 어디가 달라지는지까지 같이 보여줍니다.
                    </p>
                  </div>
                  <span className="pill neutral">{navigatorCards.length}개 설정</span>
                </div>

                <div className="template-change-list">
                  {navigatorCards.length > 0 ? (
                    navigatorCards.map((card) => renderNavigatorCard(card))
                  ) : (
                    <p className="field-hint">편집할 프로필 정보가 없습니다.</p>
                  )}
                </div>

                {templatePreviewRecord ? (
                  <article className="template-validation-panel">
                    <strong>최근 미리보기</strong>
                    <p>파일명: {templatePreviewRecord.outputFileName}</p>
                    <p>경로: {templatePreviewRecord.outputPath}</p>
                    <p>시각: {formatDateTime(templatePreviewRecord.previewedAt)}</p>
                  </article>
                ) : (
                  <article className="template-validation-panel">
                    <strong>미리보기는 선택 사항입니다.</strong>
                    <p className="field-hint">
                      저장 전에 실제 출력 파일을 한 번 만들어 보고 싶을 때만 사용하면 됩니다.
                    </p>
                  </article>
                )}

                <div className="button-row template-wizard-actions">
                  <button className="ghost-button" onClick={onGoStep1} type="button">
                    이전
                  </button>
                  <button
                    className="ghost-button"
                    disabled={isTemplateActionRunning || !hasProfileDraft}
                    onClick={onPreviewTemplate}
                    type="button"
                  >
                    {isTemplateActionRunning ? "처리 중..." : "미리보기"}
                  </button>
                  <button
                    className="primary-button"
                    disabled={isTemplateActionRunning || (editingTemplateId === null && !templatePreviewRecord)}
                    onClick={onSaveTemplate}
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
  );
};
