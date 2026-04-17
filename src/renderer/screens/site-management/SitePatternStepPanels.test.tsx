// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SitePatternPresetModal } from "./SitePatternPresetModal";
import { SitePatternSimulationPanel } from "./SitePatternSimulationPanel";

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

const findButtonByText = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text));

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

describe("site pattern step panels", () => {
  it("should render the simulation panel and move between months", async () => {
    const onMovePreviousMonth = vi.fn();
    const onMoveNextMonth = vi.fn();
    const { container } = await renderComponent(
      <SitePatternSimulationPanel
        assignmentSummaries={[
          {
            cycleKey: "cycle-1",
            cycleName: "Cycle 1",
            patternString: "주주야야휴휴",
            teams: ["A조", "B조"]
          }
        ]}
        canMoveNextMonth
        canMovePreviousMonth={false}
        cycleShiftCards={[
          {
            key: "cycle-1-day",
            cycleName: "Cycle 1",
            label: "주간",
            toneClassName: "day",
            timeRange: "07:00 - 19:00",
            breakMinutes: 60
          }
        ]}
        invalidCycleMessages={["Cycle 1: X"]}
        metricGroups={[
          {
            cycleKey: "cycle-1",
            cycleName: "Cycle 1",
            items: [
              {
                label: "근무일",
                value: "20일"
              }
            ]
          }
        ]}
        onMoveNextMonth={onMoveNextMonth}
        onMovePreviousMonth={onMovePreviousMonth}
        poolSummary={{
          timeRange: "09:00 - 18:00",
          breakMinutes: "60",
          dailyHoursText: "8.0"
        }}
        simulationAnchorDate="2026-04-17"
        simulationCells={[
          {
            key: "2026-04-17",
            isCurrentMonth: true,
            isToday: true,
            isHoliday: false,
            dayLabel: "17",
            date: "2026-04-17",
            holidayClassName: "",
            assignments: [
              {
                key: "2026-04-17-A조",
                teamLabel: "A조",
                dutyLabel: "주간",
                toneClassName: "day"
              }
            ]
          }
        ]}
        simulationMonthLabel="2026년 4월"
      />
    );

    expect(container.textContent).toContain("월간 달력 시뮬레이션");
    expect(container.textContent).toContain("2026년 4월");
    expect(container.textContent).toContain("Pool 별도 운영");
    expect(container.textContent).toContain("A조 주간");
    expect(container.textContent).toContain("패턴String 오류: Cycle 1: X");

    const previousButton = findButtonByText(container, "이전");
    const nextButton = findButtonByText(container, "다음");

    expect(previousButton).toBeTruthy();
    expect(nextButton).toBeTruthy();
    expect(previousButton?.getAttribute("disabled")).not.toBeNull();

    await act(async () => {
      nextButton?.click();
    });

    expect(onMovePreviousMonth).not.toHaveBeenCalled();
    expect(onMoveNextMonth).toHaveBeenCalledTimes(1);
  });

  it("should render preset modal and forward apply and close actions", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const { container } = await renderComponent(
      <SitePatternPresetModal
        canApply
        onApply={onApply}
        onClose={onClose}
        onSelectSiteId={vi.fn()}
        selectedSiteId="site-1"
        siteOptions={[
          { id: "site-1", name: "기본 패턴" },
          { id: "site-2", name: "2교대 패턴" }
        ]}
      />
    );

    expect(container.textContent).toContain("패턴 및 설정정보 불러오기");
    expect(container.textContent).toContain("기본 패턴");

    const applyButton = findButtonByText(container, "불러오기");
    const closeButton = findButtonByText(container, "취소");

    expect(applyButton).toBeTruthy();
    expect(closeButton).toBeTruthy();

    await act(async () => {
      applyButton?.click();
      closeButton?.click();
    });

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
