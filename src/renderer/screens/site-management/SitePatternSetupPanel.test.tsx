// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SitePatternSetupPanel } from "./SitePatternSetupPanel";

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

const selectOptionFromShell = async (shell: Element, optionText: string) => {
  const control = shell.querySelector(".app-select-control") as HTMLButtonElement | null;

  expect(control).toBeTruthy();

  await act(async () => {
    control?.click();
  });

  const optionButton = Array.from(shell.querySelectorAll(".app-select-option")).find((button) =>
    button.textContent?.includes(optionText)
  ) as HTMLButtonElement | undefined;

  expect(optionButton).toBeTruthy();

  await act(async () => {
    optionButton?.click();
  });
};

const changeInputValue = async (
  input: HTMLInputElement | HTMLSelectElement,
  value: string,
  eventType: "change" | "input" = "change"
) => {
  const prototype =
    input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (!valueSetter) {
    throw new Error("Missing native value setter for test input");
  }

  await act(async () => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event(eventType, { bubbles: true }));
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

describe("SitePatternSetupPanel", () => {
  it("should forward preset and field changes to parent callbacks", async () => {
    const onOpenPatternPresetModal = vi.fn();
    const onNameChange = vi.fn();
    const onCustomerNameChange = vi.fn();
    const onStatusChange = vi.fn();
    const onTeamCountChange = vi.fn();
    const onCycleCountChange = vi.fn();
    const onPoolEnabledChange = vi.fn();
    const { container } = await renderComponent(
      <SitePatternSetupPanel
        customerNameOptions={["고객사A", "고객사B"]}
        cycleAssignments={[
          {
            cycleKey: "cycle-1",
            name: "Cycle 1",
            patternString: "주주야야휴휴",
            teams: ["A조"]
          }
        ]}
        cycleCount={2}
        draft={{
          customerName: "",
          cycleCount: "2",
          name: "본관",
          poolEnabled: false,
          siteCode: "SITE-001",
          status: "active",
          teamCount: "4"
        }}
        draggingTeamLabel={null}
        onAssignTeamToCycle={vi.fn()}
        onClearDraggingTeam={vi.fn()}
        onCycleCountChange={onCycleCountChange}
        onCustomerNameChange={onCustomerNameChange}
        onNameChange={onNameChange}
        onOpenPatternPresetModal={onOpenPatternPresetModal}
        onPoolEnabledChange={onPoolEnabledChange}
        onStartDraggingTeam={vi.fn()}
        onStatusChange={onStatusChange}
        onTeamCountChange={onTeamCountChange}
        patternPresetDisabled={false}
        teamCount={4}
      />
    );

    expect(container.textContent).toContain("기본 정보 및 패턴 설정");
    expect(container.textContent).toContain("근무 묶음 배정");

    const presetButton = findButtonByText(container, "패턴 및 설정정보 불러오기");
    const nameInput = container.querySelector(".site-name-field input") as HTMLInputElement | null;
    const customerSelectShell = container.querySelector(".site-customer-field .app-select-shell");
    const statusSelectShell = container.querySelector(".site-status-field .app-select-shell");
    const numberInputs = Array.from(
      container.querySelectorAll(".site-topology-grid-primary input[type='number']")
    ) as HTMLInputElement[];
    const poolCheckbox = container.querySelector(".site-toggle-field input[type='checkbox']") as HTMLInputElement | null;

    expect(presetButton).toBeTruthy();
    expect(nameInput).toBeTruthy();
    expect(customerSelectShell).toBeTruthy();
    expect(statusSelectShell).toBeTruthy();
    expect(numberInputs).toHaveLength(2);
    expect(poolCheckbox).toBeTruthy();

    await act(async () => {
      presetButton?.click();
    });
    await changeInputValue(nameInput!, "본관-수정", "input");
    await selectOptionFromShell(customerSelectShell!, "고객사B");
    await selectOptionFromShell(statusSelectShell!, "중지");
    await changeInputValue(numberInputs[0]!, "5");
    await changeInputValue(numberInputs[1]!, "3");
    await act(async () => {
      poolCheckbox?.click();
    });

    expect(onOpenPatternPresetModal).toHaveBeenCalledTimes(1);
    expect(onNameChange).toHaveBeenCalledWith("본관-수정");
    expect(onCustomerNameChange).toHaveBeenCalledWith("고객사B");
    expect(onStatusChange).toHaveBeenCalledWith("inactive");
    expect(onTeamCountChange).toHaveBeenCalledWith("5");
    expect(onCycleCountChange).toHaveBeenCalledWith("3");
    expect(onPoolEnabledChange).toHaveBeenCalledWith(true);
  });

  it("should forward drag and drop assignment actions", async () => {
    const onAssignTeamToCycle = vi.fn();
    const onClearDraggingTeam = vi.fn();
    const onStartDraggingTeam = vi.fn();
    const { container } = await renderComponent(
      <SitePatternSetupPanel
        customerNameOptions={[]}
        cycleAssignments={[
          {
            cycleKey: "cycle-1",
            name: "Cycle 1",
            patternString: "주주야야휴휴",
            teams: ["A조"]
          },
          {
            cycleKey: "cycle-2",
            name: "Cycle 2",
            patternString: "",
            teams: []
          }
        ]}
        cycleCount={2}
        draft={{
          customerName: "",
          cycleCount: "2",
          name: "본관",
          poolEnabled: false,
          siteCode: "SITE-001",
          status: "active",
          teamCount: "4"
        }}
        draggingTeamLabel="A조"
        onAssignTeamToCycle={onAssignTeamToCycle}
        onClearDraggingTeam={onClearDraggingTeam}
        onCycleCountChange={vi.fn()}
        onCustomerNameChange={vi.fn()}
        onNameChange={vi.fn()}
        onOpenPatternPresetModal={vi.fn()}
        onPoolEnabledChange={vi.fn()}
        onStartDraggingTeam={onStartDraggingTeam}
        onStatusChange={vi.fn()}
        onTeamCountChange={vi.fn()}
        patternPresetDisabled={false}
        teamCount={4}
      />
    );

    const teamChip = container.querySelector(".site-cycle-team-chip") as HTMLButtonElement | null;
    const cycleCards = Array.from(container.querySelectorAll(".site-cycle-assignment-card")) as HTMLDivElement[];

    expect(teamChip).toBeTruthy();
    expect(cycleCards).toHaveLength(2);

    await act(async () => {
      teamChip!.dispatchEvent(new Event("dragstart", { bubbles: true }));
      teamChip!.dispatchEvent(new Event("dragend", { bubbles: true }));
      cycleCards[1]!.dispatchEvent(new Event("drop", { bubbles: true }));
    });

    expect(onStartDraggingTeam).toHaveBeenCalledWith("A조");
    expect(onClearDraggingTeam).toHaveBeenCalledTimes(2);
    expect(onAssignTeamToCycle).toHaveBeenCalledWith("A조", "cycle-2");
  });
});
