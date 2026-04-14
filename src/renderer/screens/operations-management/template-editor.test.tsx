// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DocumentTemplateCanvasSnapshot,
  DocumentTemplateCanvasZone,
  DocumentTemplateStyleSpec
} from "@shared/domain/document-template";

import { TemplateCanvasEditor } from "./TemplateCanvasEditor";
import { TemplateSemanticPropertiesPanel } from "./TemplateSemanticPropertiesPanel";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const renderComponent = async (element: ReactElement) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(element);
  });

  return {
    container
  };
};

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();

    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
  }

  mountedContainers.splice(0).forEach((container) => {
    container.remove();
  });
});

const createSnapshot = (zoneOverride?: Partial<DocumentTemplateCanvasZone>): DocumentTemplateCanvasSnapshot => ({
  templateType: "attachment1",
  sheetName: "별첨1",
  maxRow: 12,
  maxColumn: 8,
  labels: [],
  zones: [
    {
      id: "zone-title",
      label: "제목 위치",
      description: "문서 제목 위치",
      role: "title",
      bindingType: "cell",
      fieldKey: "titleCell",
      bindings: ["B2"],
      bounds: {
        startRow: 2,
        endRow: 4,
        startColumn: 2,
        endColumn: 4
      },
      ...zoneOverride
    }
  ]
});

describe("template editor renderer", () => {
  it("should allow picking a binding directly from advanced canvas mode", async () => {
    const onPickBindingValue = vi.fn();
    const onSelectZone = vi.fn();
    const { container } = await renderComponent(
      <TemplateCanvasEditor
        onPickBindingValue={onPickBindingValue}
        onSelectZone={onSelectZone}
        selectedZoneId="zone-title"
        snapshot={createSnapshot()}
      />
    );

    const advancedModeButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("고급 모드")
    );

    expect(advancedModeButton).toBeTruthy();

    await act(async () => {
      advancedModeButton?.click();
    });

    const targetGridCell = container.querySelector(
      'button.template-canvas-grid-cell[title="C3 → C3"]'
    ) as HTMLButtonElement | null;

    expect(targetGridCell).toBeTruthy();

    await act(async () => {
      targetGridCell?.click();
    });

    expect(onPickBindingValue).toHaveBeenCalledWith("C3");
  });

  it("should adjust column width and row height from advanced canvas controls", async () => {
    const onAdjustZoneMetric = vi.fn();
    const { container } = await renderComponent(
      <TemplateCanvasEditor
        onAdjustZoneMetric={onAdjustZoneMetric}
        onSelectZone={vi.fn()}
        selectedZoneId="zone-title"
        snapshot={createSnapshot()}
        styleSpec={{
          rowHeights: {
            titleCell: 24
          }
        }}
      />
    );

    const advancedModeButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("고급 모드")
    );

    expect(advancedModeButton).toBeTruthy();

    await act(async () => {
      advancedModeButton?.click();
    });

    const increaseColumnWidthButton = container.querySelector(
      'button[aria-label="열 너비 늘리기"]'
    ) as HTMLButtonElement | null;
    const resetRowHeightButton = container.querySelector(
      'button[aria-label="행 높이 자동 복원"]'
    ) as HTMLButtonElement | null;

    expect(increaseColumnWidthButton).toBeTruthy();
    expect(resetRowHeightButton).toBeTruthy();

    await act(async () => {
      increaseColumnWidthButton?.click();
      resetRowHeightButton?.click();
    });

    expect(onAdjustZoneMetric).toHaveBeenNthCalledWith(1, "columnWidths", "titleCell", 9.5);
    expect(onAdjustZoneMetric).toHaveBeenNthCalledWith(2, "rowHeights", "titleCell", null);
  });

  it("should show the merged range override and restore it from the properties panel", async () => {
    const onRestoreZoneStyle = vi.fn();
    const styleSpec: DocumentTemplateStyleSpec = {
      mergedRanges: {
        titleCell: "B2:E2"
      }
    };
    const { container } = await renderComponent(
      <TemplateSemanticPropertiesPanel
        baselineBindingValue="B2"
        baselineStyleSpec={{}}
        canUndo={false}
        onBindingChange={vi.fn()}
        onRestoreBinding={vi.fn()}
        onRestoreZoneStyle={onRestoreZoneStyle}
        onStyleNumberChange={vi.fn()}
        onStyleStringChange={vi.fn()}
        onUndoChange={vi.fn()}
        selectedZone={createSnapshot().zones[0]}
        styleSpec={styleSpec}
        templateType="attachment1"
      />
    );

    const mergedRangeInput = container.querySelector(
      'input[placeholder="예: B2:D4"]'
    ) as HTMLInputElement | null;

    expect(mergedRangeInput).toBeTruthy();
    expect(mergedRangeInput?.value).toBe("B2:E2");

    const restoreButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("선택 영역 스타일 기준 복원")
    );

    expect(restoreButton).toBeTruthy();

    await act(async () => {
      restoreButton?.click();
    });

    expect(onRestoreZoneStyle).toHaveBeenCalledWith("titleCell");
  });
});
