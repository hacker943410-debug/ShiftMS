// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { SitePatternImportAnalysis } from "@shared/bridge/contracts";

import { useSiteManagementInteractionState } from "./useSiteManagementInteractionState";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];
let latestState: ReturnType<typeof useSiteManagementInteractionState> | null = null;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const HookHarness = () => {
  latestState = useSiteManagementInteractionState();
  return null;
};

const renderHookHarness = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(<HookHarness />);
  });

  if (!latestState) {
    throw new Error("interaction state hook did not initialize");
  }

  return latestState;
};

afterEach(async () => {
  latestState = null;

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

const createPatternImportAnalysis = (
  overrides?: Partial<SitePatternImportAnalysis>
): SitePatternImportAnalysis =>
  ({
    analysisReport: "분석 결과",
    dates: [],
    detectedGroupCount: 1,
    endDate: "2026-04-30",
    fileName: "pattern.xlsx",
    filePath: "C:/imports/pattern.xlsx",
    groups: [],
    holidayCount: 0,
    previewRows: [],
    sheetName: "Sheet1",
    skippedWorkers: [],
    startDate: "2026-04-01",
    suggestion: {
      cycleCount: 1,
      cycles: [],
      poolBreakMinutes: 60,
      poolEnabled: false,
      poolTimeRange: "09:00 - 18:00",
      teamCount: 4,
      teams: []
    },
    totalDays: 30,
    uniqueCodes: [],
    warningMessages: [],
    workerCount: 8,
    ...overrides
  }) as SitePatternImportAnalysis;

describe("useSiteManagementInteractionState", () => {
  it("should open and clear pattern import modal-related state", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.setPatternImportError("기존 오류");
      state.setPatternImportCopyStatus("기존 복사");
      state.setShowPatternImportModal(true);
      state.setShowPatternImportGuide(true);
    });

    expect(latestState).toMatchObject({
      patternImportCopyStatus: "기존 복사",
      patternImportError: "기존 오류",
      showPatternImportGuide: true,
      showPatternImportModal: true
    });
  });

  it("should reset preview tab and copy status when analysis changes", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.setPatternImportPreviewTab("groups");
      state.setPatternImportCopyStatus("복사됨");
    });

    expect(latestState).toMatchObject({
      patternImportCopyStatus: "복사됨",
      patternImportPreviewTab: "groups"
    });

    await act(async () => {
      latestState?.setPatternImportAnalysis(createPatternImportAnalysis());
    });

    expect(latestState).toMatchObject({
      patternImportCopyStatus: null,
      patternImportPreviewTab: "analysis"
    });
  });

  it("should keep detail and delete state together", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.setDetailSiteId("site-1");
      state.setDetailSnapshot({
        cycleSummaries: [],
        pattern: null,
        patternVersions: [],
        patternString: "",
        poolEnabled: false,
        shiftDefinitions: [],
        site: {
          createdAt: "2026-04-01T00:00:00.000Z",
          id: "site-1",
          name: "본관",
          siteCode: "SITE-001",
          status: "active",
          timezone: "Asia/Seoul"
        },
        teamStatusItems: [],
        workType: "교대"
      });
      state.setDeleteError("삭제 오류");
      state.setIsDeletingSite(true);
    });

    expect(latestState).toMatchObject({
      deleteError: "삭제 오류",
      detailSiteId: "site-1",
      isDeletingSite: true
    });
    expect(latestState?.detailSnapshot?.site.name).toBe("본관");
  });
});
