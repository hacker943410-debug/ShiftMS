// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteAssignmentStepView } from "./SiteAssignmentStepView";

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

describe("site assignment step view", () => {
  it("should render summary data and forward primary actions", async () => {
    const onBack = vi.fn();
    const onComplete = vi.fn();
    const onOpenSchedule = vi.fn();
    const onSaveOrValidate = vi.fn();
    const { container } = await renderComponent(
      <SiteAssignmentStepView
        assignmentStartDate="2026-04-16"
        assigningEmployeeId={null}
        canManageSiteRegistration
        cycleShiftCards={[
          {
            key: "cycle-1-주간",
            cycleName: "Cycle 1",
            label: "주간",
            timeRange: "07:00 - 19:00",
            breakMinutes: 60
          }
        ]}
        draggingEmployeeId={null}
        draggingEmployeeSourceTeam={null}
        errorMessage={null}
        filteredPoolEmployees={[
          {
            id: "employee-1",
            name: "홍길동",
            employeeCode: "E-001",
            employmentType: "정규직"
          }
        ]}
        isCompletingSite={false}
        isSavingDraft={false}
        onAssignEmployee={vi.fn()}
        onAssignmentStartDateChange={vi.fn()}
        onBack={onBack}
        onClearDraggingEmployee={vi.fn()}
        onComplete={onComplete}
        onDragAutoScroll={vi.fn()}
        onOpenSchedule={onOpenSchedule}
        onPoolKeywordChange={vi.fn()}
        onPoolScopeChange={vi.fn()}
        onSaveOrValidate={onSaveOrValidate}
        onStartDraggingEmployee={vi.fn()}
        onTeamCapacityChange={vi.fn()}
        onUnassignEmployee={vi.fn()}
        poolEnabled
        poolKeyword=""
        poolScope="all"
        siteId="site-1"
        siteName="본사"
        stageLabel="근무지 수정"
        teamColumns={[
          {
            label: "A조",
            displayLabel: "A조",
            assignedEmployees: [
              {
                id: "employee-1",
                name: "홍길동",
                employeeCode: "E-001",
                employmentType: "정규직"
              }
            ],
            isConfiguredTeam: true,
            isPoolGroup: false,
            maxHeadcount: 2,
            isAtCapacity: false,
            capacityValue: "2"
          },
          {
            label: "Pool",
            displayLabel: "Pool 근무",
            assignedEmployees: [],
            isConfiguredTeam: false,
            isPoolGroup: true,
            isAtCapacity: false,
            capacityValue: ""
          }
        ]}
      />
    );

    expect(container.textContent).toContain("근무지 수정 - 2단계: 조직 구성");
    expect(container.textContent).toContain("배정 후보");
    expect(container.textContent).toContain("1명");
    expect(container.textContent).toContain("Cycle 1 · 주간");

    const backButton = findButtonByText(container, "이전 단계");
    const saveButton = findButtonByText(container, "패턴 다시 저장");
    const scheduleButton = findButtonByText(container, "근무표로 이동");
    const completeButton = findButtonByText(container, "완료");

    expect(backButton).toBeTruthy();
    expect(saveButton).toBeTruthy();
    expect(scheduleButton).toBeTruthy();
    expect(completeButton).toBeTruthy();

    await act(async () => {
      backButton?.click();
      saveButton?.click();
      scheduleButton?.click();
      completeButton?.click();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSaveOrValidate).toHaveBeenCalledTimes(1);
    expect(onOpenSchedule).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("should hide save actions without permission", async () => {
    const { container } = await renderComponent(
      <SiteAssignmentStepView
        assignmentStartDate="2026-04-16"
        assigningEmployeeId={null}
        canManageSiteRegistration={false}
        cycleShiftCards={[]}
        draggingEmployeeId={null}
        draggingEmployeeSourceTeam={null}
        errorMessage={null}
        filteredPoolEmployees={[]}
        isCompletingSite={false}
        isSavingDraft={false}
        onAssignEmployee={vi.fn()}
        onAssignmentStartDateChange={vi.fn()}
        onBack={vi.fn()}
        onClearDraggingEmployee={vi.fn()}
        onComplete={vi.fn()}
        onDragAutoScroll={vi.fn()}
        onOpenSchedule={vi.fn()}
        onPoolKeywordChange={vi.fn()}
        onPoolScopeChange={vi.fn()}
        onSaveOrValidate={vi.fn()}
        onStartDraggingEmployee={vi.fn()}
        onTeamCapacityChange={vi.fn()}
        onUnassignEmployee={vi.fn()}
        poolEnabled={false}
        poolKeyword=""
        poolScope="all"
        siteId="site-1"
        siteName="site"
        stageLabel="stage"
        teamColumns={[]}
      />
    );

    const footer = container.querySelector(".footer-action-card");

    expect(footer?.textContent).toContain("권한");
    expect(footer?.querySelectorAll("button").length).toBe(1);
  });

  it("should highlight the focused team column when provided", async () => {
    const { container } = await renderComponent(
      <SiteAssignmentStepView
        assignmentStartDate="2026-04-16"
        assigningEmployeeId={null}
        canManageSiteRegistration
        cycleShiftCards={[]}
        draggingEmployeeId={null}
        draggingEmployeeSourceTeam={null}
        errorMessage={null}
        filteredPoolEmployees={[]}
        focusedTeamLabel="B조"
        isCompletingSite={false}
        isSavingDraft={false}
        onAssignEmployee={vi.fn()}
        onAssignmentStartDateChange={vi.fn()}
        onBack={vi.fn()}
        onClearDraggingEmployee={vi.fn()}
        onComplete={vi.fn()}
        onDragAutoScroll={vi.fn()}
        onOpenSchedule={vi.fn()}
        onPoolKeywordChange={vi.fn()}
        onPoolScopeChange={vi.fn()}
        onSaveOrValidate={vi.fn()}
        onStartDraggingEmployee={vi.fn()}
        onTeamCapacityChange={vi.fn()}
        onUnassignEmployee={vi.fn()}
        poolEnabled={false}
        poolKeyword=""
        poolScope="all"
        siteId="site-1"
        siteName="site"
        stageLabel="stage"
        teamColumns={[
          {
            label: "A조",
            displayLabel: "A조",
            assignedEmployees: [],
            isConfiguredTeam: true,
            isPoolGroup: false,
            isAtCapacity: false,
            capacityValue: "",
          },
          {
            label: "B조",
            displayLabel: "B조",
            assignedEmployees: [],
            isConfiguredTeam: true,
            isPoolGroup: false,
            isAtCapacity: false,
            capacityValue: "",
          },
        ]}
      />,
    );

    const focusedColumn = container.querySelector('[data-team-label="B조"]');

    expect(focusedColumn?.className).toContain("focused");
  });
});
