// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type {
  BridgeResult,
  LocalFileSelection,
  WorkforceWageBulkColumnSuggestion,
  WorkforceWageBulkUpdateApplyInput,
  WorkforceWageBulkUpdateApplySummary,
  WorkforceWageBulkUpdatePreview,
  WorkforceWageBulkUpdatePreviewInput
} from "@shared/bridge/contracts";

import { useWageBulkUpdate, type WageBulkUpdateBridge } from "./useWageBulkUpdate";

// These drive the hook the way the screen's buttons do, against a bridge whose header reading
// finishes when the test says so. The reducer tests prove the transitions; these prove the hook
// sends them - which is the half four review rounds found missing.

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const defer = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
};

const fullHeaders: WorkforceWageBulkColumnSuggestion = {
  employeeCodeColumn: "A",
  siteNameColumn: "F",
  employeeNameColumn: "G",
  hourlyRateColumn: "H",
  ambiguousFields: [],
  headerLabels: ["사번", "", "", "", "", "근무지명", "이름", "시급"]
};

const previewFor = (input: WorkforceWageBulkUpdatePreviewInput): WorkforceWageBulkUpdatePreview => ({
  previewId: `preview:${input.filePath}:${input.effectiveFrom}`,
  fileName: "wages.xlsx",
  filePath: input.filePath,
  sheetName: "Sheet1",
  effectiveFrom: input.effectiveFrom,
  totalRows: 1,
  readyCount: 1,
  skippedCount: 0,
  rows: [
    {
      rowNumber: 2,
      siteName: "보라매DC",
      employeeName: "김현우",
      importedHourlyRate: 14500,
      effectiveFrom: input.effectiveFrom,
      status: "ready",
      statusLabel: "적용 가능"
    }
  ]
});

const summaryFor = (input: WorkforceWageBulkUpdateApplyInput): WorkforceWageBulkUpdateApplySummary => ({
  ...previewFor(input),
  previewId: input.expectedPreviewId,
  appliedCount: 1,
  rows: [{ ...previewFor(input).rows[0], status: "applied", statusLabel: "적용 완료" }]
});

const createBridge = () => {
  const selections: Array<LocalFileSelection | null> = [];
  const headerReads: Array<Deferred<BridgeResult<WorkforceWageBulkColumnSuggestion>>> = [];
  const previewCalls: WorkforceWageBulkUpdatePreviewInput[] = [];
  const applyCalls: WorkforceWageBulkUpdateApplyInput[] = [];
  const bridge: WageBulkUpdateBridge = {
    selectSpreadsheetFile: async () => {
      const next = selections.shift();

      if (next === undefined) {
        throw new Error("no file selection queued");
      }

      return { ok: true, data: next };
    },
    suggestWorkforceWageBulkColumns: () => {
      const pending = defer<BridgeResult<WorkforceWageBulkColumnSuggestion>>();

      headerReads.push(pending);

      return pending.promise;
    },
    previewWorkforceWageBulkUpdate: async (input) => {
      previewCalls.push(input);

      return { ok: true, data: previewFor(input) };
    },
    applyWorkforceWageBulkUpdate: async (input) => {
      applyCalls.push(input);

      return { ok: true, data: summaryFor(input) };
    }
  };

  return { bridge, selections, headerReads, previewCalls, applyCalls };
};

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];
let latest: ReturnType<typeof useWageBulkUpdate> | null = null;

const Harness = ({
  bridge,
  onApplied
}: {
  bridge: WageBulkUpdateBridge;
  onApplied: () => void;
}) => {
  latest = useWageBulkUpdate({
    bridge,
    askQuestion: async () => ({ confirmed: true }),
    onApplied
  });

  return null;
};

const mount = async (bridge: WageBulkUpdateBridge, onApplied: () => void = () => {}) => {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(<Harness bridge={bridge} onApplied={onApplied} />);
  });
};

// The hook re-renders on every state change, so it is read fresh rather than held.
const state = () => {
  if (!latest) {
    throw new Error("hook did not render");
  }

  return latest;
};

const chooseFile = async (fileName = "wages.xlsx") => {
  await act(async () => {
    void state().selectFile();
  });

  return fileName;
};

