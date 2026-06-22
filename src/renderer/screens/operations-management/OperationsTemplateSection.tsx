import type { DocumentTemplateHistoryRecord, DocumentTemplateVersion, TemplateType } from "@shared/domain/model";

export interface TemplateManagementRow {
  id: string;
  title: string;
  templateType: TemplateType;
  path: string;
  fileName: string;
  outputFileNamePattern: string;
  versionLabel: string;
  status: DocumentTemplateVersion["status"];
  isDefault: boolean;
  usageNote: string;
  changePolicy: string;
  createdAt?: string;
  approvedAt?: string;
  template: DocumentTemplateVersion;
}

export interface TemplateHistoryRow {
  id: string;
  occurredAt?: string;
  templateTypeLabel: string;
  versionLabel: string;
  actionLabel: string;
  detail?: string | null;
}

interface OperationsTemplateSectionProps {
  isLoading: boolean;
  isTemplateActionRunning: boolean;
  templateRows: TemplateManagementRow[];
  templateHistoryRows: TemplateHistoryRow[];
  templateStatusLabel: Record<DocumentTemplateVersion["status"], string>;
  onOpenRegistration: () => void;
  onOpenEdit: (template: DocumentTemplateVersion) => void;
  onUpdateOutputFileName: (template: DocumentTemplateVersion) => void;
  onApprove: (templateId: string) => void;
  onSetDefault: (template: DocumentTemplateVersion) => void;
  onDelete: (template: DocumentTemplateVersion) => void;
  onOpenGuide: () => void;
  formatDateTime: (value?: string) => string;
}

const getNextActionLabel = (template: TemplateManagementRow) => {
  if (template.status === "pending") {
    return "승인 후 배포 목록에 노출됩니다.";
  }

  if (!template.isDefault) {
    return "기본 사용으로 전환하면 자동 선택 기준으로 쓰입니다.";
  }

  return "현재 기본 사용 양식입니다.";
};

const getTemplateKindGuide = (template: TemplateManagementRow) => {
  if (template.templateType === "schedule") {
    return "근무표 배포에서 선택되는 양식입니다.";
  }

  return "문서 출력 메뉴에서 사용하는 보조 양식입니다.";
};

const templateTypeOrder: TemplateType[] = ["schedule", "proposal", "attachment1", "attachment2"];

const templateTypeSectionMeta: Record<
  TemplateType,
  {
    label: string;
    detail: string;
  }
> = {
  schedule: {
    label: "근무표 양식",
    detail: "근무표 배포에서 선택되며 월간 스케줄 Excel 출력 기준이 됩니다."
  },
  proposal: {
    label: "품의서 양식",
    detail: "수당 품의 신청 시 기본 문서 본문으로 사용되는 양식입니다."
  },
  attachment1: {
    label: "별첨1 양식",
    detail: "근무자별 상세 지급 내역과 유형별 소계를 출력하는 양식입니다."
  },
  attachment2: {
    label: "별첨2 양식",
    detail: "부서와 근무지 기준 취합표를 출력하는 양식입니다."
  }
};

