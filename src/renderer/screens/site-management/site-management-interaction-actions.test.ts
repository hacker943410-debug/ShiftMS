import { describe, expect, it, vi } from "vitest";

import type { LocalFileSelection, SitePatternImportAnalysis } from "@shared/bridge/contracts";
import type { SiteRecord } from "@shared/domain/model";

import type { SiteManagementDraftLike } from "./site-management-actions";
import type { SiteViewRow } from "./site-management-selectors";
import { createSiteManagementInteractionActions } from "./site-management-interaction-actions";

const createDraft = (overrides?: Partial<SiteManagementDraftLike>): SiteManagementDraftLike => ({
  customerName: "",
  cycleCount: "1",
  cycles: [],
  name: "",
  poolBreakMinutes: "60",
  poolEnabled: false,
  poolTimeRange: "09:00 - 18:00",
  siteCode: "SITE-001",
  status: "active",
  teamCapacities: ["", "", "", ""],
  teamCount: "4",
  teamCycleAssignments: ["cycle-1", "cycle-1", "cycle-1", "cycle-1"],
  ...overrides
});

const createRow = (overrides?: Partial<SiteViewRow>): SiteViewRow =>
  ({
    cycleSummaries: [],
    pattern: {
      createdAt: "2026-04-01T00:00:00.000Z",
      cycleLength: 4,
      cycles: [],
      id: "pattern-1",
      name: "기본 패턴",
      patternCode: "DDNN",
      patternStartDate: "2026-04-10",
      poolBreakMinutes: 60,
      poolEnabled: false,
      siteId: "site-1",
      startIndexRule: "manual",
      status: "active",
      steps: [],
      teamCapacities: [],
      teamCount: 4,
      teamCycleAssignments: [],
      teamIndexes: [],
      ...overrides?.pattern
    },
    patternString: "DDNN",
    poolEnabled: false,
    shiftDefinitions: [],
    site: {
      createdAt: "2026-04-01T00:00:00.000Z",
      id: "site-1",
      name: "본관",
      siteCode: "SITE-001",
      status: "active",
      timezone: "Asia/Seoul",
      ...overrides?.site
    },
    teamStatusItems: [],
    workType: "교대",
    ...overrides
  }) as SiteViewRow;

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
      cycles: [
        {
          breakMinutes: 60,
          cycleKey: "cycle-1",
          name: "Cycle 1",
          patternStartDate: "2026-04-12",
          patternString: "DDNN",
          shiftCount: 2,
          shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
          sourceCycleCodes: ["D", "N"],
          teamIndexes: []
        }
      ],
      poolBreakMinutes: 60,
      poolEnabled: false,
      poolTimeRange: "09:00 - 18:00",
      teamCount: 4,
      teams: []
    },
    totalDays: 30,
    uniqueCodes: ["D", "N"],
    warningMessages: [],
    workerCount: 8,
    ...overrides
  }) as SitePatternImportAnalysis;

const createFile = (overrides?: Partial<LocalFileSelection>): LocalFileSelection => ({
  fileName: "pattern.xlsx",
  filePath: "C:/imports/pattern.xlsx",
  ...overrides
});

