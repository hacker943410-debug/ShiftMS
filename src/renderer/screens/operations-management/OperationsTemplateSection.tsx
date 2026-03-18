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
  formatDateTime
}: OperationsTemplateSectionProps) => {
  return (
    <>
      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.4 양식 관리</p>
            <h3>양식 등록과 사용 순서</h3>
          </div>
          <button
            className="primary-button"
            disabled={isLoading || isTemplateActionRunning}
            onClick={onOpenRegistration}
            type="button"
          >
            양식등록
          </button>
        </div>

        <div className="template-guide-grid">
          <article className="template-guide-card">
            <strong>1. 새 양식 등록</strong>
            <p>파일을 가져온 뒤 1차 검증을 하고, 2단계에서 필요한 셀 위치만 고르면 됩니다.</p>
          </article>
          <article className="template-guide-card">
            <strong>2. 양식 수정</strong>
            <p>`수정`은 현재 양식의 조건만 바꾸는 기능입니다. 새 양식을 다시 등록하는 절차가 아닙니다.</p>
          </article>
          <article className="template-guide-card">
            <strong>3. 승인과 기본 사용</strong>
            <p>`승인`은 사용 후보 등록, `기본 사용`은 실제 자동 선택 기준 전환입니다.</p>
          </article>
        </div>

        <div className="template-action-guide">
          <article className="template-guide-card">
            <strong>버튼 설명</strong>
            <div className="template-action-guide-list">
              <span><strong>수정</strong> 현재 양식의 좌표와 조건을 바로 고칩니다.</span>
              <span><strong>파일명 변경</strong> 실제 출력 파일명 규칙만 바꿉니다.</span>
              <span><strong>승인</strong> 배포/출력 메뉴에서 선택 가능하게 만듭니다.</span>
              <span><strong>기본 사용</strong> 승인된 양식 중 기본본으로 전환합니다.</span>
              <span><strong>삭제</strong> 목록에서 제거합니다.</span>
            </div>
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
            {templateRows.map((template) => (
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

                <div className="template-guide-grid template-guide-grid--compact">
                  <article className="template-guide-card">
                    <strong>보관 파일</strong>
                    <p>{template.fileName}</p>
                  </article>
                  <article className="template-guide-card">
                    <strong>실제 출력 파일명 규칙</strong>
                    <p>{template.outputFileNamePattern}</p>
                  </article>
                  <article className="template-guide-card">
                    <strong>현재 용도</strong>
                    <p>{template.usageNote}</p>
                  </article>
                  <article className="template-guide-card">
                    <strong>다음 할 일</strong>
                    <p>{getNextActionLabel(template)}</p>
                  </article>
                </div>

                <div className="template-guide-grid template-guide-grid--compact">
                  <article className="template-guide-card">
                    <strong>양식 설명</strong>
                    <p>{getTemplateKindGuide(template)}</p>
                  </article>
                  <article className="template-guide-card">
                    <strong>수정 시 참고</strong>
                    <p>{template.changePolicy}</p>
                  </article>
                  <article className="template-guide-card">
                    <strong>생성일</strong>
                    <p>{formatDateTime(template.createdAt)}</p>
                  </article>
                  <article className="template-guide-card">
                    <strong>승인일</strong>
                    <p>{formatDateTime(template.approvedAt)}</p>
                  </article>
                </div>

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
                    disabled={isTemplateActionRunning || template.status !== "approved" || template.isDefault}
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
          <div className="template-list-grid">
            <article className="template-card">
              <strong>등록된 양식이 없습니다.</strong>
              <p className="field-hint">`양식등록`을 눌러 첫 번째 양식을 추가해 주세요.</p>
            </article>
          </div>
        )}
      </section>

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.4.1 최근 이력</p>
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
                    <td>{history.actionLabel}</td>
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