export const OperationsTemplateSection = ({
  isLoading,
  isTemplateActionRunning,
  templateRows,
  templateHistoryRows,
  templateStatusLabel,
  onOpenRegistration,
  onOpenEdit,
  onUpdateOutputFileName,
  onApprove,
  onSetDefault,
  onDelete,
  onOpenGuide,
  formatDateTime
}: OperationsTemplateSectionProps) => {
  const approvedCount = templateRows.filter((row) => row.status === "approved").length;
  const pendingCount = templateRows.filter((row) => row.status === "pending").length;
  const defaultCount = templateRows.filter((row) => row.isDefault).length;
  const templateGroups = templateTypeOrder.map((templateType) => {
    const rows = templateRows.filter((row) => row.templateType === templateType);

    return {
      ...templateTypeSectionMeta[templateType],
      templateType,
      rows,
      approved: rows.filter((row) => row.status === "approved").length,
      pending: rows.filter((row) => row.status === "pending").length,
      defaults: rows.filter((row) => row.isDefault).length
    };
  });

  return (
    <>
      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">양식 관리</p>
            <h3>양식 등록과 사용 순서</h3>
          </div>
          <div className="button-row">
            <button
              className="ghost-button compact-button"
              disabled={isLoading || isTemplateActionRunning}
              onClick={onOpenGuide}
              type="button"
            >
              가이드 보기
            </button>
            <button
              className="primary-button"
              disabled={isLoading || isTemplateActionRunning}
              onClick={onOpenRegistration}
              type="button"
            >
              양식등록
            </button>
          </div>
        </div>

        <div className="template-guide-grid">
          <article className="template-guide-card">
            <strong>1. 새 양식 등록</strong>
            <p>파일을 가져온 뒤 구조 확인을 하고, 2단계에서 필요한 문서 위치를 고르면 됩니다.</p>
          </article>
          <article className="template-guide-card">
            <strong>2. 양식 수정</strong>
            <p>&apos;수정&apos;은 현재 양식의 조건만 바꾸는 기능입니다. 새 양식을 다시 등록하는 절차가 아닙니다.</p>
          </article>
          <article className="template-guide-card">
            <strong>3. 승인과 기본 사용</strong>
            <p>&apos;승인&apos;은 사용 후보 등록, &apos;기본 사용&apos;은 실제 자동 선택 기준 전환입니다.</p>
          </article>
        </div>

        <div className="template-action-guide">
          <article className="template-guide-card">
            <strong>버튼 설명</strong>
            <div className="template-action-guide-list">
              <span><strong>수정</strong> 현재 양식의 문서 영역 위치와 기준 조건을 바로 고칩니다.</span>
              <span><strong>파일명 변경</strong> 실제 출력 파일명 규칙만 바꿉니다.</span>
              <span><strong>승인</strong> 배포/출력 메뉴에서 선택 가능하게 만듭니다.</span>
              <span><strong>기본 사용</strong> 승인된 양식 중 기본본으로 전환합니다.</span>
              <span><strong>삭제</strong> 목록에서 제거합니다.</span>
            </div>
          </article>
        </div>

        <div className="operations-summary-strip">
          <article className="operations-summary-card" data-tone="accent">
            <span>등록된 양식</span>
            <strong>{templateRows.length}건</strong>
            <em>근무표, 품의서, 별첨1, 별첨2 양식을 한 화면에서 관리합니다.</em>
          </article>
          <article className="operations-summary-card" data-tone={approvedCount > 0 ? "ok" : "warn"}>
            <span>승인 완료</span>
            <strong>{approvedCount}건</strong>
            <em>승인된 양식만 배포 및 출력 메뉴에서 선택할 수 있습니다.</em>
          </article>
          <article className="operations-summary-card" data-tone={pendingCount > 0 ? "warn" : "ok"}>
            <span>미승인</span>
            <strong>{pendingCount}건</strong>
            <em>검증 또는 승인 대기 중인 양식 수입니다.</em>
          </article>
          <article className="operations-summary-card">
            <span>기본 사용</span>
            <strong>{defaultCount}건</strong>
            <em>양식 종류별 기본본 전환 이력은 아래 변경 이력에서 다시 확인할 수 있습니다.</em>
          </article>
        </div>

        {isLoading ? (
          <div className="template-list-grid">
            <article className="template-card">
              <strong>양식 정보를 불러오는 중입니다.</strong>
            </article>
          </div>
        ) : templateRows.length > 0 ? (
          <div className="template-list-grid">
            {templateGroups.map((group) => (
              <section className="template-type-group" key={group.templateType}>
                <header className="template-type-group-head">
                  <div className="template-type-group-copy">
                    <strong>{group.label}</strong>
                    <p>{group.detail}</p>
                  </div>
                  <div className="template-type-group-meta">
                    <span className="pill neutral">{group.rows.length}건</span>
                    <span className="pill accent">승인 {group.approved}</span>
                    <span className="pill neutral">미승인 {group.pending}</span>
                    <span className="pill info">기본 {group.defaults}</span>
                  </div>
                </header>

                {group.rows.length > 0 ? (
                  <div className="template-type-group-grid">
                    {group.rows.map((template) => (
                      <article className="template-card" key={template.id}>
                        <div className="template-card-head">
                          <div>
                            <strong>{template.title}</strong>
                            <p className="field-hint">{template.versionLabel}</p>
                          </div>
                          <div className="template-card-meta">
                            <span className={`pill ${template.status === "approved" ? "accent" : "neutral"}`}>
                              {templateStatusLabel[template.status]}
                            </span>
                            {template.isDefault ? <span className="pill accent">기본 사용</span> : null}
                          </div>
                        </div>

                        <dl className="template-card-spec">
                          <div>
                            <dt>보관 파일</dt>
                            <dd>{template.fileName}</dd>
                          </div>
                          <div>
                            <dt>실제 출력 파일명 규칙</dt>
                            <dd>{template.outputFileNamePattern}</dd>
                          </div>
                          <div>
                            <dt>현재 용도</dt>
                            <dd>{template.usageNote}</dd>
                          </div>
                          <div>
                            <dt>다음 할 일</dt>
                            <dd>{getNextActionLabel(template)}</dd>
                          </div>
                          <div>
                            <dt>양식 설명</dt>
                            <dd>{getTemplateKindGuide(template)}</dd>
                          </div>
                          <div>
                            <dt>수정 시 참고</dt>
                            <dd>{template.changePolicy}</dd>
                          </div>
                          <div>
                            <dt>생성일</dt>
                            <dd>{formatDateTime(template.createdAt)}</dd>
                          </div>
                          <div>
                            <dt>승인일</dt>
                            <dd>{formatDateTime(template.approvedAt)}</dd>
                          </div>
                        </dl>

                        <div className="button-row">
                          <button
                            className="ghost-button"
                            disabled={isTemplateActionRunning}
                            onClick={() => {
                              onOpenEdit(template.template);
                            }}
                            type="button"
                          >
                            수정
                          </button>
                          <button
                            className="ghost-button"
                            disabled={isTemplateActionRunning}
                            onClick={() => {
                              onUpdateOutputFileName(template.template);
                            }}
                            type="button"
                          >
                            파일명 변경
                          </button>
                          <button
                            className="ghost-button"
                            disabled={isTemplateActionRunning || template.status === "approved"}
                            onClick={() => {
                              onApprove(template.id);
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
                              onSetDefault(template.template);
                            }}
                            type="button"
                          >
                            기본 사용
                          </button>
                          <button
                            className="danger-button"
                            disabled={isTemplateActionRunning}
                            onClick={() => {
                              onDelete(template.template);
                            }}
                            type="button"
                          >
                            삭제
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <article className="template-card template-card-empty">
                    <strong>{group.label}이 아직 없습니다.</strong>
                    <p className="field-hint">{group.detail}</p>
                  </article>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="template-list-grid">
            <article className="template-card">
              <strong>아직 등록된 양식이 없습니다.</strong>
              <p className="field-hint">&apos;양식등록&apos; 버튼을 눌러 첫 번째 양식을 추가해 주세요.</p>
            </article>
          </div>
        )}
      </section>

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">최근 이력</p>
            <h3>양식 변경 이력</h3>
          </div>
          <span className="pill neutral">{templateHistoryRows.length}건</span>
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
              ) : templateHistoryRows.length > 0 ? (
                templateHistoryRows.map((history) => (
                  <tr key={history.id}>
                    <td>{formatDateTime(history.occurredAt)}</td>
                    <td>{history.templateTypeLabel}</td>
                    <td>{history.versionLabel}</td>
                    <td>
                      <span
                        className={`pill ${
                          history.actionLabel.includes("삭제")
                            ? "danger"
                            : history.actionLabel.includes("승인")
                              ? "accent"
                              : history.actionLabel.includes("기본")
                                ? "info"
                                : "neutral"
                        }`}
                      >
                        {history.actionLabel}
                      </span>
                    </td>
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
    </>
  );
};
