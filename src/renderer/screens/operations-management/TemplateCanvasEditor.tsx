import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import type {
  DocumentTemplateCanvasBounds,
  DocumentTemplateCanvasLabel,
  DocumentTemplateCanvasSnapshot,
  DocumentTemplateCanvasZone,
  DocumentTemplateStyleSpec
} from "@shared/domain/document-template";

const PREVIEW_TARGET_WIDTH = 720;
const PREVIEW_TARGET_HEIGHT = 420;
const CANVAS_CELL_WIDTH = 38;
const CANVAS_CELL_HEIGHT = 20;
const MIN_CANVAS_ZOOM = 0.42;
const MAX_CANVAS_ZOOM = 1.2;
const CANVAS_ZOOM_STEP = 0.14;
const DEFAULT_COLUMN_WIDTH = 9;
const DEFAULT_ROW_HEIGHT = 20;
const SIZE_STEP = 0.5;
const MIN_COLUMN_WIDTH = 4;
const MAX_COLUMN_WIDTH = 30;
const MIN_ROW_HEIGHT = 12;
const MAX_ROW_HEIGHT = 48;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundMetric = (value: number) => Math.round(value * 2) / 2;

const toColumnAddress = (column: number) => {
  if (!Number.isFinite(column) || column <= 0) {
    return "";
  }

  let remaining = Math.trunc(column);
  let result = "";

  while (remaining > 0) {
    const offset = (remaining - 1) % 26;
    result = String.fromCharCode(65 + offset) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return result;
};

const formatZoneBounds = (bounds: DocumentTemplateCanvasBounds) =>
  `${toColumnAddress(bounds.startColumn)}${bounds.startRow} ~ ${toColumnAddress(bounds.endColumn)}${bounds.endRow}`;

const parseCellAddress = (address: string) => {
  const matched = /^([A-Z]+)(\d+)$/i.exec(address.trim());

  if (!matched) {
    return null;
  }

  return {
    column: matched[1]!.toUpperCase().split("").reduce((sum, character) => sum * 26 + character.charCodeAt(0) - 64, 0),
    row: Number(matched[2]!)
  };
};

const parseMergedRangeBounds = (value: string | undefined): DocumentTemplateCanvasBounds | null => {
  if (!value) {
    return null;
  }

  const [startAddress, endAddress] = value.trim().toUpperCase().split(":");

  if (!startAddress || !endAddress) {
    return null;
  }

  const start = parseCellAddress(startAddress);
  const end = parseCellAddress(endAddress);

  if (!start || !end) {
    return null;
  }

  return {
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row),
    startColumn: Math.min(start.column, end.column),
    endColumn: Math.max(start.column, end.column)
  };
};

const getSurfaceWidth = (snapshot: DocumentTemplateCanvasSnapshot) =>
  Math.max(snapshot.maxColumn * CANVAS_CELL_WIDTH, 540);

const getSurfaceHeight = (snapshot: DocumentTemplateCanvasSnapshot) =>
  Math.max(snapshot.maxRow * CANVAS_CELL_HEIGHT, 280);

const getInitialZoom = (snapshot: DocumentTemplateCanvasSnapshot) => {
  const widthZoom = PREVIEW_TARGET_WIDTH / getSurfaceWidth(snapshot);
  const heightZoom = PREVIEW_TARGET_HEIGHT / getSurfaceHeight(snapshot);

  return clamp(Math.min(widthZoom, heightZoom, 1), MIN_CANVAS_ZOOM, 1);
};

const getStyleKey = (zone: DocumentTemplateCanvasZone) => zone.fieldKey ?? zone.id;

const normalizeColor = (value: string | undefined, fallback: string) =>
  value && /^#([0-9a-fA-F]{6})$/.test(value) ? value : fallback;