const createHarness = (overrides?: {
  detailRow?: SiteViewRow | null;
  patternImportAnalysis?: SitePatternImportAnalysis | null;
  patternImportFile?: LocalFileSelection | null;
  rows?: SiteViewRow[];
  sites?: SiteRecord[];
}) => {
  let assignmentStartDate = "2026-04-01";
  let deleteError: string | null = "기존 오류";
  let detailSiteId: string | null = null;
  let detailSnapshot: SiteViewRow | null = null;
  let draft = createDraft();
  let focusedAssignmentTeamLabel: string | null = null;
  let isAnalyzingPatternImport = false;
  let isDeletingSite = false;
  let patternImportAnalysis = overrides?.patternImportAnalysis ?? null;
  let patternImportCopyStatus: string | null = "기존 복사";
  let patternImportError: string | null = "기존 오류";
  let patternImportFile = overrides?.patternImportFile ?? null;
  let patternImportPreviewTab: "analysis" | "groups" | "mismatches" | "data" = "groups";
  let showPatternImportModal = false;
  let view: "list" | "step1" | "step2" = "list";
  let workflowSiteId = "";
  let refreshCount = 0;
  let restoreFocusCount = 0;
  let resetRegistrationCount = 0;

  const askQuestion = vi.fn(async () => ({ confirmed: true }));
  const bridge = {
    analyzeSitePatternImport: vi.fn(),
    deleteSite: vi.fn(),
    selectSpreadsheetFile: vi.fn()
  };
  const writeClipboardText = vi.fn(async () => undefined);

  const actions = createSiteManagementInteractionActions({
    askQuestion,
    bridge,
    buildDraftFromPatternImportAnalysis: (analysis, siteCode) =>
      createDraft({
        cycleCount: String(analysis.suggestion.cycleCount),
        name: "imported",
        siteCode
      }),
    buildDraftFromRow: (row) =>
      createDraft({
        name: row.site.name,
        siteCode: row.site.siteCode,
        siteId: row.site.id
      }),
    buildNextAutoSiteCode: (sites) => `SITE-${String(sites.length + 1).padStart(3, "0")}`,
    createDateInputValue: () => "2026-04-20",
    createInitialDraft: (siteCode = "") => createDraft({ siteCode }),
    detailRow: overrides?.detailRow ?? null,
    getErrorMessage: (error) => (error instanceof Error ? error.message : "오류"),
    incrementRefreshKey: () => {
      refreshCount += 1;
    },
    markShouldRestoreListFocus: () => {
      restoreFocusCount += 1;
    },
    patternImportAnalysis,
    patternImportFile,
    resetRegistrationState: () => {
      resetRegistrationCount += 1;
    },
    rows: overrides?.rows ?? [createRow()],
    setAssignmentStartDate: (value) => {
      assignmentStartDate = value;
    },
    setDeleteError: (value) => {
      deleteError = value;
    },
    setDetailSiteId: (value) => {
      detailSiteId = value;
    },
    setDetailSnapshot: (value) => {
      detailSnapshot = value;
    },
    setDraft: (value) => {
      draft = typeof value === "function" ? value(draft) : value;
    },
    setFocusedAssignmentTeamLabel: (value) => {
      focusedAssignmentTeamLabel = value;
    },
    setIsAnalyzingPatternImport: (value) => {
      isAnalyzingPatternImport = value;
    },
    setIsDeletingSite: (value) => {
      isDeletingSite = value;
    },
    setPatternImportAnalysis: (value) => {
      patternImportAnalysis = value;
    },
    setPatternImportCopyStatus: (value) => {
      patternImportCopyStatus = value;
    },
    setPatternImportError: (value) => {
      patternImportError = value;
    },
    setPatternImportFile: (value) => {
      patternImportFile = value;
    },
    setPatternImportPreviewTab: (value) => {
      patternImportPreviewTab = value;
    },
    setShowPatternImportModal: (value) => {
      showPatternImportModal = value;
    },
    setView: (value) => {
      view = value;
    },
    setWorkflowSiteId: (value) => {
      workflowSiteId = value;
    },
    sites:
      overrides?.sites ??
      ([{ createdAt: "2026-04-01T00:00:00.000Z", id: "site-1", name: "본관", siteCode: "SITE-001", status: "active", timezone: "Asia/Seoul" }] as SiteRecord[]),
    writeClipboardText
  });

  return {
    actions,
    askQuestion,
    bridge,
    getState: () => ({
      assignmentStartDate,
      deleteError,
      detailSiteId,
      detailSnapshot,
      draft,
      focusedAssignmentTeamLabel,
      isAnalyzingPatternImport,
      isDeletingSite,
      patternImportAnalysis,
      patternImportCopyStatus,
      patternImportError,
      patternImportFile,
      patternImportPreviewTab,
      refreshCount,
      resetRegistrationCount,
      restoreFocusCount,
      showPatternImportModal,
      view,
      workflowSiteId
    }),
    writeClipboardText
  };
};

