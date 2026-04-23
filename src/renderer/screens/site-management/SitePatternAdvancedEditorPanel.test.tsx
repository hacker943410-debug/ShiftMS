// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SitePatternAdvancedEditorPanel } from "./SitePatternAdvancedEditorPanel";

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

  return { container };
};

const changeInputValue = async (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  if (!valueSetter) {
    throw new Error("Missing native input value setter");
  }

  await act(async () => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
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

describe("SitePatternAdvancedEditorPanel", () => {
  it("should render pool settings and forward pool break minutes changes", async () => {
    const onPoolBreakMinutesChange = vi.fn();
    const { container } = await renderComponent(
      <SitePatternAdvancedEditorPanel
        cycles={[]}
        getPatternStringNote={() => "note"}
        getPatternStringPlaceholder={() => "placeholder"}
        onCycleFieldChange={vi.fn()}
        onCycleShiftTimeChange={vi.fn()}
        onCycleTeamIndexChange={vi.fn()}
        onPoolBreakMinutesChange={onPoolBreakMinutesChange}
        onPoolTimeRangeChange={vi.fn()}
        poolBreakMinutes="60"
        poolDailyHoursText="8"
        poolEnabled
        poolTimeRange="09:00 - 18:00"
      />
    );

    expect(container.textContent).toContain("Pool 설정");
    expect(container.textContent).toContain("Pool 실근무시간");
    expect(container.textContent).toContain("8시간");

    const breakInput = Array.from(container.querySelectorAll("input[type='number']")).find(
      (input) => (input as HTMLInputElement).value === "60"
    ) as HTMLInputElement | undefined;

    expect(breakInput).toBeTruthy();

    await changeInputValue(breakInput!, "45");

    expect(onPoolBreakMinutesChange).toHaveBeenCalledWith("45");
  });

  it("should forward cycle field and team index changes", async () => {
    const onCycleFieldChange = vi.fn();
    const onCycleTeamIndexChange = vi.fn();
    const { container } = await renderComponent(
      <SitePatternAdvancedEditorPanel
        cycles={[
          {
            assignedTeamLabels: ["A조", "B조"],
            cycleKey: "cycle-1",
            cycleLabelCount: 6,
            draft: {
              breakMinutes: "60",
              name: "Cycle 1",
              patternStartDate: "2026-04-01",
              patternString: "주주야야휴휴",
              shiftCount: "2",
              shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"]
            },
            fallbackShiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
            name: "Cycle 1",
            shiftCount: 2,
            shiftLabels: ["주간", "야간"],
            teamIndexes: [
              {
                teamIndex: 0,
                teamLabel: "A조",
                value: 0
              },
              {
                teamIndex: 1,
                teamLabel: "B조",
                value: 1
              }
            ]
          }
        ]}
        getPatternStringNote={() => "2교대 note"}
        getPatternStringPlaceholder={() => "placeholder"}
        onCycleFieldChange={onCycleFieldChange}
        onCycleShiftTimeChange={vi.fn()}
        onCycleTeamIndexChange={onCycleTeamIndexChange}
        onPoolBreakMinutesChange={vi.fn()}
        onPoolTimeRangeChange={vi.fn()}
        poolBreakMinutes="60"
        poolDailyHoursText="8"
        poolEnabled={false}
        poolTimeRange="09:00 - 18:00"
      />
    );

    expect(container.textContent).toContain("Cycle 1 설정");
    expect(container.textContent).toContain("배정 조: A조, B조");
    expect(container.textContent).toContain("조별 Index");

    const textInputs = Array.from(container.querySelectorAll("input")).filter(
      (input) => (input as HTMLInputElement).type === "text"
    ) as HTMLInputElement[];
    const numberInputs = Array.from(container.querySelectorAll("input[type='number']")) as HTMLInputElement[];
    const indexRows = Array.from(container.querySelectorAll(".site-index-row"));
    const teamIndexInputs = Array.from(
      container.querySelectorAll(".site-index-row input[type='number']")
    ) as HTMLInputElement[];

    expect(textInputs.length).toBeGreaterThanOrEqual(2);
    expect(numberInputs.length).toBeGreaterThanOrEqual(4);
    expect(indexRows).toHaveLength(2);
    expect(indexRows[0]?.textContent).toContain("A조 Index");
    expect(indexRows[1]?.textContent).toContain("B조 Index");

    await changeInputValue(textInputs[0]!, "주간A");
    await changeInputValue(textInputs[1]!, "주야휴");
    await changeInputValue(numberInputs.find((input) => input.value === "2")!, "3");
    await changeInputValue(teamIndexInputs[0]!, "2");

    expect(onCycleFieldChange).toHaveBeenCalledWith("cycle-1", "name", "주간A");
    expect(onCycleFieldChange).toHaveBeenCalledWith("cycle-1", "patternString", "주야휴");
    expect(onCycleFieldChange).toHaveBeenCalledWith("cycle-1", "shiftCount", "3");
    expect(onCycleTeamIndexChange).toHaveBeenCalledWith("cycle-1", 0, "2");
  });
});