const getZoneStyle = (
  zone: DocumentTemplateCanvasZone,
  styleSpec: DocumentTemplateStyleSpec | undefined
): CSSProperties => {
  const styleKey = getStyleKey(zone);
  const renderedBounds = parseMergedRangeBounds(styleSpec?.mergedRanges?.[styleKey]) ?? zone.bounds;
  const widthOverride = styleSpec?.columnWidths?.[styleKey];
  const heightOverride = styleSpec?.rowHeights?.[styleKey];
  const width = Math.max(
    (renderedBounds.endColumn - renderedBounds.startColumn + 1) * CANVAS_CELL_WIDTH - 8,
    typeof widthOverride === "number" ? widthOverride * 6 : 56
  );
  const height = Math.max(
    (renderedBounds.endRow - renderedBounds.startRow + 1) * CANVAS_CELL_HEIGHT - 8,
    typeof heightOverride === "number" ? heightOverride * 1.45 : 40
  );

  return {
    left: `${(renderedBounds.startColumn - 1) * CANVAS_CELL_WIDTH + 4}px`,
    top: `${(renderedBounds.startRow - 1) * CANVAS_CELL_HEIGHT + 4}px`,
    width: `${width}px`,
    height: `${height}px`,
    backgroundColor: normalizeColor(styleSpec?.fillColors?.[styleKey], "rgba(255, 255, 255, 0.88)"),
    color: normalizeColor(styleSpec?.fontColors?.[styleKey], "#223557"),
    textAlign: styleSpec?.horizontalAlignments?.[styleKey] ?? "left"
  };
};

const getRenderedZoneBounds = (
  zone: DocumentTemplateCanvasZone,
  styleSpec: DocumentTemplateStyleSpec | undefined
) => parseMergedRangeBounds(styleSpec?.mergedRanges?.[getStyleKey(zone)]) ?? zone.bounds;

const getLabelStyle = (label: DocumentTemplateCanvasLabel): CSSProperties => ({
  left: `${(label.column - 1) * CANVAS_CELL_WIDTH + 8}px`,
  top: `${(label.row - 1) * CANVAS_CELL_HEIGHT + 6}px`
});

interface TemplateCanvasEditorProps {
  snapshot: DocumentTemplateCanvasSnapshot;
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
  onPickBindingValue?: (value: string) => void;
  onAdjustZoneMetric?: (
    field: "columnWidths" | "rowHeights",
    styleKey: string,
    value: number | null
  ) => void;
  styleSpec?: DocumentTemplateStyleSpec;
}

const toCellAddress = (row: number, column: number) => `${toColumnAddress(column)}${row}`;

const canPickBindingForZone = (zone: DocumentTemplateCanvasZone | null) =>
  Boolean(zone?.fieldKey) && zone?.bindingType !== "sheet" && zone?.bindingType !== "block";

const getBindingValueForCell = (
  zone: DocumentTemplateCanvasZone,
  row: number,
  column: number
) => {
  switch (zone.bindingType) {
    case "row":
      return String(row);
    case "column":
      return toColumnAddress(column);
    default:
      return toCellAddress(row, column);
  }
};

const getGridCellStyle = (row: number, column: number): CSSProperties => ({
  left: `${(column - 1) * CANVAS_CELL_WIDTH}px`,
  top: `${(row - 1) * CANVAS_CELL_HEIGHT}px`,
  width: `${CANVAS_CELL_WIDTH}px`,
  height: `${CANVAS_CELL_HEIGHT}px`
});

