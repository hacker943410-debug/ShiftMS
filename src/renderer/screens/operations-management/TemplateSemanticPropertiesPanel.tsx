import { useEffect, useState } from "react";

import type {
  DocumentTemplateCanvasZone,
  DocumentTemplateStyleSpec
} from "@shared/domain/document-template";
import type { TemplateType } from "@shared/domain/model";

import { FormSelect } from "../../components/FormSelect";

type NumericStyleField = "columnWidths" | "rowHeights" | "fontSizes";
type StringStyleField = "fontColors" | "fillColors" | "horizontalAlignments" | "mergedRanges";

interface TemplateSemanticPropertiesPanelProps {
  selectedZone: DocumentTemplateCanvasZone | null;
  templateType: TemplateType;
  styleSpec: DocumentTemplateStyleSpec | undefined;
  baselineStyleSpec?: DocumentTemplateStyleSpec;
  baselineBindingValue?: string | null;
  canUndo: boolean;
  onBindingChange: (value: string) => void;
  onRestoreBinding: () => void;
  onRestoreZoneStyle: (styleKey: string) => void;
  onStyleNumberChange: (field: NumericStyleField, styleKey: string, value: number | null) => void;
  onStyleStringChange: (field: StringStyleField, styleKey: string, value: string | null) => void;
  onUndoChange: () => void;
}

const colorHexPattern = /^#([0-9a-fA-F]{6})$/;
const mergedRangePattern = /^([A-Z]+[0-9]+):([A-Z]+[0-9]+)$/i;

const resolveStyleKey = (zone: DocumentTemplateCanvasZone) => zone.fieldKey ?? zone.id;

const formatRoleLabel = (role: DocumentTemplateCanvasZone["role"]) => {
  switch (role) {
    case "title":
      return "제목";
    case "header":
      return "상단 안내";
    case "field":
      return "기본 필드";
    case "summary":
      return "요약";
    case "table":
      return "표";
    case "week":
      return "주간 일정";
    case "notes":
      return "메모";
    case "logo":
      return "로고";
    case "footer":
      return "하단";
    default:
      return "시트";
  }
};

const formatBindingTypeLabel = (bindingType: DocumentTemplateCanvasZone["bindingType"]) => {
  switch (bindingType) {
    case "cell":
      return "셀";
    case "row":
      return "행";
    case "column":
      return "열";
    case "block":
      return "영역";
    default:
      return "시트";
  }
};

const normalizeColorValue = (value: string | undefined, fallback: string) =>
  value && colorHexPattern.test(value) ? value : fallback;

