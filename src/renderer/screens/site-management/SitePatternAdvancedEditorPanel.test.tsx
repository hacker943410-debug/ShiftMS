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
        onCycleShiftBreakChange={vi.fn()}
        onCycleShiftTimeChange={vi.fn()}
        onCycleHolidayToggle={vi.fn()}
        onCycleHolidayShiftTimeChange={vi.fn()}
        onCycleHolidayShiftBreakChange={vi.fn()}
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

  it("renders a 휴게(분) input per shift and forwards only the changed shift's break", async () => {
    const onCycleShiftBreakChange = vi.fn();
    const { container } = await renderComponent(
      <SitePatternAdvancedEditorPanel
        cycles={[
          {
            assignedTeamLabels: ["A조"],
            cycleKey: "cycle-1",
            cycleLabelCount: 6,
            draft: {
              breakMinutes: "60",
              name: "Cycle 1",
              patternStartDate: "2026-04-01",
              patternString: "주주야야휴휴",
              shiftCount: "2",
              shiftBreakMinutes: ["60", "90"],
              shiftTimes: ["07:00 - 16:00", "22:00 - 13:00"],
              holidayTimeMode: "unified",
              weekdayPublicHolidayAsHoliday: true,
              holidayShiftTimes: ["07:00 - 16:00", "22:00 - 13:00"],
              holidayShiftBreakMinutes: ["60", "90"]
            },
            fallbackShiftTimes: ["07:00 - 16:00", "22:00 - 13:00"],
            name: "Cycle 1",
            shiftCount: 2,
            shiftLabels: ["주간", "야간"],
            teamIndexes: [{ teamIndex: 0, teamLabel: "A조", value: 0 }]
          }
        ]}
        getPatternStringNote={() => "note"}
        getPatternStringPlaceholder={() => "placeholder"}
        onCycleFieldChange={vi.fn()}
        onCycleShiftBreakChange={onCycleShiftBreakChange}
        onCycleShiftTimeChange={vi.fn()}
        onCycleHolidayToggle={vi.fn()}
        onCycleHolidayShiftTimeChange={vi.fn()}
        onCycleHolidayShiftBreakChange={vi.fn()}
        onCycleTeamIndexChange={vi.fn()}
        onPoolBreakMinutesChange={vi.fn()}
        onPoolTimeRangeChange={vi.fn()}
        poolBreakMinutes="60"
        poolDailyHoursText="8"
        poolEnabled={false}
        poolTimeRange="09:00 - 18:00"
      />
    );

    const breakInputs = Array.from(
      container.querySelectorAll(".site-shift-break-field input")
    ) as HTMLInputElement[];

    // 근무조마다 휴게 입력칸이 따로 있고, 주간 60 / 야간 90으로 서로 다르게 표시된다.
    expect(breakInputs).toHaveLength(2);
    expect(breakInputs[0]?.value).toBe("60");
    expect(breakInputs[1]?.value).toBe("90");

    // 야간 휴게만 바꾸면 그 근무조(index 1)만 콜백으로 전달된다(다른 조 값은 안 건드림).
    await changeInputValue(breakInputs[1]!, "120");
    expect(onCycleShiftBreakChange).toHaveBeenCalledWith("cycle-1", 1, "120");
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
              shiftBreakMinutes: ["60", "60"],
              shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
              holidayTimeMode: "unified",
              weekdayPublicHolidayAsHoliday: true,
              holidayShiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
              holidayShiftBreakMinutes: ["60", "60"]
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
        onCycleShiftBreakChange={vi.fn()}
        onCycleShiftTimeChange={vi.fn()}
        onCycleHolidayToggle={vi.fn()}
        onCycleHolidayShiftTimeChange={vi.fn()}
        onCycleHolidayShiftBreakChange={vi.fn()}
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

  it("switches weekday/holiday inputs via the 평일/휴일 tab in split mode without inline doubling", async () => {
    const onCycleShiftBreakChange = vi.fn();
    const onCycleHolidayShiftBreakChange = vi.fn();
    const { container } = await renderComponent(
      <SitePatternAdvancedEditorPanel
        cycles={[
          {
            assignedTeamLabels: ["A조"],
            cycleKey: "cycle-1",
            cycleLabelCount: 6,
            draft: {
              breakMinutes: "60",
              name: "Cycle 1",
              patternStartDate: "2026-04-01",
              patternString: "주주야야휴휴",
              shiftCount: "2",
              shiftBreakMinutes: ["60", "60"],
              shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
              holidayTimeMode: "split",
              weekdayPublicHolidayAsHoliday: true,
              holidayShiftTimes: ["08:00 - 18:00", "20:00 - 06:00"],
              holidayShiftBreakMinutes: ["30", "30"]
            },
            fallbackShiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
            name: "Cycle 1",
            shiftCount: 2,
            shiftLabels: ["주간", "야간"],
            teamIndexes: [{ teamIndex: 0, teamLabel: "A조", value: 0 }]
          }
        ]}
        getPatternStringNote={() => "note"}
        getPatternStringPlaceholder={() => "placeholder"}
        onCycleFieldChange={vi.fn()}
        onCycleShiftBreakChange={onCycleShiftBreakChange}
        onCycleShiftTimeChange={vi.fn()}
        onCycleHolidayToggle={vi.fn()}
        onCycleHolidayShiftTimeChange={vi.fn()}
        onCycleHolidayShiftBreakChange={onCycleHolidayShiftBreakChange}
        onCycleTeamIndexChange={vi.fn()}
        onPoolBreakMinutesChange={vi.fn()}
        onPoolTimeRangeChange={vi.fn()}
        poolBreakMinutes="60"
        poolDailyHoursText="8"
        poolEnabled={false}
        poolTimeRange="09:00 - 18:00"
      />
    );

    const tabs = Array.from(
      container.querySelectorAll(".site-daytype-tab")
    ) as HTMLButtonElement[];
    expect(tabs).toHaveLength(2);

    // 분리 모드여도 시간칸이 2배로 쌓이지 않는다(교대 2개 = 휴게칸 2개).
    let breakInputs = Array.from(
      container.querySelectorAll(".site-shift-break-field input")
    ) as HTMLInputElement[];
    expect(breakInputs).toHaveLength(2);
    expect(breakInputs[0]?.value).toBe("60"); // 기본 = 평일 보기

    // 휴일 탭으로 전환하면 같은 칸이 휴일 값으로 바뀐다.
    await act(async () => {
      tabs[1]!.click();
    });
    breakInputs = Array.from(
      container.querySelectorAll(".site-shift-break-field input")
    ) as HTMLInputElement[];
    expect(breakInputs).toHaveLength(2);
    expect(breakInputs[0]?.value).toBe("30"); // 휴일 값

    await changeInputValue(breakInputs[0]!, "45");
    expect(onCycleHolidayShiftBreakChange).toHaveBeenCalledWith("cycle-1", 0, "45");
    expect(onCycleShiftBreakChange).not.toHaveBeenCalled();
  });
});
