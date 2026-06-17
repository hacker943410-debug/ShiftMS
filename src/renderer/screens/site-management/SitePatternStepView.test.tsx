// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SitePatternStepView } from "./SitePatternStepView";

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
  Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text
  );

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

describe("SitePatternStepView", () => {
  it("should render the step1 view and forward footer and preset modal actions", async () => {
    const onBackToList = vi.fn();
    const onReviewOrSave = vi.fn();
    const onGoNext = vi.fn();
    const onModalApply = vi.fn();
    const onModalClose = vi.fn();
    const { container } = await renderComponent(
      <SitePatternStepView
        activeCycleCount={1}
        advancedEditorPanelProps={{
          cycles: [
            {
              cycleKey: "cycle-1",
              name: "Cycle 1",
              shiftCount: 2,
              cycleLabelCount: 8,
              shiftLabels: ["주간", "야간"],
              fallbackShiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
              assignedTeamLabels: ["A조"],
              teamIndexes: [{ teamLabel: "A조", teamIndex: 0, value: 0 }],
              draft: {
                name: "Cycle 1",
                shiftCount: "2",
                patternStartDate: "2026-04-01",
                breakMinutes: "60",
                patternString: "주주야야휴휴",
                shiftBreakMinutes: ["60", "60"],
                shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
                holidayTimeMode: "unified",
                weekdayPublicHolidayAsHoliday: true,
                holidayShiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
                holidayShiftBreakMinutes: ["60", "60"]
              }
            }
          ],
          getPatternStringNote: () => "패턴 안내",
          getPatternStringPlaceholder: () => "주주야야휴휴",
          onCycleFieldChange: vi.fn(),
          onCycleShiftBreakChange: vi.fn(),
          onCycleShiftTimeChange: vi.fn(),
          onCycleHolidayToggle: vi.fn(),
          onCycleHolidayShiftTimeChange: vi.fn(),
          onCycleHolidayShiftBreakChange: vi.fn(),
          onCycleTeamIndexChange: vi.fn(),
          onPoolBreakMinutesChange: vi.fn(),
          onPoolTimeRangeChange: vi.fn(),
          poolBreakMinutes: "60",
          poolDailyHoursText: "8",
          poolEnabled: true,
          poolTimeRange: "09:00 - 18:00"
        }}
        assignedTeamCount={2}
        canManageSiteRegistration
        cycleCount={2}
        formError={null}
        hasPersistedSiteId={false}
        isSubmitting={false}
        onBackToList={onBackToList}
        onGoNext={onGoNext}
        onReviewOrSave={onReviewOrSave}
        patternPresetModalProps={{
          canApply: true,
          onApply: onModalApply,
          onClose: onModalClose,
          onSelectSiteId: vi.fn(),
          selectedSiteId: "site-1",
          siteOptions: [{ id: "site-1", name: "기본 패턴" }]
        }}
        poolBreakMinutes="60"
        poolEnabled
        poolTimeRange="09:00 - 18:00"
        setupPanelProps={{
          customerNameOptions: ["고객사A"],
          cycleAssignments: [
            {
              cycleKey: "cycle-1",
              name: "Cycle 1",
              patternString: "주주야야휴휴",
              teams: ["A조"]
            }
          ],
          cycleCount: 2,
          draft: {
            customerName: "고객사A",
            cycleCount: "2",
            name: "본관",
            poolEnabled: true,
            siteCode: "SITE-001",
            status: "active",
            teamCount: "2"
          },
          draggingTeamLabel: null,
          onAssignTeamToCycle: vi.fn(),
          onClearDraggingTeam: vi.fn(),
          onCycleCountChange: vi.fn(),
          onCustomerNameChange: vi.fn(),
          onNameChange: vi.fn(),
          onOpenPatternPresetModal: vi.fn(),
          onPoolEnabledChange: vi.fn(),
          onStartDraggingTeam: vi.fn(),
          onApplyRotationTemplate: vi.fn(),
          rotationTemplates: [],
          onStatusChange: vi.fn(),
          onTeamCountChange: vi.fn(),
          patternPresetDisabled: false,
          teamCount: 2
        }}
        showPatternPresetModal
        simulationAnchorDate="2026-04-17"
        simulationMonthLabel="2026년 4월"
        simulationPanelProps={{
          assignmentSummaries: [
            {
              cycleKey: "cycle-1",
              cycleName: "Cycle 1",
              patternString: "주주야야휴휴",
              teams: ["A조"]
            }
          ],
          canMoveNextMonth: true,
          canMovePreviousMonth: false,
          cycleShiftCards: [
            {
              key: "cycle-1-day",
              cycleName: "Cycle 1",
              label: "주간",
              toneClassName: "day",
              timeRange: "07:00 - 19:00",
              breakMinutes: 60
            }
          ],
          invalidCycleMessages: [],
          metricGroups: [
            {
              cycleKey: "cycle-1",
              cycleName: "Cycle 1",
              items: [{ label: "근무일", value: "20일" }]
            }
          ],
          onMoveNextMonth: vi.fn(),
          onMovePreviousMonth: vi.fn(),
          poolSummary: {
            timeRange: "09:00 - 18:00",
            breakMinutes: "60",
            dailyHoursText: "8.0"
          },
          simulationAnchorDate: "2026-04-17",
          simulationCells: [
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
          ],
          simulationMonthLabel: "2026년 4월"
        }}
        siteName="본관"
        stageLabel="근무지 등록"
        teamCount={2}
      />
    );

    expect(container.textContent).toContain("근무지 등록 - 1단계: 패턴 등록");
    expect(container.textContent).toContain("본관");
    expect(container.textContent).toContain("월간 달력 시뮬레이션");
    expect(container.textContent).toContain("패턴 및 설정정보 불러오기");

    await act(async () => {
      findButtonByText(container, "뒤로가기")?.click();
      findButtonByText(container, "입력 검토")?.click();
    });
    // '기본 설정' 단계에서는 '다음: 근무시간 설정'을 눌러야 '다음 단계'가 나타난다.
    await act(async () => {
      findButtonByText(container, "다음: 근무시간 설정")?.click();
    });
    await act(async () => {
      findButtonByText(container, "다음 단계")?.click();
      findButtonByText(container, "불러오기")?.click();
      findButtonByText(container, "취소")?.click();
    });

    expect(onBackToList).toHaveBeenCalledTimes(1);
    expect(onReviewOrSave).toHaveBeenCalledTimes(1);
    expect(onGoNext).toHaveBeenCalledTimes(1);
    expect(onModalApply).toHaveBeenCalledTimes(1);
    expect(onModalClose).toHaveBeenCalledTimes(1);
  });

  it("should hide footer registration buttons without permission", async () => {
    const { container } = await renderComponent(
      <SitePatternStepView
        activeCycleCount={0}
        advancedEditorPanelProps={{
          cycles: [],
          getPatternStringNote: () => "",
          getPatternStringPlaceholder: () => "",
          onCycleFieldChange: vi.fn(),
          onCycleShiftBreakChange: vi.fn(),
          onCycleShiftTimeChange: vi.fn(),
          onCycleHolidayToggle: vi.fn(),
          onCycleHolidayShiftTimeChange: vi.fn(),
          onCycleHolidayShiftBreakChange: vi.fn(),
          onCycleTeamIndexChange: vi.fn(),
          onPoolBreakMinutesChange: vi.fn(),
          onPoolTimeRangeChange: vi.fn(),
          poolBreakMinutes: "60",
          poolDailyHoursText: "0",
          poolEnabled: false,
          poolTimeRange: "09:00 - 18:00"
        }}
        assignedTeamCount={0}
        canManageSiteRegistration={false}
        cycleCount={1}
        formError={null}
        hasPersistedSiteId={false}
        isSubmitting={false}
        onBackToList={vi.fn()}
        onGoNext={vi.fn()}
        onReviewOrSave={vi.fn()}
        patternPresetModalProps={{
          canApply: false,
          onApply: vi.fn(),
          onClose: vi.fn(),
          onSelectSiteId: vi.fn(),
          selectedSiteId: "",
          siteOptions: []
        }}
        poolBreakMinutes="60"
        poolEnabled={false}
        poolTimeRange="09:00 - 18:00"
        setupPanelProps={{
          customerNameOptions: [],
          cycleAssignments: [],
          cycleCount: 1,
          draft: {
            customerName: "",
            cycleCount: "1",
            name: "",
            poolEnabled: false,
            siteCode: "SITE-001",
            status: "active",
            teamCount: "1"
          },
          draggingTeamLabel: null,
          onAssignTeamToCycle: vi.fn(),
          onClearDraggingTeam: vi.fn(),
          onCycleCountChange: vi.fn(),
          onCustomerNameChange: vi.fn(),
          onNameChange: vi.fn(),
          onOpenPatternPresetModal: vi.fn(),
          onPoolEnabledChange: vi.fn(),
          onStartDraggingTeam: vi.fn(),
          onApplyRotationTemplate: vi.fn(),
          rotationTemplates: [],
          onStatusChange: vi.fn(),
          onTeamCountChange: vi.fn(),
          patternPresetDisabled: true,
          teamCount: 1
        }}
        showPatternPresetModal={false}
        simulationAnchorDate="2026-04-17"
        simulationMonthLabel="2026-04"
        simulationPanelProps={{
          assignmentSummaries: [],
          canMoveNextMonth: false,
          canMovePreviousMonth: false,
          cycleShiftCards: [],
          invalidCycleMessages: [],
          metricGroups: [],
          onMoveNextMonth: vi.fn(),
          onMovePreviousMonth: vi.fn(),
          poolSummary: null,
          simulationAnchorDate: "2026-04-17",
          simulationCells: [],
          simulationMonthLabel: "2026-04"
        }}
        siteName=""
        stageLabel="site"
        teamCount={1}
      />
    );

    const footer = container.querySelector(".footer-action-card");

    expect(footer?.textContent).toContain("권한");
    expect(footer?.querySelectorAll("button").length).toBe(1);
  });
});