const parseNumericInput = (value: string) => {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const TemplateSemanticPropertiesPanel = ({
  selectedZone,
  templateType,
  styleSpec,
  baselineStyleSpec,
  baselineBindingValue,
  canUndo,
  onBindingChange,
  onRestoreBinding,
  onRestoreZoneStyle,
  onStyleNumberChange,
  onStyleStringChange,
  onUndoChange
}: TemplateSemanticPropertiesPanelProps) => {
  const [mergedRangeInput, setMergedRangeInput] = useState("");

  useEffect(() => {
    const nextStyleKey = selectedZone ? resolveStyleKey(selectedZone) : null;
    setMergedRangeInput(nextStyleKey ? styleSpec?.mergedRanges?.[nextStyleKey] ?? "" : "");
  }, [selectedZone, styleSpec]);

  if (!selectedZone) {
    return (
      <article className="template-properties-panel template-validation-panel">
        <strong>먼저 왼쪽 도식에서 영역을 선택해 주세요.</strong>
        <p className="field-hint">
          선택한 영역의 위치, 크기, 글자색, 배경색, 정렬을 이 패널에서 바로 조정할 수 있습니다.
        </p>
      </article>
    );
  }

  const styleKey = resolveStyleKey(selectedZone);
  const primaryBinding = selectedZone.bindings[0] ?? "";
  const canEditBinding =
    Boolean(selectedZone.fieldKey) &&
    selectedZone.bindingType !== "sheet" &&
    selectedZone.bindingType !== "block";

  const currentColumnWidth = styleSpec?.columnWidths?.[styleKey];
  const currentRowHeight = styleSpec?.rowHeights?.[styleKey];
  const currentFontSize = styleSpec?.fontSizes?.[styleKey];
  const currentFontColor = styleSpec?.fontColors?.[styleKey];
  const currentFillColor = styleSpec?.fillColors?.[styleKey];
  const currentAlignment = styleSpec?.horizontalAlignments?.[styleKey] ?? "left";
  const currentMergedRange = styleSpec?.mergedRanges?.[styleKey] ?? "";
  const hasBindingChanges =
    canEditBinding && typeof baselineBindingValue === "string" && baselineBindingValue !== primaryBinding;
  const hasStyleChanges =
    (styleSpec?.columnWidths?.[styleKey] ?? undefined) !==
      (baselineStyleSpec?.columnWidths?.[styleKey] ?? undefined) ||
    (styleSpec?.rowHeights?.[styleKey] ?? undefined) !==
      (baselineStyleSpec?.rowHeights?.[styleKey] ?? undefined) ||
    (styleSpec?.fontSizes?.[styleKey] ?? undefined) !==
      (baselineStyleSpec?.fontSizes?.[styleKey] ?? undefined) ||
    (styleSpec?.fontColors?.[styleKey] ?? undefined) !==
      (baselineStyleSpec?.fontColors?.[styleKey] ?? undefined) ||
    (styleSpec?.fillColors?.[styleKey] ?? undefined) !==
      (baselineStyleSpec?.fillColors?.[styleKey] ?? undefined) ||
    (styleSpec?.horizontalAlignments?.[styleKey] ?? undefined) !==
      (baselineStyleSpec?.horizontalAlignments?.[styleKey] ?? undefined) ||
    (styleSpec?.mergedRanges?.[styleKey] ?? undefined) !==
      (baselineStyleSpec?.mergedRanges?.[styleKey] ?? undefined);
  const isMergedRangeValid =
    mergedRangeInput.trim().length === 0 || mergedRangePattern.test(mergedRangeInput.trim());
  const commitMergedRange = () => {
    const normalized = mergedRangeInput.trim().toUpperCase();

    if (normalized.length === 0) {
      if (currentMergedRange) {
        onStyleStringChange("mergedRanges", styleKey, null);
      }
      setMergedRangeInput("");
      return;
    }

    if (!mergedRangePattern.test(normalized)) {
      return;
    }

    if (normalized !== currentMergedRange) {
      onStyleStringChange("mergedRanges", styleKey, normalized);
    }
  };

  return (
    <article className="template-properties-panel">
      <div className="template-card-head">
        <div>
          <strong>선택 영역 속성</strong>
          <p className="field-hint">
            현재 선택한 문서 영역의 기본 위치와 시각 규격을 조정합니다.
          </p>
        </div>
        <span className="pill neutral">{templateType === "schedule" ? "근무표" : "문서 양식"}</span>
      </div>

      <div className="template-properties-summary">
        <article className="template-guide-card">
          <strong>영역명</strong>
          <p>{selectedZone.label}</p>
        </article>
        <article className="template-guide-card">
          <strong>영역 유형</strong>
          <p>{formatRoleLabel(selectedZone.role)}</p>
        </article>
        <article className="template-guide-card">
          <strong>위치 단위</strong>
          <p>{formatBindingTypeLabel(selectedZone.bindingType)}</p>
        </article>
      </div>

      <div className="template-properties-grid">
        <label className="field">
          <span>대표 위치</span>
          <input
            onChange={(event) => {
              onBindingChange(event.target.value);
            }}
            placeholder={canEditBinding ? "예: B4 또는 12" : "직접 변경 불가"}
            readOnly={!canEditBinding}
            value={primaryBinding}
          />
          <small className="field-hint">
            {canEditBinding
              ? "이 항목은 현재 선택한 문서 영역의 대표 위치입니다. 왼쪽 도식의 고급 모드에서 셀을 직접 눌러 바꿀 수도 있습니다."
              : "이 영역은 여러 셀로 구성된 블록이라 기존 편집 항목에서 위치를 조정합니다."}
          </small>
        </label>

        <label className="field">
          <span>열 너비</span>
          <input
            min="0"
            onChange={(event) => {
              onStyleNumberChange("columnWidths", styleKey, parseNumericInput(event.target.value));
            }}
            placeholder="자동"
            step="0.5"
            type="number"
            value={currentColumnWidth ?? ""}
          />
          <small className="field-hint">선택 영역의 기준 열 너비를 지정합니다.</small>
        </label>

        <label className="field">
          <span>행 높이</span>
          <input
            min="0"
            onChange={(event) => {
              onStyleNumberChange("rowHeights", styleKey, parseNumericInput(event.target.value));
            }}
            placeholder="자동"
            step="0.5"
            type="number"
            value={currentRowHeight ?? ""}
          />
          <small className="field-hint">선택 영역의 기준 행 높이를 지정합니다.</small>
        </label>

        <label className="field">
          <span>글자 크기</span>
          <input
            min="0"
            onChange={(event) => {
              onStyleNumberChange("fontSizes", styleKey, parseNumericInput(event.target.value));
            }}
            placeholder="자동"
            step="0.5"
            type="number"
            value={currentFontSize ?? ""}
          />
          <small className="field-hint">출력 시 사용할 기본 글자 크기입니다.</small>
        </label>
      </div>

      <div className="template-properties-grid template-properties-grid--colors">
        <label className="field">
          <span>글자색</span>
          <div className="template-color-field">
            <input
              className="template-color-picker"
              onChange={(event) => {
                onStyleStringChange("fontColors", styleKey, event.target.value);
              }}
              type="color"
              value={normalizeColorValue(currentFontColor, "#223557")}
            />
            <input
              onChange={(event) => {
                onStyleStringChange(
                  "fontColors",
                  styleKey,
                  colorHexPattern.test(event.target.value) ? event.target.value : null
                );
              }}
              placeholder="#223557"
              value={currentFontColor ?? ""}
            />
          </div>
        </label>

        <label className="field">
          <span>배경색</span>
          <div className="template-color-field">
            <input
              className="template-color-picker"
              onChange={(event) => {
                onStyleStringChange("fillColors", styleKey, event.target.value);
              }}
              type="color"
              value={normalizeColorValue(currentFillColor, "#F7FAFF")}
            />
            <input
              onChange={(event) => {
                onStyleStringChange(
                  "fillColors",
                  styleKey,
                  colorHexPattern.test(event.target.value) ? event.target.value : null
                );
              }}
              placeholder="#F7FAFF"
              value={currentFillColor ?? ""}
            />
          </div>
        </label>

        <label className="field">
          <span>가로 정렬</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              onStyleStringChange(
                "horizontalAlignments",
                styleKey,
                event.target.value as "left" | "center" | "right"
              );
            }}
            selectClassName="top-filter-select"
            value={currentAlignment}
          >
            <option value="left">왼쪽</option>
            <option value="center">가운데</option>
            <option value="right">오른쪽</option>
          </FormSelect>
        </label>

        <label className="field">
          <span>병합 범위</span>
          <input
            onBlur={commitMergedRange}
            onChange={(event) => {
              setMergedRangeInput(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitMergedRange();
              }
            }}
            placeholder="예: B2:D4"
            value={mergedRangeInput}
          />
          <small className={`field-hint ${isMergedRangeValid ? "" : "is-error"}`}>
            {isMergedRangeValid
              ? "비워 두면 원래 양식 병합을 그대로 따르고, 입력하면 이 범위로 다시 병합합니다."
              : "병합 범위는 예: B2:D4 형식으로 입력해 주세요."}
          </small>
        </label>
      </div>

      <div className="button-row template-properties-actions">
        <button
          className="ghost-button compact-button"
          disabled={!hasBindingChanges}
          onClick={onRestoreBinding}
          type="button"
        >
          대표 위치 기준 복원
        </button>
        <button
          className="ghost-button compact-button"
          disabled={!hasStyleChanges}
          onClick={() => {
            onRestoreZoneStyle(styleKey);
          }}
          type="button"
        >
          선택 영역 스타일 기준 복원
        </button>
        <button
          className="ghost-button compact-button"
          disabled={!canUndo}
          onClick={onUndoChange}
          type="button"
        >
          최근 변경 되돌리기
        </button>
      </div>
    </article>
  );
};