export const TemplateCanvasEditor = ({
  snapshot,
  selectedZoneId,
  onSelectZone,
  onPickBindingValue,
  onAdjustZoneMetric,
  styleSpec
}: TemplateCanvasEditorProps) => {
  const focusableZones = snapshot.zones.filter((zone) => zone.role !== "sheet");
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [hoveredGridBinding, setHoveredGridBinding] = useState<string | null>(null);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [zoom, setZoom] = useState(() => getInitialZoom(snapshot));

  const fallbackSelectedZoneId = useMemo(
    () => focusableZones[0]?.id ?? null,
    [focusableZones]
  );

  useEffect(() => {
    setHoveredZoneId(null);
    setHoveredGridBinding(null);
    setAdvancedMode(false);
    setShowLabels(true);
    setZoom(getInitialZoom(snapshot));
  }, [snapshot]);

  useEffect(() => {
    if (!selectedZoneId && fallbackSelectedZoneId) {
      onSelectZone(fallbackSelectedZoneId);
      return;
    }

    if (selectedZoneId && !focusableZones.some((zone) => zone.id === selectedZoneId) && fallbackSelectedZoneId) {
      onSelectZone(fallbackSelectedZoneId);
    }
  }, [fallbackSelectedZoneId, focusableZones, onSelectZone, selectedZoneId]);

  const effectiveSelectedZoneId = selectedZoneId ?? fallbackSelectedZoneId;
  const activeZoneId = hoveredZoneId ?? effectiveSelectedZoneId;
  const selectedZone =
    focusableZones.find((zone) => zone.id === effectiveSelectedZoneId) ?? null;
  const canPickBinding = canPickBindingForZone(selectedZone);
  const selectedStyleKey = selectedZone ? getStyleKey(selectedZone) : null;
  const activeBindingValue =
    selectedZone && hoveredGridBinding
      ? hoveredGridBinding
      : selectedZone?.bindings[0] ?? null;
  const currentColumnWidthOverride =
    selectedStyleKey !== null ? styleSpec?.columnWidths?.[selectedStyleKey] : undefined;
  const currentRowHeightOverride =
    selectedStyleKey !== null ? styleSpec?.rowHeights?.[selectedStyleKey] : undefined;
  const effectiveColumnWidth = currentColumnWidthOverride ?? DEFAULT_COLUMN_WIDTH;
  const effectiveRowHeight = currentRowHeightOverride ?? DEFAULT_ROW_HEIGHT;
  const surfaceWidth = getSurfaceWidth(snapshot);
  const surfaceHeight = getSurfaceHeight(snapshot);
  const viewportWidth = surfaceWidth * zoom;
  const viewportHeight = surfaceHeight * zoom;
  const handleAdjustMetric = (field: "columnWidths" | "rowHeights", delta: number) => {
    if (!selectedStyleKey || !onAdjustZoneMetric) {
      return;
    }

    const currentValue = field === "columnWidths" ? effectiveColumnWidth : effectiveRowHeight;
    const nextValue =
      field === "columnWidths"
        ? roundMetric(clamp(currentValue + delta, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH))
        : roundMetric(clamp(currentValue + delta, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT));

    onAdjustZoneMetric(field, selectedStyleKey, nextValue);
  };
  const handleResetMetric = (field: "columnWidths" | "rowHeights") => {
    if (!selectedStyleKey || !onAdjustZoneMetric) {
      return;
    }

    onAdjustZoneMetric(field, selectedStyleKey, null);
  };

  return (
    <article className="template-canvas-preview-panel">
      <div className="template-canvas-preview-toolbar">
        <div className="template-canvas-preview-meta">
          <span>{snapshot.sheetName}</span>
          <span>
            {snapshot.maxColumn}열 · {snapshot.maxRow}줄
          </span>
        </div>
        <div className="template-canvas-preview-scale">
          <button
            className={`ghost-button compact-button ${advancedMode ? "is-active" : ""}`}
            disabled={!selectedZone}
            onClick={() => {
              setAdvancedMode((current) => !current);
            }}
            type="button"
          >
            {advancedMode ? "고급 모드 끄기" : "고급 모드"}
          </button>
          <button
            className={`ghost-button compact-button ${showLabels ? "is-active" : ""}`}
            onClick={() => {
              setShowLabels((current) => !current);
            }}
            type="button"
          >
            {showLabels ? "문구 숨김" : "문구 보기"}
          </button>
          <button
            className="ghost-button compact-button"
            onClick={() => {
              setZoom((current) => clamp(current - CANVAS_ZOOM_STEP, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM));
            }}
            type="button"
          >
            축소
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            className="ghost-button compact-button"
            onClick={() => {
              setZoom((current) => clamp(current + CANVAS_ZOOM_STEP, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM));
            }}
            type="button"
          >
            확대
          </button>
          <button
            className="ghost-button compact-button"
            onClick={() => {
              setZoom(getInitialZoom(snapshot));
            }}
            type="button"
          >
            맞춤
          </button>
        </div>
      </div>
      {advancedMode && selectedZone ? (
        <div className={`template-canvas-advanced-banner ${canPickBinding ? "is-pickable" : ""}`}>
          <strong>고급 모드</strong>
          <span>
            {canPickBinding
              ? `현재 영역 안의 셀을 클릭하면 대표 위치가 ${selectedZone.bindingType === "row" ? "줄 번호" : selectedZone.bindingType === "column" ? "열" : "셀 주소"} 기준으로 바로 바뀝니다.`
              : "이 영역은 여러 셀로 묶인 블록이라 직접 위치 지정 대신 오른쪽 속성 패널과 변경 카드에서 조정합니다."}
          </span>
          <em>{activeBindingValue ? `현재 선택 기준: ${activeBindingValue}` : "현재 선택 기준 없음"}</em>
          <div className="template-canvas-direct-controls">
            <article className="template-canvas-direct-control">
              <div className="template-canvas-direct-control-head">
                <strong>열 너비 빠른 조절</strong>
                <span>{currentColumnWidthOverride === undefined ? "자동" : `${currentColumnWidthOverride} 기준`}</span>
              </div>
              <div className="template-canvas-direct-control-actions">
                <button
                  aria-label="열 너비 줄이기"
                  className="ghost-button compact-button"
                  onClick={() => {
                    handleAdjustMetric("columnWidths", -SIZE_STEP);
                  }}
                  type="button"
                >
                  -0.5
                </button>
                <strong>{effectiveColumnWidth.toFixed(1)}</strong>
                <button
                  aria-label="열 너비 늘리기"
                  className="ghost-button compact-button"
                  onClick={() => {
                    handleAdjustMetric("columnWidths", SIZE_STEP);
                  }}
                  type="button"
                >
                  +0.5
                </button>
                <button
                  aria-label="열 너비 자동 복원"
                  className="ghost-button compact-button"
                  disabled={currentColumnWidthOverride === undefined}
                  onClick={() => {
                    handleResetMetric("columnWidths");
                  }}
                  type="button"
                >
                  자동 복원
                </button>
              </div>
            </article>
            <article className="template-canvas-direct-control">
              <div className="template-canvas-direct-control-head">
                <strong>행 높이 빠른 조절</strong>
                <span>{currentRowHeightOverride === undefined ? "자동" : `${currentRowHeightOverride} 기준`}</span>
              </div>
              <div className="template-canvas-direct-control-actions">
                <button
                  aria-label="행 높이 줄이기"
                  className="ghost-button compact-button"
                  onClick={() => {
                    handleAdjustMetric("rowHeights", -SIZE_STEP);
                  }}
                  type="button"
                >
                  -0.5
                </button>
                <strong>{effectiveRowHeight.toFixed(1)}</strong>
                <button
                  aria-label="행 높이 늘리기"
                  className="ghost-button compact-button"
                  onClick={() => {
                    handleAdjustMetric("rowHeights", SIZE_STEP);
                  }}
                  type="button"
                >
                  +0.5
                </button>
                <button
                  aria-label="행 높이 자동 복원"
                  className="ghost-button compact-button"
                  disabled={currentRowHeightOverride === undefined}
                  onClick={() => {
                    handleResetMetric("rowHeights");
                  }}
                  type="button"
                >
                  자동 복원
                </button>
              </div>
            </article>
          </div>
        </div>
      ) : null}
      <div className="template-canvas-preview">
        <div
          className="template-canvas-preview-viewport"
          style={{
            width: `${viewportWidth}px`,
            height: `${viewportHeight}px`
          }}
        >
          <div
            className="template-canvas-preview-surface"
            style={{
              width: `${surfaceWidth}px`,
              height: `${surfaceHeight}px`,
              backgroundSize: `${CANVAS_CELL_WIDTH}px ${CANVAS_CELL_HEIGHT}px`,
              transform: `scale(${zoom})`
            }}
          >
            {showLabels
              ? snapshot.labels.map((label) => (
                  <span
                    className="template-canvas-label"
                    key={label.id}
                    style={getLabelStyle(label)}
                  >
                    {label.text}
                  </span>
                ))
              : null}
            {focusableZones.map((zone) => {
              const isActive = zone.id === activeZoneId;
              const isSelected = zone.id === effectiveSelectedZoneId;

              return (
                <button
                  className={[
                    "template-canvas-zone",
                    `template-canvas-zone--${zone.role}`,
                    isActive ? "is-active" : "",
                    isSelected ? "is-selected" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={zone.id}
                  onBlur={() => {
                    setHoveredZoneId((current) => (current === zone.id ? null : current));
                  }}
                  onClick={() => {
                    onSelectZone(zone.id);
                  }}
                  onMouseEnter={() => {
                    setHoveredZoneId(zone.id);
                  }}
                  onMouseLeave={() => {
                    setHoveredZoneId((current) => (current === zone.id ? null : current));
                  }}
                  style={getZoneStyle(zone, styleSpec)}
                  type="button"
                >
                  <strong
                    style={{
                      color: normalizeColor(styleSpec?.fontColors?.[getStyleKey(zone)], "#223557"),
                      fontSize: `${styleSpec?.fontSizes?.[getStyleKey(zone)] ?? 12}px`,
                      textAlign: styleSpec?.horizontalAlignments?.[getStyleKey(zone)] ?? "left"
                    }}
                  >
                    {zone.label}
                  </strong>
                  <span
                    style={{
                      color: normalizeColor(styleSpec?.fontColors?.[getStyleKey(zone)], "#607089"),
                      fontSize: `${Math.max((styleSpec?.fontSizes?.[getStyleKey(zone)] ?? 12) - 1, 10)}px`,
                      textAlign: styleSpec?.horizontalAlignments?.[getStyleKey(zone)] ?? "left"
                    }}
                  >
                    {zone.description}
                  </span>
                </button>
              );
            })}
            {advancedMode && selectedZone ? (
              <div className="template-canvas-grid-overlay">
                {Array.from(
                  { length: selectedZone.bounds.endRow - selectedZone.bounds.startRow + 1 },
                  (_, rowOffset) => selectedZone.bounds.startRow + rowOffset
                ).flatMap((rowNumber) =>
                  Array.from(
                    { length: selectedZone.bounds.endColumn - selectedZone.bounds.startColumn + 1 },
                    (_, columnOffset) => selectedZone.bounds.startColumn + columnOffset
                  ).map((columnNumber) => {
                    const bindingValue = getBindingValueForCell(selectedZone, rowNumber, columnNumber);
                    const cellAddress = toCellAddress(rowNumber, columnNumber);
                    const isCurrentBinding = activeBindingValue === bindingValue;

                    return (
                      <button
                        className={`template-canvas-grid-cell ${isCurrentBinding ? "is-current" : ""}`}
                        key={`${selectedZone.id}-${cellAddress}`}
                        onClick={() => {
                          if (canPickBinding) {
                            onPickBindingValue?.(bindingValue);
                          }
                        }}
                        onMouseEnter={() => {
                          setHoveredGridBinding(bindingValue);
                        }}
                        onMouseLeave={() => {
                          setHoveredGridBinding((current) => (current === bindingValue ? null : current));
                        }}
                        style={getGridCellStyle(rowNumber, columnNumber)}
                        title={`${cellAddress}${canPickBinding ? ` → ${bindingValue}` : ""}`}
                        type="button"
                      >
                        <span>{cellAddress}</span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="template-canvas-zone-list" role="list">
        {focusableZones.map((zone, index) => {
          const isActive = zone.id === activeZoneId;

          return (
            <button
              className={`template-canvas-zone-chip ${isActive ? "is-active" : ""}`}
              key={zone.id}
              onClick={() => {
                onSelectZone(zone.id);
              }}
              onMouseEnter={() => {
                setHoveredZoneId(zone.id);
              }}
              onMouseLeave={() => {
                setHoveredZoneId((current) => (current === zone.id ? null : current));
              }}
              type="button"
            >
                <span className="template-canvas-zone-chip-index">{index + 1}</span>
              <span className="template-canvas-zone-chip-copy">
                <strong>{zone.label}</strong>
                <small>{formatZoneBounds(getRenderedZoneBounds(zone, styleSpec))}</small>
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
};