describe("site-management-interaction-actions", () => {
  it("should reset import preview state and open the pattern import modal", () => {
    const harness = createHarness({
      patternImportAnalysis: createPatternImportAnalysis(),
      patternImportFile: createFile()
    });

    harness.actions.openPatternImportModal();

    expect(harness.getState()).toMatchObject({
      patternImportAnalysis: null,
      patternImportCopyStatus: null,
      patternImportError: null,
      patternImportFile: null,
      patternImportPreviewTab: "analysis",
      showPatternImportModal: true
    });
  });

  it("should store the selected import file and reset preview state", async () => {
    const harness = createHarness({
      patternImportAnalysis: createPatternImportAnalysis()
    });
    const selectedFile = createFile({ fileName: "selected.xlsx" });
    harness.bridge.selectSpreadsheetFile.mockResolvedValue({
      data: selectedFile,
      ok: true
    });

    await harness.actions.handleSelectPatternImportFile();

    expect(harness.getState()).toMatchObject({
      patternImportAnalysis: null,
      patternImportCopyStatus: null,
      patternImportError: null,
      patternImportFile: selectedFile,
      patternImportPreviewTab: "analysis"
    });
  });

  it("should analyze the selected import file and store the result", async () => {
    const analysis = createPatternImportAnalysis();
    const harness = createHarness({
      patternImportFile: createFile()
    });
    harness.bridge.analyzeSitePatternImport.mockResolvedValue({
      data: analysis,
      ok: true
    });

    await harness.actions.handleAnalyzePatternImport();

    expect(harness.bridge.analyzeSitePatternImport).toHaveBeenCalledWith({
      filePath: "C:/imports/pattern.xlsx"
    });
    expect(harness.getState().patternImportAnalysis).toEqual(analysis);
    expect(harness.getState().isAnalyzingPatternImport).toBe(false);
  });

  it("should apply pattern import analysis into a fresh draft and open step1", async () => {
    const analysis = createPatternImportAnalysis();
    const harness = createHarness({
      patternImportAnalysis: analysis,
      sites: [
        {
          createdAt: "2026-04-01T00:00:00.000Z",
          id: "site-1",
          name: "본관",
          siteCode: "SITE-001",
          status: "active",
          timezone: "Asia/Seoul"
        },
        {
          createdAt: "2026-04-02T00:00:00.000Z",
          id: "site-2",
          name: "별관",
          siteCode: "SITE-002",
          status: "active",
          timezone: "Asia/Seoul"
        }
      ] as SiteRecord[]
    });

    await harness.actions.handleApplyPatternImportToDraft();

    expect(harness.getState()).toMatchObject({
      assignmentStartDate: "2026-04-12",
      draft: expect.objectContaining({
        cycleCount: "1",
        name: "imported",
        siteCode: "SITE-003"
      }),
      patternImportError: null,
      resetRegistrationCount: 1,
      showPatternImportModal: false,
      view: "step1"
    });
  });

  it("should open detail modal and registration flows for the selected row", () => {
    const row = createRow({
      pattern: {
        createdAt: "2026-04-01T00:00:00.000Z",
        cycleLength: 4,
        cycles: [],
        id: "pattern-2",
        name: "야간 패턴",
        patternCode: "NNXX",
        patternStartDate: "2026-04-15",
        poolBreakMinutes: 60,
        poolEnabled: false,
        siteId: "site-9",
        startIndexRule: "manual",
        status: "active",
        steps: [],
        teamCapacities: [],
        teamCount: 4,
        teamCycleAssignments: [],
        teamIndexes: [],
        teamSettings: []
      },
      site: {
        createdAt: "2026-04-01T00:00:00.000Z",
        id: "site-9",
        name: "별관",
        siteCode: "SITE-009",
        status: "active",
        timezone: "Asia/Seoul"
      }
    });
    const harness = createHarness({
      detailRow: row,
      rows: [row]
    });

    harness.actions.openDetailModal(row);
    harness.actions.openRegistration("site-9");

    expect(harness.getState()).toMatchObject({
      assignmentStartDate: "2026-04-15",
      detailSiteId: "site-9",
      detailSnapshot: row,
      draft: expect.objectContaining({
        name: "별관",
        siteCode: "SITE-009",
        siteId: "site-9"
      }),
      focusedAssignmentTeamLabel: null,
      resetRegistrationCount: 1,
      view: "step1",
      workflowSiteId: "site-9"
    });
  });

  it("should open step2 assignment from the detail modal and focus the selected team", () => {
    const row = createRow({
      pattern: {
        createdAt: "2026-04-01T00:00:00.000Z",
        cycleLength: 4,
        cycles: [],
        id: "pattern-3",
        name: "주간 패턴",
        patternCode: "DDXX",
        patternStartDate: "2026-04-18",
        poolBreakMinutes: 60,
        poolEnabled: false,
        siteId: "site-7",
        startIndexRule: "manual",
        status: "active",
        steps: [],
        teamCapacities: [],
        teamCount: 4,
        teamCycleAssignments: [],
        teamIndexes: [],
        teamSettings: []
      },
      site: {
        createdAt: "2026-04-01T00:00:00.000Z",
        id: "site-7",
        name: "동관",
        siteCode: "SITE-007",
        status: "active",
        timezone: "Asia/Seoul"
      }
    });
    const harness = createHarness({
      detailRow: row,
      rows: [row]
    });

    harness.actions.openAssignmentFromDetail("A");

    expect(harness.getState()).toMatchObject({
      assignmentStartDate: "2026-04-18",
      detailSiteId: null,
      detailSnapshot: null,
      draft: expect.objectContaining({
        name: "동관",
        siteCode: "SITE-007",
        siteId: "site-7"
      }),
      focusedAssignmentTeamLabel: "A조",
      resetRegistrationCount: 1,
      view: "step2",
      workflowSiteId: "site-7"
    });
  });

  it("should confirm and delete the detail site through the bridge", async () => {
    const row = createRow();
    const harness = createHarness({
      detailRow: row
    });
    harness.bridge.deleteSite.mockResolvedValue({
      data: row.site,
      ok: true
    });

    await harness.actions.handleRequestDeleteSite();

    expect(harness.askQuestion).toHaveBeenCalledTimes(2);
    expect(harness.bridge.deleteSite).toHaveBeenCalledWith({ siteId: "site-1" });
    expect(harness.getState()).toMatchObject({
      deleteError: null,
      detailSiteId: null,
      detailSnapshot: null,
      isDeletingSite: false,
      refreshCount: 1,
      restoreFocusCount: 1,
      workflowSiteId: ""
    });
  });
});