afterEach(async () => {
  latest = null;

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

describe("useWageBulkUpdate", () => {
  const wages = { fileName: "wages.xlsx", filePath: "C:/wages.xlsx" };

  it("keeps the preview locked until the header row of the chosen file has been read", async () => {
    const fake = createBridge();

    fake.selections.push(wages);
    await mount(fake.bridge);
    await chooseFile();

    expect(state().file?.fileName).toBe("wages.xlsx");
    expect(state().isReadingHeader).toBe(true);
    expect(state().canPreview).toBe(false);
    expect(state().notices.join(" ")).toContain("확인하는 중");

    // Clicking now must not start a preview on the unchecked defaults.
    await act(async () => {
      await state().preview();
    });

    expect(fake.previewCalls).toHaveLength(0);
    expect(state().error).toBeNull();

    await act(async () => {
      fake.headerReads[0].resolve({ ok: true, data: fullHeaders });
    });

    expect(state().isReadingHeader).toBe(false);
    expect(state().mapping).toEqual({
      employeeCodeColumn: "A",
      siteNameColumn: "F",
      employeeNameColumn: "G",
      hourlyRateColumn: "H"
    });
    expect(state().canPreview).toBe(true);
    expect(state().notices.join(" ")).toContain("사번 열(A)");
  });

  it("drops the header answer of a file that was replaced before it arrived", async () => {
    const fake = createBridge();

    fake.selections.push(wages, { fileName: "other.xlsx", filePath: "C:/other.xlsx" });
    await mount(fake.bridge);
    await chooseFile();
    await chooseFile();

    expect(state().file?.fileName).toBe("other.xlsx");

    await act(async () => {
      fake.headerReads[0].resolve({ ok: true, data: fullHeaders });
    });

    // The first file's columns never reach the boxes, and the second file is still being read.
    expect(state().mapping.siteNameColumn).toBe("B");
    expect(state().isReadingHeader).toBe(true);
    expect(state().canPreview).toBe(false);

    await act(async () => {
      fake.headerReads[1].resolve({
        ok: true,
        data: { ...fullHeaders, siteNameColumn: "K" }
      });
    });

    expect(state().mapping.siteNameColumn).toBe("K");
    expect(state().canPreview).toBe(true);
  });

  it("lets a typed column outrank the reading, and refuses the answer that lands afterwards", async () => {
    const fake = createBridge();

    fake.selections.push(wages);
    await mount(fake.bridge);
    await chooseFile();

    await act(async () => {
      state().setColumn("hourlyRateColumn", "z");
    });

    expect(state().mapping.hourlyRateColumn).toBe("Z");
    expect(state().isReadingHeader).toBe(false);
    expect(state().canPreview).toBe(true);

    await act(async () => {
      fake.headerReads[0].resolve({ ok: true, data: fullHeaders });
    });

    expect(state().mapping.hourlyRateColumn).toBe("Z");
    expect(state().mapping.siteNameColumn).toBe("B");
  });

  it("says so when the header row could not be read, and only then allows the defaults", async () => {
    const fake = createBridge();

    fake.selections.push(wages);
    await mount(fake.bridge);
    await chooseFile();

    await act(async () => {
      fake.headerReads[0].resolve({
        ok: false,
        errorCode: "WORKFORCE_WAGE_BULK_FILE_UNREADABLE",
        message: "파일을 열 수 없습니다"
      });
    });

    expect(state().isReadingHeader).toBe(false);
    expect(state().canPreview).toBe(true);
    expect(state().notices.join(" ")).toContain("머리글을 읽지 못했습니다");
    expect(state().notices.join(" ")).toContain("파일을 열 수 없습니다");
    expect(state().mapping.siteNameColumn).toBe("B");
  });

  it("applies exactly the preview that was reviewed, then reloads the list", async () => {
    const fake = createBridge();
    let reloads = 0;

    fake.selections.push(wages);
    await mount(fake.bridge, () => {
      reloads += 1;
    });
    await chooseFile();
    await act(async () => {
      fake.headerReads[0].resolve({ ok: true, data: fullHeaders });
    });

    expect(state().canApply).toBe(false);

    await act(async () => {
      await state().preview();
    });

    expect(fake.previewCalls[0]?.mapping).toEqual(state().mapping);
    expect(state().view.mode).toBe("preview");
    expect(state().canApply).toBe(true);

    await act(async () => {
      await state().apply();
    });

    expect(fake.applyCalls[0]?.expectedPreviewId).toBe(fake.previewCalls[0] && previewFor(fake.previewCalls[0]).previewId);
    expect(reloads).toBe(1);
    expect(state().view.mode).toBe("applied");
    expect(state().success).toContain("1명의 시급 변경 이력을 반영했습니다");
  });

  it("drops a reviewed preview once the effective date or a column changes", async () => {
    const fake = createBridge();

    fake.selections.push(wages);
    await mount(fake.bridge);
    await chooseFile();
    await act(async () => {
      fake.headerReads[0].resolve({ ok: true, data: fullHeaders });
    });
    await act(async () => {
      await state().preview();
    });

    expect(state().canApply).toBe(true);

    await act(async () => {
      state().setEffectiveFrom("2026-01-01");
    });

    expect(state().canApply).toBe(false);
    expect(state().view.mode).toBe("empty");

    await act(async () => {
      await state().preview();
    });

    expect(state().canApply).toBe(true);

    await act(async () => {
      state().setColumn("siteNameColumn", "Q");
    });

    expect(state().canApply).toBe(false);
  });

  it("reopening the modal starts from nothing", async () => {
    const fake = createBridge();

    fake.selections.push(wages);
    await mount(fake.bridge);
    await chooseFile();
    await act(async () => {
      fake.headerReads[0].resolve({ ok: true, data: fullHeaders });
    });
    await act(async () => {
      state().open();
    });

    expect(state().file).toBeNull();
    expect(state().mapping.siteNameColumn).toBe("B");
    expect(state().notices).toEqual([]);
    expect(state().view.mode).toBe("empty");
  });
});
