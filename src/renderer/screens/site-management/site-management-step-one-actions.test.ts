import { describe, expect, it, vi } from "vitest";

import type { SiteManagementDraftLike } from "./site-management-actions";
import {
  createSiteManagementStepOneActions
} from "./site-management-step-one-actions";

type TestDraft = SiteManagementDraftLike;

interface TestPresetRow {
  patternStartDate?: string;
  siteName: string;
}

const createDraft = (overrides?: Partial<TestDraft>): TestDraft => ({
  customerName: "현재 고객사",
  cycles: [],
  cycleCount: "1",
  name: "현재 근무지",
  patternId: "pattern-current",
  poolBreakMinutes: "60",
  poolEnabled: false,
  poolTimeRange: "09:00 - 18:00",
  siteCode: "SITE-001",
  siteId: "site-current",
  status: "active",
  teamCapacities: [],
  teamCount: "2",
  teamCycleAssignments: [],
  ...overrides
});

describe("site-management-step-one-actions", () => {
  it("should apply a preset while preserving the current site identity fields", () => {
    const setAssignmentStartDate = vi.fn();
    const setDraft = vi.fn();
    const setFormError = vi.fn();
    const closePatternPresetModal = vi.fn();
    const selectedPatternPresetRow: TestPresetRow = {
      patternStartDate: "2026-04-09",
      siteName: "기준 근무지"
    };

    const actions = createSiteManagementStepOneActions({
      buildDraftFromRow: () =>
        createDraft({
          customerName: "기준 고객사",
          name: "기준 근무지",
          patternId: "pattern-template",
          siteCode: "SITE-999",
          siteId: "site-template",
          status: "inactive"
        }),
      closePatternPresetModal,
      createDateInputValue: () => "2026-04-01",
      draftSiteId: "site-current",
      getPatternStartDate: (row) => row.patternStartDate,
      persistDraft: vi.fn(async () => true),
      selectedPatternPresetRow,
      setAssignmentStartDate,
      setDraft,
      setFormError,
      setView: vi.fn(),
      validateDraftForm: vi.fn(() => true)
    });

    actions.applyPatternPreset();

    expect(setDraft).toHaveBeenCalledTimes(1);
    const updater = setDraft.mock.calls[0]?.[0] as ((current: TestDraft) => TestDraft) | undefined;
    expect(updater?.(createDraft())).toEqual(
      createDraft({
        customerName: "현재 고객사",
        name: "현재 근무지",
        patternId: "pattern-current",
        siteCode: "SITE-001",
        siteId: "site-current",
        status: "active"
      })
    );
    expect(setAssignmentStartDate).toHaveBeenCalledWith("2026-04-09");
    expect(setFormError).toHaveBeenCalledWith(null);
    expect(closePatternPresetModal).toHaveBeenCalledTimes(1);
  });

  it("should move to step two immediately after a valid new-site draft check", async () => {
    const setView = vi.fn();
    const validateDraftForm = vi.fn(() => true);
    const persistDraft = vi.fn(async () => true);

    const actions = createSiteManagementStepOneActions({
      buildDraftFromRow: () => createDraft(),
      closePatternPresetModal: vi.fn(),
      createDateInputValue: () => "2026-04-01",
      getPatternStartDate: () => undefined,
      persistDraft,
      selectedPatternPresetRow: null,
      setAssignmentStartDate: vi.fn(),
      setDraft: vi.fn(),
      setFormError: vi.fn(),
      setView,
      validateDraftForm
    });

    await actions.handleGoNext();

    expect(validateDraftForm).toHaveBeenCalledTimes(1);
    expect(persistDraft).not.toHaveBeenCalled();
    expect(setView).toHaveBeenCalledWith("step2");
  });

  it("should persist an existing site before moving to step two", async () => {
    const setView = vi.fn();
    const persistDraft = vi.fn(async () => true);

    const actions = createSiteManagementStepOneActions({
      buildDraftFromRow: () => createDraft(),
      closePatternPresetModal: vi.fn(),
      createDateInputValue: () => "2026-04-01",
      draftSiteId: "site-current",
      getPatternStartDate: () => undefined,
      persistDraft,
      selectedPatternPresetRow: null,
      setAssignmentStartDate: vi.fn(),
      setDraft: vi.fn(),
      setFormError: vi.fn(),
      setView,
      validateDraftForm: vi.fn(() => true)
    });

    await actions.handleGoNext();

    expect(persistDraft).toHaveBeenCalledTimes(1);
    expect(setView).toHaveBeenCalledWith("step2");
  });

  it("should keep the current step when save review fails", async () => {
    const setView = vi.fn();
    const persistDraft = vi.fn(async () => false);

    const actions = createSiteManagementStepOneActions({
      buildDraftFromRow: () => createDraft(),
      closePatternPresetModal: vi.fn(),
      createDateInputValue: () => "2026-04-01",
      draftSiteId: "site-current",
      getPatternStartDate: () => undefined,
      persistDraft,
      selectedPatternPresetRow: null,
      setAssignmentStartDate: vi.fn(),
      setDraft: vi.fn(),
      setFormError: vi.fn(),
      setView,
      validateDraftForm: vi.fn(() => true)
    });

    await actions.handleGoNext();

    expect(setView).not.toHaveBeenCalled();
  });

  it("should validate new drafts and persist existing drafts when reviewing", () => {
    const validateDraftForm = vi.fn(() => true);
    const persistDraft = vi.fn(async () => true);

    const newDraftActions = createSiteManagementStepOneActions({
      buildDraftFromRow: () => createDraft(),
      closePatternPresetModal: vi.fn(),
      createDateInputValue: () => "2026-04-01",
      getPatternStartDate: () => undefined,
      persistDraft,
      selectedPatternPresetRow: null,
      setAssignmentStartDate: vi.fn(),
      setDraft: vi.fn(),
      setFormError: vi.fn(),
      setView: vi.fn(),
      validateDraftForm
    });
    const existingDraftActions = createSiteManagementStepOneActions({
      buildDraftFromRow: () => createDraft(),
      closePatternPresetModal: vi.fn(),
      createDateInputValue: () => "2026-04-01",
      draftSiteId: "site-current",
      getPatternStartDate: () => undefined,
      persistDraft,
      selectedPatternPresetRow: null,
      setAssignmentStartDate: vi.fn(),
      setDraft: vi.fn(),
      setFormError: vi.fn(),
      setView: vi.fn(),
      validateDraftForm
    });

    newDraftActions.handleReviewOrSave();
    existingDraftActions.handleReviewOrSave();

    expect(validateDraftForm).toHaveBeenCalledTimes(1);
    expect(persistDraft).toHaveBeenCalledTimes(1);
  });
});
